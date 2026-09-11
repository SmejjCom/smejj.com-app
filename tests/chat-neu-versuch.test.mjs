// smejj.com — "Neu generieren" darf den Verlauf nicht verlieren, wenn das
// erneute Senden scheitert.
//
// DER FALL, live gemessen 2026-09-11: Ein Klick auf "Neu generieren" entfernte
// SOFORT die Frage und alles darunter und sendete erst danach erneut. Bei
// abgelaufener Anmeldung kam nichts zurueck — es blieb ein LEERER Antwortblock
// mit voller Aktionsleiste und ohne Versions-Navigation. Frage, Antwort und
// jede weitere Nachricht waren weg. Dasselbe bei jeder Netzunterbrechung.
import assert from "node:assert/strict";
import test from "node:test";
import { wendeAn, holeZurueck, entferneEndgueltig, neueAntwortDa, wartendeKnoten } from "../public/chat-neu-versuch.js";

// Ein winziges DOM, das nur kann, was das Modul braucht.
function machDom(antworten = 1) {
  const knoten = [];
  const dok = {
    querySelectorAll: (auswahl) => {
      assert.equal(auswahl, "article.entry.assistant");
      return knoten.filter((k) => k.istAntwort && !k.entfernt);
    }
  };
  const mach = ({ istAntwort = false, text = "" } = {}) => {
    const k = { istAntwort, hidden: false, entfernt: false, textContent: text, remove() { this.entfernt = true; } };
    knoten.push(k);
    return k;
  };
  for (let i = 0; i < antworten; i++) mach({ istAntwort: true, text: `Antwort ${i}` });
  return { dok, mach, knoten };
}

test("scheitert das Senden, kommt alles zurueck", () => {
  const { dok, knoten } = machDom(2);
  const ok = wendeAn({ text: "Frage", entfernen: knoten }, () => false, { dok });
  assert.equal(ok, false);
  assert.ok(knoten.every((k) => !k.hidden), "Knoten bleiben versteckt");
  assert.ok(knoten.every((k) => !k.entfernt), "Knoten wurden entfernt statt zurueckgeholt");
  assert.equal(wartendeKnoten(), 0);
});

test("waehrend des Sendens ist nichts geloescht, nur versteckt", () => {
  const { dok, knoten } = machDom(2);
  const ok = wendeAn({ text: "Frage", entfernen: knoten }, () => true, { dok, frist: 60_000 });
  assert.equal(ok, true);
  assert.ok(knoten.every((k) => k.hidden), "Knoten sind nicht versteckt");
  assert.ok(knoten.every((k) => !k.entfernt), "Knoten wurden geloescht — genau der Fehler");
  entferneEndgueltig();
});

test("keine neue Antwort nach der Frist: der Verlauf kehrt zurueck", async () => {
  const { dok, knoten } = machDom(2);
  wendeAn({ text: "Frage", entfernen: knoten }, () => true, { dok, frist: 20 });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(knoten.every((k) => !k.hidden), "der Verlauf blieb verschwunden");
  assert.ok(knoten.every((k) => !k.entfernt));
});

test("kommt eine neue Antwort, verschwinden die alten Knoten", async () => {
  const { dok, mach, knoten } = machDom(2);
  wendeAn({ text: "Frage", entfernen: [...knoten] }, () => true, { dok, frist: 20 });
  mach({ istAntwort: true, text: "Die frische Antwort" });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(knoten.slice(0, 2).every((k) => k.entfernt), "die ersetzten Knoten blieben stehen");
});

test("eine LEERE neue Antwort zaehlt nicht als Ersatz", async () => {
  const { dok, mach, knoten } = machDom(1);
  wendeAn({ text: "Frage", entfernen: [...knoten] }, () => true, { dok, frist: 20 });
  mach({ istAntwort: true, text: "   " });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(knoten.every((k) => !k.hidden), "der leere Block galt als Ersatz — genau der Live-Fehler");
});

test("neueAntwortDa uebersieht Antworten, die es vorher schon gab", () => {
  const { dok, knoten } = machDom(3);
  wendeAn({ text: "Frage", entfernen: [knoten[0]] }, () => true, { dok, frist: 60_000 });
  assert.equal(neueAntwortDa(dok), false, "alte Antworten wurden als neu gezaehlt");
  holeZurueck();
});

test("ein zweiter Versuch laesst den ersten nicht zurueckkehren", () => {
  const { dok, knoten } = machDom(2);
  wendeAn({ text: "A", entfernen: [knoten[0]] }, () => true, { dok, frist: 60_000 });
  wendeAn({ text: "B", entfernen: [knoten[1]] }, () => true, { dok, frist: 60_000 });
  assert.ok(knoten[0].entfernt, "der erste Stand kann spaeter ueberraschend auftauchen");
  entferneEndgueltig();
});
