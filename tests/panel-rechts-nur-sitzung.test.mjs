// smejj.com — UI/UX Nr. 6: das rechte Panel kommt nur in derselben Browser-Sitzung wieder,
// die linke Spur bleibt dauerhaft gemerkt. Geprueft an der Quelle (Modul braucht den Browser).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/panel-layout.js", import.meta.url), "utf8");

test("rechts sessionStorage, links localStorage — kein direkter localStorage-Zugriff auf die Auf/Zu-Merker mehr", () => {
  assert.match(quelle, /function speicherFuer\(side\) \{\s*return side === "right" \? sessionStorage : localStorage;/);
  assert.ok(!/localStorage\.(get|set)Item\(PANEL_OPEN_KEYS/.test(quelle), "Auf/Zu-Merker nur ueber speicherFuer()");
  assert.equal((quelle.match(/speicherFuer\((side|"left"|"right")\)\.(get|set)Item/g) || []).length, 4, "Merken, Lesen, Startschnappschuss (2x)");
});

test("Handy bleibt ausgenommen: unter 900 px wird nie wiederhergestellt", () => {
  assert.match(quelle, /const RESTORE_MIN_WIDTH = 900;/);
  assert.match(quelle, /export function restorePanelOpen[\s\S]*?window\.innerWidth < RESTORE_MIN_WIDTH\) return 0;/);
});
