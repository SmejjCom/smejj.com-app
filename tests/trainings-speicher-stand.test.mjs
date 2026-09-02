import test from "node:test";
import assert from "node:assert/strict";
import { trainingsSpeicherStand, vergissTrainingsSpeicherStand } from "../src/training/speicherStand.js";

const ENV = {
  IDRIVE_E2_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
  IDRIVE_E2_ACCESS_KEY: "AKIAHAUPT",
  IDRIVE_E2_SECRET_KEY: "geheim-haupt",
  IDRIVE_E2_TRAINING_ENDPOINT: "verweis:IDRIVE_E2_ENDPOINT",
  IDRIVE_E2_TRAINING_REGION: "us-west-2",
  IDRIVE_E2_TRAINING_ACCESS_KEY: "verweis:IDRIVE_E2_ACCESS_KEY",
  IDRIVE_E2_TRAINING_SECRET_KEY: "verweis:IDRIVE_E2_SECRET_KEY",
  IDRIVE_E2_TRAINING_BUCKET: "smejj-app",
  IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/consents/"
};

test("Konfigurationsfehler werden als Stufe konfiguration mit Code gemeldet — ohne Werte", async () => {
  vergissTrainingsSpeicherStand();
  const stand = await trainingsSpeicherStand({ ...ENV, IDRIVE_E2_TRAINING_SECRET_KEY: "verweis:FEHLT" });
  assert.equal(stand.ok, false);
  assert.equal(stand.stufe, "konfiguration");
  assert.match(stand.fehler, /^training_idrive_config_reference_missing:IDRIVE_E2_TRAINING_SECRET_KEY/);
  assert.ok(!JSON.stringify(stand).includes("geheim"), "kein Geheimnis im Stand");
});

test("Speicherantwort 403 wird als Stufe speicher mit HTTP-Code gemeldet; 200 zaehlt Eintraege", async () => {
  vergissTrainingsSpeicherStand();
  const fetch403 = async () => new Response("", { status: 403 });
  const a = await trainingsSpeicherStand(ENV, { fetchImpl: fetch403 });
  assert.deepEqual({ ok: a.ok, stufe: a.stufe, fehler: a.fehler }, { ok: false, stufe: "speicher", fehler: "list_http_403" });
  assert.equal(a.host, "s3.us-west-2.idrivee2.com");
  vergissTrainingsSpeicherStand();
  const xml = '<?xml version="1.0"?><ListBucketResult><Contents><Key>training/consents/v1/a/b/c/grant.json</Key></Contents></ListBucketResult>';
  const fetch200 = async () => new Response(xml, { status: 200, headers: { "content-type": "application/xml" } });
  const b = await trainingsSpeicherStand(ENV, { fetchImpl: fetch200 });
  assert.equal(b.ok, true);
  assert.equal(b.eintraege, 1);
});

test("der Stand wird 60 s gehalten", async () => {
  vergissTrainingsSpeicherStand();
  let aufrufe = 0;
  const fetchImpl = async () => { aufrufe += 1; return new Response("", { status: 403 }); };
  let t = 1_000_000;
  await trainingsSpeicherStand(ENV, { fetchImpl, jetzt: () => t });
  t += 30_000;
  await trainingsSpeicherStand(ENV, { fetchImpl, jetzt: () => t });
  assert.equal(aufrufe, 1);
  t += 31_000;
  await trainingsSpeicherStand(ENV, { fetchImpl, jetzt: () => t });
  assert.equal(aufrufe, 2);
});
