// smejj.com — Unit-Tests fuer die Moderations-Warteschlange.
// Ausfuehren: node --test control-server/src/admin/moderationQueue.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  MOD_STATUS, __clearModerationForTests, entscheide, listeSignale, meldeSignal
} from "./moderationQueue.js";

const ENV = {};
const ACTOR = { email: "chefin@example.de" };
const JETZT = Date.parse("2026-07-28T12:00:00.000Z");

async function signal(patch = {}) {
  return meldeSignal({
    art: "token_ausreisser",
    subjekt: "u_a91f4",
    beleg: "18,4 M Token in 24 h — 41-faches Nutzermittel",
    schwere: "hoch",
    ...patch
  }, { actor: ACTOR, env: ENV, nowMs: JETZT });
}

test("EIN SIGNAL OHNE BELEG IST EIN GERUECHT — und wird abgewiesen", async () => {
  __clearModerationForTests();
  assert.equal((await signal({ beleg: "" })).error, "moderation_beleg_required");
  assert.equal((await signal({ beleg: "kurz" })).error, "moderation_beleg_required");
  assert.equal((await signal({ subjekt: "" })).error, "moderation_subjekt_required");
  assert.equal((await signal({ art: "bauchgefuehl" })).error, "moderation_art_invalid");
});

test("ein gemeldetes Signal sperrt NICHTS — es wartet auf eine Entscheidung", async () => {
  __clearModerationForTests();
  const s = await signal();
  assert.equal(s.ok, true);
  assert.equal(s.signal.status, MOD_STATUS.offen);
  assert.equal(s.signal.entschiedenVon, null);
  assert.equal(s.signal.massnahme, null);
});

test("eine Entscheidung ohne Begruendung ist keine", async () => {
  __clearModerationForTests();
  const s = await signal();
  assert.equal((await entscheide(s.signal.id, { bewertung: "bestaetigt", begruendung: "klar" },
    { actor: ACTOR, env: ENV, nowMs: JETZT })).error, "moderation_begruendung_required");
  assert.equal((await entscheide(s.signal.id, { bewertung: "vielleicht", begruendung: "Ausfuehrliche Begruendung hier" },
    { actor: ACTOR, env: ENV, nowMs: JETZT })).error, "moderation_bewertung_invalid");
});

test("bestaetigen haelt fest und sagt ausdruecklich, dass es nicht sperrt", async () => {
  __clearModerationForTests();
  const s = await signal();
  const e = await entscheide(s.signal.id, {
    bewertung: "bestaetigt",
    begruendung: "Automatisierter Dauerlauf ohne erkennbare Nutzung, keine Reaktion auf Rueckfrage.",
    massnahme: "Sperre beantragt"
  }, { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(e.ok, true);
  assert.equal(e.after.status, MOD_STATUS.bestaetigt);
  assert.match(e.hinweis, /nicht.*sperr|getrennt/i);
});

test("Entwarnung ist ein vollwertiges Ergebnis, kein Wegklicken", async () => {
  __clearModerationForTests();
  const s = await signal();
  const e = await entscheide(s.signal.id, {
    bewertung: "entwarnung",
    begruendung: "Legitimer Stapellauf eines Firmenkontos, mit der Kundin geklaert."
  }, { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(e.after.status, MOD_STATUS.entwarnung);

  const nochmal = await entscheide(s.signal.id, { bewertung: "bestaetigt", begruendung: "Doch nicht so harmlos" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(nochmal.error, "moderation_already_decided");
});

test("in Pruefung bleibt entscheidbar", async () => {
  __clearModerationForTests();
  const s = await signal();
  await entscheide(s.signal.id, { bewertung: "in_pruefung", begruendung: "Rueckfrage an die Nutzerin laeuft" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  const spaeter = await entscheide(s.signal.id, { bewertung: "entwarnung", begruendung: "Nutzerin hat plausibel geantwortet" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(spaeter.ok, true);
});

test("die Warteschlange zeigt Offenes zuerst, darin nach Schwere", async () => {
  __clearModerationForTests();
  await signal({ subjekt: "u_niedrig", schwere: "niedrig" });
  await signal({ subjekt: "u_hoch", schwere: "hoch" });
  const mittel = await signal({ subjekt: "u_mittel", schwere: "mittel" });
  await entscheide(mittel.signal.id, { bewertung: "entwarnung", begruendung: "Fehlalarm, sauber geklaert" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });

  const liste = await listeSignale({ env: ENV });
  assert.equal(liste.signale[0].subjekt, "u_hoch");
  assert.equal(liste.signale[1].subjekt, "u_niedrig");
  assert.equal(liste.signale[2].subjekt, "u_mittel", "Entschiedenes faellt nach hinten");
  assert.equal(liste.offen, 2);
  assert.equal(liste.hoch, 1);
});
