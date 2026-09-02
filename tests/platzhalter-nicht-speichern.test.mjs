// smejj.com — Der Wartetext „smejj denkt nach…“ darf weder gespeichert noch wiederhergestellt werden
// (Befund 03.09.: zwei Chats des Betreibers endeten dauerhaft mit dem Platzhalter).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../public/chat-store.js", import.meta.url), "utf8");

test("readEntries laesst Knoten mit data-thinking aus", () => {
  assert.match(store, /platzhalter: node\.dataset\.thinking === "true"/);
  assert.match(store, /\.filter\(\(entry\) => entry\.text\.trim\(\)\.length > 0 && !entry\.platzhalter\)/);
});

test("renderEntriesInto ueberspringt gespeicherten Altbestand ohne Rohtext", () => {
  assert.match(store, /if \(message\.role !== "user" && !String\(message\.raw \|\| ""\)\.trim\(\) && \/\^smejj denkt nach\/i\.test\(String\(message\.text \|\| ""\)\.trim\(\)\)\) continue;/);
});
