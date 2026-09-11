// smejj.com — Vertragstests der Provider-Schicht.
// Diese Tests laufen unveraendert gegen jeden kuenftigen Provider (GLM, Kimi,
// SmejjProvider). Schlaegt ein Provider hier fehl, ist der Adapter fehlerhaft.
//
// STAND 2026-09-11: Es gibt derzeit KEINEN Adapter. Cline war der einzige und
// ist mit dem A-bis-Z-Auftrag (Punkt 1) entfernt worden — er war zu diesem
// Zeitpunkt bereits funktionslos, weil die Oberflaeche zum Hinterlegen eines
// Schluessels nicht mehr existierte.
//
// WAS DAVON BLEIBT UND WARUM: Geprueft wird weiter alles, was echten
// Produktionscode hat — providerContract.js (Registry, Normalisierung,
// Autonomiestufen) und sessionStore.js. Die acht Proben, die das VERHALTEN des
// Cline-Adapters beschrieben (Streaming, Lebenszyklus, Freigaben, getResult),
// sind mit ihm entfallen: Tests fuer Code, den es nicht mehr gibt, waeren
// Theater — und ein Prueflings-Adapter im Test haette nur meinen eigenen
// Testcode geprueft.
//
// Der Vertrag selbst ist das Wertvolle: er sagt einem kuenftigen eigenen
// Agenten, was er erfuellen muss.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTONOMY_LEVELS,
  PROVIDER_METHODS,
  getProvider,
  listProviders,
  normalizeTaskInput,
  registerProvider,
  __resetProviderRegistryForTests
} from "../src/agent/providers/providerContract.js";
import { createSessionStore } from "../src/agent/api/sessionStore.js";

/**
 * Ein Adapter, der den Vertrag genau erfuellt — nicht mehr.
 *
 * Bewusst OHNE Verhalten: er dient allein dazu, die Registry zu pruefen
 * (nimmt sie einen vollstaendigen Adapter an, lehnt sie einen unvollstaendigen
 * ab). Alles, was er "koennte", waere Testcode, der sich selbst prueft.
 */
function vertragstreuerAdapter() {
  return Object.fromEntries(PROVIDER_METHODS.map((name) => [name, () => {
    throw new Error(`${name} ist in dieser Pruef-Attrappe nicht belegt`);
  }]));
}

test("ein vertragstreuer Adapter wird angenommen", () => {
  __resetProviderRegistryForTests();
  const provider = vertragstreuerAdapter();
  for (const method of PROVIDER_METHODS) {
    assert.equal(typeof provider[method], "function", `${method} fehlt`);
  }
  assert.doesNotThrow(() => registerProvider("pruefung", provider));
});

test("Registry lehnt unvollstaendige Provider ab (fail-closed)", () => {
  __resetProviderRegistryForTests();
  assert.throws(() => registerProvider("kaputt", { startTask() {} }), /erfuellt den Vertrag nicht/);
});

test("Registry lehnt ungueltige Provider-Ids ab", () => {
  __resetProviderRegistryForTests();
  assert.throws(() => registerProvider("Fremd GmbH!", vertragstreuerAdapter()), /ungueltig/);
});

test("Unbekannter Provider liefert PROVIDER_UNAVAILABLE", () => {
  __resetProviderRegistryForTests();
  assert.throws(() => getProvider("gibtesnicht"), (error) => error.code === "PROVIDER_UNAVAILABLE");
});

test("Registrierter Provider ist auffindbar und listbar", () => {
  __resetProviderRegistryForTests();
  const provider = vertragstreuerAdapter();
  registerProvider("pruefung", provider, { capabilities: ["streaming"] });
  assert.equal(getProvider("pruefung"), provider);
  assert.deepEqual(listProviders(), [{ id: "pruefung", capabilities: ["streaming"] }]);
});

test("ohne registrierten Provider ist die Liste leer", () => {
  // Das ist der Normalzustand seit dem 2026-09-11 — und agentRoutes.js
  // verlaesst sich darauf: keine Provider, keine Agent-Route.
  __resetProviderRegistryForTests();
  assert.deepEqual(listProviders(), []);
});

test("normalizeTaskInput setzt sichere Vorgaben (fail-closed Berechtigungen)", () => {
  const input = normalizeTaskInput({ prompt: "Baue X", userId: "u1" });
  assert.equal(input.autonomy.level, "supervised");
  assert.equal(input.autonomy.requireApprovalForDestructiveActions, true);
  for (const permission of Object.values(input.permissions)) {
    assert.equal(permission, false, "Berechtigungen muessen standardmaessig aus sein");
  }
});

test("normalizeTaskInput lehnt leeren Prompt und ungueltige Autonomiestufe ab", () => {
  assert.throws(() => normalizeTaskInput({ prompt: "  " }), (error) => error.code === "INVALID_REQUEST");
  assert.throws(() => normalizeTaskInput({ prompt: "X", autonomy: { level: "gottmodus" } }), (error) => error.code === "INVALID_REQUEST");
});

test("Autonomiestufen entsprechen der Spezifikation", () => {
  assert.deepEqual([...AUTONOMY_LEVELS], ["observe", "assist", "supervised", "autonomous"]);
});

test("SessionStore: Fremdzugriff wird verweigert", () => {
  const store = createSessionStore();
  const session = store.create({ userId: "u1", provider: "pruefung" });
  assert.throws(() => store.requireOwned(session.sessionId, "u2"), (error) => error.code === "AUTHENTICATION_ERROR");
  assert.equal(store.requireOwned(session.sessionId, "u1").sessionId, session.sessionId);
});

test("SessionStore: unbekannte Sitzung liefert INVALID_REQUEST", () => {
  const store = createSessionStore();
  assert.throws(() => store.require("gibtesnicht"), (error) => error.code === "INVALID_REQUEST");
});

test("SessionStore: abgelaufene Sitzungen werden entfernt (TTL)", () => {
  let clock = 1_000;
  const store = createSessionStore({ ttlMs: 100, now: () => clock });
  const session = store.create({ userId: "u1" });
  clock += 500;
  assert.throws(() => store.require(session.sessionId), (error) => error.code === "INVALID_REQUEST");
  assert.equal(store.size(), 0);
});

test("SessionStore: Obergrenze schuetzt den Control Server", () => {
  const store = createSessionStore({ maxSessions: 2 });
  store.create({ userId: "u1" });
  store.create({ userId: "u1" });
  assert.throws(() => store.create({ userId: "u1" }), (error) => error.code === "RATE_LIMITED");
});

test("SessionStore speichert keine Secrets", () => {
  const store = createSessionStore();
  const session = store.create({ userId: "u1", provider: "pruefung", model: "m" });
  assert.ok(!("apiKey" in session), "Sitzung darf keinen Key halten");
  assert.ok(!JSON.stringify({ ...session, abortController: undefined }).includes("sk-"));
});
