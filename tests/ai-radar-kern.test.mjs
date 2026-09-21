// smejj ai radar — Kern: Themenplan, Quellenpruefung, Wissensbasis, Budget, Bericht.
import test from "node:test";
import assert from "node:assert/strict";
import { STANDARD_THEMEN, faelligeThemen, naechsteFaelligkeit, themenListe } from "../src/radar/radarThemen.js";
import { GUETE, MARKIERUNG, bewerteFund, gueteVon, veroeffentlichungsDatum } from "../src/radar/quellenGuete.js";
import { PRUEFSTATUS, VERGLEICH, aehnlichkeit, baueEintrag, fuerAbruf, neueFassung, pruefstatusAus, vergleiche, zurueckNehmen } from "../src/radar/wissensbasis.js";
import { anfragenFuerLauf, darfLaufen, grenzenAus, verbrauch } from "../src/radar/radarBudget.js";
import { baueTagesbericht, nachBereichen } from "../src/radar/tagesbericht.js";

const JETZT = "2026-09-21T12:00:00.000Z";

test("Themenplan: Auftragsthemen sind abgedeckt, eigene Themen ergaenzen statt ersetzen", () => {
  const ids = STANDARD_THEMEN.map((t) => t.id);
  for (const pflicht of ["presse-ki", "neue-modelle", "konkurrenz-funktionen", "konkurrenz-preise", "sicherheit", "chat-coding", "browser-suche", "bild-video", "sprache-bildschirm", "regeln"]) {
    assert.ok(ids.includes(pflicht), `Thema ${pflicht} fehlt`);
  }
  const eigen = themenListe({ themen: [{ id: "eigenes", titel: "Eigenes", bereich: "konkurrenz", anfragen: ["etwas suchen"], intervallStunden: 3 }] });
  assert.equal(eigen.length, STANDARD_THEMEN.length + 1);
  assert.equal(themenListe({ themen: [{ id: "x" }] }).length, STANDARD_THEMEN.length, "unbrauchbares Thema wird uebergangen");
  const geaendert = themenListe({ themen: [{ id: "presse-ki", anfragen: ["presse"], intervallStunden: 99 }] });
  assert.equal(geaendert.find((t) => t.id === "presse-ki").intervallStunden, 99, "Intervall ist konfigurierbar");
  assert.equal(themenListe({ themenAus: ["presse-ki"] }).some((t) => t.id === "presse-ki"), false, "Thema abschaltbar");
});

test("Faelligkeit: ohne Lauf sofort, danach erst nach dem Intervall; laengste Wartezeit zuerst", () => {
  const themen = [
    { id: "a", intervallStunden: 12, prioritaet: 1, anfragen: ["a"], bereich: "presse" },
    { id: "b", intervallStunden: 12, prioritaet: 2, anfragen: ["b"], bereich: "presse" }
  ];
  const jetztMs = Date.parse(JETZT);
  assert.deepEqual(faelligeThemen(themen, {}, jetztMs).map((t) => t.id), ["a", "b"]);
  const letzte = { a: new Date(jetztMs - 2 * 3_600_000).toISOString(), b: new Date(jetztMs - 20 * 3_600_000).toISOString() };
  assert.deepEqual(faelligeThemen(themen, letzte, jetztMs).map((t) => t.id), ["b"], "a ist noch nicht dran");
  assert.equal(naechsteFaelligkeit(themen, { a: new Date(jetztMs).toISOString(), b: new Date(jetztMs).toISOString() }, jetztMs),
    new Date(jetztMs + 12 * 3_600_000).toISOString());
  assert.equal(naechsteFaelligkeit(themen, {}, jetztMs), null, "etwas ist ueberfaellig");
});

test("Quellenpruefung: Primaerquelle, Presse, Forum; Geruecht und Werbung werden markiert", () => {
  assert.equal(gueteVon("https://openai.com/index/gpt"), GUETE.PRIMAER);
  assert.equal(gueteVon("https://www.heise.de/news/x"), GUETE.PRESSE);
  assert.equal(gueteVon("https://reddit.com/r/x"), GUETE.FORUM);
  assert.equal(gueteVon("nicht-mal-eine-adresse"), GUETE.UNBEKANNT);

  const geruecht = bewerteFund({ url: "https://www.theverge.com/x", title: "Rumor: new model soon", snippet: "The company allegedly plans to release a new model next month according to sources." }, { jetzt: JETZT });
  assert.ok(geruecht.markierungen.includes(MARKIERUNG.GERUECHT));
  const werbung = bewerteFund({ url: "https://example.org/x", title: "Sponsored", snippet: "Sponsored: jetzt kaufen und Rabatt sichern, discount code inside, free trial verfuegbar." }, { jetzt: JETZT });
  assert.equal(werbung.tauglich, false);
  assert.equal(werbung.grund, "werbung");
});

test("Datum: aus Adresse und Text gelesen, sonst ausdruecklich unbekannt", () => {
  assert.equal(veroeffentlichungsDatum({ url: "https://blog.google/2026/09/15/etwas/" }), "2026-09-15");
  assert.equal(veroeffentlichungsDatum({ snippet: "Veroeffentlicht am 03.09.2026 in Berlin" }), "2026-09-03");
  assert.equal(veroeffentlichungsDatum({ snippet: "Published Sep 5, 2026 by the team" }), "2026-09-05");
  assert.equal(veroeffentlichungsDatum({ snippet: "ohne jedes Datum" }), null);
  const ohne = bewerteFund({ url: "https://openai.com/x", title: "t", snippet: "Die Firma hat heute ein neues Modell announced und die Dokumentation aktualisiert." }, { jetzt: JETZT });
  assert.ok(ohne.markierungen.includes(MARKIERUNG.DATUM_FEHLT));
  assert.equal(ohne.veroeffentlicht, null);
});

test("Wissensbasis: neu, Duplikat, Aenderung und Widerspruch werden unterschieden", () => {
  const alt = [{ aussage: "Anbieter X kostet 9 Euro pro Monat fuer den Pro Tarif", themaId: "t" }];
  assert.equal(vergleiche("Voellig anderes Thema ueber Datenbanken und Speicher", alt).art, VERGLEICH.NEU);
  assert.equal(vergleiche("Anbieter X kostet 9 Euro pro Monat fuer den Pro Tarif", alt).art, VERGLEICH.DUPLIKAT);
  assert.equal(vergleiche("Anbieter X kostet 12 Euro pro Monat fuer den Pro Tarif", alt).art, VERGLEICH.AENDERUNG);
  assert.equal(vergleiche("Anbieter X kostet nicht 9 Euro pro Monat fuer den Pro Tarif", alt).art, VERGLEICH.WIDERSPRUCH);
  assert.ok(aehnlichkeit("gleiche woerter hier drin", "gleiche woerter hier drin") > 0.9);
});

test("Pruefstatus: Primaerquelle oder zwei Wirte = geprueft; eine Quelle bleibt Einzelquelle", () => {
  const primaer = [{ host: "openai.com", guete: "primaerquelle", markierungen: [] }];
  assert.equal(pruefstatusAus(primaer), PRUEFSTATUS.GEPRUEFT);
  assert.equal(pruefstatusAus([{ host: "heise.de", guete: "fachpresse", markierungen: [] }]), PRUEFSTATUS.EINZELQUELLE);
  assert.equal(pruefstatusAus([{ host: "heise.de", guete: "fachpresse", markierungen: [] }, { host: "golem.de", guete: "fachpresse", markierungen: [] }]), PRUEFSTATUS.GEPRUEFT);
  assert.equal(pruefstatusAus([{ host: "heise.de", guete: "fachpresse", markierungen: ["geruecht"] }]), PRUEFSTATUS.UNSICHER);
  assert.equal(pruefstatusAus(primaer, { widerspruch: true }), PRUEFSTATUS.WIDERSPRUCH);
  assert.equal(pruefstatusAus([{ host: "heise.de", guete: "fachpresse", markierungen: [] }, { host: "heise.de", guete: "fachpresse", markierungen: [] }]), PRUEFSTATUS.EINZELQUELLE, "zwei Adressen derselben Seite sind EINE Quelle");
});

test("Versionen: Fortschreiben behaelt die Geschichte, Ruecknahme stellt die Vorfassung her", () => {
  const eins = baueEintrag({ themaId: "preise", bereich: "konkurrenz", aussage: "Tarif kostet 9 Euro", belege: [{ url: "https://openai.com/a", host: "openai.com", guete: "primaerquelle", markierungen: [], veroeffentlicht: "2026-09-01", abgerufenAm: JETZT }], jetzt: JETZT });
  assert.equal(eins.fassung, 1);
  assert.equal(eins.pruefstatus, PRUEFSTATUS.GEPRUEFT);
  const zwei = neueFassung(eins, { aussage: "Tarif kostet 12 Euro", belege: eins.belege, jetzt: JETZT });
  assert.equal(zwei.fassung, 2);
  assert.equal(zwei.vorgaenger.aussage, "Tarif kostet 9 Euro");
  const zurueck = zurueckNehmen(zwei, { grund: "falsch gelesen" });
  assert.equal(zurueck.aussage, "Tarif kostet 9 Euro");
  assert.equal(zurueck.fassung, 3, "Ruecknahme ist eine neue Fassung, keine Loeschung");
  const ohneVorgaenger = zurueckNehmen(eins, { grund: "Fehlgriff" });
  assert.equal(ohneVorgaenger.zurueckgenommen, true);
  assert.equal(fuerAbruf([ohneVorgaenger]).length, 0, "Zurueckgenommenes wird nie abgerufen");
});

test("Budget: Notaus, nicht lesbar, Tages- und Monatsdeckel halten den Lauf an", () => {
  const grenzen = grenzenAus({}, { anfragenJeTag: 10, anfragenJeMonat: 20, anfragenJeLauf: 6 });
  assert.equal(darfLaufen({ grenzen, laeufe: [], jetzt: JETZT, env: { SMEJJ_RADAR_NOTAUS: "YES" } }).grund, "notaus");
  assert.equal(darfLaufen({ grenzen, laeufe: [], jetzt: JETZT, konfig: { eingeschaltet: false } }).grund, "notaus");
  assert.equal(darfLaufen({ grenzen, laeufe: null, jetzt: JETZT }).grund, "budget_nicht_lesbar");
  assert.equal(darfLaufen({ grenzen, laeufe: [], jetzt: JETZT, laeuftSchon: true }).grund, "laeuft_bereits");
  const heute = [{ begonnenAm: JETZT, anfragen: 10 }];
  assert.equal(darfLaufen({ grenzen, laeufe: heute, jetzt: JETZT }).grund, "tagesbudget_erschoepft");
  const monat = [{ begonnenAm: "2026-09-02T00:00:00.000Z", anfragen: 20 }];
  assert.equal(darfLaufen({ grenzen, laeufe: monat, jetzt: JETZT }).grund, "monatsbudget_erschoepft");
  const frei = darfLaufen({ grenzen, laeufe: [{ begonnenAm: JETZT, anfragen: 7 }], jetzt: JETZT });
  assert.equal(frei.erlaubt, true);
  assert.equal(anfragenFuerLauf(grenzen, frei.rest), 3, "nie mehr als der Tagesrest");
  assert.deepEqual(verbrauch([{ begonnenAm: JETZT, anfragen: 2 }, { begonnenAm: "2026-08-01T00:00:00Z", anfragen: 5 }], JETZT), { anfragenHeute: 2, anfragenMonat: 2 });
});

test("Kostendeckel greift, sobald eine Anfrage wirklich Geld kostet", () => {
  const grenzen = grenzenAus({ SMEJJ_RADAR_KOSTEN_JE_ANFRAGE_USD: "0.01", SMEJJ_RADAR_MAX_USD_MONAT: "1" }, null);
  const viele = [{ begonnenAm: "2026-09-05T00:00:00.000Z", anfragen: 100 }];
  assert.equal(darfLaufen({ grenzen, laeufe: viele, jetzt: JETZT }).grund, "kostendeckel_erreicht");
});

test("Tagesbericht: sagt ehrlich, wenn nichts gefunden wurde, und zaehlt nur Belegtes", () => {
  const leer = baueTagesbericht({ laeufe: [], eintraege: [], tag: "2026-09-21" });
  assert.match(leer.ueberschrift, /keine Recherche/);
  assert.equal(leer.neu.length, 0);

  const laeufe = [{
    begonnenAm: JETZT, ok: true, anfragen: 2, quellenGeprueft: 5,
    themen: [{ id: "konkurrenz-preise", titel: "Preise", bereich: "konkurrenz", grund: "faellig", anfragen: 1, funde: 6, geprueft: 5, gespeichert: 1, verworfen: [{ url: "https://x/y", titel: "Werbung", grund: "werbung" }] }],
    vorschlaege: [{ titel: "Preise pruefen" }], offeneFragen: ["Was kostet X?"]
  }, { begonnenAm: JETZT, ok: false, grund: "tagesbudget_erschoepft", themen: [] }];
  const eintraege = [
    baueEintrag({ themaId: "konkurrenz-preise", bereich: "konkurrenz", aussage: "Tarif kostet 12 Euro", belege: [{ url: "https://openai.com/a", host: "openai.com", guete: "primaerquelle", markierungen: [], veroeffentlicht: "2026-09-20", abgerufenAm: JETZT }], jetzt: JETZT })
  ];
  const bericht = baueTagesbericht({ laeufe, eintraege, tag: "2026-09-21" });
  assert.equal(bericht.laeufe, 2);
  assert.equal(bericht.neu.length, 1);
  assert.equal(bericht.verworfen[0].grund, "werbung");
  assert.equal(bericht.fehler[0].grund, "tagesbudget_erschoepft");
  assert.equal(bericht.konkurrenz.length, 1);
  assert.equal(bericht.neu[0].quellen[0].url, "https://openai.com/a");
  assert.match(bericht.ueberschrift, /1 neue/);
  assert.equal(nachBereichen(bericht)[0].bereich, "konkurrenz");
});
