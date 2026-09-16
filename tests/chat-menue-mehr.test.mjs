// smejj.com — erweitertes Nachrichten-Menue (Betreiber-Auftrag 16.09.2026: Teilen, Antworten,
// Zitieren, Weiterleiten, Text auswaehlen, Uebersetzen, Anpinnen).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/chat-menue-mehr.js", import.meta.url), "utf8");
const menue = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("../public/chat-actions.js", import.meta.url), "utf8");

// Das Modul laedt seine Abhaengigkeiten ueber /assets/-Pfade (eine Modulinstanz im Browser) und
// ist darum in node nicht direkt importierbar: die Importe werden durch Attrappen ersetzt.
const ohneImporte = quelle
  .replace(/^import .*$/gm, "")
  .split("\nif (typeof document")[0];
const attrappen = "const metaOf = () => null; const rawOf = () => ''; const activeChatId = () => ''; const newChat = () => {}; const showToast = () => {};"
  + "const toPlainText = (t) => String(t).replace(/\\*\\*([^*]+)\\*\\*/g, '$1');";
const m = await import("data:text/javascript;base64," + Buffer.from(attrappen + ohneImporte).toString("base64"));

test("jede neue Menue-Aktion hat einen Handler", () => {
  for (const act of ["share", "reply", "quote", "forward", "translate", "select-text", "pin"]) {
    assert.ok(menue.includes(`act: "${act}"`), `${act} steht nicht im Menue`);
    assert.ok(quelle.includes(`"${act}"`), `${act} hat keinen Handler`);
  }
});

test("Zitat: jede Zeile mit >, lange Texte gekuerzt", () => {
  assert.equal(m.alsZitat("eins\nzwei"), "> eins\n> zwei");
  const lang = m.alsZitat("a".repeat(2000));
  assert.ok(lang.length < 1300, "auf rund 1200 Zeichen gekuerzt");
  assert.ok(lang.endsWith("…"));
});

test("Auszug fuer Antworten: eine Zeile, hoechstens 90 Zeichen plus Auslassung", () => {
  assert.equal(m.auszug("Hallo\n\nWelt"), "Hallo Welt");
  assert.ok(m.auszug("x ".repeat(100)).length <= 92);
});

test("Uebersetzen: Deutsch -> Englisch, sonst -> Deutsch", () => {
  assert.equal(m.uebersetzungsZiel("Das ist nicht schön"), "Englische");
  assert.equal(m.uebersetzungsZiel("This is a test"), "Deutsche");
});

test("Klartext ohne Markdown, keine Leerzeilen-Stapel", () => {
  assert.equal(m.klartextVon("**fett**\n\n\n\nweiter"), "fett\n\nweiter");
});

test("Pin-Merkmal ueberlebt ein Neuladen und trennt Nachrichten mit gleichem Zeitstempel", () => {
  const meta = { id: "m7", role: "assistant", createdAt: "2026-09-16T10:00:00Z" };
  const a = m.pinSchluessel(meta, "Antwort eins");
  assert.ok(a.startsWith("assistant|2026-09-16T10:00:00Z|"), "keine fluechtige Id im Merkmal");
  assert.equal(a, m.pinSchluessel({ ...meta, id: "m99" }, "Antwort eins"), "gleich nach Neuladen (neue Id)");
  assert.notEqual(a, m.pinSchluessel(meta, "Antwort zwei"), "gleicher Zeitstempel, anderer Text: verschieden");
});

test("Verdrahtung: Haken in chat-actions-menu.js, Eintrag im Precache, dieselbe Modulinstanz", () => {
  assert.match(menue, /import\("\/assets\/chat-menue-mehr\.js"\)\.catch\(\(\) => \{\}\)/);
  assert.ok(sw.includes('"/assets/chat-menue-mehr.js"'), "fehlt im Precache — offline tot");
  const marke = /chat-actions-menu\.js\?v=(\d+)/.exec(actions)?.[1];
  assert.ok(quelle.includes(`/assets/chat-actions-menu.js?v=${marke}`), "gleiche Marke wie chat-actions.js, sonst zweite Modulinstanz");
  assert.ok(!/entry\.append\(/.test(quelle), "nichts wird in die Nachricht gehaengt (Verlauf-Speicher)");
});
