// smejj.com Maus-Engine — Interpreter-Tests mit Mock-Browser (ohne
// Playwright, ohne Netz). Beweist deterministisches Verhalten, Allowlist-
// Abbruch, Secret-Maskierung, onFailure-Semantik und Modellunabhaengigkeit.
import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createInterpreter } from "../workers/maus-engine/interpreter.mjs";
import { uploadRunArtifacts } from "../workers/maus-engine/artifact-uploader.mjs";
import { executeRun } from "../workers/maus-engine/worker.mjs";

function makeLocator(page, description) {
  const locator = {
    description,
    async click() { page.log.push(`click:${description}`); if (page.failSelectors.has(description)) throw new Error(`element_nicht_gefunden: ${description}`); },
    async fill(value) { page.log.push(`fill:${description}`); page.filled[description] = value; },
    async type(value) { page.log.push(`type:${description}`); page.filled[description] = value; },
    async press(key) { page.log.push(`press:${description}:${key}`); },
    async hover() { page.log.push(`hover:${description}`); },
    async check() { page.log.push(`check:${description}`); },
    async uncheck() { page.log.push(`uncheck:${description}`); },
    async selectOption(value) { page.log.push(`select:${description}:${value}`); },
    async dragTo(target) { page.log.push(`drag:${description}->${target.description}`); },
    async scrollIntoViewIfNeeded() { page.log.push(`scroll:${description}`); },
    async waitFor() { page.log.push(`waitFor:${description}`); },
    async isVisible() { return false; },
    async count() { return page.failSelectors.has(description) ? 0 : 1; },
    async textContent() { return page.texts[description] ?? "Hallo Welt"; },
    async allTextContents() { return ["a", "b"]; },
    async getAttribute(name) { return `attr:${name}`; },
    async evaluate() { return [["Kopf"], ["Zelle"]]; },
    async evaluateAll() { return ["x"]; },
    async setInputFiles(path) { page.log.push(`upload:${description}:${path}`); },
    first() { return locator; },
    nth() { return locator; }
  };
  return locator;
}

function makePage(state) {
  const page = {
    log: state.log,
    filled: {},
    texts: state.texts || {},
    failSelectors: state.failSelectors || new Set(),
    currentUrl: "about:blank",
    url() { return page.currentUrl; },
    async goto(url) { page.currentUrl = url; page.log.push(`goto:${url}`); return { status: () => 200 }; },
    async title() { return "Testseite smejj.com"; },
    async screenshot() { return Buffer.from("PNGDATEN"); },
    async pdf() { return Buffer.from("PDFDATEN"); },
    async evaluate() { return null; },
    async close() { page.log.push("close:page"); },
    async bringToFront() {},
    async waitForURL() {},
    async waitForLoadState() {},
    async waitForEvent() { return { suggestedFilename: () => "datei.bin", path: async () => "/tmp/mock" }; },
    keyboard: { async press(keys) { page.log.push(`hotkey:${keys}`); } },
    mouse: {
      async click(x, y) { page.log.push(`mouseclick:${x},${y}`); },
      async move() {},
      async wheel(dx, dy) { page.log.push(`wheel:${dx},${dy}`); }
    },
    locator(sel) { return makeLocator(page, `css:${sel}`); },
    getByRole(role, opts) { return makeLocator(page, `role:${role}:${opts?.name ?? ""}`); },
    getByTestId(id) { return makeLocator(page, `testId:${id}`); },
    getByLabel(label) { return makeLocator(page, `label:${label}`); },
    getByText(text) { return makeLocator(page, `text:${text}`); },
    frameLocator() { return page; }
  };
  return page;
}

function makeBrowserFactory(state) {
  return async () => {
    const context = {
      async newPage() { return makePage(state); },
      on() {},
      async cookies() { return []; },
      async addCookies(cookies) { state.log.push(`addCookies:${cookies.length}`); },
      async clearCookies() { state.log.push("clearCookies"); },
      async storageState() { return { cookies: [{ name: "sid", value: "x", domain: "example.com", path: "/" }] }; },
      async waitForEvent() { return makePage(state); }
    };
    return { browser: { async close() { state.log.push("close:browser"); } }, context };
  };
}

function browserPlan(steps, policyOverrides = {}) {
  return {
    schemaVersion: 1,
    planId: "interp-1",
    createdAt: "2026-07-14T00:00:00Z",
    capsuleRef: "maus-engine-test-2026-07-14",
    planner: { modelId: "glm-5-2", promptTemplateVersion: "v1" },
    policy: {
      domainAllowlist: ["example.com"],
      budget: {
        maxActions: 30, maxLocalRetries: 1, maxPlannerRoundtrips: 1,
        maxDurationMs: 60000, defaultActionTimeoutMs: 1000
      },
      ...policyOverrides
    },
    steps
  };
}

const happySteps = [
  { id: "s1", action: "openBrowser" },
  { id: "s2", action: "navigate", url: "https://example.com/login" },
  { id: "s3", action: "type", target: { strategy: "css", value: "#passwort" }, secretRef: "login" },
  { id: "s4", action: "click", target: { selector: { strategy: "role", value: "button", name: "Senden" } } },
  { id: "s5", action: "extract", name: "ueberschrift", target: { strategy: "css", value: "h1" } },
  { id: "s6", action: "extractTable", name: "tabelle", target: { strategy: "css", value: "table" } },
  { id: "s7", action: "screenshot", name: "beweis" },
  { id: "s8", action: "assert", condition: "titleContains", text: "smejj.com" },
  { id: "s9", action: "closeBrowser" }
];

function runOptions(state) {
  return {
    browserFactory: makeBrowserFactory(state),
    vaultOptions: { values: { login: "geheim123" } },
    retryDelayFn: async () => {}
  };
}

test("Happy Path: Formular, Extraktion, Screenshot, Assert — deterministisch", async () => {
  const state = { log: [] };
  const result = await createInterpreter(browserPlan(happySteps), runOptions(state)).run();
  assert.equal(result.ok, true, JSON.stringify(result.actionLog));
  assert.equal(result.actionLog.length, 9);
  assert.equal(result.actionLog.every((entry) => entry.ok), true);
  assert.equal(result.extracted.ueberschrift, "Hallo Welt");
  assert.deepEqual(result.extracted.tabelle, [["Kopf"], ["Zelle"]]);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].name, "screenshots/beweis.png");
  assert.ok(state.log.includes("goto:https://example.com/login"));
});

test("Secret-Maskierung: aufgeloester Wert erscheint nie im Protokoll", async () => {
  const state = { log: [] };
  const result = await createInterpreter(browserPlan(happySteps), runOptions(state)).run();
  const protokoll = JSON.stringify(result.actionLog) + JSON.stringify(result.extracted);
  assert.equal(protokoll.includes("geheim123"), false);
  assert.equal(JSON.stringify(result.actionLog).includes("secretRef"), true);
});

test("Allowlist-Abbruch: Navigation ausserhalb -> sofortiger Abbruch", async () => {
  const steps = [
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "navigate", url: "https://example.com/ok" },
    { id: "s3", action: "screenshot", name: "nie" }
  ];
  const plan = browserPlan(steps);
  const state = { log: [] };
  const interpreter = createInterpreter(plan, runOptions(state));
  // Statisch gueltig validiert, danach zur Laufzeit manipuliert
  // (simuliert einen Redirect auf eine fremde Domain):
  plan.steps[1].url = "https://example.com@boese.tld/";
  const result = await interpreter.run();
  assert.equal(result.ok, false);
  assert.equal(result.aborted, true);
  assert.match(String(result.abortReason), /Allowlist|Blockierter/);
  assert.equal(result.actionLog.some((entry) => entry.id === "s3" && entry.ok), false);
  assert.ok(state.log.includes("close:browser"));
});

test("onFailure=continue: Lauf geht weiter, Ergebnis bleibt fail-closed", async () => {
  const steps = [
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "navigate", url: "https://example.com/x" },
    { id: "s3", action: "click", target: { selector: { strategy: "css", value: "#kaputt" } }, onFailure: "continue", retries: 1 },
    { id: "s4", action: "screenshot", name: "trotzdem" }
  ];
  const state = { log: [], failSelectors: new Set(["css:#kaputt"]) };
  const result = await createInterpreter(browserPlan(steps), runOptions(state)).run();
  assert.equal(result.ok, false);
  assert.equal(result.aborted, false);
  assert.equal(result.failedStep, "s3");
  const s3 = result.actionLog.find((entry) => entry.id === "s3");
  assert.equal(s3.attempts, 2);
  assert.equal(result.actionLog.find((entry) => entry.id === "s4").ok, true);
});

test("runMacro ohne konfigurierten Makro-Store bleibt fail-closed", async () => {
  const steps = [
    { id: "s1", action: "runMacro", macroRef: "makros/login.json" }
  ];
  const state = { log: [] };
  const result = await createInterpreter(browserPlan(steps), runOptions(state)).run();
  assert.equal(result.ok, false);
  assert.match(String(result.abortReason), /macro_store_nicht_konfiguriert/);
});

test("Modellunabhaengigkeit: gleicher Plan, anderes planner-Feld -> identisches Verhalten", async () => {
  const strip = (log) => log.map(({ durationMs, ...rest }) => rest);
  const planA = browserPlan(happySteps);
  const planB = JSON.parse(JSON.stringify(planA));
  planB.planner = { modelId: "kimi-k2-7", promptTemplateVersion: "v1" };

  const stateA = { log: [] };
  const stateB = { log: [] };
  const resultA = await createInterpreter(planA, runOptions(stateA)).run();
  const resultB = await createInterpreter(planB, runOptions(stateB)).run();

  assert.deepEqual(strip(resultA.actionLog), strip(resultB.actionLog));
  assert.deepEqual(resultA.extracted, resultB.extracted);
  assert.deepEqual(stateA.log, stateB.log);
});

test("Artefakt-Uploader: gzip + Manifest mit SHA-256 je Objekt", async () => {
  const state = { log: [] };
  const runResult = await createInterpreter(browserPlan(happySteps), runOptions(state)).run();
  const uploaded = new Map();
  const manifest = await uploadRunArtifacts(runResult, {
    config: { idrive: { endpoint: "https://e2.invalid", bucket: "b", region: "r", accessKey: "a", secretKey: "s" } },
    putObject: async (key, body) => { uploaded.set(key, body); }
  });
  assert.equal(manifest.objects.length, 2);
  const logKey = manifest.objects.find((o) => o.key.endsWith("aktionsprotokoll.json.gz"));
  assert.ok(logKey);
  const entschluesselt = gunzipSync(uploaded.get(logKey.key)).toString("utf8");
  assert.match(entschluesselt, /"planId": "interp-1"/);
  assert.equal(entschluesselt.includes("geheim123"), false);
  assert.ok(uploaded.has(`capsules/maus-engine/maus-engine-test-2026-07-14/result/interp-1/manifest.json`));
});

test("executeRun: ungueltiger Plan wird abgewiesen (422-Pfad)", async () => {
  const result = await executeRun({ schemaVersion: 1 }, { skipUpload: true });
  assert.equal(result.ok, false);
  assert.equal(result.rejected, true);
  assert.ok(result.errors.length > 0);
});

test("executeRun: Stufe-1-Plan laeuft ohne Browser", async () => {
  const plan = browserPlan([
    { id: "h1", action: "httpRequest", method: "GET", url: "https://example.com/api", expectStatus: 200 }
  ]);
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } });
  const result = await executeRun(plan, { fetchImpl, skipUpload: true });
  assert.equal(result.ok, true);
  assert.equal(result.stage, 1);
  assert.equal(result.uploaded, false);
});

// --- Stufe B (2026-07-15, freigegeben): Live-Beobachter onStep ---------------
// Kernregel: Die Anzeige ist Beiwerk. Der Lauf bleibt die Wahrheit.

test("onStep wird pro Schritt aufgerufen und sieht Index, Gesamtzahl und Eintrag", async () => {
  const state = { log: [] };
  const seen = [];
  const result = await createInterpreter(browserPlan(happySteps), {
    ...runOptions(state),
    onStep: ({ entry, index, total, artifacts }) => {
      seen.push({ index, total, action: entry.action, ok: entry.ok, hasArtifacts: Array.isArray(artifacts) });
    }
  }).run();
  assert.equal(result.ok, true);
  assert.equal(seen.length, 9);
  assert.deepEqual(seen.map((s) => s.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(seen.every((s) => s.total === 9), true);
  assert.equal(seen.every((s) => s.hasArtifacts), true);
  assert.equal(seen[0].action, "openBrowser");
  assert.equal(seen.at(-1).action, "closeBrowser");
});

test("onStep sieht maskierte Parameter — Secrets gelangen nie in die Live-Anzeige", async () => {
  const state = { log: [] };
  const seen = [];
  await createInterpreter(browserPlan(happySteps), {
    ...runOptions(state),
    onStep: ({ entry }) => { seen.push(JSON.stringify(entry)); }
  }).run();
  assert.doesNotMatch(seen.join("|"), /geheim123/, "Secret darf nicht im Live-Eintrag stehen");
});

test("FAIL-SAFE: ein werfender onStep darf den Lauf NICHT abbrechen", async () => {
  const state = { log: [] };
  let calls = 0;
  const result = await createInterpreter(browserPlan(happySteps), {
    ...runOptions(state),
    onStep: () => { calls += 1; throw new Error("e2_weg"); }
  }).run();
  assert.equal(result.ok, true, "Lauf muss trotz kaputter Anzeige gruen bleiben");
  assert.equal(result.actionLog.length, 9);
  assert.equal(calls, 9);
});

test("FAIL-SAFE: ein abgelehntes Promise aus onStep stoert den Lauf nicht", async () => {
  const state = { log: [] };
  const result = await createInterpreter(browserPlan(happySteps), {
    ...runOptions(state),
    onStep: async () => { throw new Error("timeout"); }
  }).run();
  assert.equal(result.ok, true);
  assert.equal(result.actionLog.every((entry) => entry.ok), true);
});

test("ohne onStep verhaelt sich der Interpreter unveraendert (Non-Regression)", async () => {
  const stateA = { log: [] };
  const stateB = { log: [] };
  const withoutHook = await createInterpreter(browserPlan(happySteps), runOptions(stateA)).run();
  const withHook = await createInterpreter(browserPlan(happySteps), { ...runOptions(stateB), onStep: () => {} }).run();
  assert.equal(withoutHook.ok, withHook.ok);
  assert.deepEqual(
    withoutHook.actionLog.map((e) => [e.index, e.action, e.ok]),
    withHook.actionLog.map((e) => [e.index, e.action, e.ok])
  );
  assert.deepEqual(stateA.log, stateB.log, "identische Browser-Aktionen");
});
