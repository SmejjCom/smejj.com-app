// smejj.com — Tests fuer die Server-AI-Verfuegbarkeit (Health-/Statuslogik).
// Unit: evaluateAiAvailability (Gate, Budget, Provider-Kette, fail-closed).
// Integration: echter Serverstart, GET /api/health liefert ai/aiBackend korrekt.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { evaluateAiAvailability, resolveServerAiGate } from "../control-server/src/llm/aiAvailability.js";

const TEST_KEY = "test-key-nicht-echt-1234";

function zhipuEnv(overrides = {}) {
  return {
    SMEJJ_SERVER_AI_ENABLED: "true",
    SMEJJ_SERVER_AI_REMAINING: "5",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu,salad,openrouter,custom",
    SMEJJ_LLM_ZHIPU_BASE_URL: "https://api.z.ai/api/paas/v4",
    SMEJJ_LLM_ZHIPU_API_KEY: TEST_KEY,
    ...overrides
  };
}

test("fail-closed: leere Umgebung liefert ai:false ohne Backend", () => {
  const result = evaluateAiAvailability({});
  assert.equal(result.ai, false);
  assert.equal(result.aiBackend, "");
  assert.equal(result.gateEnabled, false);
  assert.equal(result.budgetOk, false);
  assert.equal(result.providerOk, false);
});

test("Zhipu BYOK: ai:true auch ohne klassisches Server-Budget-Gate", () => {
  const result = evaluateAiAvailability(zhipuEnv({ SMEJJ_SERVER_AI_ENABLED: "false" }));
  assert.equal(result.ai, true);
  assert.equal(result.aiBackend, "zhipu:glm-5.2");
  assert.equal(result.gateEnabled, false);
  assert.equal(result.providerOk, true);
  assert.equal(result.activationMode, "zhipu-byok");
});

test("Zhipu BYOK: ai:true auch ohne lokales Remaining-Budget", () => {
  const result = evaluateAiAvailability(zhipuEnv({ SMEJJ_SERVER_AI_REMAINING: "0" }));
  assert.equal(result.ai, true);
  assert.equal(result.aiBackend, "zhipu:glm-5.2");
  assert.equal(result.budgetOk, false);
  assert.equal(result.activationMode, "zhipu-byok");
});

test("Zhipu BYOK: ai:true auch bei nicht-numerischem lokalen Budgetfeld", () => {
  const result = evaluateAiAvailability(zhipuEnv({ SMEJJ_SERVER_AI_REMAINING: "unklar" }));
  assert.equal(result.ai, true);
  assert.equal(result.budgetOk, false);
  assert.equal(result.activationMode, "zhipu-byok");
});

test("keine verwendbare Provider-Konfiguration: ai:false trotz Gate und Budget", () => {
  const result = evaluateAiAvailability({
    SMEJJ_SERVER_AI_ENABLED: "true",
    SMEJJ_SERVER_AI_REMAINING: "5",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu,salad,openrouter,custom"
  });
  assert.equal(result.ai, false);
  assert.equal(result.aiBackend, "");
  assert.equal(result.providerOk, false);
});

test("Zhipu korrekt konfiguriert: ai:true mit aiBackend zhipu:glm-5.2", () => {
  const result = evaluateAiAvailability(zhipuEnv());
  assert.equal(result.ai, true);
  assert.equal(result.aiBackend, "zhipu:glm-5.2");
  assert.equal(result.gateEnabled, true);
  assert.equal(result.budgetOk, true);
  assert.equal(result.providerOk, true);
  assert.equal(result.activationMode, "server-budget-gate");
});

test("Fallback-Provider verfuegbar: ohne Zhipu-Key gewinnt Salad aus derselben Reihenfolge", () => {
  const result = evaluateAiAvailability({
    SMEJJ_SERVER_AI_ENABLED: "true",
    SMEJJ_SERVER_AI_REMAINING: "5",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu,salad,openrouter,custom",
    SMEJJ_LLM_SALAD_BASE_URL: "https://beispiel-gateway.salad.cloud/v1",
    SMEJJ_LLM_SALAD_API_KEY: TEST_KEY
  });
  assert.equal(result.ai, true);
  assert.equal(result.aiBackend, "salad:tgi");
});

test("Fallback-Reihenfolge bleibt erhalten: Zhipu vor Salad, wenn beide konfiguriert", () => {
  const result = evaluateAiAvailability(zhipuEnv({
    SMEJJ_LLM_SALAD_BASE_URL: "https://beispiel-gateway.salad.cloud/v1",
    SMEJJ_LLM_SALAD_API_KEY: TEST_KEY
  }));
  assert.equal(result.ai, true);
  assert.equal(result.aiBackend, "zhipu:glm-5.2");
});

test("keine Secrets in der Ausgabe: API-Key taucht nirgends auf", () => {
  const result = evaluateAiAvailability(zhipuEnv());
  assert.equal(JSON.stringify(result).includes(TEST_KEY), false);
  assert.equal(JSON.stringify(result).includes("api.z.ai"), false);
});

test("Kimi K2.7 meldet sich nur mit Feature-Flag und vollstaendiger Runtime als aktiv", () => {
  const result = evaluateAiAvailability({
    SMEJJ_MODEL_DEFAULT: "kimi-k2-7",
    SMEJJ_KIMI_K2_7_ENABLED: "YES",
    SMEJJ_LLM_KIMI_BASE_URL: "https://kimi.example/v1",
    SMEJJ_LLM_KIMI_API_KEY: TEST_KEY,
    SMEJJ_LLM_KIMI_MODEL: "moonshotai/Kimi-K2.7-Code"
  }, "coding", "Kimi K2.7");
  assert.equal(result.ai, true);
  assert.equal(result.activeModelId, "kimi-k2-7");
  assert.equal(result.aiBackend, "kimi:moonshotai/Kimi-K2.7-Code");
  assert.equal(JSON.stringify(result).includes(TEST_KEY), false);
});

// --- Integration: echter Serverstart, /api/health antwortet mit dem Router-Zustand ---

async function withServer(extraEnv, port, fn) {
  const child = spawn(process.execPath, ["src/server.js"], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      SMEJJ_HOST: "127.0.0.1",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Serverstart-Timeout")), 15000);
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("smejj.com Code MVP")) { clearTimeout(timer); resolve(); }
      });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Server beendet: ${code}`)); });
    });
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    child.kill("SIGTERM");
  }
}

test("GET /api/health: ai:true + aiBackend bei aktiver Zhipu-Kette", async () => {
  await withServer(zhipuEnv(), 34771, async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.ai, true);
    assert.equal(health.aiBackend, "zhipu:glm-5.2");
    assert.equal(JSON.stringify(health).includes(TEST_KEY), false);
  });
});

test("GET /api/health: Zhipu BYOK bleibt ai:true bei deaktiviertem klassischem Gate", async () => {
  await withServer(zhipuEnv({ SMEJJ_SERVER_AI_ENABLED: "false" }), 34772, async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.ai, true);
    assert.equal(health.aiBackend, "zhipu:glm-5.2");
  });
});

// --- Waechter: Ampel und Chat duerfen nie auseinanderlaufen ---
//
// 2026-08-15: /api/health meldete "ai": true / "zhipu:glm-5.2", waehrend
// /api/chat still den Rueckfall-Assistenten ausgab ("Verstanden. Ich kann
// daraus eine konkrete Aufgabe machen..."). Der Betreiber sah eine hoefliche
// Antwort statt eines Fehlers, und keine Messung schlug an. Ursache: zwei
// getrennte Entscheidungen — Health kannte den BYOK-Pfad, streamLLM nicht.
// Diese Tests halten beide Seiten aneinander fest.

const RUECKFALL_MARKER = "Ich kann daraus eine konkrete Aufgabe machen";

async function chatAntwort(base) {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Hauptstadt von Frankreich?" }] })
  });
  return { status: res.status, backendKopf: res.headers.get("x-smejj-model-backend"), text: await res.text() };
}

test("Waechter (Unit): Ampel und Chat-Tor beantworten 'ai' identisch", () => {
  const proben = [
    {},
    zhipuEnv(),
    zhipuEnv({ SMEJJ_SERVER_AI_ENABLED: "false" }),
    zhipuEnv({ SMEJJ_SERVER_AI_REMAINING: "0" }),
    { SMEJJ_SERVER_AI_ENABLED: "true", SMEJJ_SERVER_AI_REMAINING: "5", SMEJJ_LLM_PROVIDER_ORDER: "zhipu,salad" }
  ];
  for (const env of proben) {
    assert.equal(
      resolveServerAiGate(env).ai,
      evaluateAiAvailability(env).ai,
      `Ampel und Chat-Tor weichen ab fuer: ${JSON.stringify(Object.keys(env))}`
    );
  }
});

test("Waechter (gesund): meldet die Ampel ai:true, faellt der Chat NICHT in den Rueckfall", async () => {
  // Gate aus, aber Zhipu-BYOK aktiv — exakt der Live-Stand vom 2026-08-15.
  // SMEJJ_LOCAL_ENV_FILE zeigt ins Leere, damit ausschliesslich die hier
  // gesetzte Umgebung zaehlt und nicht die Schluessel des Entwicklerrechners.
  await withServer(zhipuEnv({
    SMEJJ_SERVER_AI_ENABLED: "false",
    SMEJJ_LOCAL_ENV_FILE: "/nonexistent/smejj-test-nur-zhipu.env"
  }), 34773, async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.ai, true, "Vorbedingung: die Ampel muss hier gruen sein");

    const antwort = await chatAntwort(base);
    // Der Testschluessel ist ungueltig, der echte Anbieter wird also scheitern.
    // Erlaubt ist jeder EHRLICHE Ausgang (502/429/Stream) — verboten ist einzig
    // der stille Rueckfall-Text, der wie eine gelungene Antwort aussieht.
    assert.equal(
      antwort.text.includes(RUECKFALL_MARKER),
      false,
      `Ampel gruen, aber der Chat gab den Rueckfall-Text aus (HTTP ${antwort.status})`
    );
  });
});

test("Waechter (kaputt): ohne jeden Anbieter bleibt der Rueckfall erhalten", async () => {
  // Gegenprobe — die freundliche Notantwort ist ohne Anbieter gewollt
  // (Graceful Degradation). Ohne diese Probe wuerde der Waechter oben auch
  // dann gruen bleiben, wenn jemand den Rueckfall komplett ausbaut.
  //
  // SMEJJ_LOCAL_ENV_FILE muss auf einen leeren Pfad zeigen: der Server laedt
  // sonst ~/.config/smejj.com/env.local nach und haette auf einem Entwickler-
  // rechner echte Schluessel — der Test misst dann die Maschine, nicht den Code.
  await withServer({ SMEJJ_LOCAL_ENV_FILE: "/nonexistent/smejj-test-ohne-anbieter.env" }, 34774, async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.ai, false, "Vorbedingung: die Ampel muss hier rot sein");

    const antwort = await chatAntwort(base);
    assert.equal(antwort.status, 200);
    assert.equal(
      antwort.text.includes(RUECKFALL_MARKER),
      true,
      "Ohne Anbieter soll die Seite bedienbar bleiben statt zu fehlern"
    );
  });
});
