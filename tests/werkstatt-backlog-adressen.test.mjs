// Das Werkstatt-Backlog geht in Git und ins Bruecken-Wissen: keine Adressen im Klartext (15.09.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { baueBacklog, alsMarkdown, maskiereAdressen } from "../control-server/src/autopilots/werkstattBacklog.js";

test("maskiereAdressen laesst nur den ersten Buchstaben und die Domain stehen", () => {
  assert.equal(maskiereAdressen("NEU anna.muster@example.com und b@x.de"), "NEU a***@example.com und b***@x.de");
  assert.equal(maskiereAdressen("keine Adresse, nur smejj.com"), "keine Adresse, nur smejj.com");
});

test("ein Ampel-Befund mit Adresse erscheint im Backlog maskiert", () => {
  const backlog = baueBacklog({ ampel: { ok: true, vorfaelle: [{ bis: null, nr: 99, name: "Konto-Wache", grund: "Admin-Liste geaendert (NEU privat.person@gmail.com)", seit: "2026-09-14" }] } });
  const md = alsMarkdown(backlog, "2026-09-15T00:00:00Z");
  assert.doesNotMatch(md + JSON.stringify(backlog), /privat\.person@gmail\.com/);
  assert.match(md, /p\*\*\*@gmail\.com/);
});
