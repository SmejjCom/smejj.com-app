// smejj.com — Wie viele Glieder hat die Anbieterkette?
//
// Betreiber-Auftrag 2026-09-05, Punkt 26: "Kein Single Point of Failure."
//
// BEFUND, der diesen Test ausgelöst hat: Der Router kennt 16 Anbieter, die
// Registry führt 6 Modelle — und live war genau EINES aktiv (glm-5-2 bei
// Zhipu), alle anderen "inactive". Am 02.09. fiel genau dieser eine Anbieter
// zweimal aus, und der Chat stand stundenlang bei 64 grünen Ampeln.
//
// Die Wache zählt die Glieder jetzt und sagt es in JEDER Meldung — auch in der
// grünen. Ein Netz mit einem Glied fällt sonst erst auf, wenn es reißt.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ANBIETER_KETTE, MINDEST_GLIEDER, beurteileUmgebung, laufUmgebungsWache, zaehleKette,
  ZHIPU_CODING_ADRESSE
} from "../control-server/src/autopilots/umgebungsWacheAutopilot.js";

const GESUND = {
  SMEJJ_LLM_ZHIPU_API_KEY: "z", SMEJJ_LLM_GROQ_API_KEY: "g",
  SMEJJ_LLM_ZHIPU_BASE_URL: ZHIPU_CODING_ADRESSE
};

test("zaehlt jeden Anbieter mit Schluessel als ein Glied", () => {
  const k = zaehleKette({ SMEJJ_LLM_ZHIPU_API_KEY: "z", SMEJJ_LLM_GROQ_API_KEY: "g" });
  assert.deepEqual(k.besetzt.sort(), ["groq", "zhipu"]);
  assert.equal(k.anzahl, 2);
  assert.equal(k.gesamt, ANBIETER_KETTE.length);
  assert.equal(k.reicht, false, "zwei Glieder sind kein Netz, sondern ein Seil");
});

test("ein Schluessel-VORRAT zaehlt genauso wie ein einzelner", () => {
  const k = zaehleKette({ SMEJJ_LLM_OPENROUTER_API_KEYS: "a,b,c" });
  assert.deepEqual(k.besetzt, ["openrouter"]);
});

test("leere und weisse Werte zaehlen NICHT", () => {
  assert.equal(zaehleKette({ SMEJJ_LLM_GROQ_API_KEY: "" }).anzahl, 0);
  assert.equal(zaehleKette({ SMEJJ_LLM_GROQ_API_KEY: "   " }).anzahl, 0);
  assert.equal(zaehleKette({}).anzahl, 0);
});

test("ab der Mindestzahl gilt die Kette als tragfaehig", () => {
  const wenig = zaehleKette({ SMEJJ_LLM_ZHIPU_API_KEY: "z", SMEJJ_LLM_GROQ_API_KEY: "g" });
  const genug = zaehleKette({ SMEJJ_LLM_ZHIPU_API_KEY: "z", SMEJJ_LLM_GROQ_API_KEY: "g", SMEJJ_LLM_GEMINI_API_KEY: "x" });
  assert.equal(wenig.reicht, false);
  assert.equal(genug.reicht, true);
  assert.equal(MINDEST_GLIEDER, 3);
});

test("die Meldung nennt die Kettenlaenge — auch wenn sonst alles gruen ist", async () => {
  const duenn = await laufUmgebungsWache({ env: GESUND });
  assert.equal(duenn.ok, true, "mit zwei Anbietern laeuft der Chat — es ist eine Warnung, kein Fehler");
  assert.match(duenn.meldung, /ACHTUNG: nur 2 von \d+ Anbietern/);
  assert.match(duenn.meldung, /faellt einer aus, steht der Chat/);

  const dick = await laufUmgebungsWache({ env: { ...GESUND, SMEJJ_LLM_GEMINI_API_KEY: "x", SMEJJ_LLM_MISTRAL_API_KEY: "y" } });
  assert.match(dick.meldung, /Kette 4\/\d+ Anbieter besetzt/);
  assert.ok(!dick.meldung.includes("ACHTUNG"), "eine tragfaehige Kette braucht keine Warnung");
});

test("die Wache gibt niemals einen Schluesselwert aus", async () => {
  const lauf = await laufUmgebungsWache({ env: { ...GESUND, SMEJJ_LLM_GEMINI_API_KEY: "streng-geheim-4711" } });
  assert.ok(!lauf.meldung.includes("streng-geheim-4711"));
  const urteil = beurteileUmgebung({ ...GESUND, SMEJJ_LLM_GEMINI_API_KEY: "streng-geheim-4711" });
  assert.ok(!JSON.stringify(urteil).includes("streng-geheim-4711"));
});
