// smejj.com — Werkstatt Station 2+4: der Baumeister.
//
// Geprueft wird das SICHERHEITSMODELL, nicht die Bequemlichkeit: genau eine
// Aufgabe, dringend vor Ausbau, Nicht-Automatisierbares bleibt liegen, und
// die Freigabe-Karte sagt die Wahrheit ueber den Tor-Zustand.
import test from "node:test";
import assert from "node:assert/strict";

import { waehleAufgabe, alsAuftrag } from "../scripts/werkstatt/baue-auftrag.mjs";
import { baueKarte } from "../scripts/werkstatt/freigabe-karte.mjs";

const aufgabe = (betrifft, stufe, titel = betrifft) => ({ betrifft, stufe, titel, quelle: "Test", befund: "B" });

test("Wahl: dringend schlaegt Ausbau — ein roter Vorfall vor jeder Erweiterung", () => {
  const gewaehlt = waehleAufgabe([
    aufgabe("ausbau-x", 5),
    aufgabe("kaputt-y", 1),
    aufgabe("test-z", 2)
  ]);
  assert.equal(gewaehlt.betrifft, "kaputt-y");
});

test("Wahl: Nicht-Automatisierbares wird uebersprungen, nicht gebaut", () => {
  const gewaehlt = waehleAufgabe([
    aufgabe("training-loop", 1),   // Betreiber-Entscheidung — TABU fuer die Nacht
    aufgabe("email-zustellung", 2),// Portal-Sache — TABU
    aufgabe("echte-arbeit", 5)
  ]);
  assert.equal(gewaehlt.betrifft, "echte-arbeit",
    "die Routine darf keine Betreiber-Entscheidungen und keine Portal-Arbeit anfassen");
});

test("Wahl: leeres Backlog ist ein Ergebnis, kein Absturz", () => {
  assert.equal(waehleAufgabe([]), null);
  assert.equal(waehleAufgabe([aufgabe("training-loop", 1)]), null);
});

test("Auftrag: traegt alle Schutzregeln und ist in sich geschlossen", () => {
  const text = alsAuftrag(aufgabe("rag-regelfragen", 2, "Roter Test: rag-regelfragen"), {
    gesammeltAm: "2026-08-13T10:00:00.000Z", branchDatum: "2026-08-13"
  });
  for (const pflicht of [
    "GENAU diese eine Aufgabe",
    "feature/werkstatt-2026-08-13",
    "Niemals auf main",
    "Start-Lock",
    "Security-Lock",
    "Keine neuen Dienste",
    "npm test",
    "werkstatt:tor",
    "NEUER Test",
    "2026-08-12-ampel-ehrlich-messen",
    "freigabe-karte.mjs"
  ]) {
    assert.ok(text.includes(pflicht), `Auftrag ohne Pflichtteil: "${pflicht}"`);
  }
});

test("Karte: offenes Tor heisst BEREIT, zues Tor heisst NICHT MERGEN", () => {
  const offen = baueKarte({ branch: "feature/werkstatt-x", aufgabeTitel: "T", torOffen: true });
  assert.equal(offen.status, "BEREIT ZUM MERGE");
  assert.match(offen.koerper, /OFFEN — alle Sperren/);

  const zu = baueKarte({ branch: "feature/werkstatt-x", aufgabeTitel: "T", torOffen: false });
  assert.equal(zu.status, "TOR ZU — NICHT MERGEN");
  assert.match(zu.koerper, /ZU — siehe Protokoll/);
});

test("Karte: ein gescheiterter Bau wird als GESCHEITERT ausgewiesen — nie versteckt", () => {
  const k = baueKarte({ branch: "feature/werkstatt-x", aufgabeTitel: "T", torOffen: true, gescheitert: "Test blieb rot" });
  assert.equal(k.status, "GESCHEITERT");
  assert.match(k.titel, /GESCHEITERT/);
  assert.match(k.koerper, /Warum gescheitert: Test blieb rot/);
});

test("Karte: der Mensch entscheidet — steht woertlich drin", () => {
  const k = baueKarte({ branch: "feature/werkstatt-x", torOffen: true });
  assert.match(k.koerper, /Der Mensch entscheidet/);
  assert.match(k.koerper, /ohne Klick bleibt alles auf diesem Branch/);
});
