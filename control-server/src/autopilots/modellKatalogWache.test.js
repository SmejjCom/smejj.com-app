// smejj.com — Unit-Tests der Modell-Katalog-Wache (Autopilot Nr. 62).
// Ausfuehren: node --test control-server/src/autopilots/modellKatalogWache.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  gewaehlteModelle, fehlendeModelle, fuehreSelbsttestAus,
  aktiveAnbieter, laufModellKatalogWache, bestaetigeModell
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
    // 20b fehlt in /models UND die Bestaetigungs-Anfrage scheitert -> wirklich tot
    fetchImpl: async (url) => url.endsWith("/chat/completions")
      ? { ok: false, status: 404 }
      : modelsAntwort(["openai/gpt-oss-120b"])
  });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.meldung.includes("groq:openai/gpt-oss-20b"));
  assert.ok(ergebnis.meldung.includes("HTTP 404"));
});

test("nicht gelistet, antwortet aber -> GRUEN mit Hinweis (Zhipu glm-4.5-flash, 14.09.)", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const anfragen = [];
  const ergebnis = await laufModellKatalogWache({
    env, ablage: leereAblage(),
    fetchImpl: async (url, init) => {
      if (url.endsWith("/chat/completions")) {
        anfragen.push(JSON.parse(init.body));
        return { ok: true, status: 200, json: async () => ({ choices: [] }) };
      }
      return modelsAntwort(["openai/gpt-oss-120b"]); // 20b nicht gelistet
    }
  });
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.meldung.includes("nicht in /models gelistet, antwortet aber: groq:openai/gpt-oss-20b"));
  assert.equal(anfragen.length, 1, "genau eine Bestaetigungs-Anfrage fuer das eine fehlende Modell");
  assert.equal(anfragen[0].max_tokens, 1, "die Probe ist so klein wie moeglich");
});

test("bestaetigeModell: Netzfehler ist 'antwortet nicht' mit Grund", async () => {
  const probe = await bestaetigeModell({ baseUrl: "https://x", apiKeyHeader: "Authorization", apiKey: "k" }, "m", {
    fetchImpl: async () => { throw new Error("ECONNRESET"); }
  });
  assert.equal(probe.antwortet, false);
  assert.ok(probe.grund.includes("ECONNRESET"));
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

test("rotes Ergebnis aus der Ablage wird nachgeprueft — antwortet das Modell, wird der Stand korrigiert", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const geschrieben = [];
  const ablage = {
    lies: async () => ({ id: "modell-katalog-stand", createdAt: new Date(Date.now() - 3_600_000).toISOString(), fehlend: 1, beispiel: "groq:openai/gpt-oss-20b", geprueft: 2, anbieter: 1 }),
    schreib: async (d) => { geschrieben.push(d); }
  };
  const ergebnis = await laufModellKatalogWache({
    env, ablage,
    fetchImpl: async (url) => url.endsWith("/chat/completions")
      ? { ok: true, status: 200, json: async () => ({}) }
      : { ok: false, status: 500 } // /models darf hier gar nicht gefragt werden
  });
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.meldung.includes("Nachgeprüft"));
  assert.equal(geschrieben.length, 1);
  assert.equal(geschrieben[0].fehlend, 0);
});

test("rotes Ergebnis aus der Ablage bleibt rot, wenn die Nachpruefung scheitert", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const ablage = {
    lies: async () => ({ id: "modell-katalog-stand", createdAt: new Date(Date.now() - 3_600_000).toISOString(), fehlend: 1, beispiel: "groq:tot", geprueft: 2, anbieter: 1 }),
    schreib: async () => {}
  };
  const ergebnis = await laufModellKatalogWache({ env, ablage, fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.meldung.includes("groq:tot"));
});

test("rote Ablage mit MEHR als einem fehlenden Modell wird NICHT per Beispiel gruen geredet", async () => {
  // Review-Befund 14.09.: die Ablage kennt nur das Beispiel; die uebrigen
  // fehlenden Modelle blieben ungeprueft und wurden fuer lebendig erklaert.
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const anfragen = [];
  const ablage = {
    lies: async () => ({ id: "modell-katalog-stand", createdAt: new Date(Date.now() - 3_600_000).toISOString(), fehlend: 2, beispiel: "groq:openai/gpt-oss-20b (HTTP 404)", geprueft: 2, anbieter: 1 }),
    schreib: async (d) => { anfragen.push(d); }
  };
  const ergebnis = await laufModellKatalogWache({ env, ablage, fetchImpl: async () => { throw new Error("darf nie gerufen werden"); } });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.meldung.includes("2 gewählte(s) Modell(e)"));
  assert.equal(anfragen.length, 0, "keine Probe, nichts geschrieben");
});

test("gescheiterte Nachpruefung wird vermerkt und innerhalb von 6 h nicht wiederholt", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const geschrieben = [];
  let proben = 0;
  const stand = { id: "modell-katalog-stand", createdAt: new Date(Date.now() - 3_600_000).toISOString(), fehlend: 1, beispiel: "groq:tot (HTTP 404)", geprueft: 2, anbieter: 1 };
  const ablage = { lies: async () => stand, schreib: async (d) => { geschrieben.push(d); Object.assign(stand, d); } };
  const fetchImpl = async () => { proben += 1; return { ok: false, status: 404 }; };
  const erster = await laufModellKatalogWache({ env, ablage, fetchImpl });
  assert.equal(erster.ok, false);
  assert.equal(proben, 1, "genau eine Probe im ersten Takt");
  assert.equal(geschrieben.length, 1);
  assert.ok(typeof geschrieben[0].nachgeprueft === "string", "der Fehlversuch wird mit Zeitstempel vermerkt");
  const zweiter = await laufModellKatalogWache({ env, ablage, fetchImpl });
  assert.equal(zweiter.ok, false);
  assert.equal(proben, 1, "im naechsten Takt keine zweite Probe (Frist 6 h)");
});

test("die Kennung in der Gruen-Meldung traegt keinen Grund-Zusatz", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k" };
  const geschrieben = [];
  const ablage = {
    lies: async () => ({ id: "modell-katalog-stand", createdAt: new Date(Date.now() - 3_600_000).toISOString(), fehlend: 1, beispiel: "groq:openai/gpt-oss-20b (HTTP 404)", geprueft: 2, anbieter: 1 }),
    schreib: async (d) => { geschrieben.push(d); }
  };
  const ergebnis = await laufModellKatalogWache({ env, ablage, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.meldung.includes("groq:openai/gpt-oss-20b fehlt"), ergebnis.meldung);
  assert.doesNotMatch(ergebnis.meldung, /\(HTTP 404\)/);
  assert.equal(geschrieben[0].ungelistet, "groq:openai/gpt-oss-20b");
});

test("Deckel: hoechstens 5 Kleinstanfragen je Tageslauf", async () => {
  const env = { SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_GROQ_MODEL_FAST: "m1", SMEJJ_LLM_GROQ_MODEL_DEFAULT: "m2", SMEJJ_LLM_GROQ_MODEL_CODING: "m3", SMEJJ_LLM_GROQ_MODEL_REASONING: "m4", SMEJJ_LLM_GROQ_MODEL_WEB: "m5", SMEJJ_LLM_ZHIPU_API_KEY: "z" };
  let proben = 0;
  const ergebnis = await laufModellKatalogWache({
    env, ablage: leereAblage(),
    fetchImpl: async (url) => { if (url.endsWith("/chat/completions")) { proben += 1; return { ok: false, status: 404 }; } return modelsAntwort(["nichts-davon"]); }
  });
  assert.equal(ergebnis.ok, false);
  assert.ok(proben <= 5, `zu viele Proben: ${proben}`);
  assert.ok(ergebnis.meldung.includes("Deckel") || ergebnis.meldung.includes("verschwunden"));
});

test("ohne Netz: Abfrage faellig, kein Fehler", async () => {
  const ergebnis = await laufModellKatalogWache({ env: { SMEJJ_LLM_GROQ_API_KEY: "k" }, ablage: leereAblage(), mitNetz: false });
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.meldung.includes("Netz-Takt"));
});
