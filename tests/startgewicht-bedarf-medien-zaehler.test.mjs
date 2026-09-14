// smejj.com — zwei Module, die die Startseite nicht mehr ungefragt laedt.
//
// Gemessen 2026-09-14 (Web-Vitals, Kaltstart, 99 Antworten, 302 KB gegen ein
// Budget von 300): chat-store.js holte chat-medien.js bei JEDEM Start (7,5 KB),
// profile-dock.js den Icon-Zaehler beim ERSTEN Druck irgendwohin (3,9 KB) —
// auch beim Klick ins Schreibfeld. Beide sind nur bei Bedarf noetig: der
// Parker, wenn ein wiederhergestellter Chat eine Serveradresse traegt; der
// Zaehler, wenn ein Bedienelement gedrueckt wird. Der Waechter
// check-startgewicht.mjs sieht dynamische Importe bewusst nicht — deshalb
// bewacht dieser Test die beiden Stellen im Quelltext.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const store = fs.readFileSync("public/chat-store.js", "utf8");
const dock = fs.readFileSync("public/profile-dock.js", "utf8");

test("chat-store.js holt chat-medien.js nicht mehr beim Modulstart", () => {
  // Ohne Einrueckung am Zeilenanfang = Modulebene: genau so stand der Import
  // bis zum 14.09. und lief bei jedem Laden der Startseite los.
  assert.doesNotMatch(store, /^import\("\.\/chat-medien\.js[^\n]*\.then\(/m,
    "ein import() auf Modulebene laedt chat-medien.js bei jedem Start");
  assert.match(store, /async function parkerBereit\(messages\)/);
  // Geholt wird nur, wenn eine Nachricht wirklich eine Serveradresse traegt.
  assert.match(store, /MEDIEN_ADRESSE\.test\(String\(m\?\.html \|\| ""\)\)/);
  // Die Nachlade-Form bleibt — die Selbstheilungs-Tests schreiben genau sie um.
  assert.match(store, /import\("\.\/chat-medien\.js\?v=5"\)/);
});

test("die Wiederherstellung wartet auf den Parker, BEVOR sie zeichnet", () => {
  // Sonst kaeme ein ungeparktes <img> in die Seite — der Konsolenfehler vom
  // 09.09. ("img-src") waere zurueck.
  for (const kopf of ["export async function openChat(id)", "async function restoreOnBoot()"]) {
    const i = store.indexOf(kopf);
    assert.ok(i >= 0, kopf);
    const rumpf = store.slice(i, store.indexOf("\n}\n", i));
    assert.match(rumpf, /await parkerBereit\(chat\.messages\);\s*\n\s*renderEntriesInto\(log, chat\.messages/, kopf);
  }
});

test("profile-dock.js holt den Icon-Zaehler erst bei einem Bedienelement", () => {
  assert.doesNotMatch(dock, /addEventListener\("pointerdown", \(\) => import\("\.\/icon-nutzung\.js/,
    "ein pointerdown irgendwohin (auch ins Schreibfeld) darf den Zaehler nicht holen");
  assert.match(dock, /closest\?\.\("button, a, \[role='button'\]/);
  // Die Nachlade-Form bleibt: fail-safe, relativer Pfad, eigene Cache-Marke.
  assert.match(dock, /import\("\.\/icon-nutzung\.js\?v=1"\)\.catch\(\(\) => \{\}\)/);
});

test("die Auslieferungs-Zwillinge unter public/assets/ tragen denselben Stand", () => {
  // Der Browser bekommt /assets/…; der Waechter misst die Kopie. Laufen die
  // beiden auseinander, ist der Fix nur im Repo, nicht auf der Seite.
  assert.equal(fs.readFileSync("public/assets/chat-store.js", "utf8"), store);
  assert.equal(fs.readFileSync("public/assets/profile-dock.js", "utf8"), dock);
});
