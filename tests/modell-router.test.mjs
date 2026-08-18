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

test("angehaengte Dateien ziehen die teure Spur", () => {
  const wahl = waehleModell("Was macht das hier?", { dateien: 1 });
  assert.equal(wahl.spur, "Guthaben");
  assert.equal(wahl.grund, "viel-kontext");
});

test("sehr langer Auftrag zieht die teure Spur", () => {
  const wahl = waehleModell("x".repeat(4001));
  assert.equal(wahl.spur, "Guthaben");
});

// NACHGEMESSEN 2026-08-17: 19 ausgefuehrte Testfaelle, minimax-m3 19/19 in
// 8 s gegen Opus 5 19/19 in 12 s. Ein Denk-Wort allein rechtfertigt also
// keine Guthaben-Anfrage mehr — die alte Regel kostete Geld ohne Gegenwert.
test("Denk-Woerter allein kosten kein Guthaben mehr", () => {
  for (const probe of [
    "Analysiere die Architektur dieses Moduls.",
    "Erklaere die Migration und die Security-Folgen.",
    "Wie optimiere ich die Performance hier?"
  ]) {
    assert.equal(waehleModell(probe).spur, "Abo", probe);
  }
});

test("Code-Wort plus Denk-Wort bleibt im Abo, auf der Code-Spur", () => {
  const wahl = waehleModell("Refactor die Funktion und erklaere die Architektur.");
  assert.equal(wahl.spur, "Abo");
  assert.equal(wahl.grund, "code");
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
