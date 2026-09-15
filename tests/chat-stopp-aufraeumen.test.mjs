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

// ---- Livetest 15.09.2026: Stopp in der Wartezeit, nach dem Neuladen war die Antwort weg ----

const { markiereGestoppteLeere } = await import("../public/chat-stopp.js");

function eintrag(klassen, text = "", dataset = {}) {
  const liste = new Set(klassen);
  return { classList: { contains: (k) => liste.has(k) }, textContent: text, innerHTML: text, dataset: { ...dataset } };
}
function logMit(...eintraege) {
  return { querySelectorAll: () => eintraege };
}
/** Nachbau von readEntries() in chat-store.js: leere und wartende Eintraege werden nicht gespeichert. */
const gespeichert = (eintraege) => eintraege.filter((e) => e.textContent.trim().length > 0 && e.dataset.thinking !== "true");

test("KAPUTT (v883): eine leere gestoppte Antwort ohne data-thinking fiel beim Speichern weg", () => {
  const frage = eintrag(["entry", "user"], "Schreibe einen Aufsatz");
  const antwort = eintrag(["entry", "assistant"], ""); // der Strom hat data-thinking schon entfernt
  // Die alte Aufraeumschleife traf nur [data-thinking="true"] — hier also nichts.
  assert.equal(gespeichert([frage, antwort]).length, 1, "nur die Frage bleibt: nach dem Neuladen steht sie ohne Antwort");
});

test("GESUND: die leere gestoppte Antwort wird zu 'Gestoppt.' und damit gespeichert", () => {
  const frage = eintrag(["entry", "user"], "Schreibe einen Aufsatz");
  const antwort = eintrag(["entry", "assistant"], "");
  assert.equal(markiereGestoppteLeere(logMit(frage, antwort)), true);
  assert.equal(antwort.textContent, "Gestoppt.");
  assert.equal(antwort.dataset.gestopptLeer, "an", "Fortsetzen erkennt: das ist keine Teilantwort");
  assert.equal(gespeichert([frage, antwort]).length, 2, "Frage UND Hinweis ueberstehen das Neuladen");
});

test("GESUND: auch eine noch wartende Blase wird ehrlich markiert", () => {
  const antwort = eintrag(["entry", "assistant"], "smejj denkt nach …", { thinking: "true" });
  assert.equal(markiereGestoppteLeere(logMit(eintrag(["entry", "user"], "?"), antwort)), true);
  assert.equal(antwort.textContent, "Gestoppt.");
  assert.equal(antwort.dataset.thinking, undefined);
});

test("GESUND: eine Teilantwort und eine Frage ohne Antwortblase bleiben unangetastet", () => {
  const teil = eintrag(["entry", "assistant"], "Vulkane entstehen, wenn");
  assert.equal(markiereGestoppteLeere(logMit(eintrag(["entry", "user"], "?"), teil)), false);
  assert.equal(teil.textContent, "Vulkane entstehen, wenn");
  assert.equal(markiereGestoppteLeere(logMit(eintrag(["entry", "user"], "?"))), false);
  assert.equal(markiereGestoppteLeere(null), false);
});

test("Verdrahtung: nach Stromende wird geprueft, Fortsetzen schickt statt 'Gestoppt.' fortzusetzen", () => {
  assert.match(quelle, /markiereGestoppteLeere\(dok\.getElementById\?\.\("startLog"\)\)/);
  assert.match(quelle, /if \(istAbgebrochen\(\)\) setTimeout\(\(\) => markiereGestoppteLeere\(/);
  assert.match(quelle, /output\.dataset\.gestopptLeer === "an"/);
});
