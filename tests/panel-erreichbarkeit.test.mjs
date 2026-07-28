// smejj.com — zugeklappte Panels duerfen nicht per Tastatur erreichbar sein.
//
// Messbefund vom 2026-07-28 (Zoom- und Tastaturpruefung, echtes Chromium):
// Von 22 Tab-Stationen lagen 11 AUSSERHALB des sichtbaren Bereichs — die
// zugeklappte Seitenleiste steht bei left:-208px, das zugeklappte
// Browser-Panel bei left:1309px. Beide waren weiter fokussierbar. Wer mit der
// Tastatur bedient, verliert den Fokus ins Nichts (WCAG 2.4.7 Focus Visible)
// und muss blind weitertabben; Vorleser lasen die Eintraege ebenfalls vor.
//
// Nach dem Fix: 0 von 22 Stationen ausserhalb des Bildes, das Aufklappen
// funktioniert unveraendert (nachgemessen: Menuepunkt fokussierbar und
// sichtbar, beim Zuklappen wieder inert).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panelLayout = fs.readFileSync("public/panel-layout.js", "utf8");

test("zugeklappte Panels werden inert und aria-hidden gesetzt", () => {
  assert.match(panelLayout, /setAttribute\("inert", ""\)/);
  assert.match(panelLayout, /setAttribute\("aria-hidden", "true"\)/);
  assert.match(panelLayout, /removeAttribute\("inert"\)/);
  assert.match(panelLayout, /removeAttribute\("aria-hidden"\)/);
});

test("der Fokus wird aus einem Panel geholt, bevor es zuklappt", () => {
  assert.match(
    panelLayout,
    /panel\.contains\(document\.activeElement\)/,
    "Ohne diese Pruefung bliebe der Fokus auf einem Element, das gleich unsichtbar ist."
  );
});

test("die Erreichbarkeit haengt an der Klasse, nicht an einem einzelnen Aufrufer", () => {
  // public/app.js hat eigene Funktionen (setMenuOpen/setBrowserPanelOpen), die
  // .is-open direkt setzen, und steht unter dem Start-Lock. Ein Beobachter der
  // Klasse ist deshalb der einzige Weg, der ALLE Auf-/Zuklapp-Wege erfasst.
  assert.match(panelLayout, /new MutationObserver\(/);
  assert.match(panelLayout, /attributeFilter: \["class"\]/);
  assert.match(panelLayout, /classList\.contains\("is-open"\)/);
});

test("der Beobachter startet von selbst, auch wenn das DOM noch laedt", () => {
  assert.match(panelLayout, /document\.readyState === "loading"/);
  assert.match(panelLayout, /DOMContentLoaded/);
});
