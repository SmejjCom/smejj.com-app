import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const settings = fs.readFileSync("public/provider-settings.js", "utf8");
const chat = fs.readFileSync("public/ai/chatClient.js", "utf8");
const worker = fs.readFileSync("control-server/src/routes/workerModelRoutes.js", "utf8");
const submenu = fs.readFileSync("public/cline-model-menu.js", "utf8");

test("Cline settings never persist or render the API key", () => {
  assert.match(settings, /type="password"/);
  assert.match(settings, /autocomplete="new-password"/);
  assert.doesNotMatch(settings, /localStorage\.setItem\([^\n]*apiKey/i);
  assert.doesNotMatch(settings, /sessionStorage\.setItem\([^\n]*apiKey/i);
  assert.match(settings, /root\.querySelector\("#clineApiKey"\)\.value = ""/);
});

test("Cline selection streams through authenticated backend and supports restart-free switching", () => {
  assert.match(settings, /Modell ohne Neustart gewechselt/);
  assert.match(settings, /localStorage\.setItem\(STORAGE_KEYS\.model, "Cline"\)/);
  assert.match(chat, /\/api\/providers\/cline\/chat/);
  assert.match(chat, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(chat, /clineApiKey/);
});

test("Cline submenu shows the live catalog grouped like the settings surface", () => {
  assert.match(submenu, /\/api\/providers\/cline/);
  assert.match(submenu, /"cline-pass": "Cline Pass"/);
  // Die Gratis-Gruppe fiel bewusst raus: Cline liefert sie nur an eigene
  // Oberflaechen aus (403 live gemessen 2026-08-17) — hier waren es tote Knoepfe.
  assert.match(submenu, /"free" steht bewusst NICHT mehr drin/);
  assert.doesNotMatch(submenu, /free: "Kostenlos"/);
  assert.match(submenu, /recommended: "Empfohlen"/);
  assert.match(submenu, /Alle Modelle & Key → Einstellungen/);
  assert.match(submenu, /aria-checked/);
});

test("Cline submenu activates a model instantly without touching the chat path", () => {
  assert.match(submenu, /localStorage\.setItem\(CLINE_MODEL_KEY, model\)/);
  assert.match(submenu, /localStorage\.setItem\(STORAGE_KEYS\.model, "Cline"\)/);
  assert.match(submenu, /Cline · \$\{shortModel\(model\)\}/);
  assert.match(submenu, /smejj:cline-selected/);
  assert.doesNotMatch(submenu, /import[^\n]*chatClient/);
  assert.doesNotMatch(submenu, /clineApiKey/i);
  assert.doesNotMatch(submenu, /localStorage\.setItem\([^\n]*apiKey/i);
});

test("Cline submenu stays fail-closed without a connected key", () => {
  assert.match(submenu, /Cline-Key in Einstellungen verbinden/);
  assert.match(submenu, /status\?\.configured/);
  // Der Fehlerpfad heisst weiter renderKeyHint — der catch traegt inzwischen
  // einen Fehlerparameter und einen Block.
  assert.match(submenu, /\.catch\(\(error\) => \{[\s\S]{0,400}renderKeyHint\(submenu\)/);
});

test("autonomous worker resolves Cline credential only on the control server", () => {
  assert.match(worker, /getProviderCredential\(job\.userId, "cline"/);
  assert.match(worker, /job\.providerRuntime/);
  assert.match(worker, /tools: CODING_TOOLS/);
});
