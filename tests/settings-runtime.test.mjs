// smejj.com — settings-runtime: Eigene Anweisungen (Konto) fliessen in den
// Chat-Praeferenz-Block (job_konto_glas_20260726, Anbindung 2026-07-26).
// buildPreferenceBlock() speist chatClient.js (System-Prompt) — jede Antwort
// traegt die Konto-Anweisungen, fail-safe bei kaputtem Speicher.
import test from "node:test";
import assert from "node:assert/strict";

// localStorage-Attrappe VOR dem Modul-Import bereitstellen (Node hat keins).
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};

const { buildPreferenceBlock, readAccountInstructions } = await import("../public/settings-runtime.js");

test("Eigene Anweisungen aus dem Konto landen im Praeferenz-Block", () => {
  store.set("smejj.personalization.v1", JSON.stringify({ instructions: "Antworte kurz und auf Deutsch." }));
  const block = buildPreferenceBlock();
  assert.match(block, /Eigene Anweisungen des Nutzers \(Konto\): Antworte kurz und auf Deutsch\./);
});

test("ohne Anweisungen erscheint keine Konto-Zeile", () => {
  store.delete("smejj.personalization.v1");
  assert.doesNotMatch(buildPreferenceBlock(), /Eigene Anweisungen des Nutzers/);
  store.set("smejj.personalization.v1", JSON.stringify({ instructions: "   " }));
  assert.doesNotMatch(buildPreferenceBlock(), /Eigene Anweisungen des Nutzers/);
});

test("fail-safe: kaputter Speicherinhalt blockiert den Chat nicht", () => {
  store.set("smejj.personalization.v1", "kein json {");
  assert.equal(readAccountInstructions(), "");
  assert.match(buildPreferenceBlock(), /Antwortstil:/);
});

test("Kappung auf 1000 Zeichen schuetzt das Prompt-Budget", () => {
  store.set("smejj.personalization.v1", JSON.stringify({ instructions: "x".repeat(5000) }));
  assert.equal(readAccountInstructions().length, 1000);
});

test("chatClient nutzt den Praeferenz-Block im System-Prompt", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync("public/ai/chatClient.js", "utf8");
  assert.match(source, /smejjSettingsRuntime\?\.promptBlock\?\.\(\)/);
  assert.match(source, /Nutzerpraeferenzen:/);
});
