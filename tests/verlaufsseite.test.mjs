import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { alsProzent, alsZeit, ladeVerlauf, stufeFuer, trendFuer, wackeligText, zeichneKopf, zeichneTabelle } from "../public/verlauf.js";
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
    assert.equal(zeilen[0].dataset.stufe, "kritisch", "der Absturz mit 3 kritischen Fehlern steht oben");
  } finally {
    globalThis.document = echtesDocument;
  }
});

test("die Kopfzeile benennt einen kritischen Stand als solchen", () => {
  const knoten = { dataset: {}, textContent: "" };
  zeichneKopf(MESSWERTE, knoten);
  assert.equal(knoten.dataset.stufe, "kritisch");
  assert.match(knoten.textContent, /76,47 %/);
  assert.match(knoten.textContent, /kritischen Fehlern/);
});

test("das Aktualisierungs-Skript fuehrt zusammen statt zu ersetzen", () => {
  // Der Verlauf des Dienstes beginnt bei jedem Neubau bei Null. Wuerde ersetzt,
  // ginge bei jedem Deploy die ganze Geschichte verloren.
  const bestand = { messungen: MESSWERTE.messungen };
  const neu = { verlauf: [{ zeitpunkt: "2026-07-30T07:00:00.000Z", punktzahl: 0.88, faelle: 14, bestanden: 12, kritischeFehler: 0 }] };
  const datei = baueDatei(bestand, neu);
  assert.equal(datei.messungen.length, MESSWERTE.messungen.length + 1);
  assert.equal(datei.messungen[datei.messungen.length - 1].zeitpunkt, "2026-07-30T07:00:00.000Z");
  assert.equal(datei.erzeugtAm, "2026-07-30T07:00:00.000Z");
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
