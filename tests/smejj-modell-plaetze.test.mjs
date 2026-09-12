// smejj.com — Die vier Plätze der eigenen Modellfamilie.
//
// Betreiber-Auftrag 2026-09-06: vier eigene Modelle, die sich die Arbeit
// teilen — wie Claude das mit Fable, Opus, Sonnet und Haiku macht.
//
// Das Wesentliche am Vorbild ist nicht die Zahl der Modelle, sondern dass eine
// leichte Frage nicht das teuerste Modell beschäftigt. Diese Tests halten fest,
// dass ein Platz NUR von einer Version besetzt wird, die die Messung bestanden
// hat — am 06.09. war keine der drei gemessenen so weit.
import test from "node:test";
import assert from "node:assert/strict";
import { AUFNAHME, PLAETZE, belegePlaetze, darfBesetzen, modellFuerProfil } from "../src/shared/smejjModellPlaetze.js";

const GUT = { version: "smejj-9-9", note: 0.80, basisNote: 0.684, kritisch: 0 };

test("die vier Plaetze decken die vier Router-Profile ab", () => {
  assert.equal(PLAETZE.length, 4);
  const profile = PLAETZE.map((p) => p.profil).sort();
  assert.deepEqual(profile, ["coding", "default", "fast", "reasoning"]);
  const raenge = PLAETZE.map((p) => p.rang).sort();
  assert.deepEqual(raenge, [1, 2, 3, 4], "jeder Rang genau einmal");
});

test("die echte Lage vom 06.09.: alle vier Plaetze bleiben frei", () => {
  // smejj-1-1 und -1-2 lagen 17 bis 21 Punkte UNTER dem Basismodell. Ein Platz,
  // den sie besetzt haetten, haette die Antworten verschlechtert.
  const belegung = belegePlaetze([
    { version: "smejj-1-1", note: 0.7059, basisNote: 0.9118, kritisch: 4 },
    { version: "smejj-1-2", note: 0.5100, basisNote: 0.6840, kritisch: 132 }
  ]);
  assert.equal(belegung.length, 4);
  for (const b of belegung) {
    assert.equal(b.version, null, `${b.platz} haette frei bleiben muessen`);
    assert.match(b.grund, /Fremdmodell bleibt zustaendig/);
  }
});

test("wer schlechter ist als die Basis, bekommt keinen Platz", () => {
  assert.equal(darfBesetzen({ version: "x", note: 0.50, basisNote: 0.684, kritisch: 0 }).ok, false);
  assert.equal(darfBesetzen({ version: "x", note: 0.684, basisNote: 0.684, kritisch: 0 }).ok, false, "gleich gut genuegt nicht");
  assert.equal(darfBesetzen({ version: "x", note: 0.695, basisNote: 0.684, kritisch: 0 }).ok, false, "1,1 Punkte sind Messrauschen");
  assert.equal(darfBesetzen({ ...GUT }).ok, true);
});

test("ein einziger kritischer Fehler schliesst aus, egal wie gut die Note ist", () => {
  const fast = darfBesetzen({ version: "x", note: 0.99, basisNote: 0.684, kritisch: 1 });
  assert.equal(fast.ok, false);
  assert.match(fast.grund, /1 kritische Fehler/);
  assert.equal(AUFNAHME.maxKritisch, 0);
});

test("fail-closed: jede fehlende Zahl ist ein Nein", () => {
  for (const kaputt of [null, undefined, {}, { note: 0.9 }, { note: 0.9, basisNote: 0.6 },
    { note: "gut", basisNote: 0.6, kritisch: 0 }, { ...GUT, status: "ungueltig" }]) {
    assert.equal(darfBesetzen(kaputt).ok, false, `${JSON.stringify(kaputt)} haette abgelehnt werden muessen`);
  }
});

test("die beste Version bekommt den SCHWERSTEN Platz", () => {
  const belegung = belegePlaetze([
    { version: "mittel", note: 0.75, basisNote: 0.684, kritisch: 0 },
    { version: "beste", note: 0.90, basisNote: 0.684, kritisch: 0 },
    { version: "knapp", note: 0.71, basisNote: 0.684, kritisch: 0 }
  ]);
  const finde = (p) => belegung.find((b) => b.platz === p);
  assert.equal(finde("schwer").version, "beste", "Qualitaet zaehlt dort am meisten");
  assert.equal(finde("code").version, "mittel");
  assert.equal(finde("alltag").version, "knapp");
  assert.equal(finde("schnell").version, null, "der leichteste Platz bleibt frei, wenn die Versionen nicht reichen");
});

test("modellFuerProfil gibt null zurueck, solange kein Modell besteht — das heisst Fremdmodell", () => {
  const leer = belegePlaetze([]);
  for (const profil of ["fast", "default", "coding", "reasoning"]) {
    assert.equal(modellFuerProfil(profil, leer), null);
  }
  const belegt = belegePlaetze([GUT]);
  assert.equal(modellFuerProfil("reasoning", belegt), "smejj-9-9");
  assert.equal(modellFuerProfil("fast", belegt), null, "ein unbesetzter Platz bleibt beim Fremdmodell");
  assert.equal(modellFuerProfil("gibtesnicht", belegt), null);
});

test("eine ungueltig gekennzeichnete Bewertung besetzt nichts", () => {
  // Am 06.09. lag eine Bewertung mit 24 % im Register, die einen ABBRUCH mass
  // statt ein Modell. Sie wurde als ungueltig gekennzeichnet — und darf auch
  // dann keinen Platz besetzen, wenn ihre Zahlen zufaellig gut aussehen.
  const belegung = belegePlaetze([{ ...GUT, status: "ungueltig" }]);
  assert.ok(belegung.every((b) => b.version === null));
});

test("eine FEHLENDE Note wird als fehlend begruendet, nicht als 0 Prozent", () => {
  // Number(null) ist 0 und Number.isFinite(0) ist true. Wer so prueft, liest
  // eine fehlende Messung als "gemessen katastrophal". Der Ausgang ist hier
  // zufaellig derselbe (Ablehnung), die Begruendung aber falsch — und eine
  // falsche Begruendung schickt die Fehlersuche in die falsche Richtung.
  // Gefunden am 07.09. durch den gleichlautenden Fall im Mess-Anschluss.
  for (const kaputt of [
    { version: "x", note: null, basisNote: 0.68, kritisch: 0 },
    { version: "x", note: 0.9, basisNote: null, kritisch: 0 },
    { version: "x", note: 0.9, basisNote: 0.68, kritisch: null },
    { version: "x", note: "0.9", basisNote: 0.68, kritisch: 0 }
  ]) {
    const urteil = darfBesetzen(kaputt);
    assert.equal(urteil.ok, false);
    assert.match(urteil.grund, /fehlt/, `Begruendung war "${urteil.grund}" statt eines Hinweises auf die fehlende Zahl`);
  }
});

test("belegeAusRegister sortiert abgelehnte Versionen aus, bevor sie geprueft werden", async () => {
  const { belegeAusRegister, belegungText } = await import("../src/shared/smejjModellPlaetze.js");
  const register = {
    stable: "smejj-1-4",
    versionen: [
      { version: "smejj-1-2", status: "abgelehnt", note: 0.51, basisNote: 0.684, kritisch: 0 },
      { version: "smejj-1-3", status: "abgelehnt", note: 0.628, basisNote: 0.684, kritisch: 0 },
      { version: "smejj-1-4", status: "stable", note: 0.74, basisNote: 0.684, kritisch: 0 }
    ]
  };
  const belegung = belegeAusRegister(register);
  assert.equal(belegung.find((b) => b.platz === "schwer").version, "smejj-1-4");
  // Die abgelehnten duerfen nirgends auftauchen — auch nicht auf einem leichten Platz.
  for (const b of belegung) assert.notEqual(b.version, "smejj-1-2");
  assert.match(belegungText(belegung), /schwer: smejj-1-4/);
});

test("ein leerer Platz nennt den RICHTIGEN Grund — bestanden ist nicht gleich bestanden", async () => {
  const { belegeAusRegister } = await import("../src/shared/smejjModellPlaetze.js");
  // Lage A: noch gar nichts bestanden.
  const keins = belegeAusRegister({ versionen: [{ version: "a", status: "abgelehnt", note: 0.5, basisNote: 0.684, kritisch: 0 }] });
  assert.match(keins[0].grund, /noch keine eigene Version/);
  // Lage B: eine hat bestanden, sie reicht nur nicht fuer vier Plaetze. Hier
  // waere "keine hat bestanden" schlicht falsch und verschwiege einen Erfolg.
  const eine = belegeAusRegister({ versionen: [{ version: "b", status: "stable", note: 0.74, basisNote: 0.684, kritisch: 0 }] });
  assert.match(eine[0].grund, /reichen nicht fuer alle vier/);
  assert.equal(eine[3].version, "b");
});

test("ein Register ohne Versionen ergibt vier leere Plaetze statt eines Absturzes", async () => {
  const { belegeAusRegister } = await import("../src/shared/smejjModellPlaetze.js");
  for (const kaputt of [null, undefined, {}, { versionen: null }, { versionen: "nein" }]) {
    const b = belegeAusRegister(kaputt);
    assert.equal(b.length, 4);
    assert.ok(b.every((p) => p.version === null));
  }
});
