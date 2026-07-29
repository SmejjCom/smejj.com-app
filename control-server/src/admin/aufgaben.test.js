// smejj.com — Unit-Tests fuer die Betreiber-Aufgabenliste.
//
// Kern: nichts verschwindet spurlos, und ein Abschluss braucht ein Wort.
// Dieselbe Regel wie beim DSGVO-Vorgang — eine Aufgabe, die ohne Begruendung
// weg ist, laesst sich spaeter nicht von "vergessen" unterscheiden.
//
// Ausfuehren: node --test control-server/src/admin/aufgaben.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUFGABE_STATUS, __clearAufgabenForTests, erfasseAufgabe, listeAufgaben, setzeAufgabenStatus
} from "./aufgaben.js";

const ENV = {};
const ACTOR = { email: "chefin@example.de" };
const JETZT = Date.parse("2026-07-29T12:00:00.000Z");

test("eine Aufgabe braucht einen Titel, der etwas sagt", async () => {
  __clearAufgabenForTests();
  assert.equal((await erfasseAufgabe({ titel: "hm" }, { actor: ACTOR, env: ENV })).error, "aufgabe_titel_zu_kurz");
  assert.equal((await erfasseAufgabe({ titel: "Passkey einrichten" }, { actor: ACTOR, env: ENV })).ok, true);
});

test("ein unbekannter Bereich wird abgewiesen, nicht stillschweigend einsortiert", async () => {
  __clearAufgabenForTests();
  const e = await erfasseAufgabe({ titel: "Irgendetwas tun", bereich: "quatsch" }, { actor: ACTOR, env: ENV });
  assert.equal(e.ok, false);
  assert.equal(e.error, "aufgabe_bereich_unbekannt");
  assert.equal(Array.isArray(e.erlaubt), true, "die erlaubten Bereiche stehen dabei");
});

test("ABSCHLIESSEN BRAUCHT EINEN NACHWEIS", async () => {
  __clearAufgabenForTests();
  const neu = await erfasseAufgabe({ titel: "Zweiten Owner anlegen" }, { actor: ACTOR, env: ENV, jetztMs: JETZT });
  const ohne = await setzeAufgabenStatus(neu.aufgabe.id, "erledigt", { nachweis: "ok", actor: ACTOR, env: ENV });
  assert.equal(ohne.ok, false);
  assert.equal(ohne.error, "aufgabe_nachweis_noetig");

  const mit = await setzeAufgabenStatus(neu.aufgabe.id, "erledigt",
    { nachweis: "vize@example.de als Admin angelegt", actor: ACTOR, env: ENV });
  assert.equal(mit.ok, true);
  assert.equal(mit.after.status, AUFGABE_STATUS.erledigt);
  assert.equal(mit.after.abgeschlossenVon, "chefin@example.de");
});

test("auch Verwerfen braucht eine Begruendung", async () => {
  __clearAufgabenForTests();
  const neu = await erfasseAufgabe({ titel: "Alte Idee pruefen" }, { actor: ACTOR, env: ENV });
  assert.equal((await setzeAufgabenStatus(neu.aufgabe.id, "verworfen", { nachweis: "", actor: ACTOR, env: ENV })).error,
    "aufgabe_nachweis_noetig");
});

test("in Arbeit setzen braucht keinen Nachweis — es ist kein Abschluss", async () => {
  __clearAufgabenForTests();
  const neu = await erfasseAufgabe({ titel: "Speicher aufraeumen" }, { actor: ACTOR, env: ENV });
  const e = await setzeAufgabenStatus(neu.aufgabe.id, "in_arbeit", { actor: ACTOR, env: ENV });
  assert.equal(e.ok, true);
  assert.equal(e.after.status, AUFGABE_STATUS.inArbeit);
});

test("NICHTS WIRD GELOESCHT — erledigt ist ein Zustand", async () => {
  __clearAufgabenForTests();
  const neu = await erfasseAufgabe({ titel: "Etwas erledigen" }, { actor: ACTOR, env: ENV });
  await setzeAufgabenStatus(neu.aufgabe.id, "erledigt", { nachweis: "ist getan worden", actor: ACTOR, env: ENV });
  const liste = await listeAufgaben({ env: ENV });
  assert.equal(liste.total, 1, "die Aufgabe bleibt in der Liste");
  assert.equal(liste.offen, 0);
  assert.equal(liste.aufgaben[0].nachweis, "ist getan worden");
});

test("offene zuerst, darin die dringendsten", async () => {
  __clearAufgabenForTests();
  await erfasseAufgabe({ titel: "Ohne Frist" }, { actor: ACTOR, env: ENV, jetztMs: JETZT });
  await erfasseAufgabe({ titel: "Spaete Frist", faelligAm: "2026-12-01" }, { actor: ACTOR, env: ENV, jetztMs: JETZT });
  await erfasseAufgabe({ titel: "Ueberfaellig", faelligAm: "2026-07-01" }, { actor: ACTOR, env: ENV, jetztMs: JETZT });
  const fertig = await erfasseAufgabe({ titel: "Schon erledigt" }, { actor: ACTOR, env: ENV, jetztMs: JETZT });
  await setzeAufgabenStatus(fertig.aufgabe.id, "erledigt", { nachweis: "war schnell", actor: ACTOR, env: ENV });

  const liste = await listeAufgaben({ env: ENV, jetztMs: JETZT });
  assert.equal(liste.aufgaben[0].titel, "Ueberfaellig");
  assert.equal(liste.aufgaben[liste.aufgaben.length - 1].titel, "Schon erledigt");
  assert.equal(liste.offen, 3);
  assert.equal(liste.ueberfaellig, 1);
});

test("eine Aufgabe ohne Zustaendige wird gezaehlt — sonst macht sie niemand", async () => {
  __clearAufgabenForTests();
  await erfasseAufgabe({ titel: "Niemand zustaendig" }, { actor: ACTOR, env: ENV });
  await erfasseAufgabe({ titel: "Mit Zustaendiger", zustaendig: "vize@example.de" }, { actor: ACTOR, env: ENV });
  const liste = await listeAufgaben({ env: ENV });
  assert.equal(liste.ohneZustaendige, 1);
});

test("eine unbekannte Aufgabe und ein Nicht-Wechsel werden unterschieden", async () => {
  __clearAufgabenForTests();
  assert.equal((await setzeAufgabenStatus("auf_gibtsnicht", "erledigt", { nachweis: "egal was", actor: ACTOR, env: ENV })).error,
    "aufgabe_not_found");
  const neu = await erfasseAufgabe({ titel: "Schon offen" }, { actor: ACTOR, env: ENV });
  assert.equal((await setzeAufgabenStatus(neu.aufgabe.id, "offen", { actor: ACTOR, env: ENV })).error, "aufgabe_no_change");
});

test("eine ungueltige Frist wird abgewiesen", async () => {
  __clearAufgabenForTests();
  const e = await erfasseAufgabe({ titel: "Mit kaputter Frist", faelligAm: "nicht-ein-datum" }, { actor: ACTOR, env: ENV });
  assert.equal(e.ok, false);
  assert.equal(e.error, "aufgabe_frist_ungueltig");
});
