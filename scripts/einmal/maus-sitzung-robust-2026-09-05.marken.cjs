const fs = require("fs"); const path = require("path");
const nurPruefen = process.argv.includes("--pruefen"); const W = path.resolve(__dirname, "..", "..");
const ERS = [
  ["browser-pane-maus.js?v=browser-pane-20260905-3", "browser-pane-maus.js?v=browser-pane-20260905-7"],
  ["browser-pane-session.js?v=browser-pane-20260822-1", "browser-pane-session.js?v=browser-pane-20260905-7"],
  ["browser-pane.js?v=browser-pane-20260905-6", "browser-pane.js?v=browser-pane-20260905-8"],
  ["maus-absicht.js?v=22", "maus-absicht.js?v=23"],
  ["maus-panel.js?v=16", "maus-panel.js?v=17"],
  ["sendepfad-nachladen.js?v=6", "sendepfad-nachladen.js?v=7"],
  ["browser-nachladen.js?v=4", "browser-nachladen.js?v=5"],
  ["/assets/app.js?v=b138", "/assets/app.js?v=b139"],
  ['CACHE_NAME = "smejj-shell-v771"', 'CACHE_NAME = "smejj-shell-v772"']
];
const dateien = [];
for (const f of fs.readdirSync(path.join(W, "public"))) if (/\.(js|html)$/.test(f)) dateien.push(path.join("public", f));
for (const f of fs.readdirSync(path.join(W, "tests"))) if (f.endsWith(".mjs") && f !== "modul-einmal-instanz.test.mjs") dateien.push(path.join("tests", f));
let n = 0; const getroffen = new Set();
for (const rel of dateien) { const abs = path.join(W, rel); const alt = fs.readFileSync(abs, "utf8"); let neu = alt;
  for (const [a, b] of ERS) if (neu.includes(a)) { neu = neu.split(a).join(b); getroffen.add(a); }
  if (neu !== alt) { n += 1; if (!nurPruefen) fs.writeFileSync(abs, neu); console.log((nurPruefen ? "wuerde aendern " : "geaendert ") + rel); } }
for (const [a] of ERS) if (!getroffen.has(a)) console.error("NICHT GEFUNDEN: " + a);
console.log((nurPruefen ? "Vorschau: " : "Fertig: ") + n + " Dateien."); if (getroffen.size !== ERS.length) process.exit(1);
