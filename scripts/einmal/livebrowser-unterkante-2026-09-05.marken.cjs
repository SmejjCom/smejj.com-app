// Markenkette zum Live-Browser-Unterkanten-Fix 2026-09-05 (Quelle public/ + Tests; assets zieht build:assets).
const fs = require("fs"); const path = require("path");
const nurPruefen = process.argv.includes("--pruefen"); const W = path.resolve(__dirname, "..", "..");
const ERS = [
  ["browser-pane-render.js?v=browser-pane-20260822-1", "browser-pane-render.js?v=browser-pane-20260905-5"],
  ["browser-pane-fernwege.js?v=browser-pane-20260822-1", "browser-pane-fernwege.js?v=browser-pane-20260905-5"],
  ["browser-pane.js?v=browser-pane-20260905-4", "browser-pane.js?v=browser-pane-20260905-6"],
  ["maus-absicht.js?v=21", "maus-absicht.js?v=22"],
  ["maus-panel.js?v=15", "maus-panel.js?v=16"],
  ["sendepfad-nachladen.js?v=5", "sendepfad-nachladen.js?v=6"],
  ["browser-nachladen.js?v=3", "browser-nachladen.js?v=4"],
  ["/assets/app.js?v=b137", "/assets/app.js?v=b138"],
  ['CACHE_NAME = "smejj-shell-v770"', 'CACHE_NAME = "smejj-shell-v771"']
];
const dateien = [];
for (const f of fs.readdirSync(path.join(W, "public"))) if (/\.(js|html)$/.test(f)) dateien.push(path.join("public", f));
for (const f of fs.readdirSync(path.join(W, "tests"))) if (f.endsWith(".mjs") && f !== "modul-einmal-instanz.test.mjs") dateien.push(path.join("tests", f));
let n = 0; const bericht = new Map();
for (const rel of dateien) { const abs = path.join(W, rel); const alt = fs.readFileSync(abs, "utf8"); let neu = alt;
  for (const [a, b] of ERS) if (neu.includes(a)) { neu = neu.split(a).join(b); bericht.set(rel, [...(bericht.get(rel) || []), a.split("?")[0]]); }
  if (neu !== alt) { n += 1; if (!nurPruefen) fs.writeFileSync(abs, neu); } }
for (const [rel, m] of bericht) console.log((nurPruefen ? "wuerde aendern " : "geaendert ") + rel + ": " + [...new Set(m)].join(", "));
console.log((nurPruefen ? "Vorschau: " : "Fertig: ") + n + " Dateien."); if (!n) process.exit(1);
