// Waechter fuer den semantischen Cache.
//
// Dieser Hebel ist der einzige, der eine Anfrage nicht billiger macht, sondern
// GAR NICHT MEHR STELLT. Ein Fehltreffer liefert dem Nutzer eine falsche
// Antwort — teurer als jeder gesparte Token. Die Tests pruefen deshalb vor
// allem, was NICHT passieren darf.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AEHNLICHKEIT_SCHWELLE,
  CACHE_AN,
  CACHE_AUS,
  CACHE_SCHATTEN,
  HALTBARKEIT_MS,
  aehnlichkeit,
  cacheBericht,
  cacheModus,
  darfCachen,
  frageCache,
  merkeAntwort,
  setzeCacheZurueck
} from "../control-server/src/llm/semantischerCache.js";

const AN = { SMEJJ_SEM_CACHE: "an" };
const ANTWORT = "Das ist eine ausreichend lange Antwort, die im Cache landen darf.";
const frage = (text, extra = {}) => ({ frage: text, nutzer: "user_a", ...extra });

test("Standard ist der Schatten-Modus — nichts wird ungefragt ausgeliefert", () => {
  assert.equal(cacheModus({}), CACHE_SCHATTEN);
  assert.equal(cacheModus({ SMEJJ_SEM_CACHE: "unsinn" }), CACHE_SCHATTEN);
  assert.equal(cacheModus({ SMEJJ_SEM_CACHE: "an" }), CACHE_AN);
  assert.equal(cacheModus({ SMEJJ_SEM_CACHE: "aus" }), CACHE_AUS);
});

test("dieselbe Frage trifft, eine ANDERE Frage nicht", () => {
  setzeCacheZurueck();
  merkeAntwort(frage("Was kostet ein Abo bei smejj.com im Monat?"), ANTWORT, { env: AN });

  const gleich = frageCache(frage("Was kostet ein Abo bei smejj com im Monat?"), { env: AN });
  assert.equal(gleich.treffer, true, "Umlaut- und Satzzeichenunterschiede duerfen nicht trennen");
  assert.equal(gleich.antwort, ANTWORT);

  // Gegenstueck — und das ist der wichtigere Test:
  const anders = frageCache(frage("Was kann smejj.com im Monat alles leisten?"), { env: AN });
  assert.equal(anders.treffer, false, "eine andere Frage darf NIE die alte Antwort bekommen");
  setzeCacheZurueck();
});

test("die Schwelle liegt hoch — aehnlich genuegt nicht, es muss dieselbe Frage sein", () => {
  assert.ok(AEHNLICHKEIT_SCHWELLE >= 0.9, "unter 0,9 wird geraten statt getroffen");
  const fast = aehnlichkeit("Wie hoch ist der Preis fuer das Abo", "Wie hoch ist der Preis fuer den Speicher");
  assert.ok(fast < AEHNLICHKEIT_SCHWELLE, `zu aehnlich bewertet: ${fast}`);
  assert.equal(aehnlichkeit("Preis Abo Monat", "monat abo preis"), 1, "Reihenfolge darf nicht zaehlen");
  assert.equal(aehnlichkeit("", "irgendwas"), 0);
});

test("Anschlussfragen, Dateien, Live-Inhalte und Coding bleiben draussen", () => {
  const proben = [
    [{ verlauf: [{ role: "user", content: "vorher" }] }, "anschlussfrage"],
    [{ dateien: 1 }, "dateien"],
    [{ liveInhalt: true }, "live-inhalt"],
    [{ coding: true }, "coding"]
  ];
  for (const [extra, grund] of proben) {
    const urteil = darfCachen({ frage: "Was kostet das Abo im Monat", ...extra });
    assert.equal(urteil.ok, false, `${grund} haette abgelehnt werden muessen`);
    assert.equal(urteil.grund, grund);
  }
  // Gegenstueck: ohne diese Merkmale ist dieselbe Frage geeignet.
  assert.equal(darfCachen({ frage: "Was kostet das Abo im Monat" }).ok, true);
});

test("zu kurze Fragen tragen kein Signal", () => {
  assert.equal(darfCachen({ frage: "und?" }).ok, false);
  assert.equal(darfCachen({ frage: "was ist das" }).grund, "zu-kurz");
});

test("der Cache ist pro Nutzer — fremde Antworten bleiben fremd", () => {
  setzeCacheZurueck();
  merkeAntwort({ frage: "Wie lautet meine hinterlegte Rechnungsadresse", nutzer: "user_a" }, ANTWORT, { env: AN });

  const fremder = frageCache({ frage: "Wie lautet meine hinterlegte Rechnungsadresse", nutzer: "user_b" }, { env: AN });
  assert.equal(fremder.treffer, false, "eine Antwort fuer A darf B NIE erreichen");

  const eigener = frageCache({ frage: "Wie lautet meine hinterlegte Rechnungsadresse", nutzer: "user_a" }, { env: AN });
  assert.equal(eigener.treffer, true, "der eigene Nutzer soll seinen Treffer bekommen");

  // Nur mit ausdruecklicher Entscheidung geht es ueber Nutzergrenzen.
  const mitFreigabe = frageCache(
    { frage: "Wie lautet meine hinterlegte Rechnungsadresse", nutzer: "user_b" },
    { env: { ...AN, SMEJJ_SEM_CACHE_UEBER_NUTZER: "ja" } }
  );
  assert.equal(mitFreigabe.treffer, true);
  setzeCacheZurueck();
});

test("abgelaufene Antworten werden nicht mehr ausgeliefert", () => {
  setzeCacheZurueck();
  merkeAntwort(frage("Was kostet das Abo im Monat"), ANTWORT, { env: AN, jetzt: 0 });
  const frisch = frageCache(frage("Was kostet das Abo im Monat"), { env: AN, jetzt: HALTBARKEIT_MS - 1000 });
  assert.equal(frisch.treffer, true);
  const alt = frageCache(frage("Was kostet das Abo im Monat"), { env: AN, jetzt: HALTBARKEIT_MS + 1000 });
  assert.equal(alt.treffer, false, "eine Tag-alte Antwort kann falsch geworden sein");
  setzeCacheZurueck();
});

test("Schatten-Modus zaehlt mit, liefert aber NICHT aus", () => {
  setzeCacheZurueck();
  const schatten = { SMEJJ_SEM_CACHE: "schatten" };
  merkeAntwort(frage("Was kostet das Abo im Monat"), ANTWORT, { env: schatten });
  const ergebnis = frageCache(frage("Was kostet das Abo im Monat"), { env: schatten });
  assert.equal(ergebnis.treffer, true);
  assert.equal(ergebnis.grund, "schatten-treffer", "im Schatten wird gemessen, nicht geantwortet");
  assert.equal(cacheBericht(schatten).ausgeliefert, 0, "ausgeliefert bleibt 0, solange nicht scharf");
  assert.equal(cacheBericht(schatten).treffer, 1);
  setzeCacheZurueck();
});

test("abgeschaltet heisst abgeschaltet — und sagt das auch", () => {
  setzeCacheZurueck();
  const aus = { SMEJJ_SEM_CACHE: "aus" };
  assert.equal(merkeAntwort(frage("Was kostet das Abo im Monat"), ANTWORT, { env: aus }), false);
  const ergebnis = frageCache(frage("Was kostet das Abo im Monat"), { env: aus });
  assert.equal(ergebnis.treffer, false);
  assert.equal(ergebnis.grund, "abgeschaltet", "0 % Trefferquote und 'aus' muessen unterscheidbar sein");
  setzeCacheZurueck();
});

test("kurze oder leere Antworten landen nicht im Cache", () => {
  setzeCacheZurueck();
  assert.equal(merkeAntwort(frage("Was kostet das Abo im Monat"), "", { env: AN }), false);
  assert.equal(merkeAntwort(frage("Was kostet das Abo im Monat"), "Fehler.", { env: AN }), false);
  assert.equal(merkeAntwort(frage("Was kostet das Abo im Monat"), ANTWORT, { env: AN }), true);
  setzeCacheZurueck();
});

test("der Bericht trennt Treffer, Fehlschlaege und Ausgeliefertes", () => {
  setzeCacheZurueck();
  merkeAntwort(frage("Was kostet das Abo im Monat", { einTokens: 500 }), ANTWORT, { env: AN });
  frageCache(frage("Was kostet das Abo im Monat"), { env: AN });
  frageCache(frage("Welche Farbe hat der Himmel heute"), { env: AN });
  const bericht = cacheBericht(AN);
  assert.equal(bericht.treffer, 1);
  assert.equal(bericht.fehlschlaege, 1);
  assert.equal(bericht.ausgeliefert, 1);
  assert.equal(bericht.trefferquote, 0.5);
  assert.equal(bericht.gesparteEingabeTokens, 500);
  setzeCacheZurueck();
});

// ---------------------------------------------------------------------------
// KREATIVE AUFTRAEGE — gefunden durch die Paar-Durchsicht an ECHTEM Verkehr
// (2026-08-19), nicht durch einen Test. "Kannst du mir eine witzige Geschichte
// schreiben?" traf sich selbst mit Aehnlichkeit 1,0 und bekam die gespeicherte
// Geschichte zurueck. Technisch perfekt, inhaltlich falsch: wer zum zweiten Mal
// fragt, will eine ANDERE. Das steht in der Absicht, nicht im Wortlaut — kein
// Aehnlichkeitsmass erkennt es.
// ---------------------------------------------------------------------------
test("kreative Auftraege kommen NIE aus dem Cache", () => {
  const proben = [
    "Kannst du mir eine witzige Geschichte schreiben?",
    "Schreib mir ein Gedicht ueber den Herbst",
    "Erfinde einen Namen fuer meine Katze",
    "Gib mir drei Ideen fuer ein Geburtstagsgeschenk",
    "Denk dir einen Slogan fuer meine Firma aus"
  ];
  for (const frage of proben) {
    const urteil = darfCachen({ frage });
    assert.equal(urteil.ok, false, `haette abgelehnt werden muessen: ${frage}`);
    assert.equal(urteil.grund, "kreativ");
  }
});

test("Gegenstueck: Wissensfragen bleiben cachebar", () => {
  // Sonst haette die Regel den Cache gleich mit abgeschaltet.
  for (const frage of [
    "Wie hoch ist der Eiffelturm in Metern",
    "Was kostet ein Abo im Monat",
    "Wie funktioniert eine Waermepumpe technisch"
  ]) {
    assert.equal(darfCachen({ frage }).ok, true, `haette cachebar bleiben muessen: ${frage}`);
  }
});

test("eine kreative Antwort wird auch nicht ABGELEGT", () => {
  setzeCacheZurueck();
  const kreativ = { frage: "Schreib mir eine kurze Geschichte ueber einen Hund", nutzer: "user_a" };
  assert.equal(merkeAntwort(kreativ, ANTWORT, { env: AN }), false, "sonst liegt sie fuer spaeter bereit");
  assert.equal(frageCache(kreativ, { env: AN }).treffer, false);
  setzeCacheZurueck();
});
