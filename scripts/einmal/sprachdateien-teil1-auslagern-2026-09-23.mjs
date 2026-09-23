#!/usr/bin/env node
// Einmal-Umbau 23.09.2026 — Sprachdateien vor dem naechsten Nachtrag entlasten.
//
// WARUM: alle 14 public/i18n/xx.js standen bei 788 Zeilen (Grenze 800), die
// Teil-2-Dateien xx-2.js (seit 20.09.) bei 372. Der naechste Nachtrag haette
// die 800-Zeilen-Regel gerissen. Umbau: der Block VOR "...zusatz," in xx.js
// wandert an den ANFANG von xx-2.js. Die Rangfolge bleibt exakt gleich:
//   vorher  { Block, ...Teil2, Rest }   -> Teil 2 schlaegt Block, Rest schlaegt Teil 2
//   nachher Teil2' = { Block, Teil2 }   -> Teil 2 schlaegt Block
//           { ...Teil2', Rest }         -> Rest schlaegt beides
// Das Skript prueft das selbst: altes und neues Woerterbuch muessen Schluessel
// fuer Schluessel gleich sein, sonst schreibt es nichts.
//
// Aufruf (im Repo-Wurzelverzeichnis): node scripts/einmal/sprachdateien-teil1-auslagern-2026-09-23.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SPRACHEN = ["en", "es", "fr", "it", "pt", "tr", "ru", "ja", "ko", "zh", "ar", "hi", "bn", "id"];
const ALTE_MARKE = "?v=9";
const NEUE_MARKE = "?v=10";
const KOPF = "export default {\n";
const SPREAD = "  ...zusatz,\n";

async function woerterbuch(teil1, teil2, marke) {
  const dir = mkdtempSync(join(tmpdir(), "i18n-umbau-"));
  writeFileSync(join(dir, "t2.mjs"), teil2);
  writeFileSync(join(dir, "t1.mjs"), teil1.replace(/from "\.\/[a-z]+-2\.js\?v=\d+"/, 'from "./t2.mjs"'));
  if (!teil1.includes(marke)) throw new Error(`Marke ${marke} fehlt`);
  return (await import(pathToFileURL(join(dir, "t1.mjs")).href)).default;
}

const neu = {};
for (const s of SPRACHEN) {
  const p1 = `public/i18n/${s}.js`;
  const p2 = `public/i18n/${s}-2.js`;
  const alt1 = readFileSync(p1, "utf8");
  const alt2 = readFileSync(p2, "utf8");
  const a = alt1.indexOf(KOPF);
  const b = alt1.indexOf(SPREAD);
  if (a < 0 || b < a || alt1.indexOf(SPREAD, b + 1) >= 0 || !alt2.includes(KOPF)) throw new Error(`${s}: Aufbau unerwartet — nichts geschrieben`);
  const block = alt1.slice(a + KOPF.length, b);
  const neu1 = (alt1.slice(0, a + KOPF.length) + alt1.slice(b))
    .replace(`${s}-2.js${ALTE_MARKE}"`, `${s}-2.js${NEUE_MARKE}"`)
    .replace(/^\/\/ Abschnitts-Kommentare am 22\.09\.2026 entfernt.*\n/m,
      "// Abschnitts-Kommentare am 22.09.2026 entfernt (800-Zeilen-Regel) — die Herkunft jedes Schluessels steht im Git-Verlauf.\n" +
      `// 23.09.2026: der Block vor "...zusatz" wanderte an den Anfang von ${s}-2.js (Datei stand bei 788 Zeilen); Rangfolge unveraendert.\n`);
  const neu2 = alt2.replace(KOPF, KOPF + block);
  const vorher = await woerterbuch(alt1, alt2, ALTE_MARKE);
  const nachher = await woerterbuch(neu1, neu2, NEUE_MARKE);
  if (!isDeepStrictEqual(vorher, nachher)) throw new Error(`${s}: Woerterbuch weicht ab — nichts geschrieben`);
  neu[s] = [p1, neu1, p2, neu2, Object.keys(nachher).length];
}
for (const [s, [p1, n1, p2, n2, zahl]] of Object.entries(neu)) {
  writeFileSync(p1, n1);
  writeFileSync(p2, n2);
  console.log(`${s}: ${n1.split("\n").length - 1} + ${n2.split("\n").length - 1} Zeilen, ${zahl} Schluessel unveraendert`);
}
