// smejj.com — Dienst-Sonden (Autopiloten Nr. 8 und Nr. 32).
//
// Zwei Laeufe, die die AUSSENWELT anfassen: sie fragen fremde Dienste nach
// ihrem Zustand, statt nur eigene Logik zu pruefen. Ausgelagert aus
// autopilotLaeufer.js am 2026-08-15 — die Datei stand mit 869 Zeilen laengst
// ueber der 800-Zeilen-Regel, und der Nachweis-Waechter haette sie weiter
// wachsen lassen.
//
// Seit dem Master-Audit 2026-09-15 lassen beide Laeufe zusaetzlich EINE echte
// Mini-Arbeit tun (echteProben.js): der Bild-Maler malt ein Probebild, die
// Stimme spricht zwei Woerter — hoechstens einmal je 22 h, Stand neustartfest.
// Alles, was sie ueber die Aussenwelt sagen, haben sie selbst gemessen.
import { piperAdresse, probeBild, probeImTakt, probeStimme } from "./echteProben.js";

/**
 * Bild/Video-Qualitaet (Nr. 8 multimodal-engine), seit 2026-08-13 echt:
 * fragt die BEIDEN Erzeuger-Dienste nach ihrem Zustand, statt nur die
 * Eingabepruefung zu testen. Faellt ein Worker um oder meldet er sich
 * nicht bereit, wird die Ampel rot — und der Vorfall laeuft von selbst
 * ins Werkstatt-Backlog (Ampel-Quelle).
 *
 * Der Video-Worker wird IMMER geprueft (er ist seit 2026-08-11 live);
 * der Bild-Maler nur, wenn seine Adresse gesetzt ist — einen nie
 * ausgerollten Dienst rot zu malen waere keine Messung, sondern Laerm.
 */
// ZWEITER BLICK VOR "NICHT ERREICHBAR" (A-bis-Z-Livetest 15.09.2026, Befund M7):
// um 11:00 UTC meldete dieser Lauf "Bild-Maler nicht erreichbar (fetch failed)",
// um 11:29 war er bereit — laut Zeabur ohne Neustart, /health dort alle 10 s 200.
// Der Maler rechnet ein Bild 40-140 s auf 2 CPU-Kernen; in der Zeit kann /health
// ins Zeitlimit laufen. Ein einzelner Fehlschlag ist deshalb noch kein Ausfall:
// nach 10 s wird einmal wiederholt. Ein 429 (oder beschaeftigt:true im
// Health-Koerper) heisst "malt gerade" und zaehlt nicht als Ausfall.
export const HEALTH_WIEDERHOLUNG_MS = 10_000;

async function frageHealth(ziel, { fetchImpl, wiederholAbstandMs }) {
  let letzterFehler = null;
  for (let versuch = 1; versuch <= 2; versuch += 1) {
    if (versuch === 2) await new Promise((r) => setTimeout(r, wiederholAbstandMs));
    const begonnen = Date.now();
    try {
      const antwort = await fetchImpl(`${ziel.url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(10_000) });
      const dauerMs = Date.now() - begonnen;
      if (antwort.status === 429) return { art: "beschaeftigt", dauerMs, versuch };
      // 5xx kann "gerade ueberlastet" sein -> einmal nachsehen; 4xx ist endgueltig.
      if (!antwort.ok && antwort.status >= 500 && versuch === 1) { letzterFehler = { art: "http", status: antwort.status, dauerMs }; continue; }
      if (!antwort.ok) return { art: "http", status: antwort.status, dauerMs, versuch };
      const daten = await antwort.json().catch(() => ({}));
      if (daten.beschaeftigt === true) return { art: "beschaeftigt", dauerMs, versuch };
      return { art: "antwort", daten, dauerMs, versuch };
    } catch (fehler) {
      letzterFehler = { art: "fehler", fehler, dauerMs: Date.now() - begonnen };
    }
  }
  return { ...letzterFehler, versuch: 2 };
}

export async function laufMedienQualitaet({ mitNetz = true, env = process.env, fetchImpl = fetch, mitProbe = fetchImpl === fetch, ablage = null, sofortMs, wiederholAbstandMs = HEALTH_WIEDERHOLUNG_MS } = {}) {
  if (!mitNetz) {
    return { ok: true, meldung: "Netz-Takt abgewartet — Worker-Zustand wird im naechsten Lauf gemessen" };
  }
  const ziele = [
    { name: "Video-Worker", url: String(env.SMEJJ_VIDEO_WORKER_URL || "http://smejj-video-worker.zeabur.internal:8080") }
  ];
  // Der Bild-Maler stand hier hinter einem `if` ohne Ausweg: fehlt
  // SMEJJ_BILDER_WORKER_URL, wurde er stillschweigend ausgelassen und die
  // Medien-Ampel meldete gruen, obwohl die Bilderzeugung nie angefasst wurde —
  // falsches Gruen ist schlimmer als rot. Gemessen am 2026-08-22: die Variable
  // ist im Dienst nicht gesetzt (und war es seit den Env-Loeschungen vom 14.08.
  // nicht), waehrend der Video-Worker seinen internen Standard hatte und darum
  // weiter geprueft wurde. Dass es nicht auffiel, liegt an zwei Namen fuer
  // dieselbe Sache: im Dienst steht SMEJJ_BILD_MALER_HOST (die Variable, die
  // Zeabur je Dienst selbst anlegt), im Code stand SMEJJ_BILDER_WORKER_URL.
  const bildMalerUrl = String(
    env.SMEJJ_BILDER_WORKER_URL
    || (env.SMEJJ_BILD_MALER_HOST ? `http://${env.SMEJJ_BILD_MALER_HOST}:8080` : "")
    || "http://smejj-bild-maler.zeabur.internal:8080"
  ).trim();
  ziele.push({ name: "Bild-Maler", url: bildMalerUrl });
  let bildMalerBereit = false;
  const befunde = [];
  let allesOk = true;
  for (const ziel of ziele) {
    // Die Antwortzeit wird MITGEMESSEN. Zwei Gruende: sie ist das einzige
    // Frueh-Signal fuer einen Worker, der noch antwortet, aber schon
    // wegkippt — und der autopilot-supervisor (Nr. 39) meldet jede gruene
    // Ampel, deren Meldung keine einzige Zahl traegt. Er tat das hier zu
    // Recht der Form nach ("Video-Worker: bereit (parallax)"), obwohl eine
    // echte Netzabfrage dahinterstand. Ein Waechter, dessen Fehlalarme man
    // sich abgewoehnt, ist keiner mehr — also bekommt er seine Zahl.
    const ergebnis = await frageHealth(ziel, { fetchImpl, wiederholAbstandMs });
    const nachgesehen = ergebnis.versuch === 2 ? " (2. Versuch nach 10 s)" : "";
    if (ergebnis.art === "beschaeftigt") {
      // Kein Ausfall: der Dienst lebt und arbeitet. Gemalt wird in diesem Lauf nicht.
      befunde.push(`${ziel.name}: beschäftigt (malt gerade, HTTP 429/beschaeftigt) nach ${ergebnis.dauerMs} ms${nachgesehen}`);
      continue;
    }
    if (ergebnis.art === "http") {
      allesOk = false;
      befunde.push(`${ziel.name}: HTTP ${ergebnis.status} nach ${ergebnis.dauerMs} ms${nachgesehen}`);
      continue;
    }
    if (ergebnis.art === "fehler") {
      const fehler = ergebnis.fehler;
      allesOk = false;
      befunde.push(`${ziel.name}: nicht erreichbar (${String(fehler?.name === "TimeoutError" ? "Zeitlimit 10 s" : fehler?.message || fehler).slice(0, 50)}), auch im 2. Versuch nach 10 s`);
      continue;
    }
    const { daten, dauerMs } = ergebnis;
    if (daten.bereit === false) {
      // "laeuft, aber nicht bereit" ist der Fehlbild-Klassiker aus der
      // Salad-Zeit — genau der Zustand, der frueher unsichtbar blieb.
      allesOk = false;
      befunde.push(`${ziel.name}: laeuft, aber NICHT bereit nach ${dauerMs} ms${daten.fehler ? ` (${String(daten.fehler).slice(0, 40)})` : ""}`);
    } else {
      befunde.push(`${ziel.name}: bereit in ${dauerMs} ms${daten.engine ? ` (${daten.engine})` : ""}${nachgesehen}`);
      if (ziel.name === "Bild-Maler") bildMalerBereit = true;
    }
  }
  // ECHTE PROBE (Master-Audit 2026-09-15): /health sagt nur "Prozess lebt". Ob
  // wirklich ein Bild herauskommt, zeigt allein ein gemaltes Bild. Gemalt wird
  // nur, wenn der Maler sich bereit meldet — sonst ist er schon oben rot.
  //
  // Der Video-Worker bleibt bewusst bei /health: er hat KEINEN guenstigen
  // Kurz-Modus. POST /erzeuge nimmt nur einen Prompt (kein Standbild), malt
  // dafuer IMMER erst ein Bild beim Bild-Maler (40-120 s CPU) und rendert dann
  // Tiefe + MP4 — und mit gesetztem SMEJJ_VIDEO_EXTERN_KEY ginge jede Probe an
  // den bezahlten Fremd-Anbieter (fal.ai). Das Probebild oben deckt die
  // Bildquelle des Videos bereits ab; ein Probevideo waere Last ohne neue Aussage.
  if (mitProbe && bildMalerBereit) {
    const bild = await probeImTakt({
      kennung: "multimodal-engine-bildprobe",
      mitNetz,
      ablage,
      sofortMs,
      probe: () => probeBild({ url: bildMalerUrl, schluessel: String(env.SMEJJ_BILDER_WORKER_KEY || "").trim(), fetchImpl })
    });
    if (bild.ok === false) allesOk = false;
    befunde.push(bild.text);
  }
  befunde.push("Video: nur /health (kein Kurz-Modus ohne Bildmalen)");
  return { ok: allesOk, meldung: befunde.join("; ") };
}

/**
 * Voice-Region: misst, was messbar IST — ob die Sprachausgabe für Nutzer
 * bereitsteht.
 *
 * Der Autopilot hiess urspruenglich "prueft, ob Google die Regionsaenderung
 * genehmigt hat". Das laesst sich nicht automatisch abfragen (dafuer braeuchte
 * es eine Anmeldung in der Google-Konsole) — aber sein ERGEBNIS laesst sich
 * messen: springt die Freigabe um, meldet die Bruecke premiumVoice. Genau das
 * prueft dieser Lauf, und er sagt in der Meldung, was er wirklich gesehen hat.
 *
 * Der Lauf lief bis 2026-08-13 im Zeabur-Dienst smejj-autopilot-jobs und blieb
 * dort zwei Tage aus (Ampel rot, Dienst von aussen nicht erreichbar). Im
 * Control-Server laeuft er im selben Takt wie alle anderen.
 *
 * POST statt GET ist Absicht: die Bruecke beantwortet jedes GET ausser /health
 * mit 404 — ein GET haette hier "Endpunkt tot" gemeldet, obwohl er lebt.
 */
export async function laufVoiceRegion({ env = process.env, fetchImpl = fetch, mitProbe = fetchImpl === fetch, ablage = null, sofortMs } = {}) {
  const status = await frageSprachStatus({ env, fetchImpl });
  if (!mitProbe) return status;
  // ECHTE PROBE (Master-Audit 2026-09-15): das Flag sagt nur, ob die Bruecke
  // eine Stimme anbieten WILL. Ob smejj-voice-piper wirklich Ton erzeugt, zeigt
  // erst ein synthetisierter Satz mit gueltigem WAV/OGG-Kopf.
  const stimme = await probeImTakt({
    kennung: "voice-region-check-stimmprobe",
    ablage,
    sofortMs,
    probe: () => probeStimme({ url: piperAdresse(env), fetchImpl })
  });
  return { ok: status.ok && stimme.ok !== false, meldung: `${status.meldung}; ${stimme.text}` };
}

async function frageSprachStatus({ env, fetchImpl }) {
  const basis = String(env.SMEJJ_BRUECKE_URL || "https://smejj-chat-bridge.zeabur.app").replace(/\/+$/, "");
  try {
    const antwort = await fetchImpl(`${basis}/api/voice/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://smejj.com" },
      body: "{}",
      signal: AbortSignal.timeout(15_000)
    });
    if (!antwort.ok) return { ok: false, meldung: `Sprach-Status nicht abfragbar: HTTP ${antwort.status}` };
    const daten = await antwort.json();
    if (daten?.ok !== true) return { ok: false, meldung: `Sprach-Status meldet einen Fehler: ${String(daten?.error || "ohne Grund").slice(0, 80)}` };
    return {
      ok: true,
      meldung: daten.premiumVoice
        ? "Sprachausgabe verfügbar (premiumVoice aktiv) — Freigabe wirksam"
        : "Sprachausgabe noch nicht freigeschaltet (premiumVoice aus) — Stand unverändert"
    };
  } catch (fehler) {
    return { ok: false, meldung: `Sprach-Status nicht erreichbar: ${String(fehler?.name === "TimeoutError" ? "Zeitlimit 15 s" : fehler?.message || fehler).slice(0, 90)}` };
  }
}

