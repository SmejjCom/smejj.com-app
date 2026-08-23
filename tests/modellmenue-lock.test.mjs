// Waechter fuer die MODELL-LISTE — die Substanz, nicht nur die Bytes.
//
// Betreiber-Auftrag 2026-08-23 im Wortlaut: "Genau diese Liste ich will haben
// und musst du sichern soll nicht geaendert werden nicht kaputt gemacht werden
// ohne meine schriftliche Bestaetigung."
//
// WARUM DIESER WAECHTER NEBEN DER DATEISPERRE STEHT:
// scripts/check-modell-menue-lock.mjs vergleicht Hashes. Das meldet JEDE
// Aenderung — auch einen Kommentar — und sagt nichts darueber, ob die Liste
// noch funktioniert. Hier wird das Gegenteil geprueft: was die Liste
// ausmacht, muss da sein, egal wie die Datei sonst umgebaut wird.
//
// Die drei Arten, wie die lange Liste bisher verschwunden ist oder haette
// verschwinden koennen — je eine Pruefung dagegen:
//   1. Der Katalog-Nachbau faellt beim Aufraeumen raus. Dann bleibt nur die
//      fest verdrahtete Kurzliste stehen und sieht voellig gesund aus.
//   2. Jemand deckelt die Liste ("die ersten zehn reichen doch"). Faellt bei
//      14 Eintraegen niemandem auf — bis der Katalog waechst.
//   3. Die Quelle wird geaendert, die ausgelieferte /assets/-Kopie nicht.
//      Live bleibt die alte Liste stehen (Memory: "Artefakt ersetzt NIE die
//      Quelle").
//
// Jede Pruefung hat eine GESUNDE und eine KAPUTTE Probe (Waechter-TUEV):
// ein Waechter, der nie ausschlaegt, schuetzt nichts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// fileURLToPath, NICHT .pathname: der Projektordner heisst
// "- smejj.com info/smejj.com App" — mit Leerzeichen, die .pathname als %20
// liefert. fs findet dann keine einzige Datei und der Waechter laeuft still leer.
const wurzel = fileURLToPath(new URL("../", import.meta.url));
const lies = (p) => readFileSync(wurzel + p, "utf8");

const CLINE_MENUE = "public/cline-model-menu.js";
const CODE_MENUE = "public/code-modell-menue.js";

// Die 14 Kurznamen aus der Betreiber-Freigabe 2026-08-17, in seiner Reihenfolge.
const WUNSCHLISTE = [
  "Opus 5", "GPT 5.6", "GLM 5.3", "Kimi K3", "Deepseek V4 Pro", "Qwen 3.8 Max",
  "Kimi K2.7 Code", "Minimax M3", "Deepseek V4 Flash", "GLM 5.2",
  "Mimo V2.5 Pro", "Qwen 3.7 Plus", "Kimi K2.6", "Mimo V2.5"
];

// ---- reine Pruefungen (auf Text, damit sich kaputte Proben einspeisen lassen)

/** Baut das Untermenue Auto ZUERST und danach alle Katalog-Gruppen? */
export function autoStehtVorDenGruppen(text) {
  const auto = text.indexOf("submenu.append(autoButton(");
  const gruppen = text.indexOf("for (const category of GROUP_ORDER)");
  return auto >= 0 && gruppen >= 0 && auto < gruppen;
}

/** Kommen die Gruppen in der gewohnten Folge — erst Cline Pass, dann Empfohlen? */
export function gruppenFolge(text) {
  const treffer = text.match(/GROUP_ORDER\s*=\s*\[([^\]]*)\]/);
  if (!treffer) return [];
  return [...treffer[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Wird die lange Liste ueberhaupt noch aus dem Katalog gebaut?
 * Gesucht ist eine Schleife ueber die Katalog-Eintraege — ohne sie zeigt das
 * Menue nur noch das, was fest im Code steht.
 */
export function baustDuAusDemKatalog(text) {
  return /for \(const model of entries\)/.test(text)
    || /for \(const m of katalog\?\.models \|\| \[\]\)/.test(text);
}

/**
 * Deckelt irgendwer die Liste? slice/splice/`> N`-Abbrueche auf den
 * Katalog-Eintraegen sind hier verboten: die Liste ist so lang wie der
 * Katalog, Punkt.
 */
export function deckelGefunden(text) {
  return /(models|entries|katalog\?\.models|katalog\.models)[^\n;]{0,40}\.slice\(/.test(text)
    || /\.slice\(0,\s*\d+\)[^\n]{0,30}(models|entries)/.test(text);
}

/**
 * Holt das Menue den Katalog noch beim Server ab?
 * Zwei Schreibweisen sind im Haus ueblich und beide zaehlen: das Untermenue
 * ruft api("/models"), die Code-Flaeche baut den Pfad zusammen
 * (`${API_ORIGIN}/api/providers/cline/${pfad}` mit pfad = "models"). Ein
 * Waechter, der nur die eine Schreibweise kennt, meldet beim naechsten
 * Umbau einen Fehler, den es nicht gibt.
 */
export function holtDenKatalog(text) {
  if (/api\("\/models"\)/.test(text)) return true;
  if (/providers\/cline\/models/.test(text)) return true;
  return /providers\/cline\//.test(text) && /baueGedaechtnis\("models"/.test(text);
}

// ---- die echten Dateien ------------------------------------------------------

test("Untermenue: Auto steht ueber den Gruppen", () => {
  assert.ok(autoStehtVorDenGruppen(lies(CLINE_MENUE)),
    "Auto muss VOR der Gruppenschleife angehaengt werden — der Betreiber will es ganz oben");
});

test("Untermenue: Gruppenfolge Cline Pass, dann Empfohlen", () => {
  assert.deepEqual(gruppenFolge(lies(CLINE_MENUE)), ["cline-pass", "recommended"]);
});

test("beide Menues bauen die lange Liste aus dem Katalog", () => {
  for (const datei of [CLINE_MENUE, CODE_MENUE]) {
    assert.ok(baustDuAusDemKatalog(lies(datei)),
      `${datei} baut die Liste nicht mehr aus dem Katalog — dann bleibt nur die Kurzliste`);
  }
});

test("kein Deckel auf der Liste", () => {
  for (const datei of [CLINE_MENUE, CODE_MENUE]) {
    assert.ok(!deckelGefunden(lies(datei)),
      `${datei} kuerzt die Katalogliste — die Liste ist so lang wie der Katalog`);
  }
});

test("beide Menues holen den Katalog beim Server", () => {
  for (const datei of [CLINE_MENUE, CODE_MENUE]) {
    assert.ok(holtDenKatalog(lies(datei)), `${datei} ruft den Katalog nicht mehr ab`);
  }
});

test("die 14 Wunschmodelle stehen vollstaendig und in der Reihenfolge des Betreibers", () => {
  const text = lies(CODE_MENUE);
  const block = text.slice(text.indexOf("const CLINE_KURZ"), text.indexOf("];", text.indexOf("const CLINE_KURZ")));
  const namen = [...block.matchAll(/\["([^"]+)",/g)].map((m) => m[1]);
  assert.deepEqual(namen, WUNSCHLISTE);
});

test("Quelle und ausgelieferte Kopie sind byte-gleich", () => {
  // Live zaehlt /assets/. Laufen die beiden auseinander, aendert man die
  // Quelle und die Nutzer sehen weiter die alte Liste.
  for (const datei of [CLINE_MENUE, CODE_MENUE]) {
    const kopie = datei.replace("public/", "public/assets/");
    assert.equal(lies(datei), lies(kopie), `${datei} und ${kopie} weichen ab — Auslieferung nachziehen`);
  }
});

test("die Betreiber-Anordnung steht im Code, nicht nur im Chat", () => {
  // Damit der naechste Umbau weiss, warum hier nichts vereinfacht werden darf.
  assert.match(lies("scripts/check-modell-menue-lock.mjs"), /Genau diese Liste ich will haben/);
});

// ---- Waechter-TUEV: schlaegt er bei kaputten Proben ueberhaupt an? -----------

test("TUEV: kaputte Proben werden erkannt", () => {
  // 1. Auto hinter die Gruppen gerutscht
  assert.ok(!autoStehtVorDenGruppen(
    "for (const category of GROUP_ORDER) {}\nsubmenu.append(autoButton(submenu, active));"));
  // 2. Gruppe stillschweigend entfernt
  assert.deepEqual(gruppenFolge('const GROUP_ORDER = ["cline-pass"];'), ["cline-pass"]);
  // 3. Katalog-Nachbau herausgeloescht
  assert.ok(!baustDuAusDemKatalog("submenu.append(autoButton(x));"));
  // 4. Deckel eingebaut
  assert.ok(deckelGefunden("for (const model of entries.slice(0, 10)) {}"));
  assert.ok(deckelGefunden("const kurz = katalog.models.slice(0, 5);"));
  // 5. Katalog-Abruf gekappt
  assert.ok(!holtDenKatalog("const models = FESTE_LISTE;"));
});

test("TUEV: gesunde Proben bleiben gruen", () => {
  assert.ok(autoStehtVorDenGruppen(
    "submenu.append(autoButton(submenu, active));\nfor (const category of GROUP_ORDER) {}"));
  assert.deepEqual(gruppenFolge('const GROUP_ORDER = ["cline-pass", "recommended"];'), ["cline-pass", "recommended"]);
  assert.ok(baustDuAusDemKatalog("for (const model of entries) submenu.append(x);"));
  assert.ok(!deckelGefunden("const roh = String(id).split('/').pop();"));
  assert.ok(holtDenKatalog('api("/models")'));
  assert.ok(holtDenKatalog('fetch(`/api/providers/cline/${pfad}`)\nbaueGedaechtnis("models", k)'));
});
