// Unbegrenzte Konten in der oeffentlichen API.
//
// Der Betreiber betreibt die API selbst und lief am 02.09.2026 gegen sein
// eigenes Prepaid-Guthaben: bei 0,00 USD antwortete smejj-1.0 nicht mehr.
// Freigabe Wof Kadavanich 2026-09-02: "Kannst Du unbegrenzt erstellen".
//
// Festgehalten wird hier, was schiefgehen koennte:
//   1. Ohne Umgebungsvariable zahlt weiterhin JEDER (kein stiller Freifahrtschein).
//   2. Ein fremdes Konto bleibt gesperrt, auch wenn ein anderes befreit ist.
//   3. E-Mail-Eintraege werden zur selben Konto-Kennung gerechnet wie beim Anmelden.
//   4. Eine ungueltige Kennung befreit nicht (kein Durchrutschen ueber Tippfehler).

import assert from "node:assert/strict";
import test from "node:test";
import { istUnbegrenzt, unbegrenzteKonten } from "../control-server/src/publicapi/publicApiLedger.js";
import { authenticatedUserId } from "../control-server/src/jobs/jobAccess.js";

const KONTO = authenticatedUserId({ email: "betreiber@example.com" });
const FREMD = authenticatedUserId({ email: "jemand@example.com" });

test("ohne Umgebungsvariable ist kein Konto unbegrenzt", () => {
  assert.equal(unbegrenzteKonten({}).size, 0);
  assert.equal(istUnbegrenzt(KONTO, {}), false);
});

test("Konto-Kennung in der Liste wird befreit, ein fremdes nicht", () => {
  const env = { SMEJJ_API_UNBEGRENZT: KONTO };
  assert.equal(istUnbegrenzt(KONTO, env), true);
  assert.equal(istUnbegrenzt(FREMD, env), false);
});

test("eine E-Mail wird zur selben Kennung gerechnet wie beim Anmelden", () => {
  const env = { SMEJJ_API_UNBEGRENZT: "betreiber@example.com" };
  assert.equal(istUnbegrenzt(KONTO, env), true);
  assert.equal(istUnbegrenzt(FREMD, env), false);
});

test("mehrere Eintraege, gemischt und mit Leerzeichen", () => {
  const env = { SMEJJ_API_UNBEGRENZT: `  jemand@example.com , ${KONTO}  ` };
  assert.equal(istUnbegrenzt(KONTO, env), true);
  assert.equal(istUnbegrenzt(FREMD, env), true);
});

test("Tippfehler und Unsinn befreien niemanden", () => {
  for (const wert of ["user_xyz", "user_", "*", "alle", "user_ZZZZZZZZ"]) {
    assert.equal(istUnbegrenzt(KONTO, { SMEJJ_API_UNBEGRENZT: wert }), false, `Wert ${wert} darf nicht befreien`);
  }
});

test("eine ungueltige Konto-Kennung ist nie unbegrenzt", () => {
  const env = { SMEJJ_API_UNBEGRENZT: KONTO };
  for (const wert of ["", null, "kaputt", "user_1234567"]) {
    assert.equal(istUnbegrenzt(wert, env), false);
  }
});
