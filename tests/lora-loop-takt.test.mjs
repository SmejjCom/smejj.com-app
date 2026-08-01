import assert from "node:assert/strict";
import test from "node:test";
import { ladeLoopKonfiguration, startHindernisse } from "../workers/smejj-lora-loop/config.js";
import { erzeugeLoop } from "../workers/smejj-lora-loop/loop.js";
import { erzeugeServer } from "../workers/smejj-lora-loop/worker.mjs";

const FREIGEGEBEN = Object.freeze({
  SMEJJ_LORA_LOOP_ENABLED: "YES",
  SMEJJ_LORA_TRAINING_ENABLED: "YES",
  SMEJJ_LORA_GPU_KLASSE: "rtx3090",
  SMEJJ_LORA_MAX_USD_GESAMT: "50",
  SMEJJ_LORA_MAX_ZYKLUS_MINUTEN: "45",
  SMEJJ_LORA_FREIGABE_ID: "freigabe-2026-08-01-dauertraining",
  SMEJJ_LORA_FREIGABE_GPU_KLASSE: "rtx3090",
  SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180",
  SMEJJ_LORA_BASIS_HF_REPO: "Qwen/Qwen2.5-Coder-7B-Instruct",
  SMEJJ_LORA_DATENSATZ_SCHLUESSEL: "datasets/smejj-1-0/v1/train.jsonl",
  SMEJJ_LORA_DATENSATZ_MANIFEST: "datasets/smejj-1-0/v1/manifest.json",
  SMEJJ_LORA_TRAINER_URL: "https://trainer.example",
  SMEJJ_LORA_ZYKLUS_ABSTAND_MS: "60000"
});

/** Ablage im Arbeitsspeicher, die sich wie IDrive verhaelt (404 beim ersten Lesen). */
function ablage(anfangswerte = {}) {
  const objekte = new Map(Object.entries(anfangswerte));
  return {
    objekte,
    request: async (_config, methode, key, koerper) => {
      if (methode === "GET") {
        if (!objekte.has(key)) throw new Error(`idrive_get_404: fehlt`);
        return objekte.get(key);
      }
      objekte.set(key, koerper);
      return "";
    }
  };
}

const IDRIVE = Object.freeze({ idrive: { endpoint: "https://s3.test", bucket: "test", region: "us-west-2", accessKey: "a", secretKey: "b" } });

function deps(speicher, overrides = {}) {
  return {
    idriveConfig: IDRIVE,
    zustandRequest: speicher.request,
    bestenRequest: speicher.request,
    pruefeDaten: async () => ({ vorhanden: true }),
    messe: async () => ({ ok: true, kennzahlen: { punktzahl: 0.9, kritischeFehler: 0 } }),
    fetchImpl: async (url) => {
      const pfad = String(url);
      const json = (d) => ({ ok: true, status: 200, text: async () => JSON.stringify(d) });
      if (pfad.endsWith("/health")) return json({});
      if (pfad.endsWith("/training/start")) return json({ laufId: "l1" });
      if (pfad.includes("/training/status/")) {
        return json({ zustand: "fertig", messEndpunkt: "https://t/v1", adapterSchluessel: "a.safetensors", gelaufeneMinuten: 30 });
      }
      return json({});
    },
    warte: async () => {},
    ...overrides
  };
}

test("ohne SMEJJ_LORA_TRAINING_ENABLED tickt der Loop, trainiert aber nicht", async () => {
  const config = ladeLoopKonfiguration({ ...FREIGEGEBEN, SMEJJ_LORA_TRAINING_ENABLED: "NO" });
  const speicher = ablage();
  const loop = erzeugeLoop({ config, env: {}, log: () => {}, deps: deps(speicher) });
  await loop.tick();
  assert.equal(loop.getStatus().state, "aus");
  assert.equal(speicher.objekte.size, 0, "es darf nichts geschrieben werden");
});

test("leere Umgebung: /health nennt jeden Grund, warum nicht trainiert wird", () => {
  const config = ladeLoopKonfiguration({});
  const gruende = startHindernisse(config);
  for (const erwartet of [
    "SMEJJ_LORA_LOOP_ENABLED!=YES",
    "SMEJJ_LORA_TRAINING_ENABLED!=YES",
    "keine_schriftliche_freigabe",
    "kein_basismodell",
    "kein_datensatz",
    "keine_trainer_adresse"
  ]) {
    assert.ok(gruende.includes(erwartet), `${erwartet} fehlt in ${gruende.join(",")}`);
  }
});

test("Kostenzaehler ueberlebt einen Container-Neustart", async () => {
  // Die gemessene Falle: jeder Push ersetzt den Container. Laege der Zaehler
  // nur im Arbeitsspeicher, faenge der Deckel nach jedem Deploy bei null an.
  const config = ladeLoopKonfiguration(FREIGEGEBEN);
  const speicher = ablage();

  const loop1 = erzeugeLoop({ config, env: {}, log: () => {}, deps: deps(speicher) });
  const nach1 = await loop1.tick();
  assert.equal(nach1.zyklusIndex, 1);
  assert.equal(nach1.verbrauchtUsd, 0.125); // 30 Minuten auf einer 3090

  // Neustart: neuer Prozess, dieselbe Ablage, kein Arbeitsspeicher.
  const loop2 = erzeugeLoop({ config, env: {}, log: () => {}, deps: deps(speicher) });
  const nach2 = await loop2.tick(() => new Date(Date.now() + 3_600_000));
  assert.equal(nach2.zyklusIndex, 2, "Zyklus-Index wurde aus der Ablage gelesen");
  assert.equal(nach2.verbrauchtUsd, 0.25, "Kosten wurden aufaddiert, nicht zurueckgesetzt");
});

test("ein nicht lesbarer Kostenzaehler sperrt das Training", async () => {
  // Lieber Stillstand als ein Deckel, der nicht haelt.
  const config = ladeLoopKonfiguration(FREIGEGEBEN);
  const kaputt = {
    request: async (_c, methode) => {
      if (methode === "GET") throw new Error("idrive_get_500: Ablage kaputt");
      return "";
    }
  };
  const loop = erzeugeLoop({ config, env: {}, log: () => {}, deps: deps(kaputt) });
  await loop.tick();
  assert.equal(loop.getStatus().state, "gesperrt");
  assert.ok(String(loop.getStatus().letzterGrund).startsWith("zustand_nicht_lesbar"));
});

test("gesperrte Zyklen erhoehen den Gitter-Index NICHT", async () => {
  // Sonst waere das Gitter nach zwei Tagen ohne Freigabe 'erschoepft', ohne
  // dass je eine Konfiguration gemessen wurde.
  const config = ladeLoopKonfiguration(FREIGEGEBEN);
  const speicher = ablage();
  const loop = erzeugeLoop({
    config, env: {}, log: () => {},
    deps: deps(speicher, { pruefeDaten: async () => ({ vorhanden: false }) })
  });
  const zustand = await loop.tick();
  assert.equal(zustand.zyklusIndex, 0);
  assert.equal(zustand.zyklenGestartet, 0);
  assert.equal(zustand.verbrauchtUsd, 0);
});

test("der Verlauf enthaelt Kennzahlen, aber keine Prompts oder Antworten", async () => {
  const config = ladeLoopKonfiguration(FREIGEGEBEN);
  const loop = erzeugeLoop({ config, env: {}, log: () => {}, deps: deps(ablage()) });
  await loop.tick();
  const verlauf = loop.getVerlauf();
  assert.equal(verlauf.length, 1);
  assert.equal(verlauf[0].punktzahl, 0.9);
  assert.equal(verlauf[0].kostenUsd, 0.125);
  const text = JSON.stringify(verlauf);
  assert.ok(!/prompt|antwort|content|messages/i.test(text), text);
});

test("/kosten meldet Verbrauch, Rest und Monatskosten", async () => {
  const config = ladeLoopKonfiguration(FREIGEGEBEN);
  const loop = erzeugeLoop({ config, env: {}, log: () => {}, deps: deps(ablage()) });
  await loop.tick();

  const server = erzeugeServer({ config, loop });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const antwort = await fetch(`http://127.0.0.1:${port}/kosten`);
    const daten = await antwort.json();
    assert.equal(daten.gpuKlasse, "rtx3090");
    assert.equal(daten.monatskostenUsdBeiDauerbetrieb, 180);
    assert.equal(daten.verbrauchtUsd, 0.125);
    assert.equal(daten.restUsd, 49.875);
    assert.equal(daten.freigabeId, "freigabe-2026-08-01-dauertraining");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("/health antwortet auch im Aus-Zustand und nennt die Gruende", async () => {
  const config = ladeLoopKonfiguration({});
  const loop = erzeugeLoop({ config, env: {}, log: () => {}, deps: deps(ablage()) });
  const server = erzeugeServer({ config, loop });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const daten = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(daten.ok, true);
    assert.equal(daten.trainingEnabled, false);
    assert.ok(daten.traineertNichtWeil.length > 0);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
