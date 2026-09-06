// smejj.com — Erste-Schritte-Karten (UI/UX Nr. 9): Anzeige-Regel, Karten, Stil, Haken, Sprachen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const quelle = readFileSync(new URL("../public/erste-schritte.js", import.meta.url), "utf8");

async function ladeModul() {
  // Die Importe werden OHNE ihre Cache-Marke erkannt: ein Bump von ?v=b66 auf
  // ?v=b67 hat am 2026-09-06 alle drei Proben dieser Datei rot gemacht, obwohl
  // am Verhalten nichts anders war. Tests duerfen nie auf Cache-Marken
  // festgenagelt sein.
  const ersetzt = quelle
    .replace(/import \{ t \} from "\/assets\/i18n\/ui\.js(\?v=[^"]*)?";/, "const t = (s) => s;")
    .replace(/import \{ listChats \} from "\/assets\/chat-store\.js(\?v=[^"]*)?";/, "const listChats = async () => [];");
  assert.ok(!ersetzt.includes("/assets/"), "alle Browser-Importe ersetzt");
  const datei = join(mkdtempSync(join(tmpdir(), "smejj-erste-")), "erste.mjs");
  writeFileSync(datei, ersetzt);
  return import(pathToFileURL(datei).href);
}

function speicher(inhalt = {}) {
  return { getItem: (k) => inhalt[k] ?? null, setItem: (k, v) => { inhalt[k] = v; } };
}

test("sollZeigen: nur ohne Gespraeche, nie nach Ausblenden, ?erste-schritte=1 erzwingt", async () => {
  const m = await ladeModul();
  assert.equal(m.sollZeigen({ chats: [], storage: speicher(), search: "" }), true);
  assert.equal(m.sollZeigen({ chats: [{ id: 1 }], storage: speicher(), search: "" }), false);
  const s = speicher();
  m.merkeWeg(s);
  assert.equal(m.sollZeigen({ chats: [], storage: s, search: "" }), false, "ausgeblendet bleibt weg");
  assert.equal(m.sollZeigen({ chats: [{ id: 1 }], storage: s, search: "?erste-schritte=1" }), true, "Pruefschalter");
  assert.equal(m.sollZeigen({ chats: [], storage: { getItem() { throw new Error("kaputt"); } } }), false, "fail-safe");
});

test("drei Karten: Frag etwas, Bild erzeugen, Code schreiben — Bild und Code ueber die Werkzeug-Chips", async () => {
  const m = await ladeModul();
  assert.deepEqual(m.KARTEN.map((k) => k.id), ["frage", "bild", "code"]);
  assert.equal(m.KARTEN[0].chip, undefined);
  assert.equal(m.KARTEN[1].chip, "Bild");
  assert.equal(m.KARTEN[2].chip, "Programmieren");
  for (const k of m.KARTEN) assert.ok(k.vorlage, `Vorlage fuer ${k.id}`);
});

test("fuehreAus: Chip vorhanden -> Klick; sonst Vorlage ins Feld mit input-Ereignis und Fokus", async () => {
  const m = await ladeModul();
  let geklickt = 0;
  const ereignisse = [];
  const feld = { value: "", dispatchEvent: (e) => ereignisse.push(e.type), focus: () => ereignisse.push("focus") };
  const doc = {
    querySelector: (sel) => (sel.includes('aria-label="Bild"') ? { click: () => { geklickt += 1; } } : null),
    getElementById: (id) => (id === "startMessage" ? feld : null)
  };
  globalThis.Event ??= class { constructor(type) { this.type = type; } };
  assert.equal(m.fuehreAus(m.KARTEN[1], doc), "chip");
  assert.equal(geklickt, 1);
  assert.equal(m.fuehreAus(m.KARTEN[0], doc), "vorlage");
  assert.equal(feld.value, m.KARTEN[0].vorlage);
  assert.deepEqual(ereignisse, ["input", "focus"]);
});

test("Stil: viereckig, 44-px-Ziele, drei Spalten, unter 600 px eine; Haken in chat-actions-menu.js", () => {
  assert.match(quelle, /border-radius:0/);
  assert.match(quelle, /min-height:44px/);
  assert.match(quelle, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(quelle, /@media \(max-width:600px\)\{.*?grid-template-columns:1fr\}/);
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/erste-schritte.js").catch(() => {})'));
});

test("alle Texte der Karten stehen in allen 14 Sprachdateien", () => {
  const ordner = new URL("../public/i18n/", import.meta.url);
  const dateien = readdirSync(ordner).filter((f) => /^[a-z]{2}\.js$/.test(f) && f !== "ui.js");
  assert.equal(dateien.length, 14);
  for (const f of dateien) {
    const s = readFileSync(new URL(f, ordner), "utf8");
    for (const k of ["Erste Schritte", "Frag etwas", "Bild erzeugen", "Code schreiben", "Ausblenden", "Erkläre mir in drei Sätzen, was du für mich tun kannst."]) {
      assert.ok(s.includes(`"${k}":`), `${f}: ${k}`);
    }
  }
});
