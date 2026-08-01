import assert from "node:assert/strict";
import test from "node:test";
import { executeWithFallback } from "../control-server/src/llm/modelRouter.js";

// Befund vom 2026-08-01: der Eval-Harness schaltet bei knappem Token-Budget
// das Denken ab (thinking:{type:"disabled"}), aber der Router reicht das nur an
// GLM/Z.ai weiter. Das eigene Modell laeuft auf llama.cpp und bekam die
// Abschaltung nie — Qwen3-14B dachte weiter, das Denken frass die 600 Token des
// Falls code-esm-failclosed, und zurueck kamen 234 Zeichen ohne die geforderte
// Form. 0 von 5.
//
// llama.cpp versteht statt `thinking` das Feld chat_template_kwargs.
// Diese Tests halten fest, WAS gesendet wird — ohne eine GPU zu brauchen.

const SALAD = Object.freeze({
  name: "salad",
  baseUrl: "https://cacao-wasabi.salad.cloud/v1",
  apiKey: "k",
  apiKeyHeader: "Salad-Api-Key",
  model: "smejj-fast-1"
});
const GLM = Object.freeze({
  name: "zai", baseUrl: "https://api.z.ai/v1", apiKey: "k", model: "glm-5.2"
});

function fangeKoerper() {
  const gesehen = [];
  const fetchImpl = async (_url, optionen) => {
    gesehen.push(JSON.parse(optionen.body));
    return { ok: true, status: 200, body: null, headers: new Map() };
  };
  return { gesehen, fetchImpl };
}

async function sende(backend, thinking, env) {
  const { gesehen, fetchImpl } = fangeKoerper();
  await executeWithFallback([backend], [{ role: "user", content: "hallo" }], {
    fetchImpl, stream: false, maxTokens: 600, thinking, env
  });
  return gesehen[0];
}

test("Standard: der Salad-Weg bekommt KEIN chat_template_kwargs", async () => {
  // Fail-closed. Es liegt keine Live-Messung vor, dass der llama.cpp-Stand das
  // Feld akzeptiert. Wuerde er es mit 400 ablehnen, fiele die Kette auf das
  // naechste Backend zurueck und das eigene Modell waere praktisch abgeschaltet.
  const koerper = await sende(SALAD, { type: "disabled" }, {});
  assert.equal(koerper.chat_template_kwargs, undefined);
  assert.equal(koerper.thinking, undefined, "thinking versteht llama.cpp ohnehin nicht");
});

test("eingeschaltet: der Salad-Weg bekommt enable_thinking:false", async () => {
  const koerper = await sende(SALAD, { type: "disabled" }, { SMEJJ_LLM_SALAD_DENKEN_VORLAGE: "YES" });
  assert.deepEqual(koerper.chat_template_kwargs, { enable_thinking: false });
});

test("nur beim ausdruecklichen Abschalten, nicht bei jedem Aufruf", async () => {
  // Wo Platz im Budget ist, soll das Modell weiter denken duerfen — die
  // Antwortguete haengt daran.
  const ohne = await sende(SALAD, undefined, { SMEJJ_LLM_SALAD_DENKEN_VORLAGE: "YES" });
  assert.equal(ohne.chat_template_kwargs, undefined);
  const aktiviert = await sende(SALAD, { type: "enabled" }, { SMEJJ_LLM_SALAD_DENKEN_VORLAGE: "YES" });
  assert.equal(aktiviert.chat_template_kwargs, undefined);
});

test("GLM bleibt unveraendert bei thinking — kein Doppelweg", async () => {
  const koerper = await sende(GLM, { type: "disabled" }, { SMEJJ_LLM_SALAD_DENKEN_VORLAGE: "YES" });
  assert.deepEqual(koerper.thinking, { type: "disabled" });
  assert.equal(koerper.chat_template_kwargs, undefined, "GLM darf das Feld nicht bekommen");
});

test("fremde Backends bekommen das Feld nie", async () => {
  const fremd = { name: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "k", model: "llama-3.1-8b-instant" };
  const koerper = await sende(fremd, { type: "disabled" }, { SMEJJ_LLM_SALAD_DENKEN_VORLAGE: "YES" });
  assert.equal(koerper.chat_template_kwargs, undefined);
  assert.equal(koerper.thinking, undefined);
});
