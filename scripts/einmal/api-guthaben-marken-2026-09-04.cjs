#!/usr/bin/env node
// smejj.com — Marken-Heber fuer die Betreiber-Kaskade "Guthaben-Leiste" (2026-09-04).
//
// Der Zweig aendert settings-surface.js (laedt api-center-surface.js?v=16).
// Darueber liegen drei GESPERRTE Kettenglieder (Start-Lock):
//   premium-surfaces.js -> app.js -> index.html
// Sie werden bewusst NICHT im Zweig angefasst, sondern hier ZUR LAUFZEIT
// hochgezogen. Grund: Parallelsitzungen ziehen dieselben Glieder mehrmals am
// Tag hoch; im Zweig festgeschrieben gaebe es bei jedem fremden Stempel einen
// Konflikt. Die Kette bricht immer am obersten nicht erneuerten Glied
// (Lehre vom 2026-08-15).
const fs = require("node:fs");

function naechste(marke) {
  // "b47n" -> "b47o", "b47z" -> "b47za", "b123" -> "b124", "7" -> "8"
  if (/[a-y]$/.test(marke)) return marke.slice(0, -1) + String.fromCharCode(marke.charCodeAt(marke.length - 1) + 1);
  if (/z$/.test(marke)) return `${marke}a`;
  const m = /^(.*?)(\d+)$/.exec(marke);
  if (!m) throw new Error(`Marke unlesbar: ${marke}`);
  return m[1] + String(Number(m[2]) + 1);
}

function hebe(datei, modul) {
  let text = fs.readFileSync(datei, "utf8");
  const muster = new RegExp(`${modul.replace(/[.]/g, "\\.")}\\?v=([A-Za-z0-9-]+)`, "g");
  const marken = new Set([...text.matchAll(muster)].map((t) => t[1]));
  if (marken.size !== 1) throw new Error(`${datei}: ${modul} traegt ${marken.size} Marken (${[...marken].join(", ")}) — erwartet genau eine`);
  const alt = [...marken][0];
  const neu = naechste(alt);
  fs.writeFileSync(datei, text.replace(muster, `${modul}?v=${neu}`));
  console.log(`${datei}: ${modul} ${alt} -> ${neu}`);
}

const settings = fs.readFileSync("public/settings-surface.js", "utf8");
if (!settings.includes("./api-center-surface.js?v=16")) {
  console.error("ABBRUCH: public/settings-surface.js laedt nicht api-center-surface.js?v=16 — Zweig nicht gemergt?");
  process.exit(1);
}
hebe("public/premium-surfaces.js", "settings-surface.js");
hebe("public/app.js", "premium-surfaces.js");
hebe("public/index.html", "app.js");
console.log("Marken-Heber fertig.");
