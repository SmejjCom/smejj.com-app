// smejj.com — das Nachrichten-Menue und "Inhalt melden" folgen der Sprache der Oberflaeche.
// Geraetetest 20.09.2026 (iPhone-App + Android-Chrome, Oberflaeche Englisch): die Leiste hiess
// "Copy / More", das Menue dahinter und der Melde-Dialog blieben deutsch — ein englischer
// Play-Pruefer haette "Inhalt melden" nicht als Meldefunktion erkannt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (...teile) => fs.readFileSync(path.join(wurzel, "public", ...teile), "utf8");
const SPRACHEN = ["en", "es", "fr", "it", "pt", "tr", "ru", "ja", "ko", "zh", "ar", "hi", "bn", "id"];

function menueLabels() {
  const quelle = lies("chat-actions-menu.js");
  const anfang = quelle.indexOf("const ITEMS");
  const ende = quelle.indexOf("const BAR_SPECS");
  const teil = quelle.slice(anfang, ende) + quelle.slice(quelle.indexOf("const MENU_KOPF"), quelle.indexOf("const MENU_KOPF") + 900);
  return [...new Set([...teil.matchAll(/label: (?:t\()?"([^"]+)"\)?/g)].map((m) => m[1]))];
}

test("jedes Label des Nachrichten-Menues hat eine Uebersetzung in allen 14 Sprachen", async () => {
  const labels = menueLabels();
  assert.ok(labels.includes("Inhalt melden") && labels.includes("Ab hier löschen") && labels.length >= 14, `Labels: ${labels.join(", ")}`);
  for (const sprache of SPRACHEN) {
    const woerter = (await import(path.join(wurzel, "public", "i18n", `${sprache}.js`))).default;
    for (const label of labels) assert.ok(woerter[label], `${sprache}: "${label}" fehlt`);
  }
});

test("der Melde-Dialog schreibt keinen festen deutschen Text mehr in die Oberflaeche", async () => {
  const quelle = lies("inhalt-melden.js");
  assert.match(quelle, /import \{ t \} from "\/assets\/i18n\/ui\.js\?v=3";/);
  for (const zeile of quelle.split("\n")) {
    if (/^\s*stil\.textContent/.test(zeile)) continue; // CSS, kein Oberflaechentext
    if (/(textContent|placeholder) = "|showToast\("/.test(zeile)) assert.fail(`fester Text: ${zeile.trim()}`);
  }
  assert.match(quelle, /knopf\.textContent = t\(grund\.text\)/);
  const en = (await import(path.join(wurzel, "public", "i18n", "en.js"))).default;
  for (const m of quelle.matchAll(/\bt\("([^"]+)"\)/g)) assert.ok(en[m[1]], `en: "${m[1]}" fehlt`);
  for (const m of quelle.matchAll(/text: "([^"]+)"/g)) assert.ok(en[m[1]], `en: Grund "${m[1]}" fehlt`);
  assert.equal(en["Inhalt melden"], "Report content");
});

test("uebersetzeMenue ersetzt die Woerter, laesst Symbole stehen und laeuft nur einmal", async () => {
  const quelle = lies("chat-menue-mehr.js");
  const koerper = quelle.slice(quelle.indexOf("export function uebersetzeMenue"), quelle.indexOf("export function initChatMenueMehr"));
  const uebersetzeMenue = new Function(`${koerper.replace("export function", "function").replace("uebersetze = t", "uebersetze")}; return uebersetzeMenue;`)();
  const wort = (text) => ({ textContent: text });
  const knopf = (text) => { const w = wort(text); return { w, querySelector: () => w }; };
  const knoepfe = [knopf("Inhalt melden"), knopf("Kopieren"), knopf("Unbekannt")];
  const attribute = { "aria-label": "Weitere Aktionen" };
  const kopf = { textContent: "Heute, 17:36 · Auto" };
  const menu = { dataset: {}, querySelector: () => kopf, getAttribute: (n) => attribute[n], setAttribute: (n, v) => { attribute[n] = v; }, querySelectorAll: () => knoepfe };
  const woerter = { Heute: "Today", "Inhalt melden": "Report content", Kopieren: "Copy", "Weitere Aktionen": "More actions" };
  const zahl = uebersetzeMenue(menu, (k) => woerter[k] || k);
  assert.equal(zahl, 2);
  assert.equal(knoepfe[0].w.textContent, "Report content");
  assert.equal(knoepfe[2].w.textContent, "Unbekannt");
  assert.equal(attribute["aria-label"], "More actions");
  assert.equal(kopf.textContent, "Today, 17:36 · Auto");
  assert.equal(uebersetzeMenue(menu, () => "X"), 0, "zweiter Lauf darf nichts mehr anfassen");
  assert.match(quelle, /observe\(document\.body, \{ childList: true \}\)/, "nur die Kinder des BODY beobachten — kein subtree");
});

test("der Melde-Dialog ueberschreibt das weisse button:hover aus styles.css (klebt am Handy an der Beruehrstelle)", () => {
  const quelle = lies("inhalt-melden.js");
  assert.match(quelle, /\.melden-grund:hover\{background:rgba\(255, 255, 255, 0\.08\);\}/);
  assert.match(quelle, /\.melden-knopf:hover\{/);
});
