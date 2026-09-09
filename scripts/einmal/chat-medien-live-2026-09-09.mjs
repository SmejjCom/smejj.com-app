#!/usr/bin/env node
// smejj.com — Chat-Bilder-Fix AUF DEN LIVE-STAND legen (2026-09-09).
//
// WARUM NICHT DIE UEBLICHE KASKADE: Der Live-Stand (Frontend-Klon, origin/main,
// Service-Worker v824) entspricht seit dem 08.09. keinem Commit des Arbeitszweigs
// mehr — Parallelsitzungen liefern aus anderen Zweigen bzw. Arbeitskopien aus.
// Ein Deploy aus feature/design-v11 wuerde deren Aenderungen (z. B. den
// CSP-Fix in index.html) ueberschreiben. Darum hier der umgekehrte Weg: die
// DREI geaenderten Quelldateien werden auf die LIVE-Dateien gelegt, die
// Cache-Marken ihrer Importeure IM LIVE-STAND hochgezaehlt und der
// Service-Worker um eins erhoeht. Alles andere bleibt byte-gleich.
//
// SICHERHEITSNETZ: Jede der drei Quelldateien muss live exakt dem Stand VOR
// meiner Aenderung entsprechen (Pruefsumme) — sonst Abbruch, nichts geschrieben.
//
// Aufruf (aus der Kaskade):  node chat-medien-live-2026-09-09.mjs <klon> <quelle-worktree>
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const [klon, quelle] = process.argv.slice(2);
if (!klon || !quelle) { console.error("Aufruf: <klon> <quelle>"); process.exit(2); }

const QUELLEN = ["chat-store.js", "chat-medien.js", "chat-sync.js"];
// Pruefsummen der LIVE-Fassungen, gegen die der Fix gebaut wurde (sha256, 12 Zeichen).
const VORHER = { "chat-store.js": "1f50d3df01e8", "chat-medien.js": "bb4e213e2025", "chat-sync.js": "ff663daf7944" };

const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
const lies = (p) => readFileSync(p, "utf8");

// 1. Sicherheitsnetz
for (const f of QUELLEN) {
  const live = lies(join(klon, f));
  if (sha(live) !== VORHER[f]) { console.error(`ABBRUCH: ${f} live (${sha(live)}) ist nicht der Stand, auf dem der Fix gebaut wurde (${VORHER[f]}).`); process.exit(1); }
}
console.log("Sicherheitsnetz: alle drei Quelldateien live wie erwartet.");

// 2. Quelldateien ersetzen
const geaendert = new Set();
for (const f of QUELLEN) {
  writeFileSync(join(klon, f), lies(join(quelle, "public", f)));
  geaendert.add(f);
}

// 3. Marken der Importeure IM LIVE-STAND hochzaehlen — bis nichts mehr wandert.
const kandidaten = readdirSync(klon).filter((n) => n.endsWith(".js") || n === "index.html");
const bump = (m) => {
  const x = /^(.*-)(\d+)$/.exec(m); if (x) return x[1] + (Number(x[2]) + 1);
  if (/^\d+$/.test(m)) return String(Number(m) + 1);
  const b = /^b(\d+)$/.exec(m); if (b) return "b" + (Number(b[1]) + 1);
  throw new Error("unbekannte Marke " + m);
};
const offen = [...geaendert];
const protokoll = [];
while (offen.length) {
  const modul = offen.shift();
  const muster = new RegExp(modul.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=([A-Za-z0-9-]+)", "g");
  for (const g of kandidaten) {
    const pfad = join(klon, g);
    const text = lies(pfad);
    if (!muster.test(text)) continue;
    muster.lastIndex = 0;
    const neu = text.replace(muster, (_, marke) => `${modul}?v=${bump(marke)}`);
    writeFileSync(pfad, neu);
    protokoll.push(`${g}: ${modul} Marke gehoben`);
    if (!geaendert.has(g) && g !== "index.html") { geaendert.add(g); offen.push(g); }
    if (g === "index.html") geaendert.add(g);
  }
}

// 4. Service-Worker um eins erhoehen
const swPfad = join(klon, "sw.js");
const sw = lies(swPfad);
const m = /const CACHE_NAME = "smejj-shell-v(\d+)";/.exec(sw);
if (!m) { console.error("ABBRUCH: CACHE_NAME nicht gefunden."); process.exit(1); }
const swNeu = `smejj-shell-v${Number(m[1]) + 1}`;
writeFileSync(swPfad, sw.replace(m[0], `const CACHE_NAME = "${swNeu}";`));
geaendert.add("sw.js");

// 5. assets/-Kopien nachziehen, wo es sie live gibt
for (const f of geaendert) {
  const kopie = join(klon, "assets", f);
  if (existsSync(kopie)) writeFileSync(kopie, lies(join(klon, f)));
}

console.log(protokoll.join("\n"));
console.log(`SW: ${m[0].match(/v\d+/)[0]} -> ${swNeu}`);
console.log("GEAENDERT:", [...geaendert].sort().join(" "));
writeFileSync("/tmp/chat-medien-live-sw.txt", swNeu);
