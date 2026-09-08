#!/usr/bin/env node
// smejj.com — Marken-Heber fuer die Auslieferung der Modelle-Seite (2026-09-08).
//
// ANLASS: check:markenkette meldet 10 Module, die GEAENDERT wurden, ohne dass
// ihre Marke (?v=) gestiegen ist. Wiederkehrer laden deshalb weiter die alte
// Fassung — die zugehoerigen Fixes sind ausgeliefert und wirken trotzdem nicht.
// Keines dieser Module gehoert zur Modelle-Seite; sie stammen aus frueheren
// Auftraegen und blockieren jetzt jedes Deployment.
//
// WARUM NICHT EINFACH --freeze: Einfrieren wuerde nur den Waechter beruhigen.
// Der Browser bekaeme weiterhin den alten Code. Der Waechter haette recht
// behalten und niemand haette es gemerkt — genau die Falle, gegen die er am
// 18./19.08. gebaut wurde. Deshalb werden die Marken hier WIRKLICH gehoben,
// und erst danach eingefroren.
//
// ZUR LAUFZEIT statt im Zweig: mehrere dieser Glieder liegen im Start-Lock
// (app.js, premium-surfaces.js). Im Zweig festgeschrieben gaebe es bei jedem
// fremden Stempel einen Konflikt (Lehre vom 2026-08-15).
const fs = require("node:fs");
const path = require("node:path");

const WURZEL = "public";
const AUSGENOMMEN = new Set(["assets", "storage", "deploy", "icons", "shared"]);

// Genau die Module, die der Waechter am 2026-09-08 gemeldet hat.
const MODULE = [
  "panel-layout.js",
  "premium-surfaces.js",
  "browser-pane-render.js",
  "browser-pane-fernwege.js",
  "browser-pane-session.js",
  "browser-pane-maus.js",
  "composer-plus-menu.js",
  "arbeitsflaeche.js",
  "spur-start.js",
  "app.js"
];

function naechste(marke) {
  // "b47n" -> "b47o", "b47z" -> "b47za", "b123" -> "b124", "7" -> "8"
  if (/[a-y]$/.test(marke)) return marke.slice(0, -1) + String.fromCharCode(marke.charCodeAt(marke.length - 1) + 1);
  if (/z$/.test(marke)) return `${marke}a`;
  const m = /^(.*?)(\d+)$/.exec(marke);
  if (!m) throw new Error(`Marke unlesbar: ${marke}`);
  return m[1] + String(Number(m[2]) + 1);
}

function dateien(ordner) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(ordner)) {
    if (AUSGENOMMEN.has(eintrag)) continue;
    const pfad = path.join(ordner, eintrag);
    if (fs.statSync(pfad).isDirectory()) gefunden.push(...dateien(pfad));
    else if ([".js", ".html"].includes(path.extname(eintrag))) gefunden.push(pfad);
  }
  return gefunden;
}

const ALLE = dateien(WURZEL);
let gehoben = 0;

for (const modul of MODULE) {
  const muster = new RegExp(`${modul.replace(/\./g, "\\.")}\\?v=([A-Za-z0-9-]+)`, "g");

  // Erst SAMMELN, dann schreiben: der Waechter verlangt genau EINE Marke je
  // Modul im ganzen Baum. Wer Datei fuer Datei hebt, erzeugt zwischendurch
  // zwei — und bricht damit genau die Zusage, die hier geheilt werden soll.
  const treffer = [];
  const marken = new Set();
  for (const datei of ALLE) {
    const text = fs.readFileSync(datei, "utf8");
    const gefunden = [...text.matchAll(muster)].map((t) => t[1]);
    if (gefunden.length === 0) continue;
    treffer.push(datei);
    for (const m of gefunden) marken.add(m);
  }

  if (treffer.length === 0) {
    console.error(`ABBRUCH: ${modul} wird nirgends mit ?v= geladen — Liste veraltet?`);
    process.exit(1);
  }
  if (marken.size !== 1) {
    console.error(`ABBRUCH: ${modul} traegt ${marken.size} Marken (${[...marken].join(", ")}) — erwartet genau eine.`);
    process.exit(1);
  }

  const alt = [...marken][0];
  const neu = naechste(alt);
  for (const datei of treffer) {
    const text = fs.readFileSync(datei, "utf8");
    fs.writeFileSync(datei, text.replace(muster, `${modul}?v=${neu}`));
  }
  console.log(`  ${modul}: ${alt} -> ${neu}  (in ${treffer.length} Datei(en))`);
  gehoben += 1;
}

console.log(`Marken-Heber fertig: ${gehoben} Modul(e) gehoben.`);
