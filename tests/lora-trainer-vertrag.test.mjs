import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leseKostengrenzen } from "../workers/smejj-lora-loop/budget.js";
import { fuehreZyklusAus } from "../workers/smejj-lora-loop/cycle.js";
import { brichTrainingAb, starteTraining, trainerErreichbar, trainingZustand } from "../workers/smejj-lora-loop/trainerClient.js";

// Der Vertragstest zwischen den beiden Haelften dieses Systems: der ECHTE
// Python-Trainingsdienst (Attrappen-Modus, kein torch, keine GPU) wird von der
// ECHTEN Node-Schleife gesteuert. Alles andere in der Testsuite benutzt
// nachgebaute fetch-Antworten — die beweisen, dass der Loop sich richtig
// verhaelt, aber nicht, dass der Dienst dasselbe Protokoll spricht.
//
// Genau dieser Test haette die beiden Fehlstarts vom 2026-08-01 verhindert:
// er prueft, dass /health SOFORT antwortet, bevor irgendein Modell geladen ist.

const TRAINER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../workers/smejj-lora-trainer");

async function starteDienst(env = {}) {
  // Wechselnder Port, damit parallel laufende Tests sich nicht behindern.
  const port = 8300 + Number(process.hrtime.bigint() % 400n);
  const prozess = spawn("python3", ["server.py"], {
    cwd: TRAINER,
    env: { ...process.env, PORT: String(port), SMEJJ_TRAINER_MODUS: "attrappe",
      SMEJJ_TRAINER_PUBLIC_URL: `http://127.0.0.1:${port}`, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const basisUrl = `http://127.0.0.1:${port}`;
  const frist = Date.now() + 15_000;
  while (Date.now() < frist) {
    try {
      const antwort = await fetch(`${basisUrl}/health`);
      if (antwort.ok) return { prozess, basisUrl, port };
    } catch { /* noch nicht oben */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  prozess.kill("SIGKILL");
  throw new Error("trainer_startete_nicht");
}

function beende(dienst) {
  return new Promise((r) => { dienst.prozess.once("exit", r); dienst.prozess.kill("SIGTERM"); });
}

const python = await new Promise((r) => {
  const p = spawn("python3", ["--version"], { stdio: "ignore" });
  p.once("error", () => r(false)).once("exit", (code) => r(code === 0));
});

test("der Dienst antwortet auf /health, BEVOR ein Modell geladen ist", { skip: !python }, async () => {
  // Die Lehre aus zwei Fehlstarts: llama.cpp laedt erst und horcht dann, und
  // lief damit in Salads 60-Minuten-Startsonde. Dieser Dienst muss umgekehrt
  // herum sein.
  const dienst = await starteDienst();
  try {
    const daten = await (await fetch(`${dienst.basisUrl}/health`)).json();
    assert.equal(daten.ok, true);
    assert.equal(daten.modus, "attrappe");
    assert.ok("bereit" in daten, "der Ladezustand gehoert in den Koerper, nicht in den Statuscode");
  } finally {
    await beende(dienst);
  }
});

test("der Loop-Client spricht dasselbe Protokoll wie der Dienst", { skip: !python }, async () => {
  const dienst = await starteDienst();
  try {
    assert.equal(await trainerErreichbar({ basisUrl: dienst.basisUrl }), true);

    const start = await starteTraining({
      basisUrl: dienst.basisUrl,
      konfiguration: { kennung: "lr5e-5-r16-p0.3-e1", lernrate: 5e-5, loraRang: 16, loraAlpha: 32, epochen: 1 },
      basismodell: { hfRepo: "Qwen/Qwen3-14B" },
      datensatz: { schluessel: "datasets/smejj-1-0/projektwissen/x/train.jsonl" }
    });
    assert.equal(start.ok, true, JSON.stringify(start.gruende));
    assert.match(start.laufId, /^[a-f0-9]{16}$/);

    let zustand = await trainingZustand({ basisUrl: dienst.basisUrl, laufId: start.laufId });
    const frist = Date.now() + 10_000;
    while (zustand.zustand === "laeuft" && Date.now() < frist) {
      await new Promise((r) => setTimeout(r, 100));
      zustand = await trainingZustand({ basisUrl: dienst.basisUrl, laufId: start.laufId });
    }
    assert.equal(zustand.zustand, "fertig", JSON.stringify(zustand));
    assert.ok(zustand.adapterSchluessel);
    assert.equal(zustand.messEndpunkt, dienst.basisUrl);
  } finally {
    await beende(dienst);
  }
});

test("ein unbekannter Lauf ist 'unbekannt' — der Loop bricht darauf ab", { skip: !python }, async () => {
  const dienst = await starteDienst();
  try {
    const zustand = await trainingZustand({ basisUrl: dienst.basisUrl, laufId: "gibtesnicht" });
    assert.equal(zustand.zustand, "unbekannt");
  } finally {
    await beende(dienst);
  }
});

test("Abbruch wird bestaetigt und setzt den Lauf auf fehlgeschlagen", { skip: !python }, async () => {
  const dienst = await starteDienst();
  try {
    const start = await starteTraining({
      basisUrl: dienst.basisUrl, konfiguration: { kennung: "abbruch" },
      basismodell: {}, datensatz: {}
    });
    assert.equal(await brichTrainingAb({ basisUrl: dienst.basisUrl, laufId: start.laufId }), true);
    const zustand = await trainingZustand({ basisUrl: dienst.basisUrl, laufId: start.laufId });
    assert.equal(zustand.zustand, "fehlgeschlagen");
    // Ein zweiter Abbruch auf einen unbekannten Lauf darf NICHT true melden —
    // sonst haelt der Loop eine laufende Karte faelschlich fuer beendet.
    assert.equal(await brichTrainingAb({ basisUrl: dienst.basisUrl, laufId: "gibtesnicht" }), false);
  } finally {
    await beende(dienst);
  }
});

test("die Chat-Route ist OpenAI-kompatibel und kennzeichnet die Attrappe", { skip: !python }, async () => {
  const dienst = await starteDienst();
  try {
    const antwort = await fetch(`${dienst.basisUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hallo" }], max_tokens: 20 })
    });
    const daten = await antwort.json();
    assert.equal(antwort.status, 200);
    const text = daten.choices[0].message.content;
    // Die Attrappe muss erkennbar unbrauchbar antworten. Eine plausibel
    // klingende Scheinantwort wuerde irgendwann als echte Messung gelesen.
    assert.match(text, /attrappe/i);
  } finally {
    await beende(dienst);
  }
});

test("EIN ganzer Zyklus laeuft gegen den echten Dienst durch", { skip: !python }, async () => {
  const dienst = await starteDienst();
  try {
    const grenzen = leseKostengrenzen({
      SMEJJ_LORA_GPU_KLASSE: "rtx3090",
      SMEJJ_LORA_MAX_USD_GESAMT: "50",
      SMEJJ_LORA_MAX_ZYKLUS_MINUTEN: "45",
      SMEJJ_LORA_FREIGABE_ID: "freigabe-2026-08-01-rtx3090-180usd",
      SMEJJ_LORA_FREIGABE_GPU_KLASSE: "rtx3090",
      SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180"
    });
    const ergebnis = await fuehreZyklusAus({
      grenzen,
      zyklusIndex: 0,
      verbrauchtUsd: 0,
      besterStand: null,
      basismodell: { hfRepo: "Qwen/Qwen3-14B" },
      datensatz: { schluessel: "datasets/smejj-1-0/projektwissen/x/train.jsonl" },
      trainerBasisUrl: dienst.basisUrl,
      pruefeDaten: async () => ({ vorhanden: true }),
      // Nur die Messung bleibt nachgebaut: eine echte Suite-Messung gegen die
      // Attrappe waere sinnlos, weil die Attrappe bewusst Unsinn antwortet.
      messe: async ({ messEndpunkt }) => {
        assert.equal(messEndpunkt, dienst.basisUrl, "der Messendpunkt kommt vom Dienst");
        return { ok: true, kennzahlen: { punktzahl: 0.9, kritischeFehler: 0 } };
      },
      speichereBesten: async () => true,
      warte: async () => {},
      abfrageAbstandMs: 50
    });
    assert.equal(ergebnis.gestartet, true);
    assert.equal(ergebnis.ok, true, JSON.stringify(ergebnis.gruende));
    assert.equal(ergebnis.besser, true);
    assert.ok(ergebnis.adapterSchluessel);
  } finally {
    await beende(dienst);
  }
});
