// smejj.com — Dienst-Sonden (Autopiloten Nr. 8 und Nr. 32).
//
// Zwei Laeufe, die die AUSSENWELT anfassen: sie fragen fremde Dienste nach
// ihrem Zustand, statt nur eigene Logik zu pruefen. Ausgelagert aus
// autopilotLaeufer.js am 2026-08-15 — die Datei stand mit 869 Zeilen laengst
// ueber der 800-Zeilen-Regel, und der Nachweis-Waechter haette sie weiter
// wachsen lassen.
//
// Bewusst ohne weitere Importe: beide Laeufe brauchen nur `fetch` und ihre
// Umgebung. Alles, was sie ueber die Aussenwelt sagen, haben sie selbst
// gemessen.

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
export async function laufMedienQualitaet({ mitNetz = true, env = process.env, fetchImpl = fetch } = {}) {
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
    const begonnen = Date.now();
    try {
      const antwort = await fetchImpl(`${ziel.url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(10_000) });
      const dauerMs = Date.now() - begonnen;
      if (!antwort.ok) {
        allesOk = false;
        befunde.push(`${ziel.name}: HTTP ${antwort.status} nach ${dauerMs} ms`);
        continue;
      }
      const daten = await antwort.json().catch(() => ({}));
      if (daten.bereit === false) {
        // "laeuft, aber nicht bereit" ist der Fehlbild-Klassiker aus der
        // Salad-Zeit — genau der Zustand, der frueher unsichtbar blieb.
        allesOk = false;
        befunde.push(`${ziel.name}: laeuft, aber NICHT bereit nach ${dauerMs} ms${daten.fehler ? ` (${String(daten.fehler).slice(0, 40)})` : ""}`);
      } else {
        befunde.push(`${ziel.name}: bereit in ${dauerMs} ms${daten.engine ? ` (${daten.engine})` : ""}`);
      }
    } catch (fehler) {
      allesOk = false;
      befunde.push(`${ziel.name}: nicht erreichbar (${String(fehler?.name === "TimeoutError" ? "Zeitlimit 10 s" : fehler?.message || fehler).slice(0, 50)})`);
    }
  }
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
export async function laufVoiceRegion({ env = process.env, fetchImpl = fetch } = {}) {
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

