// smejj.com — Wörter unter den Symbolen (UI/UX Nr. 4): Zuordnung, Stil-Regeln, Haken.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const quelle = readFileSync(new URL("../public/chat-actions-woerter.js", import.meta.url), "utf8");

async function ladeModul() {
  const ersetzt = quelle.replace('import { t } from "/assets/i18n/ui.js?v=3";', "const t = (s) => s;");
  assert.notEqual(ersetzt, quelle);
  const datei = join(mkdtempSync(join(tmpdir(), "smejj-woerter-")), "woerter.mjs");
  writeFileSync(datei, ersetzt);
  return import(pathToFileURL(datei).href);
}

test("jede Leisten-Aktion hat ein Kurzwort, Versionspfeile keins", async () => {
  const m = await ladeModul();
  for (const act of ["copy", "speak", "rate-up", "rate-down", "edit", "regen"]) assert.ok(m.wortFuer(act), act);
  assert.equal(m.wortFuer("version-prev"), "");
  assert.equal(m.wortFuer(""), "");
  // Kurz genug fuer 44 px Breite bei 10 px Schrift: hoechstens 8 Zeichen.
  for (const wort of Object.values(m.WOERTER)) assert.ok(wort.length <= 8, wort);
});

test("Stil: Woerter nur unter 600 px, Knopf wird Spalte, nie breiter — die Ein-Zeilen-Regel vom 30.08. bleibt", () => {
  assert.match(quelle, /\.msg-act-wort\{display:none\}/);
  assert.match(quelle, /@media \(max-width:600px\)\{/);
  assert.match(quelle, /flex-direction:column/);
  assert.ok(!/width:\s*auto/.test(quelle.split("@media")[1] || ""), "Breite der Knoepfe bleibt 44 px");
});

test("der Haken sitzt in chat-stream.js als dynamischer Import mit catch", () => {
  const cs = readFileSync(new URL("../public/ai/chat-stream.js", import.meta.url), "utf8");
  assert.ok(cs.includes('import("/assets/chat-actions-woerter.js").catch(() => {})'));
});

test("die neuen Woerter stehen in allen 14 Sprachdateien", () => {
  for (const sp of ["ar","bn","en","es","fr","hi","id","it","ja","ko","pt","ru","tr","zh"]) {
    const q = readFileSync(new URL(`../public/i18n/${sp}.js`, import.meta.url), "utf8");
    for (const k of ["Vorlesen", "Ändern", "Kopieren", "Gut", "Schwach", "Mehr", "Neu"]) assert.ok(q.includes(`\n  ${JSON.stringify(k)}:`), `${sp}: ${k}`);
  }
});
