// smejj.com — Markenkette 2026-09-03: acht Module haben sich seit der letzten Eichung geaendert,
// ihre ?v=-Marken blieben stehen (check:markenkette rot). Diese Datei zieht die Marken an JEDEM
// Glied darueber (Merkregel: die Kette bricht am obersten nicht erneuerten Glied) — in public/
// (nicht assets/, das zieht build:assets nach) und in den Tests, die den Wortlaut pruefen.
// Aufruf: node scripts/einmal/markenkette-2026-09-03.ersetzungen.cjs [--pruefen]
const fs = require("fs");
const path = require("path");
const nurPruefen = process.argv.includes("--pruefen");
const WURZEL = path.resolve(__dirname, "..", "..");
const ERSETZUNGEN = [
  // Ausgangs-Befund (8 Module mit geaendertem Inhalt)
  ["chat-store.js?v=b65", "chat-store.js?v=b66"],
  ["chat-actions-menu.js?v=4", "chat-actions-menu.js?v=5"],
  ["chat-history-text.js?v=b47b", "chat-history-text.js?v=b47c"],
  ["panel-layout.js?v=3", "panel-layout.js?v=4"],
  ["arbeitsflaeche.js?v=2", "arbeitsflaeche.js?v=3"],
  ["spur-start.js?v=b46", "spur-start.js?v=b47"],
  ["chat-history-view.js?v=b59", "chat-history-view.js?v=b60"],
  ["settings-surface.js?v=b55", "settings-surface.js?v=b56"],
  // Kettenwirkung Runde 1: diese Dateien aendern sich durch die neuen Marken darin
  ["premium-surfaces.js?v=b47l", "premium-surfaces.js?v=b47m"],
  ["papierkorb.js?v=13", "papierkorb.js?v=14"],
  ["erwaehnung.js?v=3", "erwaehnung.js?v=4"],
  ["arbeitsbereiche.js?v=19", "arbeitsbereiche.js?v=20"],
  ["chat-history-cards.js?v=b59", "chat-history-cards.js?v=b60"],
  ["chat-store-bereiche.js?v=1", "chat-store-bereiche.js?v=2"],
  ["code-flaeche.js?v=57", "code-flaeche.js?v=58"],
  ["app.js?v=b115", "app.js?v=b116"],
  ["pwa-schnellstart.js?v=4", "pwa-schnellstart.js?v=5"],
  ["chat-actions.js?v=b45", "chat-actions.js?v=b46"],
  ["search-overlay.js?v=b59", "search-overlay.js?v=b60"],
  ["search.js?v=b52", "search.js?v=b53"],
  // Kettenwirkung Runde 2: die Nachlader darueber
  ["such-nachladen.js?v=2", "such-nachladen.js?v=3"],
  ["code-nachladen.js?v=15", "code-nachladen.js?v=16"],
  ["bedarf-nachladen.js?v=2", "bedarf-nachladen.js?v=3"]
];
const dateien = [];
for (const f of fs.readdirSync(path.join(WURZEL, "public"))) if (/\.(js|html)$/.test(f)) dateien.push(path.join("public", f));
// tests/modul-einmal-instanz.test.mjs traegt eigene Beispielzeilen mit Marke UND Regex — bleibt unangetastet.
for (const f of fs.readdirSync(path.join(WURZEL, "tests"))) if (f.endsWith(".mjs") && f !== "modul-einmal-instanz.test.mjs") dateien.push(path.join("tests", f));
let geaendert = 0; const bericht = new Map();
for (const rel of dateien) {
  const abs = path.join(WURZEL, rel); const alt = fs.readFileSync(abs, "utf8"); let neu = alt;
  for (const [von, zu] of ERSETZUNGEN) { if (neu.includes(von)) { neu = neu.split(von).join(zu); bericht.set(rel, [...(bericht.get(rel) || []), von.split("?")[0]]); } }
  if (neu !== alt) { geaendert += 1; if (!nurPruefen) fs.writeFileSync(abs, neu); }
}
for (const [rel, mods] of bericht) console.log((nurPruefen ? "wuerde aendern " : "geaendert ") + rel + ": " + [...new Set(mods)].join(", "));
console.log((nurPruefen ? "Vorschau: " : "Fertig: ") + geaendert + " Dateien.");
if (!geaendert) process.exit(1);
