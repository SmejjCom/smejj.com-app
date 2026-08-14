// Wiederholung beim Mailversand — Befund 2026-08-13 (Adminbereich, Ansicht V):
// 3 von 63 Mails in 14 Tagen verliessen den Server nicht, jedes Mal mit
// "smtp_connect_failed:ETIMEDOUT". Es gab keinen zweiten Versuch, ein einziger
// Netzhaenger kostete also die Anmeldung. Diese Tests halten fest, WANN
// wiederholt wird — und vor allem, wann nicht.
import test from "node:test";
import assert from "node:assert/strict";
import { sendAuthMail } from "./mailer.js";

// Reicht mailerConfig() aus, ohne echten Versand: der Transport ist injiziert.
const ENV = {
  SMEJJ_SMTP_HOST: "smtp.example.test",
  SMEJJ_SMTP_PORT: "465",
  SMEJJ_SMTP_USER: "nutzer@example.test",
  SMEJJ_SMTP_PASS: "geheim",
  SMEJJ_SMTP_FROM: "s@example.test"
};
const MAIL = { to: "empfaenger@example.test", subject: "Test", text: "Hallo" };

test("gelingt der erste Versuch, wird genau einmal gesendet", async () => {
  let aufrufe = 0;
  const ergebnis = await sendAuthMail(MAIL, ENV, async () => { aufrufe += 1; });
  assert.deepEqual(ergebnis, { sent: true });
  assert.equal(aufrufe, 1, "ein erfolgreicher Versand darf sich nicht wiederholen");
});

test("ein Verbindungs-Timeout wird wiederholt und kann dann gelingen", async () => {
  let aufrufe = 0;
  const ergebnis = await sendAuthMail(MAIL, ENV, async () => {
    aufrufe += 1;
    if (aufrufe === 1) throw new Error("smtp_connect_failed:ETIMEDOUT");
  });
  assert.equal(ergebnis.sent, true);
  assert.equal(aufrufe, 2);
  // Die Zahl der Versuche steht nur dann im Ergebnis, wenn es mehr als einer
  // war — so bleibt der Normalfall im Protokoll unveraendert.
  assert.equal(ergebnis.versuche, 2);
});

test("eine Ablehnung durch den Mailserver wird NICHT wiederholt", async () => {
  // 550 heisst: angekommen und abgelehnt. Ein zweiter Versuch waere sinnlose
  // Last und im Zweifel eine Dublette beim Empfaenger.
  let aufrufe = 0;
  const ergebnis = await sendAuthMail(MAIL, ENV, async () => {
    aufrufe += 1;
    throw new Error("smtp_rcpt_rejected:550");
  });
  assert.equal(ergebnis.sent, false);
  assert.equal(aufrufe, 1, "abgelehnte Post darf nicht erneut zugestellt werden");
});

test("haelt die Stoerung an, wird nach drei Versuchen ehrlich aufgegeben", async () => {
  let aufrufe = 0;
  const ergebnis = await sendAuthMail(MAIL, ENV, async () => {
    aufrufe += 1;
    throw new Error("smtp_connect_failed:ETIMEDOUT");
  });
  assert.equal(ergebnis.sent, false);
  assert.equal(ergebnis.reason, "smtp_connect_failed:ETIMEDOUT");
  assert.equal(aufrufe, 3);
});

test("eine unbrauchbare Empfaengeradresse kostet keinen einzigen Versuch", async () => {
  let aufrufe = 0;
  const ergebnis = await sendAuthMail({ ...MAIL, to: "keine-adresse" }, ENV, async () => { aufrufe += 1; });
  assert.deepEqual(ergebnis, { sent: false, reason: "recipient_invalid" });
  assert.equal(aufrufe, 0);
});
