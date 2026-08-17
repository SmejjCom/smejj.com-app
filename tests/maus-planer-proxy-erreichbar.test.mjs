// smejj.com — der Planer-Proxy der Maus muss von aussen ERREICHBAR sein.
//
// DER BEFUND (2026-08-17): Der freie Modus (mode:"interaktiv") war vollstaendig
// gebaut, mit Unit-Tests abgedeckt und ausgerollt — und trotzdem nie benutzbar.
// Die Engine fragt pro Schritt den Planer-Proxy des Control Servers und weist
// sich mit ihrem Engine-Token aus. `/api/maus/run` steht aber in
// USER_PROTECTED_EXACT_PATHS, also wies der globale Torwaechter in
// src/server.js sie mit 401 ab, lange bevor die Route lief.
//
// WARUM KEIN TEST DAS FAND: die bestehenden Tests rufen `handleMausRun` direkt
// auf und ueberspringen den Waechter damit vollstaendig. Sie beweisen, dass die
// ROUTE stimmt — nicht, dass sie erreichbar ist. Live sah es aus wie ein
// Token-Problem ("loop_planner_http_401"), obwohl beide Token nachweislich
// denselben Fingerabdruck trugen.
//
// Dieser Test prueft deshalb die Kombination aus Waechter UND Token, so wie
// eine echte Anfrage sie durchlaeuft.
import test from "node:test";
import assert from "node:assert/strict";
import { requiresAuthenticatedControlAccess } from "../src/shared/controlAccessPolicy.js";
import { istMausEngineToken } from "../control-server/src/routes/mausEngineRoutes.js";
import { ROUTES } from "../src/shared/platform.js";

const TOKEN = "t".repeat(64);
const ENV = {
  SMEJJ_MAUS_ENGINE_ENABLED: "YES",
  SMEJJ_MAUS_ENGINE_WORKER_URL: "https://engine.example",
  SMEJJ_MAUS_ENGINE_TOKEN: TOKEN
};

const url = { pathname: ROUTES.api.mausRun };
const anfrage = (authorization) => ({ method: "POST", headers: authorization ? { authorization } : {} });

// Das ist die Bedingung aus src/server.js, hier nachgebildet: der Waechter wird
// NUR uebersprungen, wenn Pfad, Methode UND Token stimmen.
function darfOhneSitzungDurch(req, env) {
  const ausnahme = req.method === "POST" && url.pathname === ROUTES.api.mausRun && istMausEngineToken(req, env);
  return ausnahme || !requiresAuthenticatedControlAccess(req, url);
}

test("die Route ist und bleibt grundsaetzlich geschuetzt", () => {
  assert.equal(requiresAuthenticatedControlAccess(anfrage(), url), true);
});

test("mit dem Engine-Token kommt die Maus durch den Waechter", () => {
  assert.equal(darfOhneSitzungDurch(anfrage(`Bearer ${TOKEN}`), ENV), true);
});

test("ohne Token bleibt es bei der Sitzungspflicht", () => {
  assert.equal(darfOhneSitzungDurch(anfrage(), ENV), false);
});

test("ein falsches Token oeffnet nichts", () => {
  assert.equal(darfOhneSitzungDurch(anfrage(`Bearer ${"x".repeat(64)}`), ENV), false);
  // Auch ein Praefix des echten Tokens nicht — die Laenge wird zuerst geprueft.
  assert.equal(darfOhneSitzungDurch(anfrage(`Bearer ${TOKEN.slice(0, 32)}`), ENV), false);
});

test("ohne konfiguriertes Token gibt es die Ausnahme gar nicht", () => {
  // Sonst waere ein Server ohne Maus-Konfiguration offen fuer jeden, der einen
  // leeren Bearer schickt.
  assert.equal(darfOhneSitzungDurch(anfrage("Bearer "), { ...ENV, SMEJJ_MAUS_ENGINE_TOKEN: "" }), false);
  assert.equal(darfOhneSitzungDurch(anfrage(`Bearer ${TOKEN}`), { ...ENV, SMEJJ_MAUS_ENGINE_TOKEN: "" }), false);
});

test("die Ausnahme gilt nur fuer POST auf genau diesen Pfad", () => {
  // GET ist der Status-Abruf und bleibt sitzungspflichtig.
  const get = { method: "GET", headers: { authorization: `Bearer ${TOKEN}` } };
  const ausnahme = get.method === "POST" && istMausEngineToken(get, ENV);
  assert.equal(ausnahme, false);
  assert.equal(requiresAuthenticatedControlAccess(get, url), true);

  // Und kein anderer geschuetzter Pfad wird durch das Token geoeffnet.
  for (const fremd of [ROUTES.api.storagePresign, ROUTES.api.fileWrite, ROUTES.api.jobs]) {
    assert.equal(
      requiresAuthenticatedControlAccess(anfrage(`Bearer ${TOKEN}`), { pathname: fremd }),
      true,
      `${fremd} muss geschuetzt bleiben`
    );
  }
});
