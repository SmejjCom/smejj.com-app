// smejj.com — Markenkette zum Maus-Livetest 2026-09-05. Geaendert: browser-pane-maus.js und
// maus-absicht.js; die Kette darueber zieht mit (Merkregel: sie bricht am obersten nicht
// erneuerten Glied). Quelle public/ + Tests; assets/ zieht build:assets nach.
// Aufruf: node scripts/einmal/maus-livetest-2026-09-05.marken.cjs [--pruefen]
const fs = require("fs");
const path = require("path");
const nurPruefen = process.argv.includes("--pruefen");
const WURZEL = path.resolve(__dirname, "..", "..");
const ERSETZUNGEN = [
  ["browser-pane-maus.js?v=browser-pane-20260905-1", "browser-pane-maus.js?v=browser-pane-20260905-3"],
  ["maus-absicht.js?v=20", "maus-absicht.js?v=21"],
  // Kettenwirkung: Importeure der beiden
  ["browser-pane.js?v=browser-pane-20260905-2", "browser-pane.js?v=browser-pane-20260905-4"],
  ["maus-panel.js?v=14", "maus-panel.js?v=15"],
  ["sendepfad-nachladen.js?v=4", "sendepfad-nachladen.js?v=5"],
  ["browser-nachladen.js?v=2", "browser-nachladen.js?v=3"],
  ["/assets/app.js?v=b134", "/assets/app.js?v=b135"],
  ['CACHE_NAME = "smejj-shell-v765"', 'CACHE_NAME = "smejj-shell-v766"']
];
const dateien = [];
for (const f of fs.readdirSync(path.join(WURZEL, "public"))) if (/\.(js|html)$/.test(f)) dateien.push(path.join("public", f));
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
