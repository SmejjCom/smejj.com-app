// smejj.com — Waechter-Tests fuer das Cockpit (Modul CK).
//
// WARUM ES DIESE TESTS GIBT: Bis 2026-08-14 lieferte cockpitUebersicht feste
// Zahlen — ttftMs: 42, apiP95Ms: 118, benchmarkPassRate: 1.0, dpoStatus
// "active_24_7" — und der damalige Test PRUEFTE diese Konstanten
// (`assert.equal(c.performance.ttftMs < 1000, true)`). Ein Test, der eine
// Erfindung festschreibt, macht sie haltbar. Diese Fassung dreht das um: sie
// prueft, dass keine unbelegte Kennzahl zurueckkommt.
//
// Ausfuehren: node --test control-server/src/admin/opsCockpit.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { cockpitUebersicht } from "./opsCockpit.js";
import { AUTOPILOTEN } from "./opsAutopilotenListe.js";
import { heartbeatAnnehmen, _herzschlaegeZuruecksetzen } from "./opsAutopiloten.js";

const ENV = { SMEJJ_AUTOPILOT_KEYS: "codeberg-spiegel:geheim1,qualitaetsmessung:geheim2" };

test("die Zahl der Automatiken kommt aus der Registry, nie aus einer Konstante", async () => {
  // Nicht hart codieren: die Zahl 29 war schon einmal falsch (31), ohne dass
  // es jemand merkte — genau der Fehler, den dieser Test finden soll.
  const c = await cockpitUebersicht({ env: {} });
  assert.equal(c.ok, true);
  assert.equal(c.automatiken.gesamt, AUTOPILOTEN.length);
  assert.equal(
    c.automatiken.gruen + c.automatiken.gelb + c.automatiken.rot + c.automatiken.grau + c.automatiken.wartung,
    AUTOPILOTEN.length,
    "jede Automatik zaehlt in genau einen Topf"
  );
});

test("KEINE erfundenen Kennzahlen — die alten Felder duerfen nicht zurueckkommen", async () => {
  const c = await cockpitUebersicht({ env: {} });
  for (const feld of ["performance", "kiModell"]) {
    assert.equal(c[feld], undefined,
      `${feld} enthielt bis 2026-08-14 feste Zahlen. Wer es wieder einfuehrt, `
      + "muss eine echte Messung mitliefern — sonst gehoert es in nichtGemessen.");
  }
  // Die Stichprobe auf die konkreten Erfindungen: sie standen so im Code.
  const roh = JSON.stringify(c);
  for (const erfindung of ["\"ttftMs\"", "\"apiP95Ms\"", "\"lcpSekunden\"", "\"benchmarkPassRate\"", "active_24_7", "blitzschnell"]) {
    assert.ok(!roh.includes(erfindung), `unbelegte Kennzahl wieder da: ${erfindung}`);
  }
});

test("was fehlt, wird benannt — mit Grund", async () => {
  const c = await cockpitUebersicht({ env: {} });
  assert.ok(Array.isArray(c.nichtGemessen) && c.nichtGemessen.length >= 3,
    "die Seite muss sagen, welche Kennzahlen sie NICHT hat");
  for (const l of c.nichtGemessen) {
    assert.ok(l.feld && l.warum && l.warum.length > 20,
      "jede Luecke braucht einen Grund, kein blosses Fragezeichen: " + JSON.stringify(l));
  }
});

test("ohne einen einzigen Herzschlag meldet das Cockpit NICHT 'nichts zu tun'", async () => {
  // Die eigentliche Falle. Nach jedem Neustart sind alle Ampeln grau, und
  // jeder Push deployt Control. "Kein Rot und kein Gelb" heisst dann nicht
  // "gesund", sondern "nichts gemessen" — dieselbe Verwechslung hat den
  // Nachtbau schon einmal 30 Phantom-Aufgaben bauen lassen.
  _herzschlaegeZuruecksetzen();
  const c = await cockpitUebersicht({ env: {} });
  assert.equal(c.lage.status, "unbekannt", "ohne Messung darf die Lage nicht 'ruhig' sein");
  assert.ok(!/nichts zu tun/i.test(c.lage.naechsterSchritt),
    "ohne Messung darf dort keine Entwarnung stehen: " + c.lage.naechsterSchritt);
  assert.equal(c.automatiken.grau, AUTOPILOTEN.length);
});

test("mit einem gruenen Herzschlag wird die Lage ruhig — und mit einem roten kritisch", async () => {
  _herzschlaegeZuruecksetzen();
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim1", status: "ok", env: ENV, jetztMs: Date.now() });
  const ruhig = await cockpitUebersicht({ env: {} });
  assert.equal(ruhig.lage.status, "ruhig");
  assert.match(ruhig.lage.naechsterSchritt, /nichts zu tun/i);

  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim2", status: "fehler", meldung: "kaputt", env: ENV, jetztMs: Date.now() });
  const kaputt = await cockpitUebersicht({ env: {} });
  assert.equal(kaputt.lage.status, "kritisch");
  assert.match(kaputt.lage.satz, /ausgefallen/);
  _herzschlaegeZuruecksetzen();
});

test("Speicher: nicht messbar heisst 'keine Zahl', nicht 'null Bytes'", async () => {
  // Ohne eingerichteten Speicher darf dort keine 0 stehen — eine 0 laese sich
  // als "gemessen, nichts belegt" lesen.
  const c = await cockpitUebersicht({ env: {} });
  if (c.speicher.ok === false) {
    assert.ok(c.speicher.error, "der Grund muss dranstehen");
    assert.equal(c.speicher.bytesGesamt, undefined, "keine erfundene Null");
  } else {
    assert.equal(typeof c.speicher.vollstaendig, "boolean",
      "die Quelle sagt, ob sie vollstaendig zaehlen konnte — das muss durchgereicht werden");
  }
});
