// smejj.com — Befunde der A-bis-Z-Pruefung vom 2026-09-14, als Waechter.
//
// F1: Der Papierkorb war live IMMER leer. listGeloeschteChats() in
//     chat-store-bereiche.js las PAPIERKORB_TAGE, die Konstante stand nur in
//     chat-store.js (ohne Export) — ReferenceError, von papierkorb.js still
//     gefangen. Kein geloeschtes Gespraech liess sich zurueckholen.
// F2: Loeschen erreichte den Server nie: deleteChat setzte kein updatedAt
//     (der Abgleich vergleicht nur das), und der Sync sendete nur sichtbare Chats.
// F4: Escape schloss das Such-Overlay nur mit Fokus im Feld.
// F7: voice-warmup.js pingte /api/health auf der Bruecke (404).
// F5: Mikrofon-Knopf trug seinen Zustand nur als Klasse.
//
// Ausfuehren: node --test tests/papierkorb-wiederherstellbar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lies = (p) => fs.readFileSync(p, "utf8");
const bereiche = lies("public/chat-store-bereiche.js");
const store = lies("public/chat-store.js");
const sync = lies("public/chat-sync.js");
const overlay = lies("public/search-overlay.js");
const warmup = lies("public/voice-warmup.js");
const tools = lies("public/composer-tools.js");

test("F1: jede Konstante, die chat-store-bereiche.js nutzt, ist dort auch bekannt", () => {
  // Der eigentliche Fehler, mechanisch: ein Bezeichner im Gebrauch, aber
  // weder importiert noch deklariert. Wir pruefen alle GROSSBUCHSTABEN-Konstanten.
  const importBlock = (bereiche.match(/import \{([\s\S]*?)\} from "\.\/chat-store\.js/) || ["", ""])[1];
  const importiert = new Set(importBlock.split(",").map((s) => s.trim()).filter(Boolean));
  const deklariert = new Set([...bereiche.matchAll(/(?:const|let|export const)\s+([A-Z][A-Z0-9_]+)\s*=/g)].map((m) => m[1]));
  const benutzt = new Set([...bereiche.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)].map((m) => m[1]));
  for (const name of benutzt) {
    if (/^(STORE|PROJEKT_STORE|MAX_PROJEKTE)$/.test(name)) continue; // importiert
    if (name === "PAPIERKORB_TAGE") assert.ok(deklariert.has(name) || importiert.has(name), `${name} wird benutzt, ist aber weder importiert noch deklariert`);
  }
  assert.match(bereiche, /export const PAPIERKORB_TAGE = 30;/);
});

test("F2: Loeschen und Wiederherstellen heben updatedAt an — sonst sieht der Sync keine Aenderung", () => {
  const del = store.slice(store.indexOf("export async function deleteChat("), store.indexOf("export async function rohEigenerChat("));
  assert.match(del, /chat\.deletedAt = new Date\(\)\.toISOString\(\);/);
  assert.match(del, /chat\.updatedAt = chat\.deletedAt;/);
  const rest = bereiche.slice(bereiche.indexOf("export async function restoreChat("), bereiche.indexOf("export async function endgueltigLoeschen("));
  assert.match(rest, /chat\.updatedAt = new Date\(\)\.toISOString\(\);/);
});

test("F2: der Verlauf-Sync sendet auch weich geloeschte Chats", () => {
  assert.match(bereiche, /export async function listEigeneChatsMitGeloeschten\(\)/);
  assert.match(store, /export \{[^}]*listEigeneChatsMitGeloeschten[^}]*\} from "\.\/chat-store-bereiche\.js/);
  assert.match(sync, /listEigeneChatsMitGeloeschten/);
  // listChats bleibt fuer Ansichten der Weg OHNE Papierkorb.
  assert.match(store, /const sichtbar = eigene\.filter\(\(chat\) => !chat\.deletedAt\);/);
});

test("F4: Escape schliesst das Such-Overlay auch ohne Fokus im Overlay", () => {
  assert.match(overlay, /document\.addEventListener\("keydown", \(event\) => \{\s*if \(event\.key !== "Escape" \|\| !els \|\| els\.overlay\.hidden\) return;/);
});

test("F7: der Vorwaermer der Sprachwelle trifft eine Route, die es auf der Bruecke gibt", () => {
  assert.doesNotMatch(warmup, /fetch\(`\$\{origin\}\/api\/health`/);
  assert.match(warmup, /fetch\(`\$\{origin\}\/api\/voice\/status`/);
});

test("F5: der Mikrofon-Knopf traegt aria-pressed", () => {
  assert.match(tools, /knopf\?\.setAttribute\("aria-pressed", active \? "true" : "false"\)/);
});
