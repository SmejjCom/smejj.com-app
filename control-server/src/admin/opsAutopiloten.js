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
import { createRecordStore } from "./recordStore.js";
import { sendAuthMail } from "../auth/mailer.js";

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
    // Seit Stufe 2 (2026-08-07) meldet sich die Cloud-Routine am Ende jedes
    // Laufs selbst — auch ein "keine neuen Funde"-Lauf ist ein Erfolg.
    messung: "heartbeat",
    erwartetAlleMs: 7 * TAG_MS,
    schonfristMs: 12 * STUNDE_MS,
    startAnleitung: "Auf claude.ai/code/routines die Routine »Konkurrenz-Radar (woechentlich)« öffnen und einmalig starten.",
    stopAnleitung: "Auf claude.ai/code/routines die Routine »Konkurrenz-Radar (woechentlich)« ausschalten."
  },
  {
    id: "training-loop",
    name: "Training-Loop",
    kurz: "STILLGELEGT seit 2. August 2026. Der Dienst ist im Zeabur-Portal angehalten und läuft nicht — das Modelltraining wurde am 6. August endgültig eingestellt.",
    funktionen: [
      "Taktete früher rund um die Uhr die Eval- und Trainings-Zyklen.",
      "Am 2026-08-02 im Zeabur-Portal angehalten (Service is suspended); am 2026-08-07 dort nachgemessen.",
      "Bis dahin stand in den Projektnotizen weiter »läuft 24/7« — fünf Tage lang glaubte niemand etwas anderes.",
      "Ein Neustart würde wieder Modellaufrufe kosten und ist ohne Training zwecklos."
    ],
    ort: "Zeabur",
    zeitplan: "stillgelegt",
    // Ein angehaltener Dienst KANN keinen Herzschlag senden. Ihn auf Herzschlag
    // zu stellen hiesse, ihn dauerhaft rot zu faerben — Alarm fuer einen
    // gewollten Zustand. Grau mit klarer Begruendung ist die ehrliche Anzeige.
    messung: "keine",
    messungHinweis: "Stillgelegt — kein Alarm, sondern ein gewollter Zustand. Diese Zeile bleibt stehen, damit niemand den Dienst für laufend hält.",
    erwartetAlleMs: null,
    schonfristMs: null,
    startAnleitung: "Nur mit Absicht: Zeabur-Portal → Projekt »untitled« → smejj-training-loop → Restart. Kostet wieder Modellaufrufe.",
    stopAnleitung: "Bereits angehalten — nichts zu tun."
  },
  {
    id: "brueckenwaechter",
    name: "Brücken-Wächter",
    kurz: "Prüft rund um die Uhr, ob die Chat-Brücke wirklich antwortet — von außen, über dieselbe Adresse wie ein Nutzer.",
    funktionen: [
      "Fragt jede Minute die öffentliche Adresse der Chat-Brücke ab und liest ihre Version.",
      "Erst 3 Fehlversuche in Folge gelten als Ausfall — eine Schwalbe ist kein Befund.",
      "Meldet sich alle 5 Minuten selbst; bleibt seine Meldung aus, wird diese Ampel rot.",
      "Seit 2026-08-07 ein EIGENER Dienst: vorher wohnte er im Training-Loop und wurde mit dessen Stilllegung fünf Tage lang unbemerkt still.",
      "Selbst nachschauen: smejj-brueckenwaechter.zeabur.app/bruecke zeigt Prüfungen, Fehler und vergangene Ausfälle; /health zeigt den Wächter selbst."
    ],
    ort: "Zeabur (eigener Dienst)",
    zeitplan: "Dauerbetrieb",
    // 5-Minuten-Takt, 10 Minuten erwartet, 20 Minuten Schonfrist: ein
    // verpasster Herzschlag ist noch kein Alarm, zwei schon.
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Zeabur-Portal → Projekt »untitled« → smejj-brueckenwaechter → Restart. Läuft ohne Modellkosten auf dem bereits bezahlten Server.",
    stopAnleitung: "Zeabur-Portal → smejj-brueckenwaechter → Suspend. Danach beobachtet niemand mehr, ob die Brücke lebt."
  },
  {
    id: "salad-sonden",
    name: "Salad-Sonden",
    kurz: "Gesundheitssonden am Salad-Container, die einen abgestürzten Dienst automatisch neu starten sollen.",
    funktionen: [
      "Salad prüft den Container in festen Abständen und startet ihn bei Ausfall neu.",
      "MERKREGEL aus der Messung: nur eine HTTP-Sonde auf /health fängt den 503-Ausfall — eine reine TCP-Sonde ist blind.",
      "Gemessen über die Eigenmeldung des Control-Servers alle 5 Minuten: lebt der Container, kommt die Meldung — bleibt sie aus, haben die Sonden ihren Dienst versagt."
    ],
    ort: "Salad",
    zeitplan: "Dauerbetrieb",
    // Eigenmeldung statt Fremdschluessel: der Server bezeugt sein eigenes
    // Leben. Faellt der Container, reisst die Meldekette ab — und genau dieses
    // Ausbleiben zeigt die Ampel nach der Schonfrist als Ausfall.
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Im Salad-Portal am Container die Health Probes prüfen (HTTP auf /health, failure_threshold maximal 20).",
    stopAnleitung: "Im Salad-Portal die Health Probes entfernen — davon wird abgeraten, dann startet nichts mehr automatisch neu."
  }
]);

const VERLAUF_MAX = 20;
// id -> { laeufe: [{ am, status, meldung, dauerMs }] } — juengster Lauf zuerst.
const herzschlaege = new Map();

// Stufe 3: externe Herzschlaege ueberleben den Neustart auf IDrive e2 (ein
// JSON-Datensatz je Autopilot). Die Eigenmeldung der Salad-Sonden wird bewusst
// NICHT abgelegt — sie bezeugt genau diesen Prozess und waere nach einem
// Neustart eine konservierte Luege; sie entsteht dort binnen Sekunden neu.
const ablage = createRecordStore("admin/autopiloten", { maximal: 50 });

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

/**
 * Stufe 3a: einen Autopiloten-Verlauf dauerhaft ablegen. Persistenz ist Zusatz,
 * nie Blocker — ein fehlgeschlagener Put kostet nur die Neustart-Festigkeit
 * dieses einen Herzschlags, niemals die 200-Antwort an den Absender.
 */
export async function persistiereHerzschlag(id, { env = process.env } = {}) {
  const gespeichert = herzschlaege.get(String(id || ""));
  if (!gespeichert || !gespeichert.laeufe.length) return false;
  try {
    await ablage.schreib({
      id: String(id),
      createdAt: gespeichert.laeufe[0].am,
      laeufe: gespeichert.laeufe
    }, { env });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stufe 3a: beim Serverstart die abgelegten Verlaeufe zurueckholen. Ein lebender
 * Eintrag im Arbeitsspeicher gewinnt immer gegen die Ablage — geladen wird nur,
 * was fehlt. Unbekannte Kennungen (z. B. ein inzwischen ausgebauter Autopilot)
 * bleiben liegen, statt Phantome auf die Ampel zu heben.
 */
export async function ladeHerzschlaege({ env = process.env } = {}) {
  try {
    const ergebnis = await ablage.liste({ env });
    if (!ergebnis.ok) return 0;
    let geladen = 0;
    for (const datensatz of ergebnis.datensaetze) {
      if (!AUTOPILOTEN.some((a) => a.id === datensatz.id)) continue;
      if (herzschlaege.has(datensatz.id)) continue;
      if (!Array.isArray(datensatz.laeufe) || !datensatz.laeufe.length) continue;
      herzschlaege.set(datensatz.id, { laeufe: datensatz.laeufe.slice(0, VERLAUF_MAX) });
      geladen += 1;
    }
    return geladen;
  } catch {
    return 0;
  }
}

// Stufe 3b: Wer bereits eine Rot-Mail bekommen hat, bekommt keine zweite fuer
// dieselbe Rot-Phase. Wird der Autopilot wieder gruen/gelb/grau, ist die
// Episode beendet und ein neues Rot meldet sich wieder.
const alarmiert = new Set();

/**
 * Ein Pruefdurchlauf der Alarm-Wache: neue Rot-Faelle melden, beendete
 * Episoden vergessen. `sende` ist fuer Tests injizierbar; im Betrieb geht die
 * Mail an die erste Adresse aus SMEJJ_ADMIN_OWNER_EMAILS — dieselbe Quelle,
 * die auch den Adminbereich oeffnet.
 */
export async function pruefeAlarm({ env = process.env, jetztMs = Date.now(), sende = null } = {}) {
  const uebersicht = autopilotUebersicht({ jetztMs });
  const rote = uebersicht.autopiloten.filter((a) => a.ampel === "rot");
  const roteIds = new Set(rote.map((a) => a.id));
  for (const id of [...alarmiert]) if (!roteIds.has(id)) alarmiert.delete(id);

  const neue = rote.filter((a) => !alarmiert.has(a.id));
  if (!neue.length) return { gemeldet: 0 };
  const empfaenger = String(env.SMEJJ_ADMIN_OWNER_EMAILS || "").split(",")[0].trim();
  if (!empfaenger) return { gemeldet: 0, hinweis: "kein Empfaenger hinterlegt" };

  const senden = sende || ((nachricht) => sendAuthMail(nachricht, env));
  let gemeldet = 0;
  for (const a of neue) {
    try {
      await senden({
        to: empfaenger,
        subject: `smejj.com Autopilot ROT: ${a.name}`,
        text: `Der Autopilot "${a.name}" steht auf ROT.\n\n`
          + `Grund: ${a.ampelGrund}\n`
          + `Ort: ${a.ort} · Zeitplan: ${a.zeitplan}\n\n`
          + "Ampel und Bedienungs-Anleitung: https://smejj.com/admin/autopiloten/\n\n"
          + "Diese Mail kommt einmal je Rot-Phase. Wird der Autopilot wieder gruen "
          + "und faellt erneut aus, meldet er sich wieder.",
        art: "autopilot-alarm"
      });
      alarmiert.add(a.id);
      gemeldet += 1;
    } catch {
      // Naechster Takt versucht es erneut — ein Mail-Ausfall darf den Alarm
      // nur verzoegern, nie verschlucken.
    }
  }
  return { gemeldet };
}

/** Stufe 3b: die Alarm-Wache im Takt starten. unref — haelt den Prozess nicht wach. */
export function starteAlarmWache({ env = process.env, intervallMs = 10 * 60 * 1000 } = {}) {
  const zeitgeber = setInterval(() => { pruefeAlarm({ env }).catch(() => {}); }, intervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}

/**
 * Eigenmeldung des Control-Servers fuer die Salad-Sonden — in-process, ohne
 * Schluessel: der Server bezeugt sich selbst, eine Faelschung von aussen ist
 * ueber diesen Weg nicht moeglich (er haengt an keiner Route).
 * `unref()` haelt den Prozess nicht am Leben, Tests und Shutdown bleiben sauber.
 */
export function starteSelbstmessung({ intervallMs = 5 * 60 * 1000 } = {}) {
  const melden = () => {
    const gespeichert = herzschlaege.get("salad-sonden") || { laeufe: [] };
    gespeichert.laeufe.unshift({
      am: new Date().toISOString(),
      status: "ok",
      meldung: "Eigenmeldung: Container läuft.",
      dauerMs: null
    });
    gespeichert.laeufe = gespeichert.laeufe.slice(0, VERLAUF_MAX);
    herzschlaege.set("salad-sonden", gespeichert);
  };
  melden();
  const zeitgeber = setInterval(melden, intervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}

/** Nur fuer Tests: den Arbeitsspeicher-Zustand zuruecksetzen (NICHT die Ablage). */
export function _herzschlaegeZuruecksetzen() {
  herzschlaege.clear();
  alarmiert.clear();
}

/** Nur fuer Tests: auch die Ablage leeren. */
export function _ablageLeeren() {
  ablage.__leeren();
}
