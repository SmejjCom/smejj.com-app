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
  assert.match(submenu, /recommended: "Empfohlen"/);
  assert.match(submenu, /Alle Modelle & Key → Einstellungen/);
  assert.match(submenu, /aria-checked/);
});

// Messlatte BEWUSST verschoben (2026-08-17): der Test verlangte bis hierher
// eine Gruppe "Kostenlos". Live gemessen liefern genau diese Modelle 403
// ("only available via Cline product surfaces") — der alte Vertrag forderte
// also tote Knoepfe. Jetzt wird das Gegenteil festgehalten.
test("Cline submenu bietet keine toten Knoepfe an", () => {
  assert.doesNotMatch(submenu, /free: "Kostenlos"/);
  assert.match(submenu, /GROUP_ORDER = \["cline-pass", "recommended"\]/);
  // Die zwei Blindgaenger (HTTP 200, aber leere Antwort) fliegen ebenfalls raus.
  assert.match(submenu, /BLINDGAENGER = new Set\(\["cline-pass\/qwen3\.7-max", "x-ai\/grok-4\.5"\]\)/);
  assert.match(submenu, /!BLINDGAENGER\.has\(model\.id\)/);
});

test("Cline submenu bietet Auto an und ruft dafuer kein /select", () => {
  assert.match(submenu, /const AUTO_MARKE = "auto"/);
  assert.match(submenu, /submenu\.append\(autoButton\(submenu, active\)\)/);
  // Auto darf NICHT ueber die /select-Route gehen: das Modell steht erst fest,
  // wenn der Auftrag da ist (ai/modellRouter.js waehlt dann und wartet ab).
  const autoBlock = submenu.slice(submenu.indexOf("function autoButton"), submenu.indexOf("function modelButton"));
  assert.doesNotMatch(autoBlock, /\/select/);
  assert.match(autoBlock, /activateCline\(AUTO_MARKE\)/);
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
  assert.match(submenu, /renderKeyHint\(submenu\)/);
});

// Betreiber-Befund 2026-08-17: "manchmal kommen komplette Modelle und
// manchmal nur 2, 3". Ursache war ein 429 der geteilten Bremse, das der
// alte Code als "kein Key" auslegte. Gebremst ist NICHT fehlend.
test("Gebremst (429) wird nicht als fehlender Key ausgegeben", () => {
  assert.match(submenu, /fehler\?\.status === 429/);
  assert.match(submenu, /retryAfterSec/);
  // Der 429-Zweig muss VOR renderKeyHint zurueckkehren, sonst luegt das Menue.
  const zweig = submenu.slice(submenu.indexOf("fehler?.status === 429"), submenu.indexOf("renderKeyHint(submenu);\n    });"));
  assert.match(zweig, /return;/);
  // Und er laedt selbst nach, statt den Nutzer klicken zu lassen.
  assert.match(zweig, /setTimeout\([\s\S]*openSubmenu\(trigger, submenu, true\)/);
});

test("autonomous worker resolves Cline credential only on the control server", () => {
  assert.match(worker, /getProviderCredential\(job\.userId, "cline"/);
  assert.match(worker, /job\.providerRuntime/);
  assert.match(worker, /tools: CODING_TOOLS/);
});

// Betreiber-Freigabe 2026-08-23 (Nutzerreise): der Wartetext "smejj denkt nach …"
// bleibt im Cline-Pfad bis zum ersten Delta — gemessen waren 3,6 s leere Blase.
test("Cline-Pfad loescht den Wartetext erst beim ersten Text, nicht vor dem Abruf", () => {
  const src = fs.readFileSync(new URL("../public/ai/chatClient.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /selected === "Cline"\) \{ clearThinking\(\);/, "clearThinking() darf nicht VOR runClineChat laufen");
  const cline = src.slice(src.indexOf("async function runClineChat"), src.indexOf("// Generischer BYOK-Anbieter"));
  assert.doesNotMatch(cline, /let answer = "";\s*output\.textContent = "";/, "kein Leeren der Blase vor dem Strom");
  assert.match(cline, /if \(!answer\) clearThinking\(\);\s*answer \+= delta;/, "Wartetext faellt beim ersten Delta");
  for (const pfad of ["nichtAngemeldetText", "Automatische Modellwahl", "(leere Antwort)", "Cline-Fehler"]) {
    const i = cline.indexOf(pfad);
    assert.ok(i > 0 && cline.slice(Math.max(0, i - 200), i).includes("clearThinking()"), `Fehlerweg '${pfad}' raeumt den Wartetext weg`);
  }
});
