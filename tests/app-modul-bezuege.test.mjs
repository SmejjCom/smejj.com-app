// smejj.com — public/app.js darf keine Namen benutzen, die es nicht kennt.
//
// Hintergrund: Bei der Aufteilung von app.js (2026-07-28) wanderte die
// Konstante PANEL_WIDTHS nach panel-layout.js, wurde dort aber nicht
// exportiert und in app.js nicht importiert. app.js benutzte sie weiter in
// setMenuOpen und setBrowserPanelOpen. Folge live: JEDES Auf- und Zuklappen
// der Seitenleiste warf "PANEL_WIDTHS is not defined" — und alles, was in der
// Funktion danach kam (syncLeftMenuState, syncBackdrop), lief nicht mehr.
//
// Kein Test hat das gefunden, weil `node --check` nur die Syntax prueft und
// die Unit-Tests app.js nicht im Browser ausfuehren. Dieser Test schliesst die
// Luecke: Er sammelt alle GROSSGESCHRIEBENEN Bezeichner (Konstanten-Konvention
// des Projekts), die app.js verwendet, und verlangt fuer jeden eine Quelle —
// eigene Deklaration oder Import.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const quelle = fs.readFileSync("public/app.js", "utf8");

// Namen, die der Browser selbst mitbringt.
const EINGEBAUT = new Set([
  "URL", "URLSearchParams", "JSON", "Math", "Date", "Object", "Array", "String",
  "Number", "Boolean", "Promise", "Set", "Map", "Error", "TypeError", "RegExp",
  "Intl", "AbortController", "Blob", "File", "FileReader", "FormData", "Image",
  "Response", "Request", "Headers", "TextEncoder", "TextDecoder", "WeakMap",
  "WeakSet", "Symbol", "BigInt", "Proxy", "Reflect", "Function", "CustomEvent",
  "Event", "MutationObserver", "IntersectionObserver", "ResizeObserver",
  "PerformanceObserver", "Notification", "Worker", "BroadcastChannel", "Node",
  "Element", "HTMLElement", "DocumentFragment", "NodeList", "Uint8Array",
  "Int8Array", "Uint16Array", "Uint32Array", "Float32Array", "Float64Array",
  "ArrayBuffer", "DataView", "EventTarget", "AudioContext", "SpeechSynthesisUtterance"
]);

function importierteNamen(text) {
  const namen = new Set();
  for (const [, block] of text.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const teil of block.split(",")) {
      const name = teil.trim().split(/\s+as\s+/).pop().trim();
      if (name) namen.add(name);
    }
  }
  for (const [, name] of text.matchAll(/import\s+(\w+)\s+from/g)) namen.add(name);
  return namen;
}

function deklarierteNamen(text) {
  const namen = new Set();
  for (const [, name] of text.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\b/g)) namen.add(name);
  for (const [, name] of text.matchAll(/(?:^|\n)\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)/g)) namen.add(name);
  return namen;
}

test("app.js kennt jede benutzte Konstante — eigene Deklaration oder Import", () => {
  const bekannt = new Set([...importierteNamen(quelle), ...deklarierteNamen(quelle), ...EINGEBAUT]);

  // Gesucht wird die Form, in der Konstanten tatsaechlich benutzt werden:
  // NAME.feld oder NAME[...]. Genau so sah der Fehler aus (PANEL_WIDTHS.min).
  // Blosses Vorkommen des Wortes reicht NICHT — sonst schlagen Prosa-Woerter in
  // Zeichenketten an ("BYOK-Felder", "0 EUR Risiko", "[DONE]"), und ein
  // Zeichenketten-Filter per regulaerem Ausdruck ist an dieser Datei zu
  // unzuverlaessig (Apostrophe, verschachtelte Vorlagen).
  const benutzt = new Set();
  for (const [, name] of quelle.matchAll(/(?<![.\w$"'`-])([A-Z][A-Z0-9_]{2,})\s*(?=\.[A-Za-z_$]|\[)/g)) benutzt.add(name);

  const unbekannt = [...benutzt].filter((name) => !bekannt.has(name)).sort();
  assert.deepEqual(
    unbekannt,
    [],
    "app.js benutzt Konstanten ohne Quelle — genau so entstand der Live-Fehler " +
    "'PANEL_WIDTHS is not defined'. Entweder in app.js deklarieren oder aus dem " +
    "Modul importieren, in das sie ausgelagert wurde."
  );
});

test("PANEL_WIDTHS wird exportiert und importiert", () => {
  const panelLayout = fs.readFileSync("public/panel-layout.js", "utf8");
  assert.match(panelLayout, /export const PANEL_WIDTHS/);
  assert.match(quelle, /import \{[^}]*PANEL_WIDTHS[^}]*\} from "\.\/panel-layout\.js(\?v=\d+)?"/);
});
