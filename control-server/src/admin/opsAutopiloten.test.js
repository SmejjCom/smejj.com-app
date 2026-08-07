// smejj.com — Unit-Tests fuer Modul AP (Autopiloten).
//
// Die wichtigste Pruefung: GRUEN gibt es nur fuer einen gemessenen Herzschlag.
// Eine Registry-Zeile allein darf nie gruen werden — genau diese Luege
// ("eingetragen = laeuft") hat den Codeberg-Spiegel monatelang verdeckt.
//
// Ausfuehren: node --test control-server/src/admin/opsAutopiloten.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTOPILOTEN,
  autopilotUebersicht,
  heartbeatAnnehmen,
  _herzschlaegeZuruecksetzen
} from "./opsAutopiloten.js";

const JETZT = Date.parse("2026-08-07T12:00:00.000Z");
const ENV = { SMEJJ_AUTOPILOT_KEYS: "qualitaetsmessung:geheim1,codeberg-spiegel:geheim2" };

function frisch() {
  _herzschlaegeZuruecksetzen();
}

test("ohne Herzschlag ist NIEMAND gruen — auch nicht die eingetragenen", () => {
  frisch();
  const u = autopilotUebersicht({ jetztMs: JETZT });
  assert.equal(u.total, AUTOPILOTEN.length);
  assert.equal(u.gruen, 0, "gruen ohne Messung waere genau die Luege, die das Modul verhindern soll");
  assert.equal(u.grau, AUTOPILOTEN.length);
});

test("puenktlicher Erfolgs-Herzschlag macht gruen", () => {
  frisch();
  const antwort = heartbeatAnnehmen({
    id: "qualitaetsmessung", key: "geheim1", status: "ok", dauerMs: 4200,
    env: ENV, jetztMs: JETZT - 60 * 60 * 1000
  });
  assert.equal(antwort.ok, true);
  const u = autopilotUebersicht({ jetztMs: JETZT });
  const a = u.autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.ampel, "gruen");
  assert.equal(u.gruen, 1);
});

test("ueberfaellig in der Schonfrist = gelb, jenseits = rot", () => {
  frisch();
  // Qualitaetsmessung: erwartet alle 12 h, Schonfrist 6 h.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT - 14 * 60 * 60 * 1000 });
  let a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.ampel, "gelb", "14 h alt bei 12+6 h ist verspaetet, nicht ausgefallen");

  frisch();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT - 20 * 60 * 60 * 1000 });
  a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.ampel, "rot", "20 h alt bei 12+6 h ist ein Ausfall");
});

test("ein gemeldeter Fehler ist sofort rot — egal wie frisch", () => {
  frisch();
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", meldung: "push abgewiesen", env: ENV, jetztMs: JETZT - 1000 });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "codeberg-spiegel");
  assert.equal(a.ampel, "rot");
  assert.ok(a.ampelGrund.includes("push abgewiesen"), "die Fehlermeldung gehoert in den Grund");
});

test("fail-closed: ohne Schluessel-Umgebung wird nichts angenommen", () => {
  frisch();
  const antwort = heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: {}, jetztMs: JETZT });
  assert.equal(antwort.ok, false);
  assert.equal(antwort.status, 503);
  assert.equal(antwort.error, "autopilot_keys_missing");
});

test("falscher Schluessel und unbekannte Kennung werden abgewiesen", () => {
  frisch();
  assert.equal(heartbeatAnnehmen({ id: "qualitaetsmessung", key: "falsch", status: "ok", env: ENV, jetztMs: JETZT }).status, 403);
  assert.equal(heartbeatAnnehmen({ id: "gibtsnicht", key: "x", status: "ok", env: ENV, jetztMs: JETZT }).status, 404);
  const u = autopilotUebersicht({ jetztMs: JETZT });
  assert.equal(u.gruen, 0, "abgewiesene Herzschlaege duerfen die Ampel nicht anfassen");
});

test("Verlauf ist gedeckelt und juengster Lauf steht vorn", () => {
  frisch();
  for (let i = 0; i < 25; i += 1) {
    heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "lauf " + i, env: ENV, jetztMs: JETZT - (25 - i) * 1000 });
  }
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.verlauf.length, 20, "der Verlauf darf nicht unbegrenzt wachsen");
  assert.ok(a.verlauf[0].meldung.includes("lauf 24"), "der juengste Lauf steht vorn");
});

test("lange Meldungen werden gekuerzt — der Speicher ist begrenzt", () => {
  frisch();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "x".repeat(5000), env: ENV, jetztMs: JETZT });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.letzterLauf.meldung.length, 200);
});

test("jeder Autopilot hat, was die idiotensichere Ansicht braucht", () => {
  for (const a of AUTOPILOTEN) {
    assert.ok(a.id && a.name && a.kurz, a.id + ": Kennung, Name und Kurzbeschreibung sind Pflicht");
    assert.ok(Array.isArray(a.funktionen) && a.funktionen.length > 0, a.id + ": mindestens eine Funktionszeile");
    assert.ok(a.startAnleitung && a.stopAnleitung, a.id + ": Start- und Stopp-Anleitung sind Pflicht");
    if (a.messung === "heartbeat") {
      assert.ok(a.erwartetAlleMs > 0 && a.schonfristMs > 0, a.id + ": Herzschlag braucht Intervall und Schonfrist");
    } else {
      assert.ok(a.messungHinweis, a.id + ": ohne Herzschlag braucht es die ehrliche Begruendung");
    }
  }
});
