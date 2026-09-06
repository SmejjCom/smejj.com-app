// smejj.com — Laufzeit fuer smejj 1 ueber den Hausmodell-Dienst (Weg B, 06.09.2026):
// Katalog-Eintrag, Registry-Anbindung, Gesundheitsprobe. Kaputte UND gesunde Probe.
// Ausführen: node --test tests/smejj-1-laufzeit.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { LAUF_MODELLE, findeLaufModell, e2Schluessel } from "../workers/smejj-hausmodell/katalog.js";
import { getModelDefinition, getModelRuntimeConfig, isModelEnabled } from "../src/shared/modelRegistry.js";
import { refreshModelRuntimeHealth, resetModelRuntimeHealth } from "../control-server/src/llm/modelRuntimeHealth.js";

const ENV = {
  SMEJJ_1_ENABLED: "YES",
  SMEJJ_LLM_SMEJJ1_BASE_URL: "https://hausmodell.test/v1",
  SMEJJ_LLM_SMEJJ1_API_KEY: "haus-schluessel"
};

test("Katalog: smejj-1-basis ist ein vollstaendiger, startbarer Eintrag und nicht der Standard", () => {
  const m = findeLaufModell("smejj-1-basis");
  assert.ok(m, "Eintrag fehlt");
  assert.equal(m.standard, false, "das Hausmodell-Standardmodell bleibt BitNet");
  assert.match(m.sha256, /^[0-9a-f]{64}$/);
  assert.ok(m.sizeBytes > 2_000_000_000 && m.sizeBytes < 3_000_000_000, "Q4_K_M eines 4B-Modells liegt bei ~2,5 GB");
  assert.ok(m.ramSchaetzungMb <= 3200, "muss neben dem Bild-Maler in die ~3 GB freien RAM passen");
  assert.equal(m.kontext, 4096);
  assert.equal(e2Schluessel(m), "models/staging/smejj-1-basis/Qwen3-4B-Instruct-2507-Q4_K_M.gguf");
  assert.equal(LAUF_MODELLE.filter((x) => x.standard).length, 1, "genau ein Standardmodell");
  assert.equal(new Set(LAUF_MODELLE.map((x) => x.id)).size, LAUF_MODELLE.length, "keine Kennung doppelt");
});

test("Registry: smejj-1 zeigt auf den Hausmodell-Dienst — Bearer, Katalog-Kennung, 4096 Kontext, fail-closed", () => {
  const def = getModelDefinition("smejj-1");
  assert.equal(def.provider, "hausmodell");
  assert.equal(def.contextTokens, 4096);
  assert.equal(isModelEnabled(def, {}), false);
  assert.equal(getModelRuntimeConfig(def, { SMEJJ_1_ENABLED: "YES" }).configured, false, "ohne Adresse und Schluessel nicht konfiguriert");
  const rt = getModelRuntimeConfig(def, ENV);
  assert.equal(rt.configured, true);
  assert.equal(rt.runtimeModel, "smejj-1-basis");
  assert.equal(rt.apiKeyHeader, "Authorization", "der Hausmodell-Dienst prueft Bearer");
  assert.equal(rt.baseUrl, "https://hausmodell.test/v1");
});

test("Gesundheitsprobe: /health eine Ebene ueber /v1 mit Bearer — gesund gruen, kaputt rot, ohne Flag keine Anfrage", async () => {
  resetModelRuntimeHealth();
  const aufrufe = [];
  const gesund = async (url, init) => { aufrufe.push({ url, auth: init?.headers?.Authorization }); return { ok: true, status: 200 }; };
  let snap = await refreshModelRuntimeHealth(ENV, { fetchImpl: gesund, force: true });
  assert.ok(aufrufe.some((a) => a.url === "https://hausmodell.test/health"), `erwartet /health, gesehen: ${aufrufe.map((a) => a.url).join(", ")}`);
  assert.equal(aufrufe.find((a) => a.url === "https://hausmodell.test/health").auth, "Bearer haus-schluessel");
  assert.equal(snap["smejj-1"]?.available, true);

  resetModelRuntimeHealth();
  const kaputt = async () => ({ ok: false, status: 503 });
  snap = await refreshModelRuntimeHealth(ENV, { fetchImpl: kaputt, force: true });
  assert.equal(snap["smejj-1"]?.available, false, "503 muss rot sein — sonst wuerde Nr. 83 nie zurueckrollen");

  resetModelRuntimeHealth();
  const zaehler = [];
  await refreshModelRuntimeHealth({}, { fetchImpl: async (u) => { zaehler.push(u); return { ok: true, status: 200 }; }, force: true });
  assert.equal(zaehler.length, 0, "ohne Freigabe wird nichts angefragt");
});
