// smejj.com — wer sendet, muss seine eigene Nachricht sehen.
//
// DER FALL, live gemessen 2026-09-11 mit echter Geraete-Emulation:
// Auf dem Handy landete die frische Nachricht unter der sichtbaren Kante des
// Verlaufs und damit hinter der Bedienzone — 47 px bei 375 px Breite, 152 px
// bei 320 px. Gemessen: #startLog endete bei 698, die Bedienzone begann bei
// 710, die neue Nachricht lag bei 715..762.
//
// RICHTIGSTELLUNG nach dem Selbsttest der Messung: dauerhaft war das nicht.
// 250 ms spaeter blieben noch 3 px. Der Fehler traf also die ersten
// Augenblicke — genau die, in denen man hinsieht, weil man gerade gesendet
// hat. Die erste Fassung dieser Notiz las sich, als bleibe die Nachricht fuer
// immer verdeckt; das waere zu dick aufgetragen.
//
// URSACHE: addEntry rief `node.scrollIntoView({ block: "end" })`. Das richtet
// am FENSTER aus, nicht am scrollenden Verlauf. Der Retter, der das sonst
// auffaengt (verlauf-unten.js, MutationObserver), schweigt WAEHREND des Stroms
// — und beim Senden startet der Strom sofort. Zwei halbe Wege, zusammen keiner.
//
// Auf Tablet und Laptop fiel es nie auf: dort ist genug Platz.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const helfer = lies("public/app-helfer.js");
const unten = lies("public/verlauf-unten.js");

test("addEntry scrollt den Verlauf ans Ende, nicht das Kind ins Fenster", () => {
  assert.match(helfer, /if \(!scrolleAnsEnde\(log\)\) node\.scrollIntoView\(\{ block: "end" \}\);/);
  assert.ok(
    !/\n\s*node\.scrollIntoView\(\{ block: "end" \}\);/.test(helfer),
    "scrollIntoView steht wieder allein da — dann landet die Nachricht unter der Kante"
  );
});

test("es gibt genau EINEN Weg ans Ende, keine zweite Fassung", () => {
  // Die Krankheit dieses Tages war durchgehend "zwei Quellen fuer eine Sache".
  assert.match(helfer, /import \{ scrolleAnsEnde \} from "\/assets\/verlauf-unten\.js";/);
  assert.ok(!/scrollTop = .*scrollHeight/.test(helfer), "app-helfer.js scrollt wieder selbst");
});

test("der Import traegt KEINE Marke — sonst zwei Instanzen", () => {
  // chat-actions-menu.js laedt dasselbe Modul ohne Marke. Zwei Kennungen
  // waeren zwei Modulinstanzen mit eigenem Zustand (Fall vom 10.09.).
  assert.ok(!/verlauf-unten\.js\?v=/.test(helfer));
});

test("scrolleAnsEnde tut wirklich etwas und meldet es ehrlich", () => {
  assert.match(unten, /log\.scrollTop = log\.scrollHeight;/);
  assert.match(unten, /if \(log\.scrollHeight <= log\.clientHeight\) return false;/);
});
