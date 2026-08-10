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
// Der Herzschlag-Speicher liegt im Arbeitsspeicher UND (seit Stufe 3) auf
// IDrive e2: geschrieben wird nach der Quittung, geladen beim Start. Ein
// Neustart setzt die Ampel also nicht mehr auf null zurueck. Nur die
// Eigenmeldung der Salad-Sonden bleibt bewusst fluechtig — sie bezeugt genau
// diesen Prozess und waere nach einem Neustart eine konservierte Luege.
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
      "Selbst nachschauen: smejj-brueckenwaechter.zeabur.app/bruecke zeigt Prüfungen, Fehler und vergangene Ausfälle; /health zeigt den Wächter selbst.",
      "Diese Ampel fragt ihn alle 5 Minuten ab (statt auf eine Meldung zu warten) — antwortet er nicht mehr, wird sie rot."
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

// Profi-Ausbau (2026-08-09): Tages-Statistik fuer die 90-Tage-Anzeige.
// id -> [{ tag: "2026-08-09", ok: 3, fehler: 0 }] — aufsteigend nach Tag.
// Bewusst je TAG verdichtet statt je Lauf: der Bruecken-Waechter meldet
// 288-mal am Tag, ein Verlauf je Lauf waere in 90 Tagen ein 26.000-Zeilen-
// Datensatz. Die Frage der Anzeige ist aber nur: War dieser Tag sauber?
const TAGE_MAX = 90;
const tagesstatistik = new Map();

function zaehleTag(id, status, jetztMs) {
  const tag = new Date(jetztMs).toISOString().slice(0, 10);
  const tage = tagesstatistik.get(id) || [];
  const letzter = tage[tage.length - 1];
  if (letzter && letzter.tag === tag) {
    letzter[status === "fehler" ? "fehler" : "ok"] += 1;
  } else {
    tage.push({ tag, ok: status === "fehler" ? 0 : 1, fehler: status === "fehler" ? 1 : 0 });
  }
  tagesstatistik.set(id, tage.slice(-TAGE_MAX));
}

// Stufe 3: externe Herzschlaege ueberleben den Neustart auf IDrive e2 (ein
// JSON-Datensatz je Autopilot). Die Eigenmeldung der Salad-Sonden wird bewusst
// NICHT abgelegt — sie bezeugt genau diesen Prozess und waere nach einem
// Neustart eine konservierte Luege; sie entsteht dort binnen Sekunden neu.
const ablage = createRecordStore("admin/autopiloten", { maximal: 50 });

// Was die Ablage tatsaechlich getan hat — sichtbar in der Ansicht.
//
// WARUM DAS HIER STEHT (Befund 2026-08-08): Nach einem Neustart standen zwei
// Autopiloten auf grau, obwohl ihre Herzschlaege haetten geladen werden
// muessen. Ob das Schreiben oder das Laden fehlschlug, war von aussen NICHT
// zu unterscheiden — beide Wege verschlucken ihre Fehler bewusst, damit sie
// nie die Quittung an den Absender gefaehrden. Ein Modul, das "gemessen statt
// behauptet" verspricht, darf ausgerechnet ueber sich selbst nicht raten.
const ablageStand = {
  geladenBeimStart: null,   // null = Laden lief noch nicht
  ladeFehler: null,
  schreibVersuche: 0,
  schreibErfolge: 0,
  letzterSchreibFehler: null
};

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
  zaehleTag(eintrag.id, ergebnis, jetztMs);
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
    wartung: zaehle("wartung"),
    autopiloten: liste.sort(sortiereNachDringlichkeit),
    // Vorfall-Protokoll: offene zuerst (bis === null), dann die juengsten.
    vorfaelle: [...vorfaelle].sort((a, b) => {
      if ((a.bis === null) !== (b.bis === null)) return a.bis === null ? -1 : 1;
      return String(b.von).localeCompare(String(a.von));
    }),
    serverStartAm: Number.isFinite(startzeitMs) ? new Date(startzeitMs).toISOString() : null,
    // Selbstauskunft der Ablage: ob die Neustart-Festigkeit wirklich traegt,
    // steht hier als Zahl statt als Versprechen.
    ablage: { ...ablageStand },
    // Der Text muss dem Stand der Technik folgen: bis Stufe 3 stand hier
    // "nach einem Neustart beginnt die Messung von vorn" — seit die Verläufe
    // auf IDrive e2 liegen, stimmt das nicht mehr. Ein veralteter Hinweis in
    // einer Ansicht, die Ehrlichkeit verspricht, ist derselbe Fehler wie eine
    // Ampel, die Konfiguration für Messung hält.
    hinweis: "Herzschläge werden dauerhaft abgelegt und überstehen einen Neustart des Control-Servers — "
      + "die Ampel beginnt nicht mehr bei null. "
      + "Grün gibt es nur für einen gemessenen, rechtzeitigen, erfolgreichen Lauf — nie aus der Konfiguration."
  };
}

function bewerten(a, jetztMs) {
  const gespeichert = herzschlaege.get(a.id) || { laeufe: [] };
  const letzter = gespeichert.laeufe[0] || null;
  const inWartung = wartung.get(a.id) || null;
  const basis = {
    wartung: inWartung,
    id: a.id,
    name: a.name,
    kurz: a.kurz,
    funktionen: a.funktionen,
    ort: a.ort,
    zeitplan: a.zeitplan,
    startAnleitung: a.startAnleitung,
    stopAnleitung: a.stopAnleitung,
    letzterLauf: letzter,
    verlauf: gespeichert.laeufe,
    // 90-Tage-Anzeige: je Tag verdichtet. Die Erfolgsquote zaehlt LAEUFE, nicht
    // Zeit — und sagt das in der Ansicht auch so. Eine "Uptime", die aus zwei
    // Cron-Laeufen am Tag 99,99 % errechnet, waere gelogen.
    tage: tagesstatistik.get(a.id) || [],
    erfolgsquote90: erfolgsquote(tagesstatistik.get(a.id))
  };

  // Wartung schlaegt alles: wer stumm geschaltet ist, loest keinen Alarm aus.
  // Die Anzeige sagt trotzdem, seit wann und warum — Stummschalten heisst
  // nicht Verstecken.
  if (inWartung) {
    return {
      ...basis,
      ampel: "wartung",
      ampelGrund: `In Wartung seit ${inWartung.seit}${inWartung.grund ? " — " + inWartung.grund : ""}. `
        + "Kein Alarm, bis die Wartung beendet wird."
    };
  }
  if (a.messung !== "heartbeat") {
    return { ...basis, ampel: "grau", ampelGrund: a.messungHinweis || "Kein Herzschlag angeschlossen." };
  }
  if (!letzter) {
    return {
      ...basis,
      ampel: "grau",
      // Nicht mehr "seit dem Start" — die Ablage überdauert den Neustart.
      // Fehlt hier etwas, hat dieser Autopilot wirklich noch nie gemeldet.
      ampelGrund: "Von diesem Autopiloten ist noch kein Herzschlag angekommen — auch nicht aus der Ablage. "
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

/** Anteil erfolgreicher Laeufe ueber die Tages-Statistik; null ohne Messung. */
function erfolgsquote(tage) {
  if (!Array.isArray(tage) || !tage.length) return null;
  let ok = 0, gesamt = 0;
  for (const t of tage) { ok += t.ok || 0; gesamt += (t.ok || 0) + (t.fehler || 0); }
  if (!gesamt) return null;
  return { prozent: Math.round((ok / gesamt) * 1000) / 10, laeufe: gesamt, tage: tage.length };
}

/** Rot zuerst, dann gelb, dann grau, dann gruen — Auffaelliges nach oben. */
function sortiereNachDringlichkeit(a, b) {
  // Wartung ganz nach unten: sie ist bewusst herbeigefuehrt und braucht keine
  // Aufmerksamkeit — anders als grau, das eine offene Frage ist.
  const rang = { rot: 0, gelb: 1, grau: 2, gruen: 3, wartung: 4 };
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
 * Der Bruecken-Waechter wird ABGEFRAGT statt zu melden (2026-08-08).
 *
 * Warum umgekehrt zu allen anderen: Ein Push-Herzschlag braucht einen
 * Schluessel am fremden Dienst — und den dort einzutragen ist ein Handgriff,
 * der leicht vergessen wird und die Ampel dann faelschlich rot faerbt. Der
 * Waechter hat aber etwas, das die cron-Skripte nicht haben: eine oeffentliche
 * Adresse. Also holt der Control-Server sich die Auskunft selbst.
 *
 * Das ist KEIN schwaecherer Nachweis: Antwortet /health, laeuft der Prozess;
 * antwortet er nicht, ist der Waechter tot — genau die Frage, um die es geht.
 * Zusaetzlich wandert der Bruecken-Zustand aus /bruecke in die Meldung, damit
 * in der Ampel steht, was der Waechter gerade sieht.
 */
export async function frageWaechterAb({ jetztMs = Date.now(), fetchImpl = fetch } = {}) {
  const basis = process.env.SMEJJ_WAECHTER_URL || "https://smejj-brueckenwaechter.zeabur.app";
  const startMs = Date.now();
  try {
    const [gesundheit, bruecke] = await Promise.all([
      fetchImpl(`${basis}/health`, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetchImpl(`${basis}/bruecke`, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    ]);
    // Keine Antwort = kein Herzschlag. Nichts eintragen ist hier richtig:
    // Ausbleiben IST der Alarm, eine erfundene Meldung waere das Gegenteil.
    if (!gesundheit?.ok) return false;

    const meldung = bruecke?.erreichbar === false
      ? `Brücke AUSGEFALLEN seit ${bruecke.laufenderAusfall?.seit || "?"}`
      : bruecke?.erreichbar === true
        ? `Brücke gesund (${bruecke.letzteVersion || "?"}), ${bruecke.gesamtPruefungen || 0} Prüfungen`
        : "Wächter läuft, erste Brücken-Prüfung steht aus";

    const gespeichert = herzschlaege.get("brueckenwaechter") || { laeufe: [] };
    gespeichert.laeufe.unshift({
      am: new Date(jetztMs).toISOString(),
      status: "ok",
      meldung: meldung.slice(0, 200),
      // Die Dauer der Abfrage selbst — misst den Weg Control-Server -> Waechter.
      dauerMs: Math.max(0, Date.now() - startMs)
    });
    gespeichert.laeufe = gespeichert.laeufe.slice(0, VERLAUF_MAX);
    herzschlaege.set("brueckenwaechter", gespeichert);
    zaehleTag("brueckenwaechter", "ok", jetztMs);
    persistiereTageGedrosselt("brueckenwaechter");
    return true;
  } catch {
    return false;
  }
}

/** Die Waechter-Abfrage im Takt starten. unref — haelt den Prozess nicht wach. */
export function starteWaechterAbfrage({ intervallMs = 5 * 60 * 1000 } = {}) {
  frageWaechterAb().catch(() => {});
  const zeitgeber = setInterval(() => { frageWaechterAb().catch(() => {}); }, intervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}

/**
 * Stufe 3a: einen Autopiloten-Verlauf dauerhaft ablegen. Persistenz ist Zusatz,
 * nie Blocker — ein fehlgeschlagener Put kostet nur die Neustart-Festigkeit
 * dieses einen Herzschlags, niemals die 200-Antwort an den Absender.
 */
export async function persistiereHerzschlag(id, { env = process.env } = {}) {
  const gespeichert = herzschlaege.get(String(id || ""));
  if (!gespeichert || !gespeichert.laeufe.length) return false;
  ablageStand.schreibVersuche += 1;
  const datensatz = {
    id: String(id),
    createdAt: gespeichert.laeufe[0].am,
    laeufe: gespeichert.laeufe,
    // Die Tages-Statistik faehrt im selben Datensatz mit — ein Put statt zwei.
    tage: tagesstatistik.get(String(id)) || []
  };
  // Zwei Anlaeufe mit grosszuegigem Zeitlimit. Hier wartet kein Mensch auf
  // eine Antwort — der Absender hat seine Quittung laengst. Was zaehlt, ist
  // dass der Datensatz ankommt, nicht dass es schnell geht.
  for (const timeoutMs of [20_000, 20_000]) {
    try {
      await ablage.schreib(datensatz, { env, timeoutMs });
      ablageStand.schreibErfolge += 1;
      ablageStand.letzterSchreibFehler = null;
      return true;
    } catch (fehler) {
      ablageStand.letzterSchreibFehler = String(fehler?.message || fehler).slice(0, 120);
    }
  }
  return false;
}

/**
 * Die Dauerbetriebs-Piloten (Waechter-Abfrage, Salad-Eigenmeldung) melden alle
 * 5 Minuten — jedes Mal zu schreiben waeren ~576 Puts am Tag fuer eine Anzeige,
 * die sich je Tag genau einmal aendert. Gedrosselt auf hoechstens einen Put pro
 * Stunde je Kennung. Abgelegt wird NUR die Tages-Statistik, nie die laeufe:
 * eine konservierte "lebt noch"-Meldung waere nach dem Neustart eine Luege
 * (siehe Kommentar an der Ablage) — dass ein VERGANGENER Tag sauber war,
 * bleibt dagegen auch nach einem Neustart wahr.
 */
const PERSISTENZ_TAKT_MS = 60 * 60 * 1000;
const letztePersistenz = new Map();

function persistiereTageGedrosselt(id, { env = process.env, jetztMs = Date.now() } = {}) {
  const zuletzt = letztePersistenz.get(id) || 0;
  if (jetztMs - zuletzt < PERSISTENZ_TAKT_MS) return;
  letztePersistenz.set(id, jetztMs);
  const tage = tagesstatistik.get(id) || [];
  if (!tage.length) return;
  ablageStand.schreibVersuche += 1;
  ablage.schreib({
    id, createdAt: new Date(jetztMs).toISOString(), laeufe: [], tage
  }, { env, timeoutMs: 20_000 }).then(() => {
    ablageStand.schreibErfolge += 1;
    ablageStand.letzterSchreibFehler = null;
  }).catch((fehler) => {
    ablageStand.letzterSchreibFehler = String(fehler?.message || fehler).slice(0, 120);
  });
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
    if (!ergebnis.ok) {
      ablageStand.geladenBeimStart = 0;
      ablageStand.ladeFehler = ergebnis.error || "record_store_list_failed";
      return 0;
    }
    let geladen = 0;
    for (const datensatz of ergebnis.datensaetze) {
      if (ladeWartung(datensatz)) continue;
      if (ladeVorfaelle(datensatz)) continue;
      if (ladeBerichtMarker(datensatz)) continue;
      if (!AUTOPILOTEN.some((a) => a.id === datensatz.id)) continue;
      // Tages-Statistik VOR der laeufe-Pruefung zurueckholen: die Datensaetze
      // der Dauerbetriebs-Piloten tragen absichtlich leere laeufe, aber volle
      // Tage — sonst waere die 90-Tage-Anzeige nach jedem Neustart leer.
      if (Array.isArray(datensatz.tage) && datensatz.tage.length && !tagesstatistik.has(datensatz.id)) {
        tagesstatistik.set(datensatz.id, datensatz.tage.slice(-TAGE_MAX));
      }
      if (herzschlaege.has(datensatz.id)) continue;
      if (!Array.isArray(datensatz.laeufe) || !datensatz.laeufe.length) continue;
      herzschlaege.set(datensatz.id, { laeufe: datensatz.laeufe.slice(0, VERLAUF_MAX) });
      geladen += 1;
    }
    ablageStand.geladenBeimStart = geladen;
    // Ein leeres Ergebnis ist kein Fehler, aber es ist auch kein Erfolg —
    // die Zahl daneben sagt, ob ueberhaupt etwas in der Ablage lag.
    ablageStand.abgelegteDatensaetze = ergebnis.datensaetze.length;
    ablageStand.ladeFehler = null;
    return geladen;
  } catch (fehler) {
    ablageStand.geladenBeimStart = 0;
    ablageStand.ladeFehler = String(fehler?.message || fehler).slice(0, 120);
    return 0;
  }
}

// ---- Wartung (Stufe 2b, Betreiber-Freigabe 2026-08-08) ----------------------
//
// WAS HIER BEWUSST NICHT STEHT: Knoepfe, die einen Dienst wirklich starten
// oder stoppen. Der Control-Server hat weder einen Zeabur- noch einen
// claude.ai-Zugang (am 2026-08-08 in der Umgebung nachgesehen: nur der
// Salad-Schluessel, und das ist er selbst). Ein "Start"-Knopf fuer den
// Konkurrenz-Radar waere eine Attrappe — und eine Attrappe in einer Ansicht,
// die "gemessen statt behauptet" verspricht, waere schlimmer als ihr Fehlen.
//
// WAS ER STATTDESSEN KANN, und was echten Wert hat: eine Automatik in WARTUNG
// setzen. Wer weiss, dass ein Autopilot gerade absichtlich stillsteht, schaltet
// ihn stumm — die Ampel zeigt "Wartung" statt Rot, und die Alarm-Mail bleibt
// aus. Ohne das ist die einzige Alternative, den Alarm zu ignorieren; und eine
// Ampel, die man ignorieren lernt, ist keine Ampel mehr.
const wartung = new Map();   // id -> { seit, grund, wer }

export function istInWartung(id) {
  return wartung.has(String(id || ""));
}

/**
 * Wartung ein- oder ausschalten. Die Entscheidung wird abgelegt, damit sie
 * einen Neustart uebersteht — sonst faellt der stummgeschaltete Autopilot
 * nach der naechsten Reallokation ploetzlich wieder in den Alarm.
 */
export async function setzeWartung(id, an, { grund = "", wer = "", env = process.env, jetztMs = Date.now() } = {}) {
  const kennung = String(id || "");
  if (!AUTOPILOTEN.some((a) => a.id === kennung)) return { ok: false, error: "autopilot_unknown" };
  if (an) {
    wartung.set(kennung, { seit: new Date(jetztMs).toISOString(), grund: String(grund).slice(0, 200), wer });
    // Eine Wartung beendet die laufende Alarm-Episode: sonst bliebe die
    // Erinnerung stehen und nach dem Ende der Wartung kaeme keine Mail mehr.
    alarmiert.delete(kennung);
  } else {
    wartung.delete(kennung);
  }
  try {
    await ablage.schreib({
      id: "_wartung",
      createdAt: new Date(jetztMs).toISOString(),
      eintraege: [...wartung.entries()].map(([k, v]) => ({ id: k, ...v }))
    }, { env, timeoutMs: 20_000 });
  } catch {
    // Die Wartung gilt trotzdem — sie steht im Arbeitsspeicher. Nur ihre
    // Neustart-Festigkeit ist dahin, und das faellt in der Ablage-Auskunft auf.
  }
  return { ok: true, id: kennung, wartung: an ? wartung.get(kennung) : null };
}

/** Beim Start die abgelegten Wartungen zurueckholen. */
function ladeWartung(datensatz) {
  if (datensatz?.id !== "_wartung" || !Array.isArray(datensatz.eintraege)) return false;
  for (const e of datensatz.eintraege) {
    if (e?.id && AUTOPILOTEN.some((a) => a.id === e.id)) {
      wartung.set(e.id, { seit: e.seit, grund: e.grund, wer: e.wer });
    }
  }
  return true;
}

// ---- Vorfall-Protokoll (Profi-Ausbau 2026-08-09) ----------------------------
//
// Was die Status-Seiten der grossen Anbieter koennen und diese Ampel bisher
// nicht: sagen, was FRUEHER kaputt war. Eine Ampel zeigt nur das Jetzt — wer
// morgens auf gruen schaut, erfaehrt nie, dass nachts drei Stunden rot waren.
// Jede Rot-Phase wird deshalb als Vorfall festgehalten: von wann bis wann,
// welcher Autopilot, welcher Grund. Erkannt wird sie von der Alarm-Wache, die
// ohnehin alle 10 Minuten hinschaut — feiner aufgeloest ist auch die Mail nicht.
const VORFAELLE_MAX = 50;
let vorfaelle = [];                 // abgeschlossene + offene, juengste zuerst
const offeneVorfaelle = new Map();  // id -> Vorfall (bis === null)

function vorfaelleFortschreiben(uebersicht, jetztMs, env) {
  // Seit Nr. 5 (2026-08-09) zaehlt auch GELB als Vorfall: wiederkehrende
  // Verspaetungen sind das Fruehwarnzeichen, das in einer Nur-Rot-Historie
  // unsichtbar bliebe. Eskaliert eine Gelb-Phase zu Rot, bleibt es EIN
  // Vorfall — die Art wird angehoben, der Beginn bleibt der Gelb-Beginn.
  const problematische = new Map(uebersicht.autopiloten
    .filter((a) => a.ampel === "rot" || a.ampel === "gelb")
    .map((a) => [a.id, a]));
  let geaendert = false;

  for (const [id, a] of problematische) {
    const offen = offeneVorfaelle.get(id);
    if (offen) {
      if (offen.art !== "rot" && a.ampel === "rot") {
        offen.art = "rot";
        offen.grund = String(a.ampelGrund || "").slice(0, 200);
        geaendert = true;
      }
      continue;
    }
    const vorfall = {
      id, name: a.name,
      art: a.ampel,
      von: new Date(jetztMs).toISOString(),
      bis: null,
      grund: String(a.ampelGrund || "").slice(0, 200)
    };
    offeneVorfaelle.set(id, vorfall);
    vorfaelle.unshift(vorfall);
    geaendert = true;
  }
  for (const [id, vorfall] of [...offeneVorfaelle]) {
    if (problematische.has(id)) continue;
    vorfall.bis = new Date(jetztMs).toISOString();
    vorfall.dauerMs = Math.max(0, jetztMs - Date.parse(vorfall.von));
    offeneVorfaelle.delete(id);
    geaendert = true;
  }
  if (!geaendert) return;
  vorfaelle = vorfaelle.slice(0, VORFAELLE_MAX);
  // Ablegen wie die Wartung: gilt sofort im Arbeitsspeicher, die Ablage ist
  // nur die Neustart-Festigkeit — ein Fehlschlag faellt in der Auskunft auf.
  ablage.schreib({
    id: "_vorfaelle",
    createdAt: new Date(jetztMs).toISOString(),
    eintraege: vorfaelle
  }, { env, timeoutMs: 20_000 }).catch((fehler) => {
    ablageStand.letzterSchreibFehler = String(fehler?.message || fehler).slice(0, 120);
  });
}

/** Beim Start die abgelegten Vorfaelle zurueckholen (Gegenstueck zu ladeWartung). */
function ladeVorfaelle(datensatz) {
  if (datensatz?.id !== "_vorfaelle" || !Array.isArray(datensatz.eintraege)) return false;
  if (!vorfaelle.length) {
    vorfaelle = datensatz.eintraege.slice(0, VORFAELLE_MAX);
    for (const v of vorfaelle) if (v && v.bis === null && v.id) offeneVorfaelle.set(v.id, v);
  }
  return true;
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
  // Vorfaelle IMMER fortschreiben — auch wenn keine Mail rausgeht (kein
  // Empfaenger, schon alarmiert): das Protokoll haengt nicht am Postausgang.
  vorfaelleFortschreiben(uebersicht, jetztMs, env);
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

// ---- Wochenbericht (Profi-Ausbau Nr. 4, 2026-08-09) -------------------------
//
// Die Ampel sieht nur, wer hinschaut. Der Wochenbericht dreht das um: jeden
// Montag ab 7:00 UTC (nach dem Radar-Lauf um 6:00) EINE Mail mit der Lage der
// Woche — wie die SLA-Reports der grossen Anbieter, nur ehrlich: Quoten aus
// gemessenen LAEUFEN, Vorfaelle mit Dauer, Stillgelegtes als "gewollt".
//
// Der "schon gesendet"-Marker liegt mit in der Ablage: Salad verteilt den
// Container mehrmals taeglich neu, ein reiner Arbeitsspeicher-Marker wuerde am
// selben Montag mehrere Mails ausloesen. (Scheitert das Ablegen UND faellt der
// Container am selben Montag, kommt schlimmstens eine zweite Mail — die
// harmlosere Richtung; verschluckt wird keiner.)
const bericht = { zuletztFuer: null };

/** Beim Start den Marker zurueckholen (Gegenstueck zu ladeWartung). */
function ladeBerichtMarker(datensatz) {
  if (datensatz?.id !== "_wochenbericht") return false;
  if (!bericht.zuletztFuer && typeof datensatz.tag === "string") bericht.zuletztFuer = datensatz.tag;
  return true;
}

/** Der Berichtstext — reine Funktion, damit der Inhalt ohne Mail testbar ist. */
export function wochenberichtText({ jetztMs = Date.now() } = {}) {
  const u = autopilotUebersicht({ jetztMs });
  const grenzeMs = jetztMs - 7 * TAG_MS;
  const AMPELWORT = { gruen: "gruen", gelb: "GELB", rot: "ROT", grau: "keine Messung", wartung: "Wartung" };

  const zeilen = u.autopiloten.map((a) => {
    if (a.zeitplan === "stillgelegt") return `- ${a.name}: stillgelegt (gewollt, kein Alarm)`;
    const woche = (a.tage || []).filter((t) => Date.parse(t.tag) >= grenzeMs);
    const laeufe = woche.reduce((s, t) => s + (t.ok || 0) + (t.fehler || 0), 0);
    const fehler = woche.reduce((s, t) => s + (t.fehler || 0), 0);
    const messung = laeufe
      ? `${laeufe} Laeufe, ${fehler} Fehler (${Math.round(((laeufe - fehler) / laeufe) * 1000) / 10} % erfolgreich)`
      : "keine Laeufe gemessen";
    return `- ${a.name} [${AMPELWORT[a.ampel] || a.ampel}]: ${messung}`;
  });

  const wochenVorfaelle = u.vorfaelle.filter((v) => Date.parse(v.von) >= grenzeMs);
  const vorfallZeilen = wochenVorfaelle.length
    ? wochenVorfaelle.map((v) => {
      const art = v.art === "gelb" ? "Verspaetung" : "Ausfall";
      const dauer = v.bis === null ? "laeuft noch" : `${Math.max(1, Math.round((v.dauerMs || 0) / 60000))} min`;
      return `- ${v.name} (${art}, ${dauer}): ${v.grund}`;
    })
    : ["- keine"];

  return `smejj.com Autopiloten — Wochenbericht\n\n`
    + `Ampel jetzt: ${u.gruen} gruen, ${u.gelb} gelb, ${u.rot} rot, ${u.grau} ohne Messung`
    + (u.wartung ? `, ${u.wartung} in Wartung` : "") + `\n\n`
    + `Letzte 7 Tage je Autopilot:\n${zeilen.join("\n")}\n\n`
    + `Vorfaelle der letzten 7 Tage:\n${vorfallZeilen.join("\n")}\n\n`
    + `Ampel und Einzelheiten: https://smejj.com/admin/autopiloten/\n`
    + `Dieser Bericht kommt jeden Montag ab 7:00 UTC — einmal, auch wenn der Server dazwischen neu startet.`;
}

/** Faelligkeit pruefen und hoechstens einmal je Montag senden. */
export async function pruefeWochenbericht({ env = process.env, jetztMs = Date.now(), sende = null } = {}) {
  const jetzt = new Date(jetztMs);
  if (jetzt.getUTCDay() !== 1 || jetzt.getUTCHours() < 7) return { gesendet: false, grund: "nicht faellig" };
  const montag = jetzt.toISOString().slice(0, 10);
  if (bericht.zuletztFuer === montag) return { gesendet: false, grund: "schon gesendet" };
  const empfaenger = String(env.SMEJJ_ADMIN_OWNER_EMAILS || "").split(",")[0].trim();
  if (!empfaenger) return { gesendet: false, grund: "kein Empfaenger hinterlegt" };

  const senden = sende || ((nachricht) => sendAuthMail(nachricht, env));
  await senden({
    to: empfaenger,
    subject: `smejj.com Autopiloten — Wochenbericht ${montag}`,
    text: wochenberichtText({ jetztMs }),
    art: "autopilot-wochenbericht"
  });
  // Marker erst NACH erfolgreichem Senden: schlaegt die Mail fehl, wirft
  // senden(), nichts wird vermerkt, und der naechste Takt versucht es erneut.
  bericht.zuletztFuer = montag;
  ablage.schreib({ id: "_wochenbericht", createdAt: jetzt.toISOString(), tag: montag }, { env, timeoutMs: 20_000 })
    .catch((fehler) => { ablageStand.letzterSchreibFehler = String(fehler?.message || fehler).slice(0, 120); });
  return { gesendet: true, fuer: montag };
}

/** Den Wochenbericht im Takt pruefen. unref — haelt den Prozess nicht wach. */
export function starteWochenbericht({ env = process.env, intervallMs = 30 * 60 * 1000 } = {}) {
  const zeitgeber = setInterval(() => { pruefeWochenbericht({ env }).catch(() => {}); }, intervallMs);
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
    zaehleTag("salad-sonden", "ok", Date.now());
    persistiereTageGedrosselt("salad-sonden");
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
  tagesstatistik.clear();
  letztePersistenz.clear();
  vorfaelle = [];
  offeneVorfaelle.clear();
  bericht.zuletztFuer = null;
}

/** Nur fuer Tests: auch die Ablage leeren. */
export function _ablageLeeren() {
  ablage.__leeren();
}
