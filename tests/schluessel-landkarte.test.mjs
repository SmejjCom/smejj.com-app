// smejj.com — Die Landkarte der Zugangsschlüssel.
//
// Betreiber-Auftrag 2026-09-05: "Wie viele Stellen verwenden API X?"
//
// Der wichtigste Test ist der zweite: Beim ersten Lauf meldete die Landkarte
// SMEJJ_SEARCH_TAVILY_API_KEY als "gesetzt, aber nirgends benutzt" — er steht
// in src/search/searchKeyProvider.js als `envKey: "..."` und wird sehr wohl
// benutzt. Eine Landkarte, die eine Verwendungsart nicht sehen kann, hätte den
// Betreiber dazu gebracht, einen funktionierenden Schlüssel zu löschen.
import test from "node:test";
import assert from "node:assert/strict";
import { baueLandkarte, bereichFuer, findeLuecken, IST_ZUGANG } from "../scripts/diagnose/schluessel-landkarte.mjs";

test("zählt jede Stelle, an der ein Schlüssel aus der Umgebung gelesen wird", () => {
  const karte = baueLandkarte([
    { pfad: "src/a.js", text: 'const k = env.SMEJJ_LLM_GROQ_API_KEY;\nif (env.SMEJJ_LLM_GROQ_API_KEY) go();' },
    { pfad: "control-server/src/autopilots/b.js", text: "const k = process.env.SMEJJ_LLM_GROQ_API_KEY;" }
  ], { SMEJJ_LLM_GROQ_API_KEY: "gsk_x" });
  const eintrag = karte.find((e) => e.name === "SMEJJ_LLM_GROQ_API_KEY");
  assert.equal(eintrag.stellen, 3);
  assert.equal(eintrag.dateien, 2);
  assert.equal(eintrag.gesetzt, true);
  assert.ok(eintrag.bereiche.some((b) => b.startsWith("Autopilot")));
});

test("ein als NAME genannter Schlüssel gilt auch als benutzt", () => {
  // Genau der Fall, den die erste Fassung übersah.
  const karte = baueLandkarte([
    { pfad: "src/search/searchKeyProvider.js", text: '  { name: "tavily", envKey: "SMEJJ_SEARCH_TAVILY_API_KEY" }' }
  ], { SMEJJ_SEARCH_TAVILY_API_KEY: "tvly_x" });
  const eintrag = karte.find((e) => e.name === "SMEJJ_SEARCH_TAVILY_API_KEY");
  assert.ok(eintrag, "der Schlüssel muss gefunden werden");
  assert.equal(eintrag.nurGenannt, 1, "als Name genannt, nicht direkt gelesen");
  const luecken = findeLuecken(karte, { SMEJJ_SEARCH_TAVILY_API_KEY: "tvly_x" });
  assert.deepEqual(luecken.verwaist, [], "er darf NICHT als verwaist gelten");
});

test("Kommentare zählen nicht als Verwendung", () => {
  const karte = baueLandkarte([
    { pfad: "src/a.js", text: '// env.SMEJJ_ALT_API_KEY wurde 2025 entfernt\n * env.SMEJJ_ALT_API_KEY\n# env.SMEJJ_ALT_API_KEY' }
  ], {});
  assert.equal(karte.length, 0, "eine Erwähnung im Kommentar ist keine Verwendung");
});

test("nur Namen, die nach Zugang klingen — Zählwerte bleiben draußen", () => {
  assert.ok(IST_ZUGANG.test("SMEJJ_LLM_GROQ_API_KEY"));
  assert.ok(IST_ZUGANG.test("IDRIVE_E2_SECRET_KEY"));
  assert.ok(IST_ZUGANG.test("ZEABUR_API_TOKEN"));
  assert.ok(!IST_ZUGANG.test("SMEJJ_TAKT_MS"));
  assert.ok(!IST_ZUGANG.test("NODE_ENV"));
});

test("der Bereich kommt aus dem Pfad — das ist die Spalte, die der Betreiber liest", () => {
  assert.equal(bereichFuer("control-server/src/autopilots/x.js"), "Autopilot");
  assert.equal(bereichFuer("control-server/src/llm/modelRouter.js"), "Model Router");
  assert.equal(bereichFuer("workers/smejj-smee/relay.mjs"), "Worker");
  assert.equal(bereichFuer("control-server/src/routes/a.js"), "API-Route");
  assert.equal(bereichFuer("control-server/src/billing/b.js"), "Abrechnung");
  assert.equal(bereichFuer("public/chat-bridge.js"), "Bruecke");
});

test("die Landkarte gibt NIEMALS einen Wert aus", () => {
  const karte = baueLandkarte([{ pfad: "src/a.js", text: "env.SMEJJ_GEHEIM_API_KEY" }], { SMEJJ_GEHEIM_API_KEY: "streng-geheim-4711" });
  const alsText = JSON.stringify(karte);
  assert.ok(!alsText.includes("streng-geheim-4711"), "ein Diagnosewerkzeug, das Geheimnisse ausgibt, ist selbst das Leck");
  assert.equal(karte[0].gesetzt, true, "nur ja/nein");
});

test("findeLuecken trennt 'benutzt aber nicht gesetzt' von 'gesetzt aber unbenutzt'", () => {
  const karte = baueLandkarte([
    { pfad: "src/a.js", text: "env.SMEJJ_FEHLT_API_KEY" },
    { pfad: "src/b.js", text: "env.SMEJJ_DA_API_KEY" }
  ], { SMEJJ_DA_API_KEY: "x", SMEJJ_UNBENUTZT_API_KEY: "y" });
  const l = findeLuecken(karte, { SMEJJ_DA_API_KEY: "x", SMEJJ_UNBENUTZT_API_KEY: "y" });
  assert.deepEqual(l.fehlend, ["SMEJJ_FEHLT_API_KEY"]);
  assert.deepEqual(l.verwaist, ["SMEJJ_UNBENUTZT_API_KEY"]);
});
