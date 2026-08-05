import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { VERALTET_AB_STUNDEN, alsProzent, alsZeit, alterText, istVeraltet, ladeVerlauf, standText, stufeFuer, trendFuer, wackeligText, zeichneKopf, zeichneTabelle } from "../public/verlauf.js";
import { baueDatei, fuegeZusammen, uebernehmeMessung } from "../scripts/verlauf/aktualisiere-messwerte.mjs";

const MESSWERTE = JSON.parse(await readFile(new URL("../public/verlauf-messwerte.json", import.meta.url), "utf8"));

test("die ausgelieferte Messwert-Datei ist gueltig und enthaelt nur Kennzahlen", () => {
  assert.equal(MESSWERTE.kind, "smejj.com-qualitaetsverlauf");
  assert.ok(MESSWERTE.messungen.length >= 1);
  const erlaubt = new Set([
    "zeitpunkt", "punktzahl", "faelle", "bestanden", "nichtBestanden", "kritischeFehler",
    "p95Ms", "medianMs", "urteil", "abgelegt",
    // Seit 2026-07-31: Wiederholungen je Fall und die Bestehensquoten.
    "wiederholungen", "wackelig", "wackeligeFaelle"
  ]);
  for (const m of MESSWERTE.messungen) {
    for (const feld of Object.keys(m)) assert.ok(erlaubt.has(feld), `unerwartetes Feld ${feld}`);
    assert.ok(m.punktzahl >= 0 && m.punktzahl <= 1);
    // Auch in den Quoten stehen nur Fallkennungen und Zahlen.
    for (const f of m.wackeligeFaelle || []) {
      assert.deepEqual(Object.keys(f).sort(), ["bestanden", "fall", "laeufe"]);
    }
  }
  // Datenschutz-Zusicherung: niemals Eingaben, Antworten oder Zugangsdaten.
  assert.equal(/prompt|antwort|content|IDRIVE|SECRET|API_KEY/i.test(JSON.stringify(MESSWERTE.messungen)), false);
});

test("ein kritischer Fehler schlaegt jede Punktzahl — wie im Bericht selbst", () => {
  const suite = { mindestPunktzahl: 0.8 };
  assert.equal(stufeFuer({ punktzahl: 0.99, kritischeFehler: 1 }, suite), "kritisch");
  assert.equal(stufeFuer({ punktzahl: 0.76, kritischeFehler: 0 }, suite), "gerissen");
  assert.equal(stufeFuer({ punktzahl: 0.95, kritischeFehler: 0 }, suite), "gut");
});

test("Trend zeigt die Richtung gegenueber der vorigen Messung", () => {
  assert.equal(trendFuer({ punktzahl: 0.7647 }, { punktzahl: 0.9118 }).richtung, "schlechter");
  assert.equal(trendFuer({ punktzahl: 0.95 }, { punktzahl: 0.9 }).richtung, "besser");
  assert.equal(trendFuer({ punktzahl: 0.9 }, { punktzahl: 0.9 }).richtung, "gleich");
  assert.equal(trendFuer({ punktzahl: 0.9 }, null), null, "die erste Messung hat keinen Trend");
});

test("Zahlen werden deutsch und ohne Erfindung dargestellt", () => {
  assert.equal(alsProzent(0.7647), "76,47 %");
  assert.equal(alsProzent(null), "–", "was nicht gemessen wurde, wird nicht gerundet");
  assert.equal(alsZeit("2026-07-30T01:06:11.346Z"), "30.07. 01:06 UTC");
  assert.equal(alsZeit("kaputt"), "–");
});

test("eine unerreichbare Messwert-Datei laesst die Seite lesbar (fail-soft)", async () => {
  assert.equal(await ladeVerlauf(async () => ({ ok: false })), null);
  assert.equal(await ladeVerlauf(async () => { throw new Error("kein Netz"); }), null);
});

test("die neueste Messung steht oben und der Absturz ist als kritisch markiert", () => {
  const zeilen = [];
  const wurzel = {
    textContent: "",
    append: (...k) => zeilen.push(...k)
  };
  const bauer = { className: "", dataset: {}, textContent: "", append() {} };
  const echtesDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ ...bauer, dataset: {}, append() {} }) };
  try {
    const anzahl = zeichneTabelle(MESSWERTE, wurzel);
    assert.equal(anzahl, MESSWERTE.messungen.length);
    // Bewusst OHNE feste Zahl: die Datei wird bei jeder Messung neu geschrieben.
    // Geprueft wird die Zusage — die NEUESTE Messung steht oben und traegt ihre
    // eigene Bewertung, nicht eine fest eingetragene.
    const neueste = MESSWERTE.messungen[MESSWERTE.messungen.length - 1];
    assert.equal(zeilen[0].dataset.stufe, stufeFuer(neueste, MESSWERTE.suite),
      "oben steht die neueste Messung mit ihrer eigenen Bewertung");
  } finally {
    globalThis.document = echtesDocument;
  }
});

// Eine FRISCHE Messung wird weiterhin als aktueller Zustand benannt.
// `jetzt` liegt eine Stunde nach der letzten Messung der Datei.
const FRISCH = Date.parse(MESSWERTE.erzeugtAm) + 60 * 60 * 1000;

test("die Kopfzeile benennt einen kritischen Stand als solchen — solange er frisch ist", () => {
  // Eigene Daten statt der ausgelieferten Datei: die aendert sich bei jeder
  // Messung, die ZUSAGE nicht.
  const kritisch = {
    suite: { mindestPunktzahl: 0.8 },
    erzeugtAm: "2026-08-04T12:00:00.000Z",
    messungen: [{ zeitpunkt: "2026-08-04T12:00:00.000Z", punktzahl: 0.7647, kritischeFehler: 3 }]
  };
  const knoten = { dataset: {}, textContent: "" };
  zeichneKopf(kritisch, knoten, Date.parse(kritisch.erzeugtAm) + 60 * 60 * 1000);
  assert.equal(knoten.dataset.stufe, "kritisch");
  assert.match(knoten.textContent, /76,47 %/);
  assert.match(knoten.textContent, /kritischen Fehlern/);
  assert.match(knoten.textContent, /gerade nicht/, "frisch darf im Praesens stehen");
});

test("ein frischer GUTER Stand wird auch als solcher benannt", () => {
  const gut = {
    suite: { mindestPunktzahl: 0.8 },
    erzeugtAm: "2026-08-04T12:00:00.000Z",
    messungen: [{ zeitpunkt: "2026-08-04T12:00:00.000Z", punktzahl: 0.9804, kritischeFehler: 0 }]
  };
  const knoten = { dataset: {}, textContent: "" };
  zeichneKopf(gut, knoten, Date.parse(gut.erzeugtAm) + 60 * 60 * 1000);
  assert.equal(knoten.dataset.stufe, "gut");
  assert.match(knoten.textContent, /98,04 %/);
  assert.match(knoten.textContent, /alle Budgets eingehalten/);
});

// ---------------------------------------------------------------------------
// Befund 2026-08-04 (Betreiber): Die Seite meldete „die Kette liefert GERADE
// nicht die geforderte Qualitaet" mit Daten vom 30.07. — fuenf Tage alt und
// aus der Zeit VOR mehreren Korrekturen. Eine veraltete Zahl ist kein Fehler.
// Sie als aktuell auszugeben schon.
// ---------------------------------------------------------------------------

test("eine veraltete Messung wird NICHT als aktueller Zustand ausgegeben", () => {
  const fuenfTageSpaeter = Date.parse(MESSWERTE.erzeugtAm) + 5 * 24 * 60 * 60 * 1000;
  const knoten = { dataset: {}, textContent: "" };
  zeichneKopf(MESSWERTE, knoten, fuenfTageSpaeter);
  assert.equal(knoten.dataset.stufe, "veraltet", "die Bewertung darf die Seite nicht mehr einfaerben");
  assert.equal(knoten.dataset.veraltet, "true");
  assert.match(knoten.textContent, /vor 5 Tagen/, "das Alter steht zuerst");
  assert.match(knoten.textContent, /sagen nichts ueber den heutigen Zustand|sagen nichts über den heutigen Zustand/);
  assert.match(knoten.textContent, /Damals gemessen/, "das Urteil gehoert in die Vergangenheit");
  assert.ok(!/gerade nicht/.test(knoten.textContent), "kein Praesens-Urteil bei alten Daten");
});

test("die 24-Stunden-Grenze sitzt genau", () => {
  const basis = Date.parse(MESSWERTE.erzeugtAm);
  assert.equal(istVeraltet(MESSWERTE.erzeugtAm, basis + 23.9 * 3_600_000), false);
  assert.equal(istVeraltet(MESSWERTE.erzeugtAm, basis + 24.1 * 3_600_000), true);
  assert.equal(VERALTET_AB_STUNDEN, 24);
  // Unlesbares Datum gilt als veraltet — fail-closed, nie als „aktuell".
  assert.equal(istVeraltet("kein datum"), true);
  assert.equal(istVeraltet(undefined), true);
});

test("das Alter wird fuer Menschen benannt", () => {
  const basis = Date.parse("2026-08-04T12:00:00.000Z");
  assert.equal(alterText("2026-08-04T11:20:00.000Z", basis), "vor 40 Minuten");
  assert.equal(alterText("2026-08-04T05:00:00.000Z", basis), "vor 7 Stunden");
  assert.equal(alterText("2026-07-30T12:00:00.000Z", basis), "vor 5 Tagen");
  assert.equal(alterText("2026-08-04T11:00:00.000Z", basis), "vor 1 Stunde", "Einzahl");
  assert.equal(alterText("kein datum", basis), "unbekannten Alters");
});

test("die Standzeile nennt Zeitpunkt UND Alter", () => {
  const basis = Date.parse(MESSWERTE.erzeugtAm);
  const frisch = standText(MESSWERTE, basis + 2 * 3_600_000);
  assert.match(frisch, /Stand der Daten:/);
  assert.match(frisch, /vor 2 Stunden/);
  assert.ok(!/Seitdem wurde nicht neu gemessen/.test(frisch));
  const alt = standText(MESSWERTE, basis + 5 * 24 * 3_600_000);
  assert.match(alt, /vor 5 Tagen/);
  assert.match(alt, /Seitdem wurde nicht neu gemessen/);
});

test("die Seite verspricht keinen Zeitplan mehr, den es nicht gibt", async () => {
  const seite = await readFile(new URL("../public/verlauf.html", import.meta.url), "utf8");
  const sichtbar = seite.replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!/Alle sechs Stunden/.test(sichtbar), "das unhaltbare Versprechen muss weg sein");
  assert.match(sichtbar, /von Hand\s+angestoßen|von Hand angestoßen/, "stattdessen steht dort, wie es wirklich laeuft");
  assert.match(sichtbar, /älter als 24 Stunden/);
});

test("das Aktualisierungs-Skript fuehrt zusammen statt zu ersetzen", () => {
  // Der Verlauf des Dienstes beginnt bei jedem Neubau bei Null. Wuerde ersetzt,
  // ginge bei jedem Deploy die ganze Geschichte verloren.
  const bestand = { messungen: MESSWERTE.messungen };
  // Der neue Eintrag liegt bewusst NACH allem Bestehenden — sonst prueft der
  // Test nur die Sortierung mit. Der Zeitpunkt wird aus der Datei abgeleitet,
  // damit er nicht bei jeder neuen Messung nachgezogen werden muss.
  const spaeter = new Date(Date.parse(MESSWERTE.erzeugtAm) + 3_600_000).toISOString();
  const neu = { verlauf: [{ zeitpunkt: spaeter, punktzahl: 0.88, faelle: 14, bestanden: 12, kritischeFehler: 0 }] };
  const datei = baueDatei(bestand, neu);
  assert.equal(datei.messungen.length, MESSWERTE.messungen.length + 1, "nichts darf verloren gehen");
  assert.equal(datei.messungen[datei.messungen.length - 1].zeitpunkt, spaeter);
  assert.equal(datei.erzeugtAm, spaeter);
  // Und die alten Eintraege stehen unveraendert weiter drin.
  for (const alt of MESSWERTE.messungen) {
    assert.ok(datei.messungen.some((m) => m.zeitpunkt === alt.zeitpunkt), `${alt.zeitpunkt} fehlt`);
  }
});

test("das Skript schreibt nichts bei unerwarteter Eingabe (fail-closed)", () => {
  assert.throws(() => baueDatei({}, {}), /kein Feld 'verlauf'/);
  assert.throws(() => baueDatei({}, { verlauf: [{ zeitpunkt: "kaputt", punktzahl: 2 }] }), /Keine gueltige Messung/);
  assert.equal(uebernehmeMessung({ zeitpunkt: "2026-07-30T01:00:00.000Z", punktzahl: 1.5 }), null);
  assert.equal(fuegeZusammen([], []).length, 0);
});

test("wackelige Faelle werden benannt, nicht nur gezaehlt", () => {
  // Sie sind die Erklaerung fuer jede Schwankung der Punktzahl. Ohne Namen
  // muesste man raten, welcher Fall gerade wackelt.
  assert.equal(wackeligText({ wackelig: 0 }), null);
  assert.equal(wackeligText({}), null, "aeltere Messungen kennen das Feld nicht");
  assert.equal(wackeligText({ wackelig: 1 }), "1 wackeliger Fall");
  assert.equal(
    wackeligText({ wackelig: 2, wackeligeFaelle: [{ fall: "regel-800-zeilen", bestanden: 3, laeufe: 5 }, { fall: "schutz-daten-loeschen", bestanden: 3, laeufe: 5 }] }),
    "2 wackelige Fälle (regel-800-zeilen 3/5, schutz-daten-loeschen 3/5)"
  );
});

test("das Aktualisierungs-Skript traegt die Quoten mit, erfindet sie aber nicht", () => {
  const mit = uebernehmeMessung({
    zeitpunkt: "2026-07-31T00:00:00.000Z",
    punktzahl: 0.9,
    wiederholungen: 3,
    wackelig: 1,
    wackeligeFaelle: [{ fall: "regel-800-zeilen", bestanden: 2, laeufe: 3, quote: 0.6667 }]
  });
  assert.equal(mit.wiederholungen, 3);
  assert.deepEqual(mit.wackeligeFaelle, [{ fall: "regel-800-zeilen", bestanden: 2, laeufe: 3 }]);

  // Aeltere Messungen ohne die Felder bekommen null, keine erfundene Eins.
  const ohne = uebernehmeMessung({ zeitpunkt: "2026-07-30T00:00:00.000Z", punktzahl: 0.9 });
  assert.equal(ohne.wiederholungen, null);
  assert.equal(ohne.wackeligeFaelle, null);
});

test("doppelte Zeitpunkte werden nicht doppelt gezaehlt", () => {
  const einmal = MESSWERTE.messungen[0];
  assert.equal(fuegeZusammen([einmal], [einmal]).length, 1);
});
