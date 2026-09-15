// Betreiber-Freigabe 1c (15.09.2026): nur unter 600 px Hoehe werden die Erste-Schritte-
// Karten kompakt (Titel nebeneinander, 44-px-Ziele), damit das Eingabefeld sichtbar ist.
// Live gemessen mit der Reparatur: 320x568 Feld 433-477 px (vorher 645-689, unter dem Rand).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const q = readFileSync(new URL("../public/erste-schritte.js", import.meta.url), "utf8");

test("die Verkleinerung haengt NUR an max-height:600px", () => {
  const m = q.match(/@media \(max-height:600px\)\{([^`]*)`\s*\n\s*\+ `([^`]*)`/);
  assert.ok(m, "Hoehen-Regel vorhanden");
  const regel = m[1] + m[2];
  assert.match(regel, /\.es-karte span\{display:none\}/, "Beschreibung weg");
  assert.match(regel, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, "Titel nebeneinander");
  assert.doesNotMatch(regel, /min-height:\s*[0-3]?\dpx/, "Tippziel nicht unter 44 px gedrueckt");
});

test("die Regel steht NACH der Breiten-Regel (sonst gewinnt 1 Spalte)", () => {
  assert.ok(q.indexOf("@media (max-height:600px)") > q.indexOf("@media (max-width:600px)"));
  assert.match(q, /\.es-karte\{display:flex;flex-direction:column;gap:4px;min-height:44px;/, "Grundregel mit 44 px unveraendert");
});
