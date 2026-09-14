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
  // Kommentare raus, sonst zaehlen Woerter wie WICHTIG oder IMMER als Bezeichner.
  const ohneKommentare = bereiche.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const benutzt = new Set([...ohneKommentare.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)].map((m) => m[1]));
  for (const name of benutzt) {
    if (name in globalThis) continue; // JSON, URL … sind eingebaut
    assert.ok(deklariert.has(name) || importiert.has(name), `${name} wird benutzt, ist aber weder importiert noch deklariert`);
  }
  assert.match(bereiche, /export const PAPIERKORB_TAGE = 30;/);
  // Und die Zahl lebt NUR dort: keine zweite Deklaration im Kern, der Papierkorb liest sie.
  assert.doesNotMatch(store, /const PAPIERKORB_TAGE = /);
  assert.match(lies("public/papierkorb.js"), /PAPIERKORB_TAGE \} from/);
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
  // chat-sync.js greift NICHT auf das Modul zu, sondern auf window.smejjChatStore —
  // die Funktion muss dort registriert sein (live gemessen 2026-09-14: fehlte, der
  // Sync fiel still auf listChats zurueck und das Loeschen blieb lokal).
  assert.match(bereiche, /window\.smejjChatStore = \{[\s\S]*listEigeneChatsMitGeloeschten[\s\S]*\};/);
  // listChats bleibt fuer Ansichten der Weg OHNE Papierkorb.
  assert.match(store, /const sichtbar = eigene\.filter\(\(chat\) => !chat\.deletedAt\);/);
});

test("F4: Escape schliesst das Such-Overlay auch ohne Fokus im Overlay", () => {
  assert.match(overlay, /document\.addEventListener\("keydown", \(event\) => \{\s*if \(event\.key !== "Escape" \|\| !els \|\| els\.overlay\.hidden\) return;/);
});

test("F7: der Vorwaermer der Sprachwelle trifft eine Route, die es auf der Bruecke gibt", () => {
  // Die Bruecke beantwortet JEDES GET unter /api/* mit 404 (Methodenwache vor dem
  // Routing, public/chat-bridge.js) — /health ist ihre einzige GET-Route.
  assert.doesNotMatch(warmup, /fetch\(`\$\{origin\}\/api\//);
  assert.match(warmup, /fetch\(`\$\{origin\}\/health`/);
  const bruecke = lies("public/chat-bridge.js");
  assert.match(bruecke, /"\/health"/, "die Bruecke muss /health als GET-Route fuehren");
});

test("F5: der Mikrofon-Knopf traegt aria-pressed", () => {
  assert.match(tools, /knopf\?\.setAttribute\("aria-pressed", active \? "true" : "false"\)/);
});
