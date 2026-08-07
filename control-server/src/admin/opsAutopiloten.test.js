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
  ladeHerzschlaege,
  persistiereHerzschlag,
  pruefeAlarm,
  starteSelbstmessung,
  _ablageLeeren,
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

test("Eigenmeldung: die Salad-Sonden werden gruen, sonst niemand", () => {
  frisch();
  const zeitgeber = starteSelbstmessung({ intervallMs: 60 * 60 * 1000 });
  clearInterval(zeitgeber);
  const u = autopilotUebersicht({ jetztMs: Date.now() });
  const sonden = u.autopiloten.find((x) => x.id === "salad-sonden");
  assert.equal(sonden.ampel, "gruen", "die Eigenmeldung traegt die Sonden-Ampel");
  assert.ok(sonden.letzterLauf.meldung.includes("Eigenmeldung"));
  assert.equal(u.gruen, 1, "kein anderer Autopilot erbt die Eigenmeldung");
});

test("Stufe 3: ein abgelegter Herzschlag uebersteht den Neustart", async () => {
  frisch(); _ablageLeeren();
  // Ohne IDrive-Umgebung faellt die Ablage auf den Memory-Speicher zurueck —
  // genau das simuliert hier den Neustart: Karte leer, Ablage voll.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "Note 96 %", env: ENV, jetztMs: JETZT - 1000 });
  assert.equal(await persistiereHerzschlag("qualitaetsmessung", { env: {} }), true);
  _herzschlaegeZuruecksetzen();
  assert.equal(autopilotUebersicht({ jetztMs: JETZT }).gruen, 0, "Neustart: erst einmal alles grau");
  const geladen = await ladeHerzschlaege({ env: {} });
  assert.equal(geladen, 1);
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.ampel, "gruen", "der geladene Verlauf traegt die Ampel wieder");
  assert.ok(a.letzterLauf.meldung.includes("Note 96"));
});

test("Stufe 3: ein lebender Herzschlag gewinnt gegen die Ablage", async () => {
  frisch(); _ablageLeeren();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "alt", env: ENV, jetztMs: JETZT - 5000 });
  await persistiereHerzschlag("qualitaetsmessung", { env: {} });
  _herzschlaegeZuruecksetzen();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "frisch", env: ENV, jetztMs: JETZT - 1000 });
  await ladeHerzschlaege({ env: {} });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.ok(a.letzterLauf.meldung.includes("frisch"), "die Ablage darf den lebenden Stand nicht ueberschreiben");
});

test("Stufe 3: Rot-Alarm genau einmal je Episode, danach wieder scharf", async () => {
  frisch(); _ablageLeeren();
  const gesendet = [];
  const sende = async (mail) => { gesendet.push(mail); };
  const alarmEnv = { ...ENV, SMEJJ_ADMIN_OWNER_EMAILS: "smejjcom@gmail.com" };

  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", meldung: "push kaputt", env: ENV, jetztMs: JETZT - 1000 });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT, sende });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT, sende });
  assert.equal(gesendet.length, 1, "dieselbe Rot-Phase wird nur einmal gemeldet");
  assert.ok(gesendet[0].subject.includes("Codeberg-Spiegel"));
  assert.ok(gesendet[0].text.includes("push kaputt"));

  // Episode endet (gruen), neues Rot -> neue Mail.
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "ok", env: ENV, jetztMs: JETZT });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT, sende });
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", meldung: "wieder kaputt", env: ENV, jetztMs: JETZT + 1000 });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT + 2000, sende });
  assert.equal(gesendet.length, 2, "eine neue Rot-Phase meldet sich wieder");
});

test("Stufe 3: ohne Empfaenger wird nichts gesendet und nichts geworfen", async () => {
  frisch();
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", env: ENV, jetztMs: JETZT });
  const ergebnis = await pruefeAlarm({ env: ENV, jetztMs: JETZT, sende: async () => { throw new Error("darf nicht"); } });
  assert.equal(ergebnis.gemeldet, 0);
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
