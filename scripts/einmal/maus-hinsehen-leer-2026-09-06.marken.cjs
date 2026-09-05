const fs = require("fs"); const path = require("path"); const W = path.resolve(__dirname, "..", "..");
const ERS = [
  ["browser-pane-maus.js?v=browser-pane-20260905-7", "browser-pane-maus.js?v=browser-pane-20260906-1"],
  // Parallelsitzung (8ab1f2de, Zoom-Modul) hatte die Kette darueber schon auf 20260906-1/24/18/8/6/b141/v774 gezogen:
  ["browser-pane.js?v=browser-pane-20260906-1", "browser-pane.js?v=browser-pane-20260906-2"],
  ["maus-absicht.js?v=24", "maus-absicht.js?v=25"],
  ["maus-panel.js?v=18", "maus-panel.js?v=19"],
  ["sendepfad-nachladen.js?v=8", "sendepfad-nachladen.js?v=9"],
  ["browser-nachladen.js?v=6", "browser-nachladen.js?v=7"],
  ["/assets/app.js?v=b141", "/assets/app.js?v=b142"],
  ["CACHE_NAME = \"smejj-shell-v774\"", "CACHE_NAME = \"smejj-shell-v775\""]
];
const dateien = [];
for (const f of fs.readdirSync(path.join(W, "public"))) if (/\.(js|html)$/.test(f)) dateien.push(path.join("public", f));
for (const f of fs.readdirSync(path.join(W, "tests"))) if (f.endsWith(".mjs") && f !== "modul-einmal-instanz.test.mjs") dateien.push(path.join("tests", f));
const getroffen = new Set(); let n = 0;
for (const rel of dateien) { const abs = path.join(W, rel); const alt = fs.readFileSync(abs, "utf8"); let neu = alt;
  for (const [a, b] of ERS) if (neu.includes(a)) { neu = neu.split(a).join(b); getroffen.add(a); }
  if (neu !== alt) { n += 1; fs.writeFileSync(abs, neu); console.log("geaendert " + rel); } }
for (const [a] of ERS) if (!getroffen.has(a)) console.error("NICHT GEFUNDEN: " + a);
console.log("Fertig: " + n + " Dateien."); if (getroffen.size !== ERS.length) process.exit(1);
