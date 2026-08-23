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

test("Morgen-Lage (mitNetz): vier Zahlen aus Stubs, Dienste mit letztem echten Lauf, nichts erfunden", async () => {
  const jetztMs = Date.parse("2026-08-23T08:00:00.000Z");
  const c = await cockpitUebersicht({
    env: {}, jetztMs, mitNetz: true,
    leseDienste: async () => ({ ok: true, dienste: [
      { id: "control", name: "smejj-control", bautAus: "Zeabur", antwortMs: 38, zustand: "gleich", satz: "ok" },
      { id: "bruecke", name: "smejj-chat-bridge", bautAus: "Zeabur", antwortMs: 210, zustand: "gleich", satz: "ok" },
      { id: "bild", name: "smejj-bild-maler", bautAus: "Zeabur", antwortMs: null, zustand: "nicht-erreichbar", satz: "weg" }
    ] }),
    leseMrr: async () => ({ gemessen: true, cent: 900, abos: 1, waehrung: "eur" }),
    leseIndex: async () => ({ ok: true, entries: [{ createdAt: "2026-08-22T00:00:00Z" }, { createdAt: "2026-07-01T00:00:00Z" }] }),
    leseAudit: async () => ({ ok: true, entries: [{ at: "2026-08-23T07:59:00Z", action: "users.index.rebuild", actorEmail: "a@b", target: "admin/index/users.json" }, { at: "2026-08-23T07:50:00Z", action: "security.alarm", target: "login", reason: "zu viele Fehlversuche" }] }),
    leseFreigaben: async () => ({ ok: true, approvals: [{ id: "x", status: "pending", action: "user.delete", target: "u", requestedBy: "a@b", requestedAt: "2026-08-23T07:40:00Z" }] })
  });
  const m = c.morgen;
  assert.equal(m.nutzer.gesamt, 2);
  assert.equal(m.nutzer.neuDieseWoche, 1);
  assert.equal(m.umsatz.cent, 900);
  assert.equal(m.antwortzeit.langsamsterMs, 210);
  assert.equal(m.antwortzeit.langsamster, "smejj-chat-bridge");
  assert.ok(m.ohneSignal.anzahl >= 0 && m.ohneSignal.gesamt > 30);
  assert.ok(m.dienste.some((d) => d.id === "nachtbau"), "der Nachtbau steht als eigene Zeile");
  assert.ok(m.dienste.some((d) => d.id === "speicher"), "der Speicher steht mit Schreibprobe");
  assert.equal(m.protokoll.eintraege.length, 2);
  assert.equal(m.alarme.anzahl, 1, "Sicherheitsalarme aus dem Audit werden gezaehlt (Erbe der Seite A)");
  assert.equal(m.alarme.letzter.grund, "zu viele Fehlversuche");
  assert.equal(m.vierAugen.offen.length, 1);
});

test("ohne mitNetz bleibt das Cockpit netzlos — morgen ist null", async () => {
  const c = await cockpitUebersicht({ env: {} });
  assert.equal(c.morgen, null);
});
