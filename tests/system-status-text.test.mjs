import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { lesbarerStatus } from "../public/system-status-text.js";

// Live auf smejj.com gesehen (2026-08-02): die System-Ansicht zeigte
// "Storage: true", "AI Mode: disabled", "Sync: local". Entwicklerwerte in
// einer Nutzeransicht. Freigabe des Betreibers am selben Tag, beschraenkt auf
// die Texte der System-Ansicht.

test("die live gesehenen Rohwerte werden verstaendlich", () => {
  assert.equal(lesbarerStatus("true"), "verbunden");
  assert.equal(lesbarerStatus("disabled"), "aus");
  assert.equal(lesbarerStatus("local"), "nur lokal");
  assert.equal(lesbarerStatus("false"), "nicht verbunden");
});

test("Teilwoerter in laengeren Saetzen werden mituebersetzt", () => {
  // Live gesehen: "geprueft / Inferenz disabled" beim K2.7-Eintrag.
  assert.equal(lesbarerStatus("geprueft / Inferenz disabled"), "geprueft / Inferenz aus");
});

test("unbekannte Werte bleiben UNVERAENDERT", () => {
  // Lieber ein Entwicklerwort zu viel als eine falsche Uebersetzung, die einen
  // Ausfall wie einen Normalzustand aussehen laesst.
  assert.equal(lesbarerStatus("IDrive e2 (smejj-app) OK"), "IDrive e2 (smejj-app) OK");
  assert.equal(lesbarerStatus("0 EUR Risiko / blockiert"), "0 EUR Risiko / blockiert");
  assert.equal(lesbarerStatus("irgendein neuer Zustand"), "irgendein neuer Zustand");
});

test("leere und fehlende Werte ergeben leeren Text, nicht 'undefined'", () => {
  assert.equal(lesbarerStatus(undefined), "");
  assert.equal(lesbarerStatus(null), "");
  assert.equal(lesbarerStatus("   "), "");
});

test("app.js benutzt die Uebersetzung an allen Anzeigestellen", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  for (const ziel of ["#storageStatusText", "#idriveStatusText", "#aiModeText", "#homeAiSummary", "#costAiMode"]) {
    const zeile = app.split("\n").find((l) => l.includes(ziel) && l.includes("setText"));
    assert.ok(zeile && zeile.includes("lesbarerStatus"), `${ziel} zeigt noch den Rohwert`);
  }
});

test("die Datei liegt im Precache — sonst ist die App offline tot", () => {
  // app.js importiert sie. Fehlt sie im SHELL, liefert der Rueckfall offline
  // "/" (HTML) statt JavaScript und bricht app.js komplett ab.
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(sw, /"\/assets\/system-status-text\.js"/);
  assert.match(sw, /const CACHE_NAME = "smejj-shell-v240"/,
    "ohne Versionssprung erreicht der Fix Bestandsnutzer nicht");
});

test("app.js bleibt unter der 800-Zeilen-Grenze", () => {
  const zeilen = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").split("\n").length;
  assert.ok(zeilen <= 800, `app.js hat ${zeilen} Zeilen`);
});
