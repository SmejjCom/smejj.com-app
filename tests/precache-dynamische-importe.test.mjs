// smejj.com — Jedes dynamisch geladene Modul MUSS im Precache stehen.
//
// BEFUND 2026-08-20 (Vergleich Quelle gegen Live): maus-absicht.js laedt
// maus-chrome.js per import("./maus-chrome.js?v=1"). Im LIVE-Zwischenspeicher
// stand der Eintrag, in der QUELLE fehlte er — ein Bau aus der Quelle haette
// ihn entfernt und die Maus-Bruecke offline stumm gemacht.
//
// Warum das keine Kleinigkeit ist: ein FEHLENDER Eintrag faellt online nie
// auf. Der Browser holt das Modul einfach aus dem Netz. Erst offline (oder
// bei wackliger Leitung) stirbt die Funktion still — genau die Fehlerfamilie
// "etwas faellt weg und niemand merkt es".
//
// Statische Importe deckt der Precache ohnehin ueber index.html ab; hier geht
// es nur um die dynamischen, die in keiner Skript-Liste stehen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sw = fs.readFileSync("public/sw.js", "utf8");

/** Alle dynamischen Importe der Frontend-Module, ohne ?v-Marke. */
function dynamischeImporte() {
  const funde = new Map();
  for (const datei of fs.readdirSync("public")) {
    if (!datei.endsWith(".js")) continue;
    const quelle = fs.readFileSync(path.join("public", datei), "utf8");
    for (const [, ziel] of quelle.matchAll(/import\(\s*["'`]([^"'`]+)["'`]/g)) {
      const ohneMarke = ziel.split("?")[0];
      if (!ohneMarke.endsWith(".js")) continue;
      // Nur eigene Module; fremde Adressen (http…) gehen den Precache nichts an.
      if (/^https?:/.test(ohneMarke)) continue;
      const name = ohneMarke.replace(/^\.\//, "").replace(/^\/assets\//, "");
      if (name.includes("/")) continue; // Unterordner haben eigene Zusicherungen
      if (!funde.has(name)) funde.set(name, datei);
    }
  }
  return funde;
}

test("jedes dynamisch geladene Modul steht im Precache", () => {
  const fehlend = [];
  for (const [modul, lader] of dynamischeImporte()) {
    if (!fs.existsSync(path.join("public", modul))) continue; // Tippfehler faengt ein anderer Test
    if (!sw.includes(`"/assets/${modul}"`)) fehlend.push(`${modul} (geladen von ${lader})`);
  }
  assert.deepEqual(fehlend, [], `offline nicht auffindbar:\n  ${fehlend.join("\n  ")}`);
});

test("der Waechter beisst wirklich zu", () => {
  // TUEV mit kaputter und gesunder Probe (Charta): ohne diese Gegenprobe
  // wuesste niemand, ob die Zusicherung oben ueberhaupt etwas prueft.
  const kaputt = sw.replace('"/assets/maus-chrome.js",', "");
  assert.ok(!kaputt.includes('"/assets/maus-chrome.js"'), "Probe nicht praepariert");
  assert.ok(sw.includes('"/assets/maus-chrome.js"'), "gesunde Probe: der Eintrag muss da sein");
});
