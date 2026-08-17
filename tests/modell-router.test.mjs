// Waechter fuer den Modell-Router ("Auto"). Geprueft wird die REGEL, nicht das
// Netz: welcher Auftrag landet auf der Abo-Spur (0 EUR variabel) und welcher
// darf Guthaben ziehen. Jede Probe hat ein Gegenstueck — sonst misst der Test
// nur, dass die Funktion existiert.
import test from "node:test";
import assert from "node:assert/strict";
import { BLINDGAENGER, waehleModell } from "../public/ai/modellRouter.js";

test("Alltagsfrage bleibt auf der Abo-Spur", () => {
  const wahl = waehleModell("Wie spaet ist es in Tokio?");
  assert.equal(wahl.spur, "Abo");
  assert.equal(wahl.grund, "alltag");
});

test("Code-Frage nimmt das Abo-Codemodell, nicht das teure", () => {
  const wahl = waehleModell("Schreib mir eine JavaScript Funktion, die ein Array sortiert.");
  assert.equal(wahl.spur, "Abo");
  assert.equal(wahl.grund, "code");
});

test("angehaengte Dateien machen den Auftrag schwer", () => {
  const wahl = waehleModell("Was macht das hier?", { dateien: 1 });
  assert.equal(wahl.spur, "Guthaben");
  assert.equal(wahl.grund, "schwer");
});

test("langer Auftrag macht den Auftrag schwer", () => {
  const wahl = waehleModell("x".repeat(1201));
  assert.equal(wahl.spur, "Guthaben");
});

test("Schwer-Wort schlaegt das blosse Code-Wort", () => {
  // Gegenprobe zum Code-Fall oben: dasselbe Thema, aber mit Denk-Merkmal.
  const wahl = waehleModell("Refactor die Funktion und erklaere die Architektur.");
  assert.equal(wahl.spur, "Guthaben");
  assert.equal(wahl.grund, "schwer");
});

test("Router waehlt nie einen Blindgaenger", () => {
  // Live gemessen 2026-08-17: HTTP 200, aber 0 Zeichen Inhalt nach 90-120 s.
  const proben = [
    "Hallo",
    "Schreib eine Funktion",
    "Analysiere die Architektur",
    "y".repeat(2000)
  ];
  for (const probe of proben) {
    assert.equal(BLINDGAENGER.includes(waehleModell(probe).modell), false, probe.slice(0, 20));
  }
});

test("die zwei gemessenen Blindgaenger stehen auf der Liste", () => {
  assert.deepEqual([...BLINDGAENGER].sort(), ["cline-pass/qwen3.7-max", "x-ai/grok-4.5"]);
});
