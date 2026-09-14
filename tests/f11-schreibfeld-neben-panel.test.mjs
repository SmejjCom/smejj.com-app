// smejj.com — F11 (A-bis-Z-Pruefung 14.09.): das Schreibfeld der Startseite
// neben dem offenen Browser-Panel.
//
// GEMESSEN 2026-09-14 (Chrome headless, 1094 px, Spur 200, Panel 514): dem
// Chat bleiben 380 px, das Glas ist 324 px (leer) bzw. 360 px (Chat) breit.
// Die Knopfzeile brauchte 401 px ([+] 38, Modell 88, Nachdenken 127,
// Mikrofon 38, Senden 38, fuenf Luecken a 10, Polster 22) und brach in eine
// dritte Zeile. Der Fix ist eine Container-Abfrage am Glas (design-v12-chat.css):
// unter 400 px wird die Nachdenken-Pille ein 38-px-Viereck ohne Wort, unter
// 300 px bekommt das Modellwort Auslassungspunkte. Diese Zusagen halten fest,
// was ohne Browser pruefbar ist — die Masse selbst misst ein CDP-Lauf.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lese = (datei) => readFileSync(new URL(`../public/${datei}`, import.meta.url), "utf8");
const chat = lese("design-v12-chat.css");
const buendel = lese("start-styles.css");

// Die Knopfzeile im Glas, wie gemessen (px). Mit Wort passt sie erst ab 401 px,
// als Viereck ab 312 px — und 312 <= 324 (Glas bei 1094 px, Panel offen, leer).
const LUECKE = 10, POLSTER = 22, PLUS = 38, MODELL = 88, MIKRO = 38, SENDEN = 38;
const bedarf = (nachdenken) => PLUS + MODELL + nachdenken + MIKRO + SENDEN + 5 * LUECKE + POLSTER;

test("F11: die Knopfzeile passt als Viereck in das 324-px-Glas, mit Wort nicht", () => {
  assert.equal(bedarf(127), 401);
  assert.ok(bedarf(127) > 324, "mit Wort muesste die Zeile brechen (so war der Befund)");
  assert.equal(bedarf(38), 312);
  assert.ok(bedarf(38) <= 324, "als Viereck muss eine Zeile reichen");
});

test("F11: das Glas ist ein Container (inline-size) mit dem Namen schreibfeld", () => {
  assert.match(chat, /#start \.prompt-glass \{\s*\n\s*container-type: inline-size;\s*\n\s*container-name: schreibfeld;\s*\n\}/);
});

test("F11: unter 400 px verliert die Nachdenken-Pille ihr Wort und wird 38 px breit", () => {
  const block = chat.match(/@container schreibfeld \(max-width: 400px\) \{([\s\S]*?)\n\}/);
  assert.ok(block, "der 400-px-Container-Block fehlt in design-v12-chat.css");
  assert.match(block[1], /\.fpille-nachdenken \.chip-label \{ display: none; \}/);
  const pille = block[1].match(/#start \.prompt-glass \.fpille-nachdenken \{[^}]*\}/);
  assert.ok(pille, "die Pillen-Regel fehlt im 400-px-Block");
  // .text-chip hat min-width 88 px (styles.css) — ohne eigenes min-width blieb
  // die Pille auch ohne Wort 88 px breit (gemessen) und die Zeile brach weiter.
  assert.match(pille[0], /width: 38px/);
  assert.match(pille[0], /min-width: 38px/);
  assert.match(pille[0], /padding: 0/);
});

test("F11: unter 300 px bekommt das Modellwort Auslassungspunkte — mit min-width 0", () => {
  const block = chat.match(/@container schreibfeld \(max-width: 300px\) \{([\s\S]*?)\n\}/);
  assert.ok(block, "der 300-px-Container-Block fehlt in design-v12-chat.css");
  const modell = block[1].match(/\.model-picker button \{[^}]*\}/);
  assert.ok(modell, "die Modell-Regel fehlt im 300-px-Block");
  // min-width schlaegt max-width: ohne "min-width: 0" bleibt der Knopf 88 px (gemessen bei 840 px).
  assert.match(modell[0], /min-width: 0/);
  assert.match(modell[0], /max-width: 72px/);
  assert.match(modell[0], /text-overflow: ellipsis/);
});

test("F11: der Container-Block steht VOR dem 430-px-Block (F18 prueft das Dateiende)", () => {
  const container = chat.indexOf("@container schreibfeld");
  assert.ok(container >= 0, "die Container-Abfrage fehlt in design-v12-chat.css");
  assert.ok(container < chat.indexOf("@media (max-width: 430px)"));
});

test("das Buendel start-styles.css traegt die Container-Abfrage (bundle-start-styles.mjs gelaufen)", () => {
  assert.ok(buendel.includes("container-name: schreibfeld;"), "Container fehlt im Buendel");
  assert.ok(buendel.includes("@container schreibfeld (max-width: 400px)"), "400-px-Block fehlt im Buendel");
  assert.ok(buendel.includes("@container schreibfeld (max-width: 300px)"), "300-px-Block fehlt im Buendel");
});
