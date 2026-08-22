// Der Sucher nach still entfallenden Pruefungen. Er braucht kein Netz, laeuft
// also in der Pruefsuite mit — anders als der Betriebswerte-Pruefer.
//
// Sein Wert haengt an einer einzigen Frage: findet er den bekannten Fall? Ein
// Sucher, der nichts findet, sagt nur dann etwas aus, wenn er es koennte.

import { test } from "node:test";
import assert from "node:assert/strict";
import { verdachtImText, AUSNAHMEN, KAPUTTE_PROBE, GESUNDE_PROBE }
  from "../scripts/diagnose/stille-auslassung.mjs";

test("die kaputte Probe wird gefunden", () => {
  // Woertlich der alte Bild-Maler-Code: `if (env.SMEJJ_BILDER_WORKER_URL)` um
  // ein Pruefziel, ohne Meldung. Er stand seit dem 14.08. live und liess die
  // Medien-Ampel gruen leuchten, waehrend die Bilderzeugung nie geprueft wurde.
  const treffer = verdachtImText(KAPUTTE_PROBE);
  assert.equal(treffer.length, 1, "der bekannte Fall MUSS gefunden werden");
  assert.equal(treffer[0].name, "SMEJJ_BILDER_WORKER_URL");
});

test("die gesunde Probe bleibt still", () => {
  // Dieselbe Sache mit Standard statt stillem Entfallen. Wer hier meckert,
  // erzeugt Laerm, und Laerm wird abgeschaltet.
  assert.deepEqual(verdachtImText(GESUNDE_PROBE), []);
});

test("eine gemeldete Auslassung ist kein Verdacht", () => {
  // Ueberspringen ist in Ordnung, solange es jemand erfaehrt.
  const text = [
    "const ziele = [];",
    "if (env.SMEJJ_X_URL) {",
    "  ziele.push({ name: 'X', url: env.SMEJJ_X_URL });",
    "} else {",
    "  befunde.push('X: nicht konfiguriert, nicht geprueft');",
    "}"
  ].join("\n");
  assert.deepEqual(verdachtImText(text), []);
});

test("Bedingungen ohne Pruefziel in der Naehe zaehlen nicht", () => {
  // Sonst meldet der Sucher jede Fallunterscheidung im ganzen Projekt.
  const text = "if (env.SMEJJ_X_MODUS) { farbe = 'blau'; }";
  assert.deepEqual(verdachtImText(text), []);
});

test("jede Ausnahme traegt eine Begruendung", () => {
  assert.ok(AUSNAHMEN.length > 0);
  for (const a of AUSNAHMEN) {
    assert.ok(a.muster instanceof RegExp, "Ausnahme ohne Muster");
    assert.ok(a.grund && a.grund.length > 30, `Ausnahme ${a.muster} ohne Begruendung`);
  }
});

test("die CONFIRM-Ausnahme greift, aber nicht zu breit", () => {
  const bestaetigung = "if (process.env.CONFIRM_PROBE_PATCH !== 'YES') { return; } // check";
  assert.deepEqual(verdachtImText(bestaetigung), []);
  // Ein Wert, der nur zufaellig aehnlich heisst, faellt NICHT unter die Ausnahme.
  const echt = "if (env.CONFIRMED_TARGET_URL) { ziele.push(env.CONFIRMED_TARGET_URL); }";
  assert.equal(verdachtImText(echt).length, 1);
});
