// smejj.com — die App-Huelle spricht die Sprache des Nutzers.
//
// Hintergrund (Inventur 20.09.2026): index.html liegt unter dem Start-Lock und
// traegt darum feste deutsche Beschriftungen. huelle-sprache.js uebersetzt sie
// zur Laufzeit. Diese Reihe sichert die drei Eigenschaften, an denen es
// scheitern wuerde: NICHTS anfassen, was der Nutzer oder das Modell geschrieben
// hat; den Wert neben einer Beschriftung stehen lassen; bei fehlender
// Uebersetzung den deutschen Text behalten.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quelle = fs.readFileSync(path.join(wurzel, "public", "huelle-sprache.js"), "utf8");

test("Nutzer- und Modell-Inhalte sind gesperrt", () => {
  for (const wahl of ["#startLog", ".chat-log", "[data-smejj-schritte]", "#codeEditor", "#voiceModeReply"]) {
    assert.ok(quelle.includes(`"${wahl}"`), `Sperrliste ohne ${wahl}`);
  }
  // TEXTAREA und PRE/CODE duerfen nie angefasst werden: dort steht Eingabe bzw. Code.
  for (const tag of ["TEXTAREA", "PRE", "CODE"]) assert.ok(quelle.includes(`"${tag}"`), `Tag-Sperre ohne ${tag}`);
});

test("nur der erste eigene Textknoten wird ersetzt — der Wert daneben bleibt", () => {
  assert.match(quelle, /nodeType !== 3/);
  assert.match(quelle, /break;/);
  assert.ok(!/\.textContent = neu/.test(quelle), "ganzer Inhalt darf nicht ersetzt werden");
});

test("fail-safe: ohne Uebersetzung bleibt der deutsche Text stehen", () => {
  assert.match(quelle, /neu !== wert/);
});

test("deutsche Oberflaeche wird nicht angefasst", () => {
  assert.match(quelle, /uiLanguage\(\)/);
  assert.match(quelle, /startsWith\("de"\)/);
});

test("die Huelle wird geladen und liegt im Offline-Vorrat", () => {
  const lader = fs.readFileSync(path.join(wurzel, "public", "chat-actions-menu.js"), "utf8");
  assert.match(lader, /huelle-sprache\.js/);
  const sw = fs.readFileSync(path.join(wurzel, "public", "sw.js"), "utf8");
  assert.ok(sw.includes('"/assets/huelle-sprache.js"'), "Precache ohne huelle-sprache.js");
  // Precache ist alles-oder-nichts: fehlt die Datei unter /assets, installiert
  // sich KEIN Service Worker mehr (Befund v912, 20.09.2026).
  assert.ok(fs.existsSync(path.join(wurzel, "public", "assets", "huelle-sprache.js")), "assets-Kopie fehlt");
});

test("der Germanisierer laeuft nur bei deutscher Oberflaeche", () => {
  const klartext = fs.readFileSync(path.join(wurzel, "public", "deutsch-klartext.js"), "utf8");
  assert.match(klartext, /uiLanguage/);
  // setzeKlartext hatte bis zum 20.09.2026 GAR KEINE Sperre und ersetzte
  // englische Beschriftungen durch deutsche.
  assert.match(klartext, /export function setzeKlartext[\s\S]{0,400}?oberflaecheDeutsch\(doc\)/);
});
