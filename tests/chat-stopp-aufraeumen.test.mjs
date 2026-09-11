// smejj.com — nach einem Abbruch darf die App nicht weiter "denken".
//
// DER FALL, live gemessen 2026-09-11: Ein Klick auf "Antwort stoppen", bevor
// das erste Wort da war, beendete den Strom — aber "smejj denkt nach ..." blieb
// als Antwort stehen, data-thinking blieb gesetzt und der Ladebalken
// (task-indicator-active) lief WEITER, auch nach zehn Sekunden. Die App sah
// aus, als arbeite sie noch an etwas, das niemand mehr holt.
//
// Der Grund: den Wartetext raeumt sonst nur der Strom selbst (beim ersten
// Ereignis) und den Balken nur app.js in seinem catch. Ein Abbruch geht an
// beiden vorbei.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/chat-stopp.js", import.meta.url), "utf8");

test("der Abbruch raeumt auf, nicht nur der Strom", () => {
  assert.match(quelle, /m\.stoppeChatStrom\(\); raeumeNachAbbruch\(m\);/);
});

test("der Ladebalken wird ausgeschaltet", () => {
  const fn = quelle.match(/function raeumeNachAbbruch[\s\S]*?\n\}/);
  assert.ok(fn, "raeumeNachAbbruch fehlt");
  assert.match(fn[0], /hideTaskIndicator/);
});

test("der Wartetext verschwindet und die Denkzeile wird beendet", () => {
  const fn = quelle.match(/function raeumeNachAbbruch[\s\S]*?\n\}/)[0];
  assert.match(fn, /beendeDenken\(knoten\)/);
  assert.match(fn, /clearThinkingState\(knoten\)/);
});

test("eine TEILANTWORT bleibt stehen", () => {
  const fn = quelle.match(/function raeumeNachAbbruch[\s\S]*?\n\}/)[0];
  // Der Selektor trifft nur Knoten, in denen noch kein Wort steht: sobald Text
  // kommt, nimmt der Strom data-thinking weg.
  assert.match(fn, /\.entry\.assistant\[data-thinking="true"\]/);
  assert.ok(!/querySelectorAll\('\.entry\.assistant'\)/.test(fn), "greift nach allen Antworten");
});

test("statt einer leeren Blase steht eine Auskunft", () => {
  const fn = quelle.match(/function raeumeNachAbbruch[\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(!knoten\.textContent\.trim\(\)\) knoten\.textContent = "Gestoppt\.";/);
});

test("ein Fehler beim Aufraeumen haelt den Abbruch nicht auf", () => {
  const fn = quelle.match(/function raeumeNachAbbruch[\s\S]*?\n\}/)[0];
  assert.match(fn, /\.catch\(\(\) =>/, "der Balken-Import hat keinen Fang");
  assert.match(fn, /try \{ strom\.beendeDenken/, "beendeDenken haengt ohne Fang am Ablauf");
});
