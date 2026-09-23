// smejj.com — Lern-Hinweis nach Daumen hoch ohne Einwilligung (23.09.2026).
// Geprueft wird die Zusage an den Betreiber: hoechstens einmal je Sitzung, kein
// Dialog, direkter Weg zum Schalter — und dass der Chat ihn NUR beim richtigen
// Grund nachlaedt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window ??= globalThis;
const { darfHinweisZeigen, LERN_HINWEIS_MERKER } = await import("../public/lern-hinweis.js");

const speicher = (start = {}) => {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test("hoechstens einmal je Sitzung; gesperrter Speicher = lieber gar nicht", () => {
  assert.equal(darfHinweisZeigen(speicher()), true);
  assert.equal(darfHinweisZeigen(speicher({ [LERN_HINWEIS_MERKER]: "1" })), false);
  assert.equal(darfHinweisZeigen({ getItem: () => { throw new Error("gesperrt"); } }), false);
});

test("Quelle: kein Dialog, Zeile UNTER der Antwort, Sprung per Reiter-Notiz zum Schalter", () => {
  const q = fs.readFileSync(new URL("../public/lern-hinweis.js", import.meta.url), "utf8");
  assert.doesNotMatch(q, /<dialog|showModal|position:\s*fixed/);
  assert.match(q, /\(leiste \|\| entry\)\.after\(zeile\)/);
  assert.match(q, /setItem\(KONTO_REITER_SCHLUESSEL, "data"\)/);
  assert.match(q, /getElementById\("privacyTraining"\)/);
  assert.match(q, /role", "status"/);
  assert.equal(fs.readFileSync(new URL("../public/assets/lern-hinweis.js", import.meta.url), "utf8"), q, "Spiegel unter /assets ist gleich");
});

test("Chat: laedt den Hinweis nur beim Grund 'Einwilligung fehlt' und schickt die Antwort-Herkunft mit", () => {
  const q = fs.readFileSync(new URL("../public/chat-actions.js", import.meta.url), "utf8");
  assert.match(q, /grund === "einwilligung_fehlt_oder_veraltet"\) import\("\.\/lern-hinweis\.js\?v=2"\)/);
  assert.match(q, /modell: entry\.dataset\?\.antwortModell/);
  const strom = fs.readFileSync(new URL("../public/ai/chat-stream.js", import.meta.url), "utf8");
  assert.match(strom, /output\.dataset\.antwortModell = String\(response\.headers\.get\("x-smejj-model-id"\)/);
});

test("Chat liest die spaete Modellzeile der Bruecke (': smejj-modell ... id=')", () => {
  const strom = fs.readFileSync(new URL("../public/ai/chat-stream.js", import.meta.url), "utf8");
  assert.match(strom, /event\.match\(\/\^: smejj-modell \.\*\\bid=\(\\S\+\)\/m\)/);
  const zeile = ": smejj-modell backend=zhipu:glm-5.2 id=glm-5-2 fallback=true";
  assert.equal(zeile.match(/^: smejj-modell .*\bid=(\S+)/m)[1], "glm-5-2");
  assert.equal(": smejj-modell backend=groq id=openai/gpt-oss-120b fallback=true".match(/^: smejj-modell .*\bid=(\S+)/m)[1], "openai/gpt-oss-120b");
});
