// smejj.com — Seitentitel und Ueberschrift der Ansicht folgen der Sprache der Oberflaeche.
// Geraetetest 20.09.2026: "Verlauf · smejj.com" in englischer App.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quelle = fs.readFileSync(path.join(wurzel, "public", "view-title.js"), "utf8");
const SPRACHEN = ["en", "es", "fr", "it", "pt", "tr", "ru", "ja", "ko", "zh", "ar", "hi", "bn", "id"];
// Markennamen und gleichlautende Woerter brauchen keinen Schluessel.
const OHNE_SCHLUESSEL = new Set(["smejjBot", "smejjCloud", "Code"]);

function ueberschriften() {
  const html = fs.readFileSync(path.join(wurzel, "public", "index.html"), "utf8");
  const liste = [];
  for (const m of html.matchAll(/<(?:section|main|div)[^>]*class="[^"]*\bview\b[^"]*"[^>]*>/g)) {
    const kopf = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/.exec(html.slice(m.index, m.index + 6000));
    if (kopf) liste.push(kopf[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim());
  }
  return [...new Set(liste)];
}

function lade() {
  const koerper = quelle
    .replace(/^import .*$/m, "")
    .replace(/^const BASE_TITLE = .*$/m, 'const BASE_TITLE = "smejj.com — KI- und Code-Assistent";')
    .replace(/export function/g, "function");
  return new Function("t", "document", `${koerper}; return { viewTitle, uebersetzeUeberschrift, applyViewTitle };`);
}

test("jede Ueberschrift einer Ansicht ist in allen 14 Sprachen uebersetzt", async () => {
  const titel = ueberschriften();
  assert.ok(titel.length >= 15 && titel.includes("Verlauf") && titel.includes("Kostenschutz"), titel.join(" | "));
  for (const sprache of SPRACHEN) {
    const woerter = (await import(path.join(wurzel, "public", "i18n", `${sprache}.js`))).default;
    for (const t of titel) if (!OHNE_SCHLUESSEL.has(t)) assert.ok(woerter[t], `${sprache}: "${t}" fehlt`);
  }
});

test("Titel und Ueberschrift werden uebersetzt, die Quelle bleibt fuer den naechsten Sprachwechsel erhalten", () => {
  const woerter = { Verlauf: "History", "smejj.com — KI- und Code-Assistent": "smejj.com — AI and Code Assistant" };
  const dokument = { title: "" };
  const { applyViewTitle, uebersetzeUeberschrift } = lade()((k) => woerter[k] || k, dokument);
  const kopf = { textContent: "Verlauf", childElementCount: 0, dataset: {} };
  applyViewTitle({ querySelector: () => kopf }, "chatHistory");
  assert.equal(kopf.textContent, "History");
  assert.equal(dokument.title, "History · smejj.com");
  // Sprachwechsel zurueck auf Deutsch: geht von der gemerkten Quelle aus, nicht von "History".
  assert.equal(uebersetzeUeberschrift(kopf, (k) => k), "Verlauf");
  assert.equal(kopf.textContent, "Verlauf");
  // Start behaelt den vollen Titel — in der Sprache des Menschen.
  applyViewTitle({ querySelector: () => null }, "start");
  assert.equal(dokument.title, "smejj.com — AI and Code Assistant");
});

test("eine Oberflaeche, die ihre Ueberschrift selbst schreibt, gilt als neue Quelle; Kind-Elemente bleiben heil", () => {
  const { uebersetzeUeberschrift } = lade()((k) => k, { title: "" });
  const kopf = { textContent: "Account", childElementCount: 0, dataset: { titelQuelle: "Verlauf", titelZiel: "History" } };
  assert.equal(uebersetzeUeberschrift(kopf, (k) => ({ Verlauf: "History" })[k] || k), "Account");
  assert.equal(kopf.textContent, "Account");
  const mitKind = { textContent: "Dateien 3", childElementCount: 1, dataset: {} };
  uebersetzeUeberschrift(mitKind, () => "X");
  assert.equal(mitKind.textContent, "Dateien 3", "Ueberschrift mit Kind-Element wird nicht ueberschrieben");
});

test("view-title.js laedt t() mit derselben Kennung wie die uebrigen Wurzel-Module", () => {
  assert.match(quelle, /import \{ t \} from "\.\/i18n\/ui\.js\?v=3";/);
});
