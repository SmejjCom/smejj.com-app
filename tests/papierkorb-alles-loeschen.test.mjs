// smejj.com — "Alles endgueltig loeschen" im Papierkorb (Betreiber 15.09.2026) und die
// Rueckfrage, die das Neuzeichnen ueberlebt.
//
// Live gemessen 15.09. (erfundene Chats, alle Serveranfragen abgefangen): nach dem ersten
// Klick auf "Endgueltig loeschen" war der Knopf 700 ms spaeter wieder unscharf — jeder Klick
// irgendwo zeichnet die Ansicht nach 150 ms neu. Ein zweiter Klick loeschte nie.
// Ausfuehren: node --test tests/papierkorb-alles-loeschen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const korb = fs.readFileSync("public/papierkorb.js", "utf8");
const bereiche = fs.readFileSync("public/chat-store-bereiche.js", "utf8");
const sync = fs.readFileSync("public/chat-sync.js", "utf8");

test("Rueckfrage lebt im Modul, nicht am Knopf — sie ueberlebt das Neuzeichnen", () => {
  assert.match(korb, /let scharf = \{ schluessel: "", bis: 0 \};/);
  assert.doesNotMatch(korb, /dataset\.scharf/, "ein Merker am Knopf geht beim Neuzeichnen verloren");
  assert.match(korb, /const istScharf = \(\) => scharf\.schluessel === schluessel && Date\.now\(\) < scharf\.bis;/);
  assert.match(korb, /knopf\.textContent = istScharf\(\) \? gefragt : normal;/);
  assert.match(korb, /schluessel: `chat:\$\{chat\.id\}`/);
});

test("Alles endgueltig loeschen: nur ab zwei Chats, Zahl in der Rueckfrage, einer nach dem anderen", () => {
  assert.match(korb, /if \(chats\.length > 1\) liste\.append\(alleLoeschenZeile\(chats\)\);/);
  assert.match(korb, /gefragt: `Wirklich alle \$\{chats\.length\} löschen\? Nochmal klicken`/);
  assert.match(korb, /for \(const chat of chats\) \{\s*await endgueltigLoeschen\(chat\.id\)/);
  // Waehrend des Laufs wird nicht neu gezeichnet, und der Lauf gibt die Sperre immer frei.
  assert.match(korb, /if \(!ziel \|\| massenLauf\) return;/);
  assert.match(korb, /\} finally \{\s*massenLauf = false;\s*\}/);
});

test("Server-Loeschungen laufen nacheinander und die Loeschung wartet auf den Server", () => {
  assert.match(bereiche, /const detail = \{ id: String\(id \|\| ""\), warten: \[\] \};/);
  assert.match(bereiche, /await Promise\.all\(detail\.warten\)\.catch\(\(\) => \{\}\);/);
  assert.match(sync, /loeschKette = loeschKette\.then\(\(\) => loescheAufServer\(id\)\);/);
  assert.match(sync, /ereignis\.detail\.warten\?\.push\?\.\(loeschKette\);/);
  assert.match(sync, /method: "DELETE", headers: kopf, signal: AbortSignal\.timeout\(15000\)/);
});
