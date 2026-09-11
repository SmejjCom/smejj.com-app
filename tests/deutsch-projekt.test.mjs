// smejj.com — die Oberflaeche sagt "Projekt", nicht "Project".
//
// Gefunden am 2026-09-11 beim A-bis-Z-Rundgang durch den Code-Bereich: das
// Projekt-Menue bot "Neues Project anlegen …" an, die Arbeitsbereiche
// begruessten mit "Noch kein Project. Ein Project buendelt Gespraeche …", und
// nach dem Speichern eines Codeblocks stand da "Im Project-Ordner gespeichert".
// Elf Stellen in sechs Dateien — ein englisches Wort mitten im deutschen Satz.
//
// Betreiber-Regel: die Oberflaeche ist deutsch. deutsch-klartext.js raeumt zur
// Laufzeit ein paar englische Reste weg, kannte aber nur "Projects" (Plural)
// und traf diese Stellen nie.
//
// GEPRUEFT WIRD NUR, WAS DER NUTZER LIEST. Bezeichner im Code (projectId,
// renderProjectCards) und Kommentare bleiben unangetastet: die Kommentare
// erklaeren die Herkunft, und ein Suchlauf nach "Project" soll sie finden.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

const WURZEL = new URL("../public/", import.meta.url);
const DATEIEN = readdirSync(WURZEL).filter((n) => n.endsWith(".js") || n.endsWith(".html"));

/** Zeilen ohne Kommentar — nur dort steht Text, den jemand zu sehen bekommt. */
function textZeilen(inhalt) {
  return inhalt.split("\n").filter((z) => {
    const t = z.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("<!--");
  });
}

test("kein 'Project' in sichtbaren Texten", () => {
  const treffer = [];
  for (const name of DATEIEN) {
    const inhalt = readFileSync(new URL(name, WURZEL), "utf8");
    for (const zeile of textZeilen(inhalt)) {
      // Nur das ALLEINSTEHENDE Wort: projectId, renderProjectCards und
      // Konsorten sind Bezeichner und gehen niemanden etwas an.
      if (!/\bProject\b/.test(zeile)) continue;
      // In Anfuehrungszeichen ODER als Attributwert = sichtbarer Text.
      if (/["'`][^"'`]*\bProject\b[^"'`]*["'`]/.test(zeile)) treffer.push(`${name}: ${zeile.trim().slice(0, 70)}`);
    }
  }
  assert.deepEqual(treffer, [], `Englisches "Project" in der Oberflaeche:\n  ${treffer.join("\n  ")}`);
});

test("die deutschen Fassungen stehen wirklich da", () => {
  const arbeit = readFileSync(new URL("arbeitsbereiche.js", WURZEL), "utf8");
  assert.match(arbeit, /"Neues Projekt anlegen"/);
  assert.match(arbeit, /"Wie soll das Projekt heißen\?"/);
  const flaeche = readFileSync(new URL("code-flaeche.js", WURZEL), "utf8");
  assert.match(flaeche, /"Neues Projekt anlegen …"/);
});
