// smejj.com — Tests fuer den Maus-Selbsttest-Plan (Capsule job_maus_selbsttest_20260726).
// Sichert: der Plan ist schema-valide (fail-closed), deckt die wichtigen
// oeffentlichen Seiten ab, jeder Seitenblock hat einen Screenshot-Beleg, und
// Pruef-Schritte brechen den Lauf nicht ab (onFailure continue) — der Bericht
// soll ALLE Befunde enthalten, nicht nur den ersten.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validatePlan } from "../workers/maus-engine/plan-validator.mjs";

const PLAN_PATH = new URL("../workers/maus-engine/plaene/selbsttest-smejj-com-v1.json", import.meta.url);
// Zweiter Selbsttest (2026-07-26): Betreiber-Website iMild.com. Gleiche Engine,
// gleicher Vertrag — nur ein weiterer Plan, null Engine-Aenderung.
const IMILD_PLAN_PATH = new URL("../workers/maus-engine/plaene/selbsttest-imild-com-v1.json", import.meta.url);

async function loadPlan() {
  return JSON.parse(await readFile(PLAN_PATH, "utf8"));
}

async function loadImildPlan() {
  return JSON.parse(await readFile(IMILD_PLAN_PATH, "utf8"));
}

test("Selbsttest-Plan ist schema-valide (fail-closed)", async () => {
  const plan = await loadPlan();
  const result = validatePlan(plan);
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("Selbsttest-Plan deckt die wichtigen Seiten ab", async () => {
  const plan = await loadPlan();
  const urls = plan.steps.filter((s) => s.action === "navigate").map((s) => s.url);
  for (const pflicht of [
    "https://smejj.com/",
    "https://smejj.com/auth/register/",
    "https://smejj.com/impressum.html",
    "https://smejj.com/datenschutz.html",
    "https://smejj.com/maus-replay.html"
  ]) {
    assert.ok(urls.includes(pflicht), `navigate fehlt: ${pflicht}`);
  }
  const httpUrls = plan.steps.filter((s) => s.action === "httpRequest").map((s) => s.url);
  assert.ok(httpUrls.includes("https://smejj.com/manifest.webmanifest"), "Manifest-Check fehlt");
  assert.ok(httpUrls.includes("https://smejj.com/assets/config.js"), "config.js-Check fehlt");
});

test("Auth-Gate-Redirect wird geprueft und jede Seite hat einen Screenshot", async () => {
  const plan = await loadPlan();
  const gate = plan.steps.find((s) => s.action === "assert" && s.condition === "urlMatches");
  assert.ok(gate, "Auth-Gate-Assert (urlMatches /auth/login) fehlt");
  assert.match(gate.urlPattern, /auth\/login/);
  const navigations = plan.steps.filter((s) => s.action === "navigate").length;
  const screenshots = plan.steps.filter((s) => s.action === "screenshot").length;
  assert.ok(screenshots >= navigations, "jede besuchte Seite braucht einen Screenshot-Beleg");
});

test("Pruef-Schritte brechen den Lauf nicht ab (onFailure continue)", async () => {
  const plan = await loadPlan();
  const pruefer = plan.steps.filter((s) => ["assert", "waitFor", "httpRequest"].includes(s.action));
  assert.ok(pruefer.length >= 10, "zu wenige Pruef-Schritte");
  for (const step of pruefer) {
    assert.equal(step.onFailure, "continue", `Schritt ${step.id} muss onFailure continue haben`);
  }
});

test("iMild-Plan ist schema-valide und deckt Startseite, Login und Backend ab", async () => {
  const plan = await loadImildPlan();
  assert.deepEqual(validatePlan(plan), { ok: true, errors: [] });
  const urls = plan.steps.filter((s) => s.action === "navigate").map((s) => s.url);
  for (const pflicht of ["https://imild.com/", "https://imild.com/login.html", "https://imild.com/legal.html"]) {
    assert.ok(urls.includes(pflicht), `navigate fehlt: ${pflicht}`);
  }
  const api = plan.steps.find((s) => s.action === "httpRequest" && s.url.startsWith("https://api.imild.com"));
  assert.ok(api, "Backend-Check api.imild.com fehlt");
  assert.equal(api.expectStatus, 401, "Backend muss ohne Sitzung fail-closed 401 liefern");
});

test("iMild-Plan: sprachneutrale Pruefungen, continue-Politik, enge Allowlist", async () => {
  const plan = await loadImildPlan();
  assert.deepEqual(plan.policy.domainAllowlist, ["imild.com", "www.imild.com", "api.imild.com"]);
  assert.notEqual(plan.policy.visionAllowed, true);
  assert.equal(plan.policy.budget.maxPlannerRoundtrips, 0);
  const pruefer = plan.steps.filter((s) => ["assert", "waitFor", "httpRequest"].includes(s.action));
  for (const step of pruefer) {
    assert.equal(step.onFailure, "continue", `Schritt ${step.id} muss onFailure continue haben`);
  }
  // Seiten sind mehrsprachig (data-i18n): kein Assert auf uebersetzbaren Fliesstext.
  const textAsserts = plan.steps.filter((s) => s.action === "assert" && s.condition === "selectorTextContains");
  assert.equal(textAsserts.length, 0, "keine Text-Asserts — i18n wuerde sie sprachabhaengig machen");
  const screenshots = plan.steps.filter((s) => s.action === "screenshot").length;
  const navigations = plan.steps.filter((s) => s.action === "navigate").length;
  assert.ok(screenshots >= navigations, "jede besuchte Seite braucht einen Screenshot-Beleg");
});

test("Sicherheits-Policy: nur smejj.com, kein Vision, kein Planer-Roundtrip, keine Secrets", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.policy.domainAllowlist, ["smejj.com", "www.smejj.com"]);
  assert.notEqual(plan.policy.visionAllowed, true);
  assert.equal(plan.policy.budget.maxPlannerRoundtrips, 0);
  const raw = JSON.stringify(plan);
  assert.ok(!raw.includes("secretRef"), "Selbsttest braucht keine Secrets");
  assert.ok(!/(password|passwort)"?\s*:/i.test(raw), "keine Klartext-Credentials im Plan");
});
