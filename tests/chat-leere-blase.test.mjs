// smejj.com — eine Rueckfrage darf keine leere Antwort-Blase hinterlassen.
//
// DER FALL, live gemessen 2026-09-11: Schickt der Server statt einer Antwort
// eine Rueckfrage ("Was genau soll die Antwort enthalten?"), legt chat-stream.js
// dafuer eine eigene Karte HINTER den Antwort-Knoten — richtig so, denn vor der
// Rueckfrage kann Text stehen. Kam aber kein Text, blieb der Antwort-Knoten
// LEER stehen: eine Luecke im Verlauf mit voller Aktionsleiste darunter
// (Kopieren, Vorlesen, Hilfreich, Nicht hilfreich) fuer Text, den es nicht gibt.
// Vorlesen einer leeren Antwort tut dann nichts — und "nichts passiert" sieht
// aus wie ein kaputter Knopf.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strom = lies("public/ai/chat-stream.js");
const aktionen = lies("public/chat-actions.js");

test("der Strom merkt sich, dass eine Rueckfrage gezeigt wurde", () => {
  assert.match(strom, /let frageGezeigt = false;/);
  assert.match(strom, /if \(zeigeFrage\(output, payload\.smejj_frage\)\) frageGezeigt = true;/);
});

test("bleibt der Antwort-Knoten leer, verschwindet er", () => {
  assert.match(strom, /if \(frageGezeigt && !output\.textContent\.trim\(\)\) \{ output\.remove\(\); return; \}/);
});

test("die Pruefung kommt NACH der Arbeitsnotiz", () => {
  // Sonst faellt eine Antwort weg, die nur aus der letzten Notiz besteht.
  const notiz = strom.indexOf("letzteNotiz.trim()) output.textContent = letzteNotiz");
  const weg = strom.indexOf("frageGezeigt && !output.textContent.trim()");
  assert.ok(notiz > 0 && weg > notiz, "der leere Knoten wird entfernt, bevor die Notiz greift");
});

test("leere Eintraege bekommen keine Aktionsleiste", () => {
  assert.match(aktionen, /if \(!\(entry\.textContent \|\| ""\)\.trim\(\) && !entry\.firstElementChild\) \{ barOf\(entry\)\?\.remove\(\); continue; \}/);
});

test("eine Antwort NUR aus Medien behaelt ihre Leiste", () => {
  // firstElementChild schuetzt Bild- und Videoantworten: die haben keinen Text,
  // sind aber sehr wohl Nachrichten.
  const zeile = aktionen.split("\n").find((z) => z.includes("barOf(entry)?.remove(); continue;"));
  assert.ok(zeile.includes("!entry.firstElementChild"), "Medienantworten verlieren ihre Leiste");
});
