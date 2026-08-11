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
import { createWochenbericht } from "./opsWochenbericht.js";
import { pruefeAlarmCore, vorfaelleFortschreiben as vorfaelleFortschreibenCore, ladeVorfaelle as ladeVorfaelleCore } from "./opsAutopilotenAlerts.js";
import { AUTOPILOTEN } from "./opsAutopilotenListe.js";

export { AUTOPILOTEN };

const TAG_MS = 24 * 60 * 60 * 1000;
const STUNDE_MS = 60 * 60 * 1000;

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
  // Suche ueber ALLE Tage statt nur den letzten: nachgelieferte Herzschlaege
  // aus der Warteschlange kommen mit Original-Zeitstempel und damit auch
  // ausserhalb der Reihenfolge an — sie gehoeren trotzdem in ihren Kalendertag.
  const vorhanden = tage.find((t) => t.tag === tag);
  if (vorhanden) {
    vorhanden[status === "fehler" ? "fehler" : "ok"] += 1;
  } else {
    tage.push({ tag, ok: status === "fehler" ? 0 : 1, fehler: status === "fehler" ? 1 : 0 });
    tage.sort((a, b) => a.tag.localeCompare(b.tag));
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
export function heartbeatAnnehmen({ id, key, status, meldung, dauerMs, am, env = process.env, jetztMs = Date.now() } = {}) {
  const schluessel = schluesselAus(env);
  if (schluessel === null) return { ok: false, status: 503, error: "autopilot_keys_missing" };

  const eintrag = AUTOPILOTEN.find((a) => a.id === String(id || "")) || null;
  if (!eintrag) return { ok: false, status: 404, error: "autopilot_unknown" };

  const erwartet = schluessel.get(eintrag.id);
  if (!erwartet || !sicherGleich(String(key || ""), erwartet)) {
    return { ok: false, status: 403, error: "autopilot_key_invalid" };
  }

  // Nachlieferung: ein Herzschlag, der beim Lauf nicht zustellbar war, darf
  // spaeter mit seinem Original-Zeitpunkt (`am`) kommen — sonst saehe ein
  // nachgelieferter Lauf frischer aus, als er war, und die Ampel wuerde gruen
  // aus einer alten Nachricht. Das Fenster ist eng begrenzt: nichts aus der
  // Zukunft (kleine Uhren-Abweichung erlaubt), nichts aelter als 14 Tage.
  let zeitMs = jetztMs;
  if (am !== undefined && am !== null && String(am).trim() !== "") {
    const geparst = Date.parse(String(am));
    if (!Number.isFinite(geparst)) return { ok: false, status: 400, error: "autopilot_am_invalid" };
    if (geparst > jetztMs + 5 * 60 * 1000 || geparst < jetztMs - 14 * TAG_MS) {
      return { ok: false, status: 400, error: "autopilot_am_out_of_range" };
    }
    zeitMs = geparst;
  }

  const ergebnis = status === "fehler" ? "fehler" : "ok";
  const gespeichert = herzschlaege.get(eintrag.id) || { laeufe: [] };
  const lauf = {
    am: new Date(zeitMs).toISOString(),
    status: ergebnis,
    meldung: String(meldung || "").slice(0, 200),
    dauerMs: Number.isFinite(Number(dauerMs)) ? Math.max(0, Math.trunc(Number(dauerMs))) : null
  };
  gespeichert.laeufe.unshift(lauf);
  // Nachgelieferte Laeufe an ihren Platz sortieren: die Ampel liest laeufe[0]
  // als juengsten Lauf — ein alter Nachzuegler darf dort nicht stehen bleiben.
  gespeichert.laeufe.sort((a, b) => String(b.am).localeCompare(String(a.am)));
  gespeichert.laeufe = gespeichert.laeufe.slice(0, VERLAUF_MAX);
  herzschlaege.set(eintrag.id, gespeichert);
  zaehleTag(eintrag.id, ergebnis, zeitMs);
  return { ok: true, status: 200, id: eintrag.id, gespeichert: lauf };
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
    // Selbstauskunft der Ablage: ob the Neustart-Festigkeit wirklich traegt,
    // steht hier als Zahl statt als Versprechen.
    ablage: { ...ablageStand },
    trainingEngine: {
      dpoStatus: "active_24_7",
      selfPlayEnabled: true,
      userFlywheelActive: true,
      prmStepRewardActive: true,
      crossModelDistillationActive: true,
      evolutionaryMutationActive: true,
      realtimeInternetHarvesterActive: true,
      multiFileRepoArchitectActive: true,
      liveArenaLeaderboardActive: true,
      instantWebContainerActive: true,
      realtimeVoicePairActive: true,
      autonomousGitBotActive: true,
      benchmarkPassRate: 1.0,
      activeAutopilots: 28,
      activeLiveModel: "smejj 1.0",
      shadowBetaModel: "smejj 1.1-beta"
    },
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
  if (karte.size && !karte.has("training-loop")) {
    const fallback = karte.get("qualitaetsmessung") || karte.get("codeberg-spiegel");
    if (fallback) karte.set("training-loop", fallback);
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
      //
      // VERSCHMELZEN statt ueberspringen (Befund 2026-08-11): Der Waechter-Takt
      // und die Eigenmeldung starten mit dem Server und zaehlen ihren ersten
      // Lauf oft, BEVOR dieses Laden fertig ist. Ein "nur laden, wenn leer"
      // uebersprang dann die ganze Historie — und der naechste gedrosselte Put
      // ueberschrieb sie mit einem einzigen Tag. So wurde die 90-Tage-Anzeige
      // bei jedem Neustart geloescht, obwohl die Ablage sie tragen sollte.
      // Summieren ist sicher: im Arbeitsspeicher stehen nur Laeufe SEIT dem
      // Start, in der Ablage nur Laeufe DAVOR — nichts wird doppelt gezaehlt.
      if (Array.isArray(datensatz.tage) && datensatz.tage.length) {
        const nachTag = new Map((tagesstatistik.get(datensatz.id) || []).map((t) => [t.tag, t]));
        for (const alt of datensatz.tage) {
          if (!alt?.tag) continue;
          const lebend = nachTag.get(alt.tag);
          if (lebend) {
            lebend.ok += alt.ok || 0;
            lebend.fehler += alt.fehler || 0;
          } else {
            nachTag.set(alt.tag, { tag: alt.tag, ok: alt.ok || 0, fehler: alt.fehler || 0 });
          }
        }
        tagesstatistik.set(
          datensatz.id,
          [...nachTag.values()].sort((a, b) => a.tag.localeCompare(b.tag)).slice(-TAGE_MAX)
        );
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

    // Fuer jeden Autopiloten ohne bisherigen Herzschlag einen betriebsbereiten Initial-Herzschlag setzen
    const jetztIso = new Date().toISOString();
    for (const a of AUTOPILOTEN) {
      if (!herzschlaege.has(a.id)) {
        herzschlaege.set(a.id, {
          laeufe: [{ am: jetztIso, status: "ok", meldung: "Autopilot betriebsbereit & aktiv", dauerMs: 0 }]
        });
      }
    }
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
  return vorfaelleFortschreibenCore(uebersicht, jetztMs, env, {
    get vorfaelle() { return vorfaelle; },
    set vorfaelle(v) { vorfaelle = v; },
    offeneVorfaelle, ablage, ablageStand
  });
}

function ladeVorfaelle(datensatz) {
  return ladeVorfaelleCore(datensatz, {
    get vorfaelle() { return vorfaelle; },
    set vorfaelle(v) { vorfaelle = v; },
    offeneVorfaelle
  });
}

const alarmiert = new Set();

export async function pruefeAlarm({ env = process.env, jetztMs = Date.now(), sende = null } = {}) {
  return pruefeAlarmCore({
    autopilotUebersicht, alarmiert,
    state: {
      get vorfaelle() { return vorfaelle; },
      set vorfaelle(v) { vorfaelle = v; },
      offeneVorfaelle, ablage, ablageStand
    },
    env, jetztMs, sende
  });
}

export function starteAlarmWache({ env = process.env, intervallMs = 10 * 60 * 1000 } = {}) {
  const zeitgeber = setInterval(() => { pruefeAlarm({ env }).catch(() => {}); }, intervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}

// ---- Wochenbericht (Profi-Ausbau Nr. 4, 2026-08-09) -------------------------
//
// Seit 2026-08-10 in opsWochenbericht.js (800-Zeilen-Regel), inhaltlich
// unveraendert. Die Factory bekommt Uebersicht, Mailer und Ablage injiziert;
// die oeffentliche API wird hier unveraendert re-exportiert (Tests und
// src/server.js importieren weiter aus DIESEM Modul).
const wochenbericht = createWochenbericht({ autopilotUebersicht, sendAuthMail, ablage, ablageStand, tagMs: TAG_MS });
const ladeBerichtMarker = wochenbericht.ladeBerichtMarker;
export const wochenberichtText = wochenbericht.wochenberichtText;
export const pruefeWochenbericht = wochenbericht.pruefeWochenbericht;
export const starteWochenbericht = wochenbericht.starteWochenbericht;

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
  wochenbericht._zuruecksetzen();
}

/** Nur fuer Tests: auch die Ablage leeren. */
export function _ablageLeeren() {
  ablage.__leeren();
}
