// smejj.com — Unit-Tests der Modell-Katalog-Wache (Autopilot Nr. 62).
// Ausfuehren: node --test control-server/src/autopilots/modellKatalogWache.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  gewaehlteModelle, fehlendeModelle, fuehreSelbsttestAus,
  aktiveAnbieter, laufModellKatalogWache
} from "./modellKatalogWacheAutopilot.js";

// Eine Ablage-Attrappe: nichts gespeichert, Schreiben wird geschluckt.
const leereAblage = () => ({ lies: async () => null, schreib: async () => {} });

// Ein /models-Fake in OpenAI-Form.
const modelsAntwort = (ids) => ({ ok: true, status: 200, json: async () => ({ data: ids.map((id) => ({ id })) }) });

test("Selbsttest: kaputte und gesunde Probe werden richtig beurteilt", () => {
  assert.equal(fuehreSelbsttestAus().bestanden, true);
});

test("gewaehlteModelle folgt dem Router inkl. Env-Override", () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const modelle = gewaehlteModelle("groq", env);
  assert.ok(modelle.includes("openai/gpt-oss-120b") && modelle.includes("openai/gpt-oss-20b"));
  const mitOverride = gewaehlteModelle("groq", { ...env, SMEJJ_LLM_GROQ_MODEL_FAST: "custom-fast" });
  assert.ok(mitOverride.includes("custom-fast"));
});

test("aktiveAnbieter: nur mit Schluessel, openrouter zaehlt mit", () => {
  assert.deepEqual(aktiveAnbieter({}), []);
  const namen = aktiveAnbieter({ SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_OPENROUTER_API_KEY: "o" });
  assert.deepEqual(namen.sort(), ["groq", "openrouter"]);
});

test("fehlendes Modell macht ROT und wird benannt", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const ergebnis = await laufModellKatalogWache({
    env, ablage: leereAblage(),
    fetchImpl: async () => modelsAntwort(["openai/gpt-oss-120b"]) // 20b fehlt
  });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.meldung.includes("groq:openai/gpt-oss-20b"));
});

test("alle gewaehlten Modelle vorhanden -> gruen mit Zahlen", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const ergebnis = await laufModellKatalogWache({
    env, ablage: leereAblage(),
    fetchImpl: async () => modelsAntwort(["openai/gpt-oss-120b", "openai/gpt-oss-20b"])
  });
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.meldung.includes("2"));
});

test("kein Anbieter pruefbar -> ROT, die Wache hat nichts gemessen", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const ergebnis = await laufModellKatalogWache({
    env, ablage: leereAblage(),
    fetchImpl: async () => ({ ok: false, status: 404 })
  });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.meldung.includes("nichts gemessen"));
});

test("unpruefbarer Anbieter wird BENANNT, macht aber nicht rot", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_OPENROUTER_API_KEY: "o" };
  const ergebnis = await laufModellKatalogWache({
    env, ablage: leereAblage(),
    fetchImpl: async (url) => url.includes("openrouter")
      ? { ok: false, status: 503 }
      : modelsAntwort(["openai/gpt-oss-120b", "openai/gpt-oss-20b"])
  });
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.meldung.includes("openrouter"));
});

test("ohne Schluessel: Katalog ungenutzt, ehrlich gruen", async () => {
  const ergebnis = await laufModellKatalogWache({ env: {}, ablage: leereAblage(), fetchImpl: async () => { throw new Error("darf nie gerufen werden"); } });
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.meldung.includes("nichts zu prüfen"));
});

test("frischer Stand aus der Ablage wird gemeldet statt neu gefragt", async () => {
  const jetzt = Date.parse("2026-08-24T12:00:00Z");
  const ablage = {
    lies: async () => ({ createdAt: "2026-08-24T02:00:00Z", fehlend: 1, beispiel: "groq:tot", geprueft: 3, anbieter: 1, unpruefbar: "" }),
    schreib: async () => { throw new Error("darf nicht schreiben"); }
  };
  const ergebnis = await laufModellKatalogWache({ env: { SMEJJ_LLM_GROQ_API_KEY: "k" }, ablage, jetztMs: jetzt, fetchImpl: async () => { throw new Error("darf nie gerufen werden"); } });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.meldung.includes("groq:tot"));
});

test("ohne Netz: Abfrage faellig, kein Fehler", async () => {
  const ergebnis = await laufModellKatalogWache({ env: { SMEJJ_LLM_GROQ_API_KEY: "k" }, ablage: leereAblage(), mitNetz: false });
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.meldung.includes("Netz-Takt"));
});
