// Befreiung einzelner Konten von der Ratenbremse der Chat-Bruecke.
//
// Die Bremse zaehlt nach IP-Adresse und traf damit auch den Betreiber
// (12 Anfragen je Minute, dann 429). Freigabe Wof Kadavanich 2026-09-01:
// "nur fuer mich, mach die Code-Aenderung".
//
// Diese Tests halten die drei Eigenschaften fest, auf die es ankommt:
//   1. Ohne gesetzte Umgebungsvariable aendert sich NICHTS.
//   2. Befreit wird nur, wessen Konto in der Liste steht — und nur, wenn die
//      Anmeldung vorher schon geprueft wurde (Zwischenspeicher).
//   3. Die Befreiung fragt NIE beim Control Server nach. Sonst koennte jeder
//      mit einem erfundenen Token einen Rundlauf ausloesen; die Bremse waere
//      dann ein Verstaerker statt eines Schutzes.

import assert from "node:assert/strict";
import test from "node:test";
import { _leereAuthCache, befreiteKonten, istBefreit, pruefeToken } from "../public/chat-bridge-auth.js";

const CONTROL = "https://control.example";

function antwortMit(nutzdaten, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => nutzdaten
  });
}

async function meldeAn(token, epost) {
  await pruefeToken(token, {
    controlOrigin: CONTROL,
    fetchFn: antwortMit({ authenticated: true, user: { email: epost } })
  });
}

test("ohne Umgebungsvariable ist niemand befreit", async () => {
  _leereAuthCache();
  await meldeAn("token-betreiber", "chef@smejj.com");
  assert.deepEqual(befreiteKonten({}), []);
  assert.equal(istBefreit("token-betreiber", { env: {} }), false);
});

test("das gelistete Konto ist befreit, ein anderes nicht", async () => {
  _leereAuthCache();
  const env = { SMEJJ_RATE_LIMIT_BEFREIT: "chef@smejj.com" };
  await meldeAn("token-betreiber", "chef@smejj.com");
  await meldeAn("token-fremd", "jemand@example.com");
  assert.equal(istBefreit("token-betreiber", { env }), true);
  assert.equal(istBefreit("token-fremd", { env }), false);
});

test("Gross- und Kleinschreibung sowie Leerzeichen stoeren nicht", async () => {
  _leereAuthCache();
  // Neutrale Beispieladresse: der Namenswaechter laesst Schreibvarianten der
  // eigenen Plattform nicht zu, geprueft wird hier ohnehin nur der Vergleich.
  const env = { SMEJJ_RATE_LIMIT_BEFREIT: "  Chef@Example.COM , zweiter@example.com " };
  await meldeAn("token-betreiber", "CHEF@example.com");
  assert.equal(istBefreit("token-betreiber", { env }), true);
});

test("ein unbekanntes Token wird NICHT befreit und loest keine Nachfrage aus", () => {
  _leereAuthCache();
  const env = { SMEJJ_RATE_LIMIT_BEFREIT: "chef@smejj.com" };
  let gefragt = 0;
  const fetchFn = async () => {
    gefragt += 1;
    return { ok: true, status: 200, json: async () => ({ authenticated: true, user: { email: "chef@smejj.com" } }) };
  };
  // istBefreit bekommt fetchFn gar nicht erst — der Zaehler muss 0 bleiben.
  assert.equal(istBefreit("nie-gesehenes-token", { env, fetchFn }), false);
  assert.equal(gefragt, 0, "die Befreiung darf keinen Rundlauf ausloesen");
});

test("ein abgelehntes Token wird nicht befreit, auch wenn das Konto passt", async () => {
  _leereAuthCache();
  const env = { SMEJJ_RATE_LIMIT_BEFREIT: "chef@smejj.com" };
  await pruefeToken("token-abgelaufen", {
    controlOrigin: CONTROL,
    fetchFn: antwortMit({ authenticated: false, user: { email: "chef@smejj.com" } })
  });
  assert.equal(istBefreit("token-abgelaufen", { env }), false);
});

test("nach Ablauf des Zwischenspeichers gilt die Befreiung nicht mehr", async () => {
  _leereAuthCache();
  const env = { SMEJJ_RATE_LIMIT_BEFREIT: "chef@smejj.com" };
  const start = Date.now();
  await pruefeToken("token-betreiber", {
    jetzt: start,
    controlOrigin: CONTROL,
    fetchFn: antwortMit({ authenticated: true, user: { email: "chef@smejj.com" } })
  });
  assert.equal(istBefreit("token-betreiber", { env, jetzt: start + 60_000 }), true);
  // Der Speicher haelt gueltige Urteile 10 Minuten.
  assert.equal(istBefreit("token-betreiber", { env, jetzt: start + 11 * 60_000 }), false);
});

test("ohne Token ist niemand befreit", () => {
  const env = { SMEJJ_RATE_LIMIT_BEFREIT: "chef@smejj.com" };
  assert.equal(istBefreit("", { env }), false);
});
