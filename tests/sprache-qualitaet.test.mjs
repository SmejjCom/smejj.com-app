// smejj.com — Angelina-Autopilot (Nr. 31): der Sprach-Waechter.
//
// Zu diesem Autopiloten gab es bis 2026-08-13 KEINEN Code — nur einen
// Registry-Eintrag, der eine "Satz- & Prompt-Synthesizer Engine im
// 24/7-Dauerbetrieb" versprach. Diese Tests halten fest, was er wirklich
// kann: falsch geschriebene SICHTBARE Texte finden, ohne bei Pfaden und
// Kennungen Fehlalarm zu geben. Ein Waechter mit Fehlalarm wird ignoriert.
import test from "node:test";
import assert from "node:assert/strict";

import { pruefeSprache, pruefeSpracheAlle } from "../control-server/src/autopilots/spracheQualitaetAutopilot.js";

test("findet Ersatzschreibung in sichtbarem Text", () => {
  const { funde } = pruefeSprache("seite.html", "<h1>Willkommen zurueck</h1>");
  assert.equal(funde.length, 1);
  assert.equal(funde[0].falsch, "zurueck");
  assert.equal(funde[0].richtig, "zurück");
});

test("KEIN Fehlalarm bei Pfaden, Attributen und Skripten", () => {
  // Genau hier waere ein Waechter wertlos geworden: In Dateinamen und
  // Kennungen ist die Ersatzschreibung richtig.
  const quellen = [
    '<a href="/zurueck-zur-uebersicht">Zurück</a>',
    '<img src="fuer-alle.png" alt="Für alle">',
    '<script>const zurueck = 1;</script>',
    '<div data-ziel="ueber-uns"></div>'
  ];
  for (const q of quellen) {
    assert.equal(pruefeSprache("x.html", q).funde.length, 0, `Fehlalarm bei: ${q}`);
  }
});

test("richtige Schreibweise im selben Text entwaffnet den Fund", () => {
  // Eine Zeile, die beide Formen zeigt (etwa eine Erklaerung), ist kein Fehler.
  const { funde } = pruefeSprache("hilfe.html", "<p>Schreibe zurück statt zurueck</p>");
  assert.equal(funde.length, 0);
});

test("gesunde Seite ergibt keine Funde", () => {
  const { funde } = pruefeSprache("gut.html", "<p>Willkommen zurück. Wir können das für Sie prüfen.</p>");
  assert.equal(funde.length, 0);
});

test("Zusammenfassung zaehlt Dateien und Funde getrennt", () => {
  const bericht = pruefeSpracheAlle([
    { path: "a.html", content: "<p>fuer</p><p>ueber</p>" },
    { path: "b.html", content: "<p>alles gut</p>" },
    { path: "c.html", content: "<p>koennen</p>" }
  ]);
  assert.equal(bericht.geprueft, 3);
  assert.equal(bericht.dateienMitFunden, 2);
  assert.equal(bericht.funde, 3);
});

test("die echten Seiten dieses Projekts werden geprueft", async () => {
  const { sammleSeiten, laufSprachQualitaet } = await import("../control-server/src/autopilots/autopilotLaeufer.js");
  const seiten = sammleSeiten();
  assert.ok(seiten.length > 10, `nur ${seiten.length} Seiten gefunden`);
  const lauf = laufSprachQualitaet(seiten);
  assert.equal(lauf.ok, true);
  assert.match(lauf.meldung, /\d+ Seiten geprüft/);
});

test("ENTSCHEIDEND: ohne Seiten ist der Waechter ROT, nicht 'nichts gefunden'", async () => {
  // Der gefaehrlichste Fall: Findet der Sammler nichts (falscher Pfad, Ordner
  // fehlt im Abbild), duerfte "0 Funde" nie wie "alles sauber" aussehen.
  const { laufSprachQualitaet } = await import("../control-server/src/autopilots/autopilotLaeufer.js");
  const leer = laufSprachQualitaet([]);
  assert.equal(leer.ok, false, "keine Seiten zu pruefen ist ein Ausfall, kein Erfolg");
  assert.match(leer.meldung, /Keine Seiten/i);

  const sauber = laufSprachQualitaet([{ path: "gut.html", content: "<p>Alles gut geschrieben.</p>" }]);
  assert.equal(sauber.ok, true);
  assert.match(sauber.meldung, /keine falsch geschriebenen/);
});
