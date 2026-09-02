// smejj.com — UI/UX-Programm 02.09., Nr. 10: Rueckgaengig statt Bestaetigung beim Loeschen eines Chats.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/chat-history-view.js", import.meta.url), "utf8");

test("Loeschen fragt nicht mehr 'Wirklich loeschen?', sondern loescht weich und bietet Rueckgaengig", () => {
  assert.ok(!quelle.includes("Wirklich löschen?"), "Zwei-Schritt-Bestaetigung ist weg");
  assert.match(quelle, /const ok = await deleteChat\(chat\.id\)\.catch\(\(\) => false\);\s*render\(\);\s*if \(ok\) zeigeRueckgaengig\(chat\);/);
  assert.match(quelle, /restoreChat/, "Wiederherstellen kommt aus chat-store.js");
});

test("die Rueckgaengig-Leiste nutzt die bestehenden msg-undo-Klassen, laeuft 8 s und stellt per Klick wieder her", () => {
  const fn = quelle.slice(quelle.indexOf("export function zeigeRueckgaengig"), quelle.indexOf("function zeigeUmbenennen"));
  assert.match(fn, /className = "msg-undo ch-undo"/);
  assert.match(fn, /RUECKGAENGIG_MS = 8000/.test(quelle) ? /RUECKGAENGIG_MS/ : /8000/);
  assert.match(fn, /restore\(chat\.id\)/);
  assert.match(fn, /neuZeichnen\(\)/);
  assert.match(fn, /30 Tage wiederherstellbar/);
  assert.match(fn, /setAttribute\("role", "status"\)/);
});
