// smejj.com — A-bis-Z-Livetest 15.09.2026: Doppelklick auf "Projekt erstellen"
// legte ZWEI Projekte an; die Dialoge schrieben "loeschen" statt "löschen".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync("public/projects-surface.js", "utf8");
const start = quelle.indexOf("export function sperreWaehrendDesLaufs");
const sperreWaehrendDesLaufs = new Function(`${quelle.slice(start, quelle.indexOf("\n}\n", start) + 2).replace("export function", "function")}; return sperreWaehrendDesLaufs;`)();

/** Ein "Anlegen", das wie workspace.createProject kurz auf die Datenbank wartet. */
function werkbank() {
  const projekte = [];
  return { projekte, anlegen: async () => { await new Promise((r) => setTimeout(r, 5)); projekte.push({ id: projekte.length + 1 }); } };
}

test("KAPUTT (v883): ohne Sperre legt ein Doppelklick zwei Projekte an", async () => {
  const w = werkbank();
  await Promise.all([w.anlegen(), w.anlegen()]);
  assert.equal(w.projekte.length, 2);
});

test("GESUND: mit Sperre legt ein Doppelklick genau EIN Projekt an, danach geht es wieder", async () => {
  const w = werkbank();
  const knopf = { disabled: false };
  const anlegen = sperreWaehrendDesLaufs(w.anlegen, knopf);
  const erster = anlegen();
  assert.equal(knopf.disabled, true, "waehrend des Anlegens gesperrt");
  await Promise.all([erster, anlegen()]);
  assert.equal(w.projekte.length, 1);
  assert.equal(knopf.disabled, false, "danach wieder frei");
  await anlegen();
  assert.equal(w.projekte.length, 2, "ein spaeterer, bewusster Klick legt wieder an");
});

test("GESUND: auch nach einem Fehler ist der Knopf wieder frei", async () => {
  const knopf = { disabled: false };
  const kaputt = sperreWaehrendDesLaufs(async () => { throw new Error("db"); }, knopf);
  await assert.rejects(kaputt, /db/);
  assert.equal(knopf.disabled, false);
});

test("Verdrahtung und Umlaute in den Projekt-Dialogen", () => {
  assert.match(quelle, /const anlegen = sperreWaehrendDesLaufs\(async \(\) => \{/);
  assert.match(quelle, /Wie soll das Projekt heißen\?/);
  assert.match(quelle, /wirklich lokal löschen\?/);
  assert.match(quelle, /Projekt gelöscht\./);
  assert.doesNotMatch(quelle, /heissen\?|loeschen\?|geloescht\.|ausgewaehlt\./, "keine Ersatzschreibung in sichtbaren Texten");
});
