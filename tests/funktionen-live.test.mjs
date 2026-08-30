// Waechter-TUEV fuer den Funktions-Waechter: kranke UND gesunde Proben.
//
// Der Anlass (2026-08-17): die Medien-Ablage war wochenlang abgeschaltet und
// antwortete 503 "chat_sync_deaktiviert" — niemand merkte es, weil die
// Oberflaeche den Fehler still schluckte. Dieser Waechter soll genau das
// kuenftig melden. Ein Waechter, der nur gesunde Proben sieht, taugt nichts:
// darum steht hier beides.
import test from "node:test";
import assert from "node:assert/strict";
import { bewerte } from "../scripts/diagnose/funktionen-live.mjs";

test("KRANK: der Fall, der die Bilder gekostet hat", () => {
  assert.equal(bewerte(503, { ok: false, error: "chat_sync_deaktiviert" }), "aus");
});

test("KRANK: die anderen Abschalt-Gruende des Servers", () => {
  for (const grund of [
    "billing_portal_not_configured",
    "maus_engine_nicht_konfiguriert",
    "provider_credential_encryption_not_configured",
    "autonomous_loop_disabled",
    "worker_dispatch_not_configured"
  ]) {
    assert.equal(bewerte(503, { error: grund }), "aus", grund);
  }
});

test("GESUND: 401 heisst 'lebt, verlangt nur Anmeldung'", () => {
  // Das ist die haeufigste Antwort und darf NIE als Ausfall zaehlen —
  // sonst schlaegt der Waechter dauernd falsch an und wird ignoriert.
  assert.equal(bewerte(401, { error: "authentication_required" }), "an");
});

test("GESUND: 200 und ein fachliches 404 zaehlen als an", () => {
  assert.equal(bewerte(200, {}), "an");
  // So antwortet die reparierte Medien-Ablage auf eine erfundene Kennung.
  assert.equal(bewerte(404, { error: "kennung_ungueltig" }), "an");
});

test("UNKLAR bleibt unklar — kein blindes Gruen", () => {
  // Ein 404 ohne Grund kann ein falscher Pfad sein: nicht als 'an' verkaufen.
  assert.equal(bewerte(404, {}), "unklar");
  assert.equal(bewerte(0, {}), "unklar");
  assert.equal(bewerte(500, {}), "unklar");
});
