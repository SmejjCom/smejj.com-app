// smejj.com — Waechter fuer die Chat-Bruecke.
//
// WARUM (gemessen am 2026-08-05, nicht vermutet): Die Bruecke war an diesem Tag
// zweimal laenger tot — einmal 25 Minuten am Stueck. Salad meldete waehrenddessen
// durchgehend `state=running ready=true`, weil seine Sonde nur prueft, OB jemand
// auf Port 8080 lauscht, nie ob Antworten herauskommen. Der Versuch, dort eine
// HTTP-Sonde einzurichten, ist zweimal fehlgeschlagen (sie erreicht /health nie
// und toetet den Container nach Ablauf ihres Budgets).
//
// Also wird von aussen geprueft, aus dem einzigen Prozess, der ohnehin rund um
// die Uhr laeuft. Er fragt dieselbe Adresse ab, die auch ein Nutzer benutzt —
// das ist der Unterschied zu einer Sonde, die innerhalb des Containers misst.
//
// DREI ENTSCHEIDUNGEN, jede aus einem an diesem Tag bezahlten Fehler:
//
//   1. EINE SCHWALBE IST KEIN BEFUND. Ein einzelner Fehlversuch gilt nicht als
//      Ausfall. Erst `schwelle` Fehlversuche in Folge zaehlen. Genau diese
//      Regel fehlte mir heute: ein einzelner Aussetzer wurde erst fuer einen
//      Absturz gehalten, vier Wiederholungen widerlegten das.
//   2. DER AUSFALL BEGINNT BEIM ERSTEN FEHLVERSUCH, nicht wenn die Schwelle
//      erreicht ist. Sonst meldet der Waechter jeden Ausfall systematisch zu
//      kurz — und ausgerechnet die Dauer ist die Zahl, um die es geht.
//   3. EIN WAECHTER DARF NIE DEN DIENST STOEREN, den er ueberwacht. Jeder
//      Fehler wird verschluckt, jede Abfrage hat ein hartes Zeitlimit, und der
//      Meldeweg wird nie abgewartet.
//
// SICHTBARKEIT, offen und ausdruecklich: Der Loop selbst hat keine erreichbare
// Adresse. Er kann also niemanden benachrichtigen. Was er kann: jeden
// Zustandswechsel in seine Protokollausgabe schreiben (bei Zeabur historisch
// abfragbar) und — falls `meldeUrl` gesetzt ist — dorthin melden. Ohne diesen
// Wert passiert nichts und es wird auch nichts versucht.

/** Standardadresse: dieselbe, die auch die App benutzt (public/config.js).
 * Seit dem App-Umschwenk vom 2026-08-12 ist das die Zeabur-Bruecke — die alte
 * Salad-Bruecke (starfruit) ist ausgemustert; ihr Buendel-Pfad
 * assets/chat-bridge.js existiert im Frontend-Repo nicht mehr, die Instanz
 * kann nicht mehr booten. Ein Waechter, der ein ausgemustertes Ziel prueft,
 * meldet Daueralarm ohne Nutzerbezug. */
export const BRUECKE_HEALTH = "https://smejj-chat-bridge.zeabur.app/health";

const STANDARD_SCHWELLE = 3;
const STANDARD_ZEITLIMIT_MS = 10_000;
const STANDARD_MAX_VORFAELLE = 50;

/**
 * @param {object} optionen
 * @param {string} [optionen.url] Adresse der Bruecke (Standard: BRUECKE_HEALTH)
 * @param {number} [optionen.schwelle] Fehlversuche in Folge, bis ein Ausfall gilt
 * @param {number} [optionen.zeitlimitMs] hartes Limit je Abfrage
 * @param {string} [optionen.meldeUrl] optionaler Meldeweg (leer = aus)
 * @param {string} [optionen.name] Anzeigename in Protokollzeilen (Standard: "bruecken-waechter")
 * @param {Function} [optionen.versionAus] liest die Lebenskennung aus der Antwort — leer/falsy heisst "keine gueltige Antwort". Standard: das `version`-Feld (die Bruecke traegt eins; der Control-Server nicht, dort dient `aiBackend` bei `ok:true` als Kennung).
 * @param {Function} [optionen.fetchFn] nur fuer Tests
 * @param {Function} [optionen.log] nur fuer Tests
 * @param {Function} [optionen.jetzt] nur fuer Tests
 */
export function createBrueckenWaechter({
  url = BRUECKE_HEALTH,
  schwelle = STANDARD_SCHWELLE,
  zeitlimitMs = STANDARD_ZEITLIMIT_MS,
  maxVorfaelle = STANDARD_MAX_VORFAELLE,
  meldeUrl = "",
  name = "bruecken-waechter",
  versionAus = (daten) => daten?.version,
  fetchFn = fetch,
  log = console.log,
  jetzt = () => new Date()
} = {}) {
  let fehlerInFolge = 0;
  let ersterFehlerAm = null;      // Beginn der laufenden Fehlerserie
  let erreichbar = null;          // null = noch nie geprueft
  let letzterErfolgAm = null;
  let letzteVersion = "";
  let laufenderAusfall = null;    // { seit, grund }
  let gesamtPruefungen = 0;
  let gesamtFehler = 0;
  const vorfaelle = [];

  function merken(vorfall) {
    vorfaelle.push(vorfall);
    while (vorfaelle.length > maxVorfaelle) vorfaelle.shift();
  }

  /** Meldet einen Zustandswechsel. Wird NIE abgewartet und wirft nie. */
  function melden(art, text, einzelheiten) {
    log(`[${name}] ${art.toUpperCase()}: ${text}`);
    if (!meldeUrl) return;
    Promise.resolve()
      .then(() => fetchFn(meldeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ art, text, ...einzelheiten }),
        signal: AbortSignal.timeout(zeitlimitMs)
      }))
      .catch(() => { /* ein Meldeweg, der klemmt, darf nichts weiter ausloesen */ });
  }

  /**
   * Eine Abfrage. Nur HTTP 200 MIT lesbarer Antwort gilt als gesund — ein
   * blosses "die Verbindung stand" ist genau die Aussage, die bei Salads
   * TCP-Sonde in die Irre gefuehrt hat.
   */
  async function einmalPruefen() {
    try {
      const antwort = await fetchFn(`${url}?waechter=${Date.now()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(zeitlimitMs)
      });
      if (!antwort.ok) return { gesund: false, grund: `http_${antwort.status}` };
      const daten = await antwort.json();
      const kennung = versionAus(daten);
      if (!kennung) return { gesund: false, grund: "antwort_ohne_version" };
      return { gesund: true, version: String(kennung) };
    } catch (fehler) {
      const name = fehler?.name === "TimeoutError" ? "zeitueberschreitung" : "nicht_erreichbar";
      return { gesund: false, grund: name };
    }
  }

  /**
   * Ein Prueflauf. Aktualisiert den Zustand und meldet NUR Zustandswechsel —
   * eine Meldung je Abfrage waere Laerm, in dem die eine wichtige untergeht.
   * @returns {Promise<object>} der aktuelle Stand
   */
  async function pruefe() {
    const zeit = jetzt().toISOString();
    gesamtPruefungen += 1;
    const ergebnis = await einmalPruefen();

    if (ergebnis.gesund) {
      letzterErfolgAm = zeit;
      letzteVersion = ergebnis.version;
      fehlerInFolge = 0;
      ersterFehlerAm = null;
      if (laufenderAusfall) {
        const dauerMs = new Date(zeit) - new Date(laufenderAusfall.seit);
        const vorfall = { seit: laufenderAusfall.seit, bis: zeit, dauerMs, grund: laufenderAusfall.grund };
        merken(vorfall);
        laufenderAusfall = null;
        melden("erholt", `Bruecke antwortet wieder nach ${Math.round(dauerMs / 1000)} s (${ergebnis.version}).`, vorfall);
      } else if (erreichbar === null) {
        melden("start", `Waechter aktiv, Bruecke gesund (${ergebnis.version}).`, {});
      }
      erreichbar = true;
      return stand();
    }

    gesamtFehler += 1;
    fehlerInFolge += 1;
    if (fehlerInFolge === 1) ersterFehlerAm = zeit;
    if (fehlerInFolge >= schwelle && !laufenderAusfall) {
      // Rueckdatiert auf den ERSTEN Fehlversuch der Serie: sonst faellt jede
      // gemeldete Dauer um (schwelle - 1) Abfragen zu kurz aus — und ausgerechnet
      // die Dauer ist die Zahl, um die es geht.
      laufenderAusfall = { seit: ersterFehlerAm, grund: ergebnis.grund };
      erreichbar = false;
      melden("ausfall", `Bruecke antwortet seit ${fehlerInFolge} Versuchen nicht (${ergebnis.grund}).`, laufenderAusfall);
    }
    return stand();
  }

  /** Der Stand fuer /health und /bruecke. Nur Kennzahlen, keine Inhalte. */
  function stand() {
    return {
      geprueft: url,
      erreichbar,
      letzterErfolgAm,
      letzteVersion,
      fehlerInFolge,
      schwelle,
      laufenderAusfall,
      gesamtPruefungen,
      gesamtFehler,
      meldewegAktiv: Boolean(meldeUrl),
      vorfaelle: [...vorfaelle].reverse() // neueste zuerst
    };
  }

  return { pruefe, stand };
}
