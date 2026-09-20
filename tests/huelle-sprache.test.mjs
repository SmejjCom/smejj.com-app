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

// GEMESSEN 20.09.2026 an der ausgelieferten Seite: die Tag-Sperre sprang ueber
// das GANZE Element und damit auch ueber seine Attribute. Der Platzhalter jedes
// Eingabefeldes blieb deutsch — auch "Frag mich alles" auf der Startseite.
test("ein gesperrtes Tag schuetzt seinen Inhalt, nicht seine Beschriftung", () => {
  assert.match(quelle, /const nurBeschriftung = GESPERRTE_TAGS\.has\(el\.tagName\)/);
  // Die Attribut-Schleife steht VOR dem Ausstieg, die Textknoten-Schleife dahinter.
  const nachAttribut = quelle.indexOf("if (nurBeschriftung) continue;");
  assert.ok(quelle.indexOf("for (const name of ATTRIBUTE)") < nachAttribut, "Attribute muessen vor dem Ausstieg laufen");
  assert.ok(nachAttribut < quelle.indexOf("for (const knoten of el.childNodes)"), "Textknoten muessen nach dem Ausstieg stehen");
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
  assert.match(quelle, /startsWith\("de"\)/);
});

// GEMESSEN 20.09.2026 mit leerem Speicher (Zuarbeit der Play-Sitzung): beim
// ERSTEN Besuch in einer neuen Sprache liefert t() noch den deutschen
// Quelltext, weil die Sprachdatei erst im Hintergrund laedt. uiLanguage() steht
// in diesem Moment auf "de". Wer die Sperre daran haengt, steigt genau bei den
// Nutzern aus, fuer die das Modul gebaut ist — und haengt die Wache nie ein:
// die Huelle bliebe die ganze Sitzung deutsch.
test("die Sperre fragt die GESPEICHERTE Wahl, nicht die gerade geladene Sprache", () => {
  assert.match(quelle, /import \{[^}]*savedUiLanguage[^}]*\} from "\.\/i18n\/ui\.js/);
  assert.match(quelle, /savedUiLanguage\(\) \|\| "de"/);
  const codeOhneKommentare = quelle.replace(/\/\/[^\n]*/g, "");
  assert.ok(!/\buiLanguage\(/.test(codeOhneKommentare), "uiLanguage() darf im Code nicht mehr entscheiden");
});

test("nach dem Nachladen der Sprachdatei wird einmal nachgezogen", () => {
  const ui = fs.readFileSync(path.join(wurzel, "public", "i18n", "ui.js"), "utf8");
  assert.match(ui, /new CustomEvent\("smejj:sprache"/, "ui.js meldet den Sprachwechsel nicht");
  // Beide Wege muessen melden: die geladene Sprache UND der Rueckfall auf Deutsch.
  assert.ok(ui.split("meldeSprache(").length - 1 >= 3, "nicht jeder Ausgang von loadUiLanguage meldet");
  assert.match(quelle, /addEventListener\("smejj:sprache"/, "die Huelle zieht nicht nach");
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
