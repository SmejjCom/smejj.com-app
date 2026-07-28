// smejj.com — Zusicherungen fuer das Offline-Verhalten.
//
// Hintergrund: Am 2026-07-28 wurde das Offline-Verhalten zum ersten Mal
// GEMESSEN statt aus dem Quelltext geschlossen (Chromium, Netz per
// DevTools-Protokoll hart abgeschaltet). Die Shell lud in 99 ms aus dem
// Cache — aber genau im Moment des Netzwechsels warf die Statusanzeige
// "TypeError: Cannot read properties of undefined (reading 'status')".
//
// Ursache: window.addEventListener("offline", refreshLocalWorkspaceStatus)
// uebergibt der Funktion das EVENT als erstes Argument. Die Funktion erwartet
// dort aber ihre Abhaengigkeiten (deps) und griff auf deps.workspace zu.
// Dieselbe Falle gilt fuer jede Funktion, die deps erwartet und direkt als
// Listener oder Callback uebergeben wird.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspaceSurface = fs.readFileSync("public/local-workspace-surface.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

test("online/offline-Listener reichen deps durch, nicht das Event", () => {
  // Bis zum Zeilenende lesen, nicht bis zur ersten Klammer — sonst endet der
  // Treffer schon am "()" der Pfeilfunktion und der Test schlaegt falsch an.
  const listener = [...workspaceSurface.matchAll(
    /window\.addEventListener\(\s*"(online|offline)"\s*,\s*(.+)$/gm
  )];
  assert.ok(listener.length >= 2, "online- und offline-Listener erwartet");
  for (const [treffer, ereignis, handler] of listener) {
    assert.match(
      handler.trim(),
      /^\(\s*\)\s*=>/,
      `Listener fuer "${ereignis}" uebergibt die Funktion direkt (${treffer.trim()}). ` +
      "Der Browser reicht dann das Event als deps herein und deps.workspace ist undefined. " +
      "Erwartet: () => refreshLocalWorkspaceStatus(deps)."
    );
  }
});

test("refreshLocalWorkspaceStatus wird nirgends ohne Argument aufgerufen", () => {
  assert.doesNotMatch(
    workspaceSurface,
    /refreshLocalWorkspaceStatus\(\s*\)/,
    "Aufruf ohne deps — die Funktion greift auf deps.workspace zu und wuerde werfen."
  );
});

test("Service Worker haelt die Shell offline lieferbar", () => {
  // Der Rueckfall auf "/" ist das, was die Shell offline ueberhaupt erst
  // anzeigbar macht; ohne ihn liefe der Browser in einen Netzfehler.
  assert.match(sw, /caches\.match\("\/"\)/);
  assert.match(sw, /const SHELL = \[/);
  assert.ok(sw.includes('"/"'), "die Startseite selbst muss im Precache liegen");
});
