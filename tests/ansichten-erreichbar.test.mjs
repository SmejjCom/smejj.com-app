// smejj.com — jede Ansicht muss eine Tuer haben.
//
// Der Vorfall dahinter (gemessen 2026-08-15): die Ansicht "Gedaechtnis"
// (#memory, /memory) war fertig gebaut, verdrahtet und wurde beim Start sogar
// mit Daten gefuellt (app.js: $("#memoryText").value = state.memory) — aber es
// gab in der ganzen Oberflaeche KEINEN Knopf, der hinfuehrt. Wer nicht /memory
// in die Adresszeile tippte, hat die Funktion nie gesehen.
//
// Das ist dieselbe Klasse wie die Akte-Aktionsleiste: Server fertig, Ansicht
// fertig, Vier-Augen-Prinzip fertig, alle Ampeln gruen — und trotzdem acht
// Aktionen monatelang unerreichbar, weil die Bedienleiste an einen Anker band,
// den keine Ansicht zeichnete.
//
// Die Merkregel aus dem Gedaechtnis lautet: nie fragen "gibt es X?", sondern
// ZAEHLEN "an wie vielen Stellen haengt X?". Genau das tut dieser Test.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync("public/index.html", "utf8");

// Ansichten, die bewusst keinen Knopf haben duerfen — mit Begruendung, damit
// niemand die Liste stillschweigend verlaengert.
const OHNE_TUER_ERLAUBT = new Map([
  ["error", "Fehlerseite: erscheint von selbst, wenn eine Adresse nicht aufgeht. Ein Knopf dorthin waere sinnlos."],
  ["offline", "Offline-Seite: zeigt der Service Worker, wenn kein Netz da ist. Es gibt nichts anzuklicken."],
  // OFFEN, nicht erledigt (2026-08-15): Rumpf ohne eigene Funktion — eine
  // Ueberschrift, der feste Text "Coding bereit." und zwei Knoepfe, die beide
  // nur in ANDERE Ansichten springen. Er stammt aus der Zeit vor der Ansicht
  // "code" ("Programmieren"), die alles davon besser kann. Eine Tuer dorthin
  // waere schlechter als keine: sie fuehrt in einen leeren Raum. Entweder mit
  // der Automatisierungs-Oberflaeche fuellen oder mit Betreiber-Freigabe
  // entfernen — beides gehoert besprochen, nicht nebenbei entschieden.
  ["smejjClaw", "Unfertiger Rumpf, siehe Kommentar. Absichtlich ohne Tuer, bis entschieden ist, was daraus wird."]
]);

/** @returns {string[]} die id jedes <section class="view"> im Markup */
function ansichten() {
  return [...index.matchAll(/<section id="([\w-]+)" class="view/g)].map((m) => m[1]);
}

/** @returns {Set<string>} jede Ansicht, zu der irgendein Knopf fuehrt */
function erreichbare() {
  const ziele = new Set();
  for (const [, ziel] of index.matchAll(/data-view="([\w-]+)"/g)) ziele.add(ziel);
  for (const [, ziel] of index.matchAll(/data-jump="([\w-]+)"/g)) ziele.add(ziel);
  return ziele;
}

test("jede Ansicht ist ueber mindestens einen Knopf erreichbar", () => {
  const tueren = erreichbare();
  const stumm = ansichten().filter((v) => !tueren.has(v) && !OHNE_TUER_ERLAUBT.has(v));
  assert.deepEqual(
    stumm,
    [],
    `Diese Ansichten existieren im Markup, aber kein Knopf fuehrt hin: ${stumm.join(", ")}.\n` +
      `Entweder einen data-jump-Knopf ergaenzen (er wirkt ohne JS-Aenderung, app.js\n` +
      `bindet [data-jump] generisch) oder die Ansicht mit Begruendung in\n` +
      `OHNE_TUER_ERLAUBT eintragen. Nicht einfach die Liste verlaengern.`
  );
});

test("die Gedaechtnis-Ansicht bleibt erreichbar", () => {
  // Eigener Test statt nur ueber die Schleife oben: diese Ansicht ist der
  // konkrete Vorfall, und ein benannter Test sagt beim Fehlschlag sofort,
  // worum es geht.
  assert.match(
    index,
    /data-jump="memory"/,
    'Der Knopf zur Gedaechtnis-Ansicht ist weg. Sie war am 2026-08-15 schon einmal ' +
      "fertig und unerreichbar — nicht noch einmal."
  );
});

test("die erlaubten Ausnahmen existieren wirklich", () => {
  // Eine Ausnahmeliste, die auf nichts mehr zeigt, ist ein Versteck: sie
  // wuerde spaeter eine neue Ansicht gleichen Namens still durchwinken.
  const vorhanden = new Set(ansichten());
  for (const [id, grund] of OHNE_TUER_ERLAUBT) {
    assert.ok(
      vorhanden.has(id),
      `OHNE_TUER_ERLAUBT nennt "${id}" (${grund}), aber diese Ansicht gibt es nicht mehr. Eintrag entfernen.`
    );
  }
});

test("kein Knopf zeigt auf eine Ansicht, die es nicht gibt", () => {
  // Die Gegenrichtung. icon-nutzung.js erwartete am 2026-08-15 einen
  // .nav-button[data-view="smejjClaw"], den index.html nicht hatte — solche
  // Leerzeiger findet man sonst erst, wenn ein Nutzer ins Nichts klickt.
  const vorhanden = new Set(ansichten());
  // data-jump wird auch fuer Ziele ausserhalb der Ansichtenliste benutzt
  // (z. B. Overlays); geprueft wird darum nur data-view, das immer eine
  // Ansicht meint.
  const ziele = [...index.matchAll(/data-view="([\w-]+)"/g)].map((m) => m[1]);
  const leer = [...new Set(ziele)].filter((z) => !vorhanden.has(z));
  assert.deepEqual(leer, [], `Diese Knoepfe zeigen ins Leere: ${leer.join(", ")}`);
});


test("jede App-Route steht auch in der 404-Weiche", () => {
  // GitHub Pages liefert fuer /pfad die 404.html; nur Routen aus deren
  // ROUTES-Liste werden zur App umgeleitet. Fehlt eine, zeigt ihr
  // Direktaufruf die echte 404-Seite — genau so blieben /papierkorb und
  // /bereiche am 2026-08-15 unerreichbar, obwohl die Ansichten fertig waren.
  const routen = fs.readFileSync("public/view-routes.js", "utf8");
  const weiche = fs.readFileSync("public/404.html", "utf8");
  const pfade = [...routen.matchAll(/^\s+\w+: "(\/[\w-]+)",?$/gm)].map((m) => m[1]);
  const fehlend = pfade.filter((p) => p !== "/" && !weiche.includes(`"${p}"`));
  assert.deepEqual(fehlend, [], `Diese Routen fehlen in public/404.html ROUTES: ${fehlend.join(", ")}`);
});
