// smejj.com — Verlauf: Aktions-Menues mit Strichsymbolen statt Emoji (Befund F8).
//
// A-bis-Z-Pruefung 2026-09-14: Das Menue je Chat (und je Projekt) zeigte Emoji
// (↗ 📌 ✎ 📁 ⤓ 🗑), waehrend Antwort-Leiste (chat-actions-menu.js), Spur
// (spur-start.js) und Navigation (components.js, Icons) SVG-Strichsymbole
// zeichnen: stroke currentColor, keine Fuellung, keine eigene Farbe. Der Verlauf
// bekommt dieselben Zeichen; die Texte bleiben, der Text bleibt der
// zugaengliche Name (das Symbol ist aria-hidden).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const view = fs.readFileSync("public/chat-history-view.js", "utf8");
const karten = fs.readFileSync("public/chat-history-cards.js", "utf8");
const spur = fs.readFileSync("public/spur-start.js", "utf8");
const bibliothek = fs.readFileSync("public/components.js", "utf8");

// Emoji und Pfeil-/Dingbat-Zeichen — genau die Familie, aus der die alten
// Menue-Zeichen stammten (U+2190…U+2BFF Pfeile/Symbole, U+1F000…U+1FAFF Emoji).
const EMOJI = /[\u{2190}-\u{2BFF}\u{1F000}-\u{1FAFF}]/u;

function funktionsKoerper(quelle, start, ende) {
  const von = quelle.indexOf(start);
  const bis = quelle.indexOf(ende, von);
  assert.ok(von >= 0 && bis > von, `Abschnitt ${start} … ${ende} nicht gefunden`);
  return quelle.slice(von, bis);
}

test("die Karten-Bausteine liefern den Menue-Eintrag mit Symbol — Text bleibt der zugaengliche Name", () => {
  assert.match(karten, /^export function menuEintrag\(text, icon, aktion, klasse\)/m);
  assert.match(karten, /^export const VERLAUF_ICONS = Object\.freeze\(\{/m);
  const koerper = funktionsKoerper(karten, "export function menuEintrag(", "export function setzeMenuText(");
  assert.match(koerper, /zeichen\.className = "ch-menu-icon"/);
  assert.match(koerper, /zeichen\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(koerper, /label\.textContent = text/);
  assert.match(koerper, /knopf\.append\(zeichen, label\)/);
});

test("Papierkorb, Ordner und Plus kommen aus der geteilten Bibliothek — keine Duplikate", () => {
  // Derselbe Spezifizierer wie in der Spur, sonst gibt es eine zweite Modulinstanz.
  const spezifizierer = spur.match(/import \{ Icons \} from "([^"]+)"/)?.[1];
  assert.ok(spezifizierer, "spur-start.js importiert Icons nicht mehr?");
  assert.ok(karten.includes(`import { Icons } from "${spezifizierer}"`), `Karten muessen Icons aus ${spezifizierer} nehmen`);
  assert.match(karten, /loeschen: Icons\.trash/);
  assert.match(karten, /projekt: Icons\.projects/);
  assert.match(karten, /neu: Icons\.plus/);
  for (const name of ["trash", "projects", "plus"]) {
    assert.match(bibliothek, new RegExp(`^  ${name}: '<svg`, "m"), `components.js kennt ${name} nicht`);
  }
});

test("die eigenen Zeichen sind Strichsymbole ohne eigene Farbe (24er-Raster, Farbe ueber CSS)", () => {
  const block = funktionsKoerper(karten, "export const VERLAUF_ICONS", "\n});");
  const eigene = [...block.matchAll(/^\s+(\w+): '(<svg[^']*)'/gm)];
  assert.ok(eigene.length >= 6, "mindestens oeffnen, anheften, abheften, umbenennen, sichern, gewaehlt");
  for (const [, name, svg] of eigene) {
    assert.match(svg, /^<svg viewBox="0 0 24 24">/, `${name}: 24er-Raster`);
    assert.doesNotMatch(svg, /\b(fill|stroke|style|width|height)=/, `${name}: keine eigene Farbe oder Groesse im Markup`);
  }
});

test("kein Emoji mehr in den drei Menues (Chat, Projekt, Projekt-Picker)", () => {
  const chatMenu = funktionsKoerper(view, "function oeffneMenu(", "const RUECKGAENGIG_MS");
  const projektMenu = funktionsKoerper(karten, "function oeffneProjektMenu(", "function zeigeProjektUmbenennen(");
  const picker = funktionsKoerper(karten, "function zeigeProjektPicker(", "return { oeffneProjektMenu");
  for (const [name, koerper] of [["Chat-Menue", chatMenu], ["Projekt-Menue", projektMenu], ["Projekt-Picker", picker]]) {
    assert.doesNotMatch(koerper, EMOJI, `${name} enthaelt noch ein Emoji/Pfeilzeichen`);
    assert.match(koerper, /menuEintrag\(/, `${name} nutzt den gemeinsamen Eintrag nicht`);
    assert.doesNotMatch(koerper, /const eintrag = \(/, `${name} hat noch einen eigenen Eintrags-Bauer`);
  }
  // Die Texte bleiben — nur das Zeichen davor ist weg.
  for (const text of ['"Öffnen"', '"Oben anheften"', '"Nicht mehr anheften"', '"Umbenennen"', '"Zu Projekt…"', '"Als Markdown sichern"', '"Löschen"']) {
    assert.ok(chatMenu.includes(text), `Text ${text} fehlt im Chat-Menue`);
  }
  assert.ok(projektMenu.includes('"Löschen…"'));
  // Die Rueckfrage tauscht nur den Text, nicht den ganzen Knopf-Inhalt (sonst
  // waere das Symbol weg).
  assert.match(projektMenu, /setzeMenuText\(loeschen, "Wirklich\? Chats bleiben erhalten"\)/);
  assert.doesNotMatch(projektMenu, /loeschen\.textContent =/);
});

test("das Symbol wird per CSS gezeichnet: 18 px, currentColor, keine Fuellung — der Eintrag ist eine Flex-Zeile", () => {
  assert.match(view, /#chatHistory \.ch-menu button \{ display: flex; align-items: center; gap: 10px;/);
  const regel = view.match(/\.ch-menu-icon svg \{([^}]+)\}/)?.[1] || "";
  assert.ok(regel, ".ch-menu-icon svg fehlt");
  assert.match(regel, /width: 18px/);
  assert.match(regel, /height: 18px/);
  assert.match(regel, /fill: none/);
  assert.match(regel, /stroke: currentColor/);
  // Die 44-px-Untergrenze auf dem Handy bleibt.
  assert.match(view, /#chatHistory \.ch-menu button \{ min-height: 44px;/);
});

test("die Ansicht holt menuEintrag aus den nachgeladenen Bausteinen (keine zweite Quelle)", () => {
  assert.match(view, /\(\{ menuEintrag \} = karten\);/);
  assert.doesNotMatch(view, /^import .*chat-history-cards/m, "Karten bleiben nachgeladen (Startgewicht)");
});
