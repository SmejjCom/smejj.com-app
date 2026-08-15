// smejj.com — Tests fuer den Nachweis-Waechter (Autopilot Nr. 41).
//
// ANLASS, live gefunden am 2026-08-15: Der Adminspeicher war nur noch LESBAR.
// Das Audit-Log lieferte weiter Eintraege, `/api/health` meldete
// `storage: true`, alle 40 Ampeln standen gruen — und trotzdem konnte der
// Adminbereich nichts mehr schreiben: kein Nachweis, kein Step-up-Code, keine
// einzige schreibende Aktion. Aufgefallen ist es nur, weil ein Step-up-Dialog
// den rohen Fehler ausgab ("403 AccessDenied").
//
// Merkregel dieser Datei: Lesbarkeit ist kein Beweis fuer Schreibbarkeit.
import test from "node:test";
import assert from "node:assert/strict";

import { laufNachweisKette } from "../control-server/src/autopilots/autopilotLaeufer.js";

function ablageDie(verhalten) {
  return { schreib: verhalten, lies: async () => null, liste: async () => ({ ok: true, datensaetze: [] }) };
}

test("schreibbarer Speicher ist gruen — und sagt, was er geschrieben hat", async () => {
  const geschrieben = [];
  const ergebnis = await laufNachweisKette({
    ablage: ablageDie(async (d) => { geschrieben.push(d); return d; }),
    jetztIso: "2026-08-15T00:00:00.000Z"
  });
  assert.equal(ergebnis.ok, true);
  assert.match(ergebnis.meldung, /beschreibbar/);
  assert.equal(geschrieben.length, 1, "genau EIN Probeobjekt, nicht mehr");
  assert.equal(geschrieben[0].id, "nachweis-schreibprobe", "immer dieselbe Kennung — es wird ueberschrieben, nicht angehaeuft");
});

test("403 wird ROT und nennt die Folge, nicht nur den Fehlercode", async () => {
  const ergebnis = await laufNachweisKette({
    ablage: ablageDie(async () => {
      throw new Error("IDrive e2 write failed for admin/audit/2026/08/15/x.json: 403 <Error><Code>AccessDenied</Code>");
    })
  });
  assert.equal(ergebnis.ok, false, "genau dieser Zustand blieb am 15.08. unsichtbar");
  assert.match(ergebnis.meldung, /NUR LESBAR/);
  assert.match(ergebnis.meldung, /Step-up/, "wer das liest, muss die Folge sofort verstehen");
});

test("jede andere Stoerung wird ebenfalls rot, mit ihrem eigenen Grund", async () => {
  const ergebnis = await laufNachweisKette({
    ablage: ablageDie(async () => { throw new Error("connect ETIMEDOUT"); })
  });
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.meldung, /ETIMEDOUT/, "der echte Grund gehoert in die Meldung");
  assert.ok(!ergebnis.meldung.includes("NUR LESBAR"), "ein Netzfehler ist kein Rechteproblem");
});

test("der Waechter fasst das Audit-Log nicht an", async () => {
  const ziele = [];
  await laufNachweisKette({ ablage: ablageDie(async (d) => { ziele.push(d.id); return d; }) });
  assert.ok(!ziele.some((id) => String(id).includes("audit")),
    "ein Waechter, der zum Messen Nachweise erzeugt, verfaelscht was er schuetzt");
});
