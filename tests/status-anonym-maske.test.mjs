// S6 (E2E-Sicherheitspruefung 15.09.2026): Status-Routen verraten Anonymen keine Interna.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maskiereHealthFuerAnonyme, maskiereModellStatusFuerAnonyme } from "../control-server/src/http/anonymMaske.js";

const VERBOTEN = /bucket|bucketEnv|IDRIVE_E2_|idrivee2\.com|archivedObjects|model-files\/|SALAD_|quotaRemaining|gpuVramGb/i;

test("Health: Zustand bleibt, Innenleben verschwindet", () => {
  const roh = { ok: true, app: "smejj.com", gestartetAm: "x", costPolicy: { maxEur: 0 }, ai: true, aiBackend: "zhipu", activeModelId: "glm-5-2",
    modelRegistry: { defaultModelId: "glm-5-2", models: [{ id: "glm-5-2", active: true, storage: { bucketEnv: "IDRIVE_E2_MODEL_BUCKET", prefix: "model-files/glm/" } }] },
    smejjAlias: { live: false, grund: "SMEJJ_LLM_SMEJJ1_BASE_URL fehlt" }, storage: true,
    suchquelle: { monat: "2026-09", verbraucht: 11, deckel: 900, konfiguriert: true },
    trainingsSpeicher: { ok: true, stufe: "ok", host: "s3.us-west-2.idrivee2.com", bucket: "smejj-model-files", eintraege: 1 } };
  const m = maskiereHealthFuerAnonyme(roh);
  assert.doesNotMatch(JSON.stringify(m), VERBOTEN);
  assert.doesNotMatch(JSON.stringify(m), /SMEJJ_LLM_|verbraucht|deckel/);
  for (const k of ["ok", "app", "gestartetAm", "ai", "aiBackend", "activeModelId", "storage"]) assert.deepEqual(m[k], roh[k], k);
  assert.equal(m.modelRegistry.models[0].id, "glm-5-2");
  assert.equal(m.suchquelle.konfiguriert, true);
  assert.equal(roh.trainingsSpeicher.bucket, "smejj-model-files", "Eingabe unveraendert");
});

test("Modellstatus, Liste und Preflight: Entscheidung bleibt, Interna verschwinden", () => {
  const ergebnis = { ok: true, configured: true, model: { id: "kimi-k2-7", source: "moonshotai/x", storage: { prefix: "model-files/kimi/" }, verification: { status: "ok" }, inference: { default: "api" }, sourceArchive: { status: "archiviert", prefix: "model-files/a/", archivedObjects: ["a", "b"] } },
    liveStorage: { ok: true, provider: "idrive-e2", bucket: "smejj-model-files", prefix: "model-files/kimi/", objectCount: 3, expectedObjectCount: 3, checkedAt: "t", message: "BucketName smejj" } };
  const liste = maskiereModellStatusFuerAnonyme({ ok: true, models: [ergebnis], registry: { models: [{ id: "kimi-k2-7", storage: { bucketEnv: "IDRIVE_E2_MODEL_BUCKET" } }] } });
  assert.doesNotMatch(JSON.stringify(liste), VERBOTEN);
  assert.equal(liste.models[0].liveStorage.objectCount, 3);
  assert.equal(liste.models[0].model.verification.status, "ok");
  assert.equal(liste.models[0].model.sourceArchive.status, "archiviert");
  const pre = maskiereModellStatusFuerAnonyme({ ok: false, modelStatus: ergebnis, preflight: { ok: false, decision: "blocked", reasons: ["x"], facts: { gpuVramGb: 24, quotaRemainingReplicas: 10 } } });
  assert.doesNotMatch(JSON.stringify(pre), VERBOTEN);
  assert.deepEqual(pre.preflight.reasons, ["x"]);
});

test("Verdrahtung: nur ohne Sitzung wird maskiert", () => {
  const s = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(s, /handleHealth\(res, Boolean\(readSession\(req\)\)\)/);
  assert.match(s, /\(angemeldet \? \(wert\) => wert : maskiereHealthFuerAnonyme\)\(/);
  assert.match(s, /handleModelsStatus\(res, \{ angemeldet: Boolean\(readSession\(req\)\) \}\)/);
  const r = readFileSync(new URL("../control-server/src/routes/modelRoutes.js", import.meta.url), "utf8");
  assert.match(r, /maske\(live\)\(\{ ok: preflight\.ok, modelStatus, preflight \}\)/);
});
