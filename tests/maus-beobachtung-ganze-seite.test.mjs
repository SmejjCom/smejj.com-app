// smejj.com — die Maus sieht die GANZE Seite, nicht nur den Bildausschnitt.
//
// DER BEFUND (2026-08-17, aus einer echten Aufnahme): Die Maus sollte auf der
// Hilfeseite den Impressum-Link anklicken und scheiterte. Ihre eigene
// Begruendung im Protokoll:
//
//   "Impressum-Link ist in den sichtbaren Elementen nicht vorhanden,
//    vermutlich weiter unten auf der Seite; scrollen nach unten"
//
// Der Beobachter verwarf alles ausserhalb des Fensters. Ein Link im
// Fussbereich existierte fuer die Maus nicht — sie musste blind suchen und
// verbrauchte dabei ihr Schrittbudget.
//
// Beim Beheben lauerte gleich die naechste Falle: die Liste wird gekappt, und
// zwar frueher hinten. Auf einer Seite mit vielen Elementen haette das erneut
// zuerst den Fussbereich getroffen — dieselbe Luecke mit anderer Ursache.
import test from "node:test";
import assert from "node:assert/strict";
import { buildObservation, waehleElemente, OBSERVATION_MAX_ELEMENTS } from "../workers/maus-engine/observer.mjs";

// Eine Seite mit Kopf, viel Mitte und einem Impressum-Link ganz unten —
// so wie smejj.com/hilfe.html.
function seiteMit(anzahlMitte, { impressumImBild = false } = {}) {
  const elemente = [
    { tag: "a", role: "link", text: "Start", href: "/", x: 10, y: 10 },
    ...Array.from({ length: anzahlMitte }, (_, i) => ({
      tag: "a", role: "link", text: `Absatz ${i}`, href: `/a${i}`, x: 10, y: 200 + i,
      ausserhalbBild: true
    })),
    {
      tag: "a", role: "link", text: "Impressum", href: "/impressum.html", x: 10, y: 9000,
      ...(impressumImBild ? {} : { ausserhalbBild: true })
    }
  ];
  return {
    url() { return "https://smejj.com/hilfe.html"; },
    async title() { return "Hilfe"; },
    async evaluate() { return { text: "Hilfe", elements: elemente }; }
  };
}

test("ein Element ausserhalb des Fensters kommt mit — und ist als solches erkennbar", async () => {
  const b = await buildObservation(seiteMit(3));
  const impressum = b.elements.find((e) => e.text === "Impressum");
  assert.ok(impressum, "der Impressum-Link fehlt in der Beobachtung");
  assert.equal(impressum.ausserhalbBild, true);
  // Sichtbares traegt die Markierung NICHT — sonst waere sie kein Hinweis mehr.
  assert.equal(b.elements.find((e) => e.text === "Start").ausserhalbBild, undefined);
});

test("der Fussbereich ueberlebt die Kappung", async () => {
  // Mehr Elemente als die Obergrenze: es MUSS gekappt werden.
  const b = await buildObservation(seiteMit(OBSERVATION_MAX_ELEMENTS * 3));
  assert.ok(b.elements.length <= OBSERVATION_MAX_ELEMENTS);
  assert.ok(
    b.elements.some((e) => e.text === "Impressum"),
    "der letzte Link wurde weggekappt — genau der Fehler, der behoben werden sollte"
  );
  // Und der Kopf ebenfalls: beides zusammen ist der Sinn der Mitte-Kappung.
  assert.ok(b.elements.some((e) => e.text === "Start"));
});

test("waehleElemente nimmt aus der Mitte, deterministisch", () => {
  const liste = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual(waehleElemente(liste, 4), [1, 2, 9, 10]);
  assert.deepEqual(waehleElemente(liste, 5), [1, 2, 3, 9, 10], "bei ungerade bekommt der Kopf das Mehr");
  assert.deepEqual(waehleElemente(liste, 10), liste, "nichts zu kappen");
  assert.deepEqual(waehleElemente(liste, 20), liste);
  assert.deepEqual(waehleElemente(liste, 0), []);
  assert.deepEqual(waehleElemente(null, 3), []);
  // Zweimal aufgerufen dasselbe Ergebnis — der Planer darf sich darauf verlassen.
  assert.deepEqual(waehleElemente(liste, 4), waehleElemente(liste, 4));
});

test("Passwortfelder bleiben maskiert, auch ausserhalb des Fensters", async () => {
  const seite = {
    url() { return "https://beispiel.test/"; },
    async title() { return "t"; },
    async evaluate() {
      return { text: "", elements: [{ tag: "input", type: "password", name: "pw", x: 1, y: 9000, ausserhalbBild: true }] };
    }
  };
  const b = await buildObservation(seite);
  assert.equal(b.elements[0].masked, true);
  assert.equal(b.elements[0].text, "***");
  assert.equal(b.elements[0].ausserhalbBild, true);
});
