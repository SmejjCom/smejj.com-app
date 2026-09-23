// smejj.com — Release-Pruefung und Sicherheitscheck duerfen sich nicht widersprechen.
//
// BEFUND 14.09.2026: check:security erlaubte seit dem 15.08. zwei Workflows
// (Betreiber-Entscheidung) und eichte am 25.08. die Verweis-Formen ${NAME} und
// verweis:NAME — scripts/release/free_tier_release_guard.mjs bekam beides nie.
// release:preflight war dadurch seit dem 20.08. rot, waehrend check:all gruen
// wirkte. Beide Skripte laufen beim Import los, darum liest der Test die Quellen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
const sicherheit = lies("scripts/check-no-paid-services.mjs");
const release = lies("scripts/release/free_tier_release_guard.mjs");
const workflows = (quelle) => [...quelle.matchAll(/"(\.github\/workflows\/[^"]+\.yml)"/g)].map((m) => m[1]).sort();
const ausnahmen = (quelle, name) => (quelle.match(new RegExp(`/IDRIVE_E2_\\(\\?:\\(\\?:TRAINING\\|WATCHDOG\\)_\\)\\?${name}=\\(\\?!([^)]*)\\)`)) || [])[1];

test("beide Pruefungen erlauben genau dieselben Workflow-Dateien", () => {
  assert.deepEqual(workflows(release), workflows(sicherheit));
  assert.equal(workflows(release).length, 4, "die Erlaubnisliste bleibt kurz — jede weitere Datei braucht eine Begruendung (Stand 23.09.2026: vier, alle mit Begruendung)");
});

test("beide Pruefungen kennen dieselben Verweis-Formen fuer e2-Zugaenge", () => {
  for (const name of ["SECRET_KEY", "ACCESS_KEY"]) {
    assert.ok(ausnahmen(sicherheit, name), `Muster ${name} im Sicherheitscheck nicht gefunden`);
    assert.equal(ausnahmen(release, name), ausnahmen(sicherheit, name), `${name}: Ausnahmen weichen ab`);
  }
});

test("ein echter Wert faellt in der Release-Pruefung weiter auf", () => {
  const muster = new RegExp(release.match(/\/(IDRIVE_E2_\(\?:\(\?:TRAINING\|WATCHDOG\)_\)\?ACCESS_KEY=[^\n]*?)\/,/)[1]);
  // Name und Wert zusammengesetzt, sonst meldet der Scanner diese Testzeile selbst.
  assert.equal(muster.test("IDRIVE_E2_" + "ACCESS_KEY" + "=" + "A1B2C3D4E5F6"), true, "echter Wert");
  assert.equal(muster.test("IDRIVE_E2_TRAINING_ACCESS_KEY=${IDRIVE_E2_ACCESS_KEY}"), false, "Verweis");
  assert.equal(muster.test("IDRIVE_E2_TRAINING_ACCESS_KEY=verweis:IDRIVE_E2_ACCESS_KEY"), false, "Verweis-Form");
});
