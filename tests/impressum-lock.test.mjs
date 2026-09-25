// Impressum-Lock (Betreiber 25.09.2026): Inhalt des geschuetzten Stands.
// Die Dateisperre meldet jede Byte-Aenderung; dieser Test sagt zusaetzlich,
// WAS der geschuetzte Stand verspricht.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { PROTECTED_FILES } from "../scripts/check-impressum-lock.mjs";

const lies = (p) => readFileSync(p, "utf8");

test("alle geschuetzten Impressum-Dateien existieren (nicht geloescht)", () => {
  for (const f of PROTECTED_FILES) assert.ok(existsSync(f), f);
});

test("Impressum nennt die Firma, Anschrift und E-Mail, aber keinen Personennamen", () => {
  for (const f of PROTECTED_FILES) {
    const s = lies(f);
    assert.match(s, /iMild LLC/, f);
    assert.match(s, /Oakland, CA 94601/, f);
    assert.match(s, /s@smejj\.com/, f);
    assert.doesNotMatch(s, /Kadavanich/, f);
    assert.doesNotMatch(s, /MStV/, f);
  }
});

test("ausgelieferte Kopie gleicht der Quelle", () => {
  assert.equal(lies("public/assets/impressum.html"), lies("public/impressum.html"));
});
