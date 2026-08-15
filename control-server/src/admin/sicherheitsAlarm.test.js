// smejj.com — Tests fuer die Sicherheitswache.
// Ausfuehren: node --test control-server/src/admin/sicherheitsAlarm.test.js
//
// WARUM ES DIESE DATEI GIBT: Bei der A-bis-Z-Pruefung am 2026-08-15 fiel auf,
// dass dieses Modul unter dem Admin-Lock liegt, aber keinen Test hatte. Es
// entscheidet, WANN der Betreiber ueber einen Angriffsversuch erfaehrt — und
// ebenso wichtig: wann NICHT. Eine Wache, die bei jedem Vorgang schreit,
// gewoehnt man sich ab; eine, die schweigt, ist keine.
import test from "node:test";
import assert from "node:assert/strict";

import { ARTEN, __clearAlarmForTests, meldeEreignis } from "./sicherheitsAlarm.js";
import { __clearAuditMemoryForTests, readAuditPage } from "./auditLog.js";

const ENV = { SMEJJ_ADMIN_OWNER_EMAILS: "chefin@example.invalid" };

// Eine ECHTE Uhrzeit, kein kleiner Zaehler: die Ruhezeit wird gegen
// `zuletztGemeldet` gerechnet, das anfangs 0 ist. Mit einer kleinen Zahl
// (z. B. `now: () => 1000`) laege der erste Alarm scheinbar mitten in der
// Ruhezeit und wuerde verschluckt — eine Messfalle des Tests, nicht des
// Moduls. Genau darauf bin ich beim Schreiben hereingefallen.
const T0 = Date.parse("2026-08-15T12:00:00.000Z");

function wache() {
  const mails = [];
  return { mails, mail: async (n) => { mails.push(n); return { sent: true }; } };
}

test.beforeEach(() => { __clearAlarmForTests(); __clearAuditMemoryForTests(); });

test("unterhalb der Schwelle wird nicht gemeldet — sonst waere die Wache Laerm", async () => {
  const { mail, mails } = wache();
  let letzte;
  for (let i = 0; i < 4; i += 1) {
    letzte = await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail, now: () => T0 });
  }
  assert.equal(letzte.gemeldet, false);
  assert.equal(letzte.anzahl, 4);
  assert.equal(mails.length, 0);
});

test("an der Schwelle schlaegt sie an — mit Nachweis UND Mail", async () => {
  const { mail, mails } = wache();
  let letzte;
  for (let i = 0; i < 5; i += 1) {
    letzte = await meldeEreignis(ARTEN.stepUpFalsch, { kennung: "1.2.3.4" }, { env: ENV, mail, now: () => T0 });
  }
  assert.equal(letzte.gemeldet, true);
  assert.equal(letzte.anzahl, 5);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, "chefin@example.invalid");

  const log = await readAuditPage({ limit: 5 }, { env: ENV });
  assert.equal(log.entries[0].action, "security.alarm");
  assert.equal(log.entries[0].target, ARTEN.stepUpFalsch,
    "das Ziel muss die Art nennen, sonst weiss niemand, wovor gewarnt wird");
});

test("waehrend der Ruhezeit meldet dieselbe Welle nicht noch einmal", async () => {
  const { mail, mails } = wache();
  let jetzt = T0;
  for (let i = 0; i < 5; i += 1) await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail, now: () => jetzt });
  assert.equal(mails.length, 1);

  jetzt += 60_000;
  for (let i = 0; i < 5; i += 1) await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail, now: () => jetzt });
  assert.equal(mails.length, 1, "30 Minuten Ruhe heisst 30 Minuten Ruhe");
});

test("nach der Ruhezeit ist sie wieder scharf", async () => {
  const { mail, mails } = wache();
  let jetzt = T0;
  for (let i = 0; i < 5; i += 1) await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail, now: () => jetzt });
  jetzt += 30 * 60_000 + 1;
  for (let i = 0; i < 5; i += 1) await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail, now: () => jetzt });
  assert.equal(mails.length, 2);
});

test("alte Vorgaenge fallen aus dem Fenster — verteiltes Rauschen loest nichts aus", async () => {
  const { mail, mails } = wache();
  let jetzt = T0;
  for (let i = 0; i < 10; i += 1) {
    await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail, now: () => jetzt });
    jetzt += 10 * 60_000; // je Vorgang ein volles Fenster weiter
  }
  assert.equal(mails.length, 0, "zehn einzelne Vorgaenge ueber anderthalb Stunden sind kein Angriff");
});

test("jede Art zaehlt fuer sich — mit ihrer eigenen Schwelle", async () => {
  const { mail, mails } = wache();
  for (let i = 0; i < 4; i += 1) await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail, now: () => T0 });
  for (let i = 0; i < 2; i += 1) await meldeEreignis(ARTEN.stepUpVerbrannt, {}, { env: ENV, mail, now: () => T0 });
  assert.equal(mails.length, 1, "verbrannte Codes haben Schwelle 2, falsche Codes 5");
  assert.match(mails[0].text, /step_up_zu_viele_versuche/);
});

test("eine unbekannte Art loest nichts aus", async () => {
  const { mail, mails } = wache();
  const ergebnis = await meldeEreignis("gibt-es-nicht", {}, { env: ENV, mail });
  assert.deepEqual(ergebnis, { gemeldet: false, anzahl: 0 });
  assert.equal(mails.length, 0);
});

test("ein kaputter Mailweg blockiert die Abwehr nicht", async () => {
  const kaputt = async () => { throw new Error("SMTP tot"); };
  let letzte;
  for (let i = 0; i < 5; i += 1) {
    letzte = await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail: kaputt, now: () => T0 });
  }
  assert.equal(letzte.gemeldet, true, "die Wache darf an ihrer eigenen Meldung nicht scheitern");
  const log = await readAuditPage({ limit: 5 }, { env: ENV });
  assert.equal(log.entries[0].action, "security.alarm", "der Nachweis steht auch ohne Mail");
});

test("ohne hinterlegte Betreiber-Adresse wird keine Mail verschickt", async () => {
  const { mail, mails } = wache();
  for (let i = 0; i < 5; i += 1) await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: {}, mail, now: () => T0 });
  assert.equal(mails.length, 0);
});

test("die Meldung sagt, dass die Anfragen bereits abgewiesen wurden", async () => {
  const { mail, mails } = wache();
  for (let i = 0; i < 5; i += 1) await meldeEreignis(ARTEN.stepUpFalsch, {}, { env: ENV, mail, now: () => T0 });
  assert.match(mails[0].text, /kein Einbruch/,
    "wer nachts eine Alarmmail bekommt, muss in Sekunden wissen, ob er aufstehen muss");
});
