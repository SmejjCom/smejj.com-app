// smejj.com Maus-Engine — Tests fuer lebende Browser-Sitzungen.
// Kernbeweis dieser Datei: ZWEI Auftraege nacheinander laufen in DERSELBEN
// Sitzung, ohne Neustart, und der zweite findet die Seite des ersten vor.
// Playwright wird durch einen Mock ersetzt (kein Netz, kein Browser-Download);
// die Sitzungslogik ist davon unabhaengig.
import test from "node:test";
import assert from "node:assert/strict";
import { createSessionRegistry } from "../workers/maus-engine/session-registry.mjs";
import { createLeaseStore } from "../workers/maus-engine/session-lease.mjs";
import { executeRunInSession, executeRun } from "../workers/maus-engine/worker.mjs";

// --- Mock-Browser: zaehlt Starts und merkt sich die zuletzt geladene Adresse --

function mockFabrik(protokoll) {
  return async () => {
    protokoll.starts += 1;
    const nummer = protokoll.starts;
    const seiten = [];
    const context = {
      async newPage() {
        const page = {
          nummer,
          currentUrl: "about:blank",
          url() { return page.currentUrl; },
          async goto(url) { page.currentUrl = url; protokoll.log.push(`goto:${url}`); return { status: () => 200 }; },
          async title() { return "Testseite smejj.com"; },
          async screenshot() { return Buffer.from("PNG"); },
          async close() {},
          async bringToFront() {},
          async waitForLoadState() {},
          async evaluate() { return null; },
          keyboard: { async press() {} },
          mouse: { async click() {}, async move() {}, async wheel() {} },
          locator() { return leerLocator(); },
          getByRole() { return leerLocator(); },
          getByTestId() { return leerLocator(); },
          getByLabel() { return leerLocator(); },
          getByText() { return leerLocator(); }
        };
        seiten.push(page);
        return page;
      },
      on() {},
      async cookies() { return []; },
      async addCookies() {},
      async clearCookies() {},
      async storageState() { return { cookies: [{ name: "sid", value: "x", domain: "example.com", path: "/" }] }; }
    };
    return {
      browser: { async close() { protokoll.log.push(`close:browser:${nummer}`); protokoll.geschlossen += 1; } },
      context
    };
  };
}

function leerLocator() {
  const l = {
    async click() {}, async fill() {}, async type() {}, async press() {},
    async hover() {}, async waitFor() {}, async count() { return 1; },
    async textContent() { return "Hallo"; }, async scrollIntoViewIfNeeded() {},
    first() { return l; }, nth() { return l; }
  };
  return l;
}

function plan(planId, steps) {
  return {
    schemaVersion: 1,
    planId,
    createdAt: "2026-07-31T00:00:00Z",
    capsuleRef: "maus-sitzung-test-2026-07-31",
    planner: { modelId: "glm-5-2", promptTemplateVersion: "v1" },
    policy: {
      domainAllowlist: ["example.com"],
      budget: {
        maxActions: 30, maxLocalRetries: 0, maxPlannerRoundtrips: 0,
        maxDurationMs: 60_000, defaultActionTimeoutMs: 1000
      }
    },
    steps
  };
}

const AUFTRAG_EINS = plan("auftrag-1", [
  { id: "s1", action: "openBrowser" },
  { id: "s2", action: "navigate", url: "https://example.com/erste-seite" },
  { id: "s3", action: "screenshot", name: "eins" }
]);

// Der zweite Auftrag hat KEIN navigate: er darf die Seite des ersten vorfinden.
const AUFTRAG_ZWEI = plan("auftrag-2", [
  { id: "s1", action: "openBrowser" },
  { id: "s2", action: "screenshot", name: "zwei" }
]);

function registryMitMock(protokoll, overrides = {}) {
  return createSessionRegistry({
    browserFactory: mockFabrik(protokoll),
    leaseStore: createLeaseStore({}),
    holder: "instanz-test",
    ...overrides
  });
}

function neuesProtokoll() {
  return { starts: 0, geschlossen: 0, log: [] };
}

test("KERNBEWEIS: zwei Auftraege, EINE Sitzung, Seite bleibt stehen", async () => {
  const protokoll = neuesProtokoll();
  const registry = registryMitMock(protokoll);
  const gemeinsam = { registry, skipUpload: true, retryDelayFn: async () => {} };

  const eins = await executeRunInSession(AUFTRAG_EINS, { sessionId: "maus-sitzung-a1", ...gemeinsam });
  assert.equal(eins.ok, true, JSON.stringify(eins.actionLog));
  assert.equal(eins.sitzungNeu, true);
  assert.equal(eins.sitzungOffen, true, "der Browser muss nach dem Lauf offen bleiben");
  assert.equal(eins.sitzung.aktiveSeite, "https://example.com/erste-seite");

  const zwei = await executeRunInSession(AUFTRAG_ZWEI, { sessionId: "maus-sitzung-a1", ...gemeinsam });
  assert.equal(zwei.ok, true, JSON.stringify(zwei.actionLog));
  assert.equal(zwei.sitzungNeu, false, "zweiter Auftrag darf keine neue Sitzung anlegen");
  assert.equal(
    zwei.sitzung.aktiveSeite,
    "https://example.com/erste-seite",
    "der zweite Auftrag muss die Seite des ersten vorfinden"
  );

  assert.equal(protokoll.starts, 1, "genau EIN Browserstart fuer zwei Auftraege (kein Kaltstart)");
  assert.equal(protokoll.geschlossen, 0, "zwischen den Auftraegen darf nichts geschlossen werden");
  assert.equal(zwei.sitzung.laeufe, 1, "Laufzaehler nach dem ersten abgeschlossenen Lauf");

  // openBrowser des zweiten Auftrags meldet die Wiederverwendung ehrlich.
  const openEintrag = zwei.actionLog.find((e) => e.action === "openBrowser");
  assert.equal(openEintrag.result.wiederverwendet, true);

  await registry.closeAll();
  assert.equal(protokoll.geschlossen, 1);
});

test("Non-Regression: OHNE sessionId schliesst der Browser wie bisher", async () => {
  const protokoll = neuesProtokoll();
  const ergebnis = await executeRun(AUFTRAG_EINS, {
    browserFactory: mockFabrik(protokoll),
    skipUpload: true,
    retryDelayFn: async () => {}
  });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.sitzungOffen, false);
  assert.equal(protokoll.geschlossen, 1, "ohne Sitzung bleibt exit-after-run-Verhalten unveraendert");
});

test("Non-Regression: zweites openBrowser OHNE Sitzung bleibt ein Fehler", async () => {
  const protokoll = neuesProtokoll();
  const doppelt = plan("doppelt", [
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "openBrowser" }
  ]);
  const ergebnis = await executeRun(doppelt, {
    browserFactory: mockFabrik(protokoll),
    skipUpload: true,
    retryDelayFn: async () => {}
  });
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.abortReason, /browser_bereits_offen/);
});

test("Budget gilt je Auftrag, nicht je Sitzung", async () => {
  const protokoll = neuesProtokoll();
  const registry = registryMitMock(protokoll);
  const knapp = plan("knapp", [
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "navigate", url: "https://example.com/a" },
    { id: "s3", action: "screenshot", name: "s" }
  ]);
  knapp.policy.budget.maxActions = 3;
  const gemeinsam = { registry, skipUpload: true, retryDelayFn: async () => {} };
  const eins = await executeRunInSession(knapp, { sessionId: "maus-sitzung-b1", ...gemeinsam });
  assert.equal(eins.ok, true);
  const zwei = await executeRunInSession(knapp, { sessionId: "maus-sitzung-b1", ...gemeinsam });
  assert.equal(zwei.ok, true, "der zweite Auftrag darf nicht am Budget des ersten scheitern");
  await registry.closeAll();
});

test("Leerlauf-TTL baut die Sitzung ab — nichts laeuft ewig", async () => {
  const protokoll = neuesProtokoll();
  let jetzt = 1_000_000;
  const registry = registryMitMock(protokoll, {
    clock: { now: () => jetzt },
    idleTtlMs: 60_000
  });
  const eins = await executeRunInSession(AUFTRAG_EINS, {
    sessionId: "maus-sitzung-c1", registry, skipUpload: true, retryDelayFn: async () => {}
  });
  assert.equal(eins.ok, true);
  assert.equal(registry.count(), 1);
  jetzt += 60_001;
  const abgebaut = await registry.aufraeumen();
  assert.deepEqual(abgebaut, [{ sessionId: "maus-sitzung-c1", grund: "leerlauf" }]);
  assert.equal(registry.count(), 0);
  assert.equal(protokoll.geschlossen, 1, "der Browser wird beim Ablauf wirklich geschlossen");
});

test("Hartlimit greift auch bei staendiger Nutzung", async () => {
  const protokoll = neuesProtokoll();
  let jetzt = 1_000_000;
  const registry = registryMitMock(protokoll, {
    clock: { now: () => jetzt },
    idleTtlMs: 600_000,
    hardLimitMs: 100_000
  });
  await executeRunInSession(AUFTRAG_EINS, {
    sessionId: "maus-sitzung-d1", registry, skipUpload: true, retryDelayFn: async () => {}
  });
  jetzt += 100_001;
  const abgebaut = await registry.aufraeumen();
  assert.equal(abgebaut[0].grund, "hartlimit");
  assert.equal(registry.count(), 0);
});

test("fail-closed: fremd gehaltene Sitzung wird abgelehnt, kein zweiter Browser", async () => {
  const protokoll = neuesProtokoll();
  const objekte = new Map();
  const geteilt = {
    getObject: async (key) => {
      if (!objekte.has(key)) throw new Error("404");
      return objekte.get(key);
    },
    putObject: async (key, body) => { objekte.set(key, body); }
  };
  // Instanz A haelt die Sitzung.
  const a = createSessionRegistry({
    browserFactory: mockFabrik(protokoll),
    leaseStore: createLeaseStore(geteilt),
    holder: "instanz-a"
  });
  await executeRunInSession(AUFTRAG_EINS, { sessionId: "maus-sitzung-e1", registry: a, skipUpload: true, retryDelayFn: async () => {} });

  // Instanz B versucht dieselbe sessionId.
  const protokollB = neuesProtokoll();
  const b = createSessionRegistry({
    browserFactory: mockFabrik(protokollB),
    leaseStore: createLeaseStore(geteilt),
    holder: "instanz-b"
  });
  const abgewiesen = await executeRunInSession(AUFTRAG_ZWEI, { sessionId: "maus-sitzung-e1", registry: b, skipUpload: true });
  assert.equal(abgewiesen.ok, false);
  assert.equal(abgewiesen.status, 409);
  assert.match(abgewiesen.errors[0], /sitzung_fremd_belegt: fremd_aktiv/);
  assert.equal(protokollB.starts, 0, "es darf KEIN zweiter Browser fuer dieselbe Sitzung starten");
  await a.closeAll();
});

test("ungueltige sessionId wird abgelehnt, nicht zurechtgebogen", async () => {
  const protokoll = neuesProtokoll();
  const registry = registryMitMock(protokoll);
  const ergebnis = await executeRunInSession(AUFTRAG_EINS, { sessionId: "../fremd", registry, skipUpload: true });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.status, 400);
  assert.equal(protokoll.starts, 0);
});

test("Obergrenze gleichzeitiger Sitzungen greift", async () => {
  const protokoll = neuesProtokoll();
  const registry = registryMitMock(protokoll, { maxSessions: 1 });
  const gemeinsam = { registry, skipUpload: true, retryDelayFn: async () => {} };
  await executeRunInSession(AUFTRAG_EINS, { sessionId: "maus-sitzung-f1", ...gemeinsam });
  const zweite = await executeRunInSession(AUFTRAG_EINS, { sessionId: "maus-sitzung-f2", ...gemeinsam });
  assert.equal(zweite.ok, false);
  assert.equal(zweite.status, 429);
  await registry.closeAll();
});

// --- Teil 4: angemeldet bleiben ---------------------------------------------

test("Cookie-Krug: wird beim Sitzungsende gesichert und beim Start eingesetzt", async () => {
  const protokoll = neuesProtokoll();
  const abgelegt = new Map();
  const storageStore = {
    async save(name, state) { abgelegt.set(name, state); },
    async load(name) { return abgelegt.get(name) ?? null; }
  };
  const gesehen = [];
  const fabrik = mockFabrik(protokoll);
  const registry = createSessionRegistry({
    browserFactory: async (optionen) => { gesehen.push(optionen?.storageState ?? null); return fabrik(optionen); },
    leaseStore: createLeaseStore({}),
    storageStore,
    holder: "instanz-test"
  });

  await executeRunInSession(AUFTRAG_EINS, {
    sessionId: "maus-sitzung-h1", registry, skipUpload: true, retryDelayFn: async () => {}
  });
  assert.equal(gesehen[0], null, "erste Sitzung startet ohne Krug");

  await registry.close("maus-sitzung-h1");
  assert.ok(abgelegt.has("maus-sitzung-h1"), "beim Schliessen muss der Krug gesichert werden");
  assert.equal(abgelegt.get("maus-sitzung-h1").cookies[0].name, "sid");

  // Neue Sitzung unter derselben Kennung: der Krug muss zurueckkommen.
  await executeRunInSession(AUFTRAG_EINS, {
    sessionId: "maus-sitzung-h1", registry, skipUpload: true, retryDelayFn: async () => {}
  });
  assert.equal(gesehen[1]?.cookies?.[0]?.name, "sid", "die Anmeldung muss das Sitzungsende ueberleben");
  await registry.closeAll();
});

test("ohne Cookie-Krug-Store bleibt alles wie zuvor", async () => {
  const protokoll = neuesProtokoll();
  const gesehen = [];
  const fabrik = mockFabrik(protokoll);
  const registry = createSessionRegistry({
    browserFactory: async (optionen) => { gesehen.push(optionen); return fabrik(optionen); },
    leaseStore: createLeaseStore({}),
    holder: "instanz-test"
  });
  await executeRunInSession(AUFTRAG_EINS, {
    sessionId: "maus-sitzung-i1", registry, skipUpload: true, retryDelayFn: async () => {}
  });
  assert.equal(gesehen[0]?.storageState, undefined);
  await registry.closeAll();
});

test("close beendet die Sitzung und schliesst den Browser", async () => {
  const protokoll = neuesProtokoll();
  const registry = registryMitMock(protokoll);
  await executeRunInSession(AUFTRAG_EINS, { sessionId: "maus-sitzung-g1", registry, skipUpload: true, retryDelayFn: async () => {} });
  assert.equal(registry.hasLiveSessions(), true);
  const ergebnis = await registry.close("maus-sitzung-g1");
  assert.deepEqual(ergebnis, { ok: true, geschlossen: true });
  assert.equal(registry.hasLiveSessions(), false);
  assert.equal(protokoll.geschlossen, 1);
  assert.equal(registry.status("maus-sitzung-g1"), null);
});
