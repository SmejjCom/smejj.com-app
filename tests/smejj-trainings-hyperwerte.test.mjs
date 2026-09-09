// Die Werte, die bestimmen wie TIEF der Adapter eingreift.
//
// Der Anlass ist ein Fehler, der ein Jahr haette schlafen koennen: bis 1.8
// schrieb das Skript `rang` und `lernrate` in die Job-Konfiguration, waehrend
// train.py `r` und `lr` liest. Beide Seiten sahen richtig aus, der Job nahm
// still seine Vorgaben — und die waren zufaellig dieselben Zahlen. Ein
// geaenderter Wert waere lautlos verpufft, und die Messung haette "kein
// Unterschied" gemeldet, obwohl gar nichts anders trainiert wurde.

import test from "node:test";
import assert from "node:assert/strict";

async function ladeMitUmgebung(werte) {
  const alt = {};
  for (const [k, v] of Object.entries(werte)) { alt[k] = process.env[k]; process.env[k] = v; }
  const modul = await import(`../scripts/training/smejj-1-1-trainieren.mjs?t=${Math.random()}`);
  for (const [k, v] of Object.entries(alt)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return modul;
}

test("die Konfiguration traegt die Namen, die train.py wirklich liest", async () => {
  const m = await ladeMitUmgebung({ SMEJJ_KANDIDAT: "smejj-1-9" });
  const k = JSON.parse(m.jobParameter().CON_TRAIN_KONFIG);
  assert.ok("r" in k, 'train.py liest konfig.get("r") — "rang" kommt nie an');
  assert.ok("lr" in k, 'train.py liest konfig.get("lr") — "lernrate" kommt nie an');
  assert.ok(!("rang" in k), "der alte Name darf nicht zurueckkommen");
  assert.ok(!("lernrate" in k), "der alte Name darf nicht zurueckkommen");
});

test("Rang und Lernrate lassen sich von aussen setzen", async () => {
  const m = await ladeMitUmgebung({ SMEJJ_KANDIDAT: "smejj-1-9", SMEJJ_RANG: "8", SMEJJ_LERNRATE: "0.00003" });
  const k = JSON.parse(m.jobParameter().CON_TRAIN_KONFIG);
  assert.equal(k.r, 8);
  assert.equal(k.lr, 0.00003);
});

test("alpha folgt dem Rang — sonst aendern sich zwei Dinge auf einmal", async () => {
  // Halbiert man nur den Rang, waechst der Ausschlag je Richtung (alpha/r), und
  // die Messung kann nicht mehr sagen, was gewirkt hat.
  for (const rang of ["8", "16", "32"]) {
    const m = await ladeMitUmgebung({ SMEJJ_KANDIDAT: "smejj-1-9", SMEJJ_RANG: rang });
    const k = JSON.parse(m.jobParameter().CON_TRAIN_KONFIG);
    assert.equal(k.alpha, Number(rang) * 2, `alpha muss bei Rang ${rang} doppelt so gross sein`);
  }
});

test("ohne Angabe bleibt alles wie bei 1.8 — sonst waere der Vergleich hin", async () => {
  const m = await ladeMitUmgebung({ SMEJJ_KANDIDAT: "smejj-1-8" });
  const k = JSON.parse(m.jobParameter().CON_TRAIN_KONFIG);
  assert.equal(k.r, 16);
  assert.equal(k.lr, 0.0001);
});
