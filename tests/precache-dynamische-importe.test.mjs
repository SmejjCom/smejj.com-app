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

// ---------------------------------------------------------------------------
// Der Stopp-Knopf darf auf NICHTS warten.
//
// GEMESSEN 2026-08-20 auf einem emulierten Handy: das Arbeits-Viereck war nach
// 2.061 ms sichtbar, aber erst nach 4.087 ms bedienbar — zwei Sekunden lang
// ein Stopp-Knopf, der nichts tut. Grund war ein statischer Importblock in
// chat-stopp.js (fuer das Fortsetzen dazugekommen): ein Modul fuehrt seinen
// Rumpf erst aus, wenn die GANZE Kette geladen ist, und das Verdrahten der
// Knoepfe braucht davon nichts.
//
// Diese Zusicherung haelt die Bauart fest, nicht die Millisekunden: keine
// statischen Importe, und die Verdrahtung steht vor jedem Nachladen.
test("chat-stopp.js verdrahtet SOFORT — keine statischen Importe", () => {
  const quelle = fs.readFileSync("public/chat-stopp.js", "utf8");
  const statisch = [...quelle.matchAll(/^\s*import\s+[^(].*?from\s+["'][^"']+["']/gm)].map((t) => t[0].trim());
  assert.deepEqual(statisch, [],
    `statische Importe verzoegern das Verdrahten:\n  ${statisch.join("\n  ")}`);
  // Die Abhaengigkeiten muessen ueberhaupt nachgeladen werden — sonst waere
  // die Datei nur leer, nicht schnell. Geprueft wird das dynamische import(),
  // egal ob mit await, in Promise.all oder mit .then().
  const dynamisch = [...quelle.matchAll(/\bimport\(\s*["'][^"']+["']/g)].length;
  assert.ok(dynamisch >= 2, `nur ${dynamisch} dynamische Importe — laedt die Datei ihre Abhaengigkeiten noch?`);
});

test("der Waechter beisst zu, wenn jemand einen Import zurueckholt", () => {
  // TUEV: eine praeparierte Zeile MUSS gefunden werden, sonst prueft die
  // Zusicherung oben nichts.
  const probe = 'import { x } from "./y.js";\nconst a = 1;';
  const gefunden = [...probe.matchAll(/^\s*import\s+[^(].*?from\s+["'][^"']+["']/gm)];
  assert.equal(gefunden.length, 1, "Muster erkennt einen statischen Import nicht");
});
