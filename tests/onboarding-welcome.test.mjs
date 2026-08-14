// smejj.com — Willkommens-Onboarding (job_konto_glas_20260726, Schritt 5).
// Erscheint genau einmal nach frischem Login, fail-safe, Start-Lock unberuehrt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};

const { shouldShowOnboarding, markOnboardingDone } = await import("../public/onboarding-welcome.js");

test("zeigt nur nach frischem Login (Login-Marker in der Adresse)", () => {
  store.clear();
  assert.equal(shouldShowOnboarding({ search: "?login=ok", storage: globalThis.localStorage }), true);
  assert.equal(shouldShowOnboarding({ search: "?session-handoff-complete=1", storage: globalThis.localStorage }), true);
  assert.equal(shouldShowOnboarding({ search: "", storage: globalThis.localStorage }), false);
});

test("nach 'Los geht's' nie wieder", () => {
  store.clear();
  markOnboardingDone(globalThis.localStorage);
  assert.equal(shouldShowOnboarding({ search: "?login=ok", storage: globalThis.localStorage }), false);
});

test("fail-safe: kaputter Speicher blockiert nichts", () => {
  const kaputt = { getItem() { throw new Error("gesperrt"); }, setItem() { throw new Error("gesperrt"); } };
  assert.equal(shouldShowOnboarding({ search: "?login=ok", storage: kaputt }), false);
  markOnboardingDone(kaputt); // darf nicht werfen
});

test("verdrahtet ueber account-privacy.js VOR der Marker-Bereinigung, Start-Lock unberuehrt", () => {
  const konto = fs.readFileSync("public/account-privacy.js", "utf8");
  const initPos = konto.indexOf("initOnboardingWelcome(STRIPE_PLAN_LINKS");
  const cleanPos = konto.indexOf("cleanLoginMarkers();");
  assert.ok(initPos > -1 && cleanPos > -1 && initPos < cleanPos, "Onboarding muss vor der Marker-Bereinigung starten");
  // Eingefrorene Startseiten-Dateien bleiben ohne Onboarding-Bezug.
  assert.doesNotMatch(fs.readFileSync("public/app.js", "utf8"), /onboarding/i);
});
