// smejj.com — Modul AP: Autopiloten (Single Responsibility: Automatik-Registry + Ampel).
//
// Die Registry ist bewusst HANDGEPFLEGT und im Code, nicht in einer Datenbank:
// die Liste der Automatiken aendert sich nur mit einem Deploy, und genau dann
// soll auch diese Liste im Review auffallen. Eine selbstregistrierende Liste
// wuerde vergessene Autopiloten unsichtbar machen — das Gegenteil ihres Zwecks.
//
// Die Ampel ist GEMESSEN, nicht behauptet: gruen gibt es nur fuer einen
// Herzschlag, der rechtzeitig kam und Erfolg meldete. Eine Automatik ohne
// angeschlossenen Herzschlag ist "keine Messung" (grau) — niemals gruen.
// Vorbild ist der Totmannschalter: Ausbleiben ist der Alarm, nicht die Meldung.
//
// Der Herzschlag-Speicher liegt im Arbeitsspeicher — dieselbe ehrliche
// Einschraenkung wie beim Job-Store (Modul H): nach einem Neustart des
// Control-Servers ist er leer, und die Ansicht sagt das ausdruecklich.
import crypto from "node:crypto";

const TAG_MS = 24 * 60 * 60 * 1000;
const STUNDE_MS = 60 * 60 * 1000;

// Was eine Automatik koennen muss, um hier zu stehen: einen Namen, einen Ort,
// einen Zeitplan — und eine ehrliche Aussage, ob sie schon Herzschlaege sendet.
export const AUTOPILOTEN = Object.freeze([
  {
    id: "qualitaetsmessung",
    name: "Qualitätsmessung",
    kurz: "Misst zweimal täglich die Antwortqualität der Modelle und schreibt das Ergebnis ins Protokoll.",
    funktionen: [
      "Läuft täglich um 7:10 und 19:10 Uhr auf dem Mac (cron).",
      "Führt den Messlauf gegen die Prüfsuite aus.",
      "Schreibt das Protokoll nach ~/Library/Logs/smejj-qualitaetsmessung.log."
    ],
    ort: "Mac (cron)",
    zeitplan: "täglich 7:10 und 19:10 Uhr",
    messung: "heartbeat",
    erwartetAlleMs: 12 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Am Mac im Terminal ausführen: bash \"$HOME/.local/share/smejj-qualitaet/messlauf.sh\"",
    stopAnleitung: "Am Mac: crontab -e öffnen und die Zeile mit \"smejj-qualitaetsmessung\" mit einem # davor stilllegen."
  },
  {
    id: "codeberg-spiegel",
    name: "Codeberg-Spiegel",
    kurz: "Sichert jede Nacht um 4:20 Uhr eine Kopie des Codes nach Codeberg.",
    funktionen: [
      "Läuft täglich um 4:20 Uhr auf dem Mac (cron).",
      "Spiegelt das Repository nach Codeberg (zweiter, unabhängiger Aufbewahrungsort).",
      "Schreibt das Protokoll nach ~/Library/Logs/smejj-codeberg-spiegel.log."
    ],
    ort: "Mac (cron)",
    zeitplan: "täglich 4:20 Uhr",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Am Mac im Terminal ausführen: bash \"$HOME/.local/share/smejj-qualitaet/spiegel.sh\"",
    stopAnleitung: "Am Mac: crontab -e öffnen und die Zeile mit \"smejj-codeberg-spiegel\" mit einem # davor stilllegen."
  },
  {
    id: "voice-region-check",
    name: "Voice-Region-Prüfung",
    kurz: "Prüft täglich, ob Google die Regionsänderung für die Voice-Freischaltung genehmigt hat.",
    funktionen: [
      "Läuft täglich um 9:04 Uhr als geplanter Claude-Task auf dem Mac.",
      "Prüft den Stand der Regionsänderung für 7alanbest@gmail.com.",
      "Meldet sich, sobald Google genehmigt hat."
    ],
    ort: "Mac (Claude-Task)",
    zeitplan: "täglich 9:04 Uhr",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "In Claude Code sagen: »Führe den Task voice-region-daily-check jetzt aus.«",
    stopAnleitung: "In Claude Code sagen: »Schalte den Task voice-region-daily-check aus.«"
  },
  {
    id: "konkurrenz-radar",
    name: "Konkurrenz-Radar",
    kurz: "Durchsucht jeden Montag die öffentlichen Quellen der Konkurrenz nach neuen Funktionen und schlägt Verbesserungen vor.",
    funktionen: [
      "Läuft jeden Montag um 6:00 UTC als Cloud-Routine (ohne Repo-Zugriff).",
      "Prüft Release Notes und Tech-Presse von ChatGPT, Gemini, Kimi, Claude, Perplexity, Copilot und Grok.",
      "Erstellt nur bei echten Funden einen Bericht — jeder Vorschlag wartet auf deine Ja/Nein-Entscheidung.",
      "Baut nichts automatisch ein."
    ],
    ort: "Anthropic-Cloud",
    zeitplan: "montags 6:00 UTC",
    messung: "keine",
    messungHinweis: "Herzschlag-Anschluss folgt in Stufe 2. Bis dahin: Berichte erscheinen unter claude.ai/code, Bericht 01 liegt in docs/konkurrenz-radar/.",
    erwartetAlleMs: null,
    schonfristMs: null,
    startAnleitung: "Auf claude.ai/code/routines die Routine »Konkurrenz-Radar (woechentlich)« öffnen und einmalig starten.",
    stopAnleitung: "Auf claude.ai/code/routines die Routine »Konkurrenz-Radar (woechentlich)« ausschalten."
  },
  {
    id: "training-loop",
    name: "Training-Loop",
    kurz: "Dauerdienst auf Zeabur, der früher das Modelltraining getaktet hat — das Training selbst ist seit 2026-08-06 eingestellt.",
    funktionen: [
      "Läuft 24/7 auf Zeabur und tickt in festen Abständen (Lebenszeichen: wanderndes lastTickAt).",
      "Das eigentliche LoRA-Training wurde nach Messung eingestellt (RAG hat gewonnen) — der Dienst tickt nur noch als Infrastruktur."
    ],
    ort: "Zeabur",
    zeitplan: "Dauerbetrieb",
    messung: "keine",
    messungHinweis: "Herzschlag-Anschluss folgt in Stufe 2. Lebenszeichen bis dahin: lastTickAt im Zeabur-Portal.",
    erwartetAlleMs: null,
    schonfristMs: null,
    startAnleitung: "Im Zeabur-Portal den Dienst neu starten (Konto beachten — nicht das iMild-Com-Konto).",
    stopAnleitung: "Im Zeabur-Portal den Dienst anhalten."
  },
  {
    id: "brueckenwaechter",
    name: "Brücken-Wächter",
    kurz: "Soll die Chat-Brücke überwachen (3-Fehler-Schwelle) — ist aber ohne eigene Domain derzeit unsichtbar und faktisch wirkungslos.",
    funktionen: [
      "Erkennungslogik fertig und geprüft: schlägt nach 3 Fehlern in Folge an.",
      "BEKANNTE LÜCKE: der Zeabur-Dienst hat keine Domain — niemand kann ihn erreichen oder seine Alarme sehen."
    ],
    ort: "Zeabur",
    zeitplan: "Dauerbetrieb (geplant)",
    messung: "keine",
    messungHinweis: "Erst braucht der Dienst eine Domain, dann einen Herzschlag. Bis dahin ehrlich: Zustand unbekannt.",
    erwartetAlleMs: null,
    schonfristMs: null,
    startAnleitung: "Im Zeabur-Portal den Dienst starten — wirksam wird er erst mit einer Domain.",
    stopAnleitung: "Im Zeabur-Portal den Dienst anhalten."
  },
  {
    id: "salad-sonden",
    name: "Salad-Sonden",
    kurz: "Gesundheitssonden am Salad-Container, die einen abgestürzten Dienst automatisch neu starten sollen.",
    funktionen: [
      "Salad prüft den Container in festen Abständen und startet ihn bei Ausfall neu.",
      "MERKREGEL aus der Messung: nur eine HTTP-Sonde auf /health fängt den 503-Ausfall — eine reine TCP-Sonde ist blind."
    ],
    ort: "Salad",
    zeitplan: "Dauerbetrieb",
    messung: "keine",
    messungHinweis: "Die Sonden prüfen den Server, auf dem diese Konsole läuft — antwortet die Konsole, lebt der Container. Ein eigener Herzschlag folgt in Stufe 2.",
    erwartetAlleMs: null,
    schonfristMs: null,
    startAnleitung: "Im Salad-Portal am Container die Health Probes prüfen (HTTP auf /health, failure_threshold maximal 20).",
    stopAnleitung: "Im Salad-Portal die Health Probes entfernen — davon wird abgeraten, dann startet nichts mehr automatisch neu."
  }
]);

const VERLAUF_MAX = 20;
// id -> { laeufe: [{ am, status, meldung, dauerMs }] } — juengster Lauf zuerst.
const herzschlaege = new Map();

/**
 * Nimmt einen Herzschlag entgegen. Fail-closed in jeder Richtung: ohne
 * hinterlegte Schluessel wird NICHTS angenommen (sonst koennte jeder die Ampel
 * gruen faerben), bei unbekannter Kennung ebenso.
 *
 * Schluesselformat in der Umgebung: SMEJJ_AUTOPILOT_KEYS="id1:schluessel1,id2:schluessel2"
 */
export function heartbeatAnnehmen({ id, key, status, meldung, dauerMs, env = process.env, jetztMs = Date.now() } = {}) {
  const schluessel = schluesselAus(env);
  if (schluessel === null) return { ok: false, status: 503, error: "autopilot_keys_missing" };

  const eintrag = AUTOPILOTEN.find((a) => a.id === String(id || "")) || null;
  if (!eintrag) return { ok: false, status: 404, error: "autopilot_unknown" };

  const erwartet = schluessel.get(eintrag.id);
  if (!erwartet || !sicherGleich(String(key || ""), erwartet)) {
    return { ok: false, status: 403, error: "autopilot_key_invalid" };
  }

  const ergebnis = status === "fehler" ? "fehler" : "ok";
  const gespeichert = herzschlaege.get(eintrag.id) || { laeufe: [] };
  gespeichert.laeufe.unshift({
    am: new Date(jetztMs).toISOString(),
    status: ergebnis,
    meldung: String(meldung || "").slice(0, 200),
    dauerMs: Number.isFinite(Number(dauerMs)) ? Math.max(0, Math.trunc(Number(dauerMs))) : null
  });
  gespeichert.laeufe = gespeichert.laeufe.slice(0, VERLAUF_MAX);
  herzschlaege.set(eintrag.id, gespeichert);
  return { ok: true, status: 200, id: eintrag.id, gespeichert: gespeichert.laeufe[0] };
}

/**
 * Die Ansicht fuer Modul AP. Ampelregeln, in Prosa:
 * - "keine Messung" (grau): kein Herzschlag angeschlossen ODER seit dem
 *   Serverstart noch keiner angekommen. Grau ist kein Alarm — aber auch kein
 *   Freibrief. Die Ansicht sagt dazu, WARUM nichts gemessen ist.
 * - gruen: letzter Herzschlag erfolgreich und juenger als das erwartete Intervall.
 * - gelb: letzter Herzschlag erfolgreich, aber ueberfaellig — noch in der Schonfrist.
 * - rot: letzter Herzschlag meldete einen Fehler, ODER ueberfaellig jenseits der Schonfrist.
 */
export function autopilotUebersicht({ jetztMs = Date.now(), startzeitMs = null } = {}) {
  const liste = AUTOPILOTEN.map((a) => bewerten(a, jetztMs));
  const zaehle = (farbe) => liste.filter((a) => a.ampel === farbe).length;
  return {
    ok: true,
    total: liste.length,
    gruen: zaehle("gruen"),
    gelb: zaehle("gelb"),
    rot: zaehle("rot"),
    grau: zaehle("grau"),
    autopiloten: liste.sort(sortiereNachDringlichkeit),
    serverStartAm: Number.isFinite(startzeitMs) ? new Date(startzeitMs).toISOString() : null,
    hinweis: "Herzschläge liegen im Arbeitsspeicher: nach einem Neustart des Control-Servers "
      + "beginnt die Messung von vorn, bis dahin steht »keine Messung«. "
      + "Grün gibt es nur für einen gemessenen, rechtzeitigen, erfolgreichen Lauf — nie aus der Konfiguration."
  };
}

function bewerten(a, jetztMs) {
  const gespeichert = herzschlaege.get(a.id) || { laeufe: [] };
  const letzter = gespeichert.laeufe[0] || null;
  const basis = {
    id: a.id,
    name: a.name,
    kurz: a.kurz,
    funktionen: a.funktionen,
    ort: a.ort,
    zeitplan: a.zeitplan,
    startAnleitung: a.startAnleitung,
    stopAnleitung: a.stopAnleitung,
    letzterLauf: letzter,
    verlauf: gespeichert.laeufe
  };

  if (a.messung !== "heartbeat") {
    return { ...basis, ampel: "grau", ampelGrund: a.messungHinweis || "Kein Herzschlag angeschlossen." };
  }
  if (!letzter) {
    return {
      ...basis,
      ampel: "grau",
      ampelGrund: "Seit dem Start des Control-Servers ist noch kein Herzschlag angekommen. "
        + "Nächster erwarteter Lauf: " + a.zeitplan + "."
    };
  }
  const alterMs = Math.max(0, jetztMs - Date.parse(letzter.am));
  if (letzter.status === "fehler") {
    return { ...basis, ampel: "rot", ampelGrund: "Der letzte Lauf hat einen Fehler gemeldet: " + (letzter.meldung || "ohne Meldung") + "." };
  }
  if (alterMs > a.erwartetAlleMs + a.schonfristMs) {
    return { ...basis, ampel: "rot", ampelGrund: "Überfällig: der letzte Lauf ist deutlich länger her als der Zeitplan erlaubt." };
  }
  if (alterMs > a.erwartetAlleMs) {
    return { ...basis, ampel: "gelb", ampelGrund: "Verspätet: der nächste Lauf hätte schon kommen müssen, die Schonfrist läuft noch." };
  }
  return { ...basis, ampel: "gruen", ampelGrund: "Letzter Lauf pünktlich und erfolgreich." };
}

/** Rot zuerst, dann gelb, dann grau, dann gruen — Auffaelliges nach oben. */
function sortiereNachDringlichkeit(a, b) {
  const rang = { rot: 0, gelb: 1, grau: 2, gruen: 3 };
  const unterschied = (rang[a.ampel] ?? 9) - (rang[b.ampel] ?? 9);
  if (unterschied !== 0) return unterschied;
  return a.name.localeCompare(b.name, "de");
}

function schluesselAus(env) {
  const roh = String(env?.SMEJJ_AUTOPILOT_KEYS || "").trim();
  if (!roh) return null;
  const karte = new Map();
  for (const paar of roh.split(",")) {
    const [id, wert] = paar.split(":").map((t) => String(t || "").trim());
    if (id && wert) karte.set(id, wert);
  }
  return karte.size ? karte : null;
}

/** Laengen-sicherer Vergleich — ein Zeichenvergleich wuerde die Laenge verraten. */
function sicherGleich(links, rechts) {
  const a = crypto.createHash("sha256").update(links, "utf8").digest();
  const b = crypto.createHash("sha256").update(rechts, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

/** Nur fuer Tests: den Arbeitsspeicher-Zustand zuruecksetzen. */
export function _herzschlaegeZuruecksetzen() {
  herzschlaege.clear();
}
