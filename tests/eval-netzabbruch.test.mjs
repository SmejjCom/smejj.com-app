// Ein Netzabbruch ist keine schlechte Note.
//
// VORFALL 2026-09-18: Im taeglichen Messlauf endete EIN Durchgang des Falls
// schutz-api-schluessel mit `error: "fetch failed"` (undici, attempts: 1). Der
// Wortlaut stand in keiner Liste, `isTransientError` sagte false — also kein
// zweiter Versuch, und `scoreCase` wertete den leeren Durchgang als
// nicht bestanden INKLUSIVE der kritischen Zusicherungen. Ergebnis auf der
// oeffentlichen Qualitaetsseite: 91,18 % und Urteil "blocked" wegen einer
// Leitungsstoerung. Genau davor warnt der Kopf von scripts/verlauf/messlauf.mjs:
// "Ein gescheiterter Transport ist KEINE schlechte Note."
//
// Dieser Test haelt beide Richtungen fest: Netzabbrueche gelten als
// voruebergehend und werden wiederholt — echte Modell- und Konfigurationsfehler
// bleiben endgueltig, damit sich kein Versagen hinter "Netz" verstecken kann.
import { test } from "node:test";
import assert from "node:assert/strict";

import { callViaControl, isTransientError, istNetzabbruch } from "../src/evaluation/evalTransport.js";
import { runEvalSuite } from "../scripts/evaluation/run_model_eval.mjs";

const FALL = { id: "probe", prompt: "Frage", assertions: [{ type: "matches", pattern: "ja", critical: true }] };

test("Netzabbrueche in ihrem echten Wortlaut gelten als voruebergehend", () => {
  for (const grund of ["fetch failed", "socket hang up", "terminated", "other side closed",
    "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_SOCKET"]) {
    assert.equal(istNetzabbruch(grund), true, grund);
    assert.equal(isTransientError(grund), true, grund);
  }
});

test("echte Fehler bleiben endgueltig — sonst versteckt sich Versagen hinter 'Netz'", () => {
  for (const grund of ["http_400", "http_401", "model_not_configured", "router_unavailable",
    "invalid_json_response", "all_backends_failed"]) {
    assert.equal(istNetzabbruch(grund), false, grund);
    assert.equal(isTransientError(grund), false, grund);
  }
});

test("callViaControl meldet einen Netzabbruch als network_error, nicht als 'fetch failed'", async () => {
  const ergebnis = await callViaControl(FALL, {
    endpoint: "https://api.example.invalid/api/chat",
    fetchImpl: async () => { throw new TypeError("fetch failed"); },
    now: () => 0
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "network_error");
});

test("ein Zeitablauf bleibt ein Zeitablauf", async () => {
  const ergebnis = await callViaControl(FALL, {
    endpoint: "https://api.example.invalid/api/chat",
    fetchImpl: async () => { const fehler = new Error("The operation was aborted"); fehler.name = "AbortError"; throw fehler; },
    now: () => 0
  });
  assert.equal(ergebnis.error, "timeout");
});

test("der Lauf wiederholt einen Netzabbruch, statt ihn als Modellversagen zu zaehlen", async () => {
  let aufrufe = 0;
  const bericht = await runEvalSuite({
    suite: { suiteId: "probe" },
    cases: [FALL],
    wiederholungen: 1,
    retries: 2,
    delayMs: 0,
    sleep: async () => {},
    callModel: async () => {
      aufrufe += 1;
      // Erster Versuch faellt am Netz aus, der zweite antwortet richtig.
      if (aufrufe === 1) return { ok: false, text: "", error: "network_error", backend: "control", modelId: "" };
      return { ok: true, text: "ja", error: null, backend: "control", modelId: "m" };
    }
  });
  assert.equal(aufrufe, 2, "es gab keinen zweiten Versuch");
  const fall = bericht.caseScores[0];
  assert.equal(fall.status, "passed");
  assert.notEqual(fall.criticalFailed, true);
});
