// Schlanke Anfrage fuer Modelle mit kleinem Kontextfenster (smejj 1).
//
// Gemessen am 13.09.: mit dem vollen Chat-Begleittext (~1.300 Tokens) kam vom
// Hausmodell auf 2 Kernen in 45 s kein erstes Wort, und der Router wich auf GLM
// aus. Mit kurzem Text: erstes Wort nach 6 bis 8 s. Diese Faelle halten fest,
// dass NUR kleine Modelle gekuerzt werden — und dass die Frage dabei bleibt.

import test from "node:test";
import assert from "node:assert/strict";

import { brauchtSchlankeAnfrage, schlankeMaxTokens, schlankeNachrichten, MAX_ANTWORT_TOKENS, SCHLANKE_ROLLE } from "../control-server/src/llm/schlankeAnfrage.js";
import { executeWithFallback } from "../control-server/src/llm/modelRouter.js";

const VOLL = [
  { role: "system", content: "Lange Systemregeln fuer grosse Modelle ... ".repeat(40) },
  { role: "user", content: "Erste Frage" },
  { role: "assistant", content: "Erste Antwort" },
  { role: "user", content: "Frage/Aufgabe:\nWas ist 17 mal 3?\n\nProjektwissen:\n" + "x".repeat(5000) }
];

test("nur Modelle mit kleinem Fenster werden gekuerzt", () => {
  assert.equal(brauchtSchlankeAnfrage({ logicalModelId: "smejj-1" }), true, "4.096 Tokens");
  assert.equal(brauchtSchlankeAnfrage({ logicalModelId: "glm-5-2" }), false, "GLM bekommt alles");
  assert.equal(brauchtSchlankeAnfrage({ logicalModelId: "provider-fallback" }), false, "unbekannt = nicht kuerzen");
  assert.equal(brauchtSchlankeAnfrage(null), false);
});

test("die Frage bleibt, Regeln, Verlauf und Anhang fallen weg", () => {
  const s = schlankeNachrichten(VOLL);
  assert.equal(s.length, 2);
  assert.equal(s[0].content, SCHLANKE_ROLLE);
  assert.match(s[1].content, /^Was ist 17 mal 3\?/, "die eigentliche Frage steht vorn");
  assert.ok(s[1].content.length <= 1502, "der Anhang wurde gekuerzt");
  assert.equal(s.some((m) => /Erste Antwort|Lange Systemregeln/.test(m.content)), false);
});

test("die Antwortgrenze wird nie groesser, nur kleiner", () => {
  assert.equal(schlankeMaxTokens(4096), MAX_ANTWORT_TOKENS);
  assert.equal(schlankeMaxTokens(100), 100);
  assert.equal(schlankeMaxTokens(undefined), MAX_ANTWORT_TOKENS);
});

test("der Router schickt dem Hausmodell den schlanken Rumpf — und GLM den vollen", async () => {
  const gesendet = [];
  const fetchImpl = async (url, init) => {
    gesendet.push({ url, body: JSON.parse(init.body) });
    return new Response("data: [DONE]\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const tools = [{ type: "function", function: { name: "suche", parameters: { type: "object", properties: {} } } }];
  const haus = { name: "hausmodell", model: "smejj-1-basis", logicalModelId: "smejj-1", baseUrl: "http://haus/v1", apiKeys: ["k"], apiKeyHeader: "Authorization" };
  const glm = { name: "zhipu", model: "glm-4.5-flash", logicalModelId: "glm-5-2", baseUrl: "http://glm/v1", apiKeys: ["k"], apiKeyHeader: "Authorization" };

  await executeWithFallback([haus], VOLL, { fetchImpl, tools, maxTokens: 4096, env: {} });
  await executeWithFallback([glm], VOLL, { fetchImpl, tools, maxTokens: 4096, env: {} });

  const [anHaus, anGlm] = gesendet;
  assert.equal(anHaus.body.messages.length, 2);
  assert.equal(anHaus.body.tools, undefined, "keine Werkzeuge fuer das kleine Modell");
  assert.equal(anHaus.body.max_tokens, MAX_ANTWORT_TOKENS);
  assert.equal(anGlm.body.messages.length, VOLL.length, "GLM bekommt unveraendert alles");
  assert.equal(anGlm.body.tools.length, 1);
  assert.equal(anGlm.body.max_tokens, 4096);
});
