// smejj.com — UI-i18n: Sprachdateien synchron, Runtime fail-safe, Surface verdrahtet.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const publicDir = path.resolve("public");
const settingsSurface = fs.readFileSync(path.join(publicDir, "settings-surface.js"), "utf8");
const accountPrivacy = fs.readFileSync(path.join(publicDir, "account-privacy.js"), "utf8");
const authPage = fs.readFileSync(path.join(publicDir, "auth", "auth-page.js"), "utf8");
const authLoginHtml = fs.readFileSync(path.join(publicDir, "auth", "login", "index.html"), "utf8");
const authRegisterHtml = fs.readFileSync(path.join(publicDir, "auth", "register", "index.html"), "utf8");
const profileDock = fs.readFileSync(path.join(publicDir, "profile-dock.js"), "utf8");
const profilePictureControl = fs.readFileSync(path.join(publicDir, "profile-picture-control.js"), "utf8");
// Der Store liefert deutsche Quelltexte, die profile-picture-control.js per t() uebersetzt.
const profilePictureStore = fs.readFileSync(path.join(publicDir, "profile-picture-store.js"), "utf8");
// Die Beispiel-Chips der Startseite sind seit 2026-08-13 uebersetzt; ihre
// deutschen Quelltexte stehen im Markup und im Chip-Modul.
const startChips = fs.readFileSync(path.join(publicDir, "start-chips.js"), "utf8");
// Zwei weitere t()-Oberflaechen: das Such-Overlay traegt die Bereichsnamen,
// die Begruessung nach dem Login die Plan-Karte.
const searchOverlay = fs.readFileSync(path.join(publicDir, "search.js"), "utf8");
const onboardingWelcome = fs.readFileSync(path.join(publicDir, "onboarding-welcome.js"), "utf8");
// Nutzerreise USA 2026-08-23: drei weitere Oberflaechen rufen t() und bekamen
// ihre fehlenden englischen Texte — Spur (Start) und die API-Flaechen.
// 2026-08-31: die beiden API-Flaechen (api-keys-surface, api-konto-surface)
// sind im zentralen API-Bereich (api-center-surface) aufgegangen.
const spurStart = fs.readFileSync(path.join(publicDir, "spur-start.js"), "utf8");
// Woerter unter den Symbolen der Antwort-Leiste (UI/UX-Programm 02.09., Nr. 4).
const chatActionsWoerter = fs.readFileSync(path.join(publicDir, "chat-actions-woerter.js"), "utf8");
// Erste-Schritte-Karten auf der leeren Startseite (UI/UX-Programm 02.09., Nr. 9).
const ersteSchritte = fs.readFileSync(path.join(publicDir, "erste-schritte.js"), "utf8");
const apiCenterSurface = fs.readFileSync(path.join(publicDir, "api-center-surface.js"), "utf8")
  + fs.readFileSync(path.join(publicDir, "api-center-helfer.js"), "utf8")
  // Die vier Listen-Aktionen liegen seit dem 04.09. in einem eigenen Modul (800-Zeilen-Regel);
  // ihre Texte gehoeren weiterhin zum API-Bereich, sonst gelten sie hier als verwaist.
  + fs.readFileSync(path.join(publicDir, "api-center-aktionen.js"), "utf8");
const startHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const uiRuntime = fs.readFileSync(path.join(publicDir, "i18n", "ui.js"), "utf8");
const languageOptionsSource = fs.readFileSync(path.join(publicDir, "language-options.js"), "utf8");

const LANGUAGE_CODES = [...languageOptionsSource.matchAll(/\["([a-z]{2})",/g)].map((m) => m[1]);
const TRANSLATED = LANGUAGE_CODES.filter((code) => code !== "de");

async function loadMessages(code) {
  const url = pathToFileURL(path.join(publicDir, "i18n", `${code}.js`)).href;
  return (await import(url)).default;
}

test("language-options deckt alle 15 Sprachen ab, de zuerst", () => {
  assert.equal(LANGUAGE_CODES.length, 15);
  assert.equal(LANGUAGE_CODES[0], "de");
});

test("jede Nicht-de-Sprache hat eine Sprachdatei mit identischem Schluesselsatz", async () => {
  const reference = Object.keys(await loadMessages("en")).sort();
  assert.ok(reference.length >= 90, `en.js hat nur ${reference.length} Schluessel`);
  for (const code of TRANSLATED) {
    const keys = Object.keys(await loadMessages(code)).sort();
    assert.deepEqual(keys, reference, `Schluesselsatz von ${code}.js weicht von en.js ab`);
  }
});

test("alle Uebersetzungswerte sind nicht-leere Strings", async () => {
  for (const code of TRANSLATED) {
    for (const [key, value] of Object.entries(await loadMessages(code))) {
      assert.equal(typeof value, "string", `${code}: ${key}`);
      assert.ok(value.trim().length > 0, `${code}: leerer Wert fuer ${key}`);
    }
  }
});

test("jeder Uebersetzungsschluessel ist ein echter deutscher Quelltext einer uebersetzten Oberflaeche", async () => {
  const combined = settingsSurface + accountPrivacy + authPage + authLoginHtml + authRegisterHtml
    + profileDock + profilePictureControl + profilePictureStore + startChips + startHtml
    + searchOverlay + onboardingWelcome + spurStart + apiCenterSurface + chatActionsWoerter + ersteSchritte;
  for (const key of Object.keys(await loadMessages("en"))) {
    assert.ok(combined.includes(key), `Verwaister Schluessel (nicht im Quellcode): ${key}`);
  }
});

test("Auth-Seiten sind uebersetzbar: Seiten-Uebersetzer, Laufzeit-t() und Fail-safe", () => {
  assert.match(authPage, /from "\.\.\/i18n\/ui\.js/);
  assert.match(authPage, /translateStaticPage/);
  assert.match(authPage, /NodeFilter\.SHOW_TEXT/);
  assert.match(authPage, /uiLanguage\(\) === "de"\) return/); // Deutsch: Seite bleibt unberuehrt
  assert.match(authPage, /t\(ERROR_TEXT\[/); // Servercodes werden uebersetzt ausgegeben
  assert.match(authPage, /loadUiLanguage\(savedUiLanguage\(\)\)\.then\(\(\) => translateStaticPage\(\)\)/);
});

test("account-privacy nutzt die i18n-Runtime, setzt lang/dir nur auf der View und rendert synchron", () => {
  assert.match(accountPrivacy, /from "\.\/i18n\/ui\.js/);
  assert.match(accountPrivacy, /view\.setAttribute\("lang", uiLanguage\(\)\)/);
  assert.match(accountPrivacy, /view\.setAttribute\("dir", uiDirection\(\)\)/);
  assert.doesNotMatch(accountPrivacy, /document\.documentElement\.(lang|dir)/);
  // KEIN Re-Render bei Sprachwechsel: app.js-Boot-Bindings (#saveProfile,
  // #registerLocal, #loginLocal) duerfen nicht zerstoert werden.
  assert.doesNotMatch(accountPrivacy, /loadUiLanguage/);
  assert.match(accountPrivacy, /Neue Sprache gilt nach dem Speichern des Profils\./);
});

test("i18n-Runtime bootet synchron aus dem Sprachcache (fuer app.js-Boot-Bindings)", () => {
  assert.match(uiRuntime, /CACHE_KEY/);
  assert.match(uiRuntime, /savedUiLanguage/);
  assert.doesNotMatch(uiRuntime, /^await |\nawait /); // kein Top-Level-Await (Browser-Kompatibilitaet)
});

// Browser-Sprach-Default: gespeicherte Wahl gewinnt immer; ohne Wahl entscheidet
// navigator.languages (Fallback en). Jede Variante laedt ui.js frisch (Query-Cache-Bust)
// mit gemocktem localStorage/navigator, damit der Modul-Boot mitgeprueft wird.
function mockEnvironment(storedSettings, languages) {
  const store = new Map();
  if (storedSettings) store.set("smejj.settings.v1", JSON.stringify(storedSettings));
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { languages, language: languages[0] },
    configurable: true
  });
}

async function loadUiWith(storedSettings, languages, cacheBust) {
  mockEnvironment(storedSettings, languages);
  const url = pathToFileURL(path.join(publicDir, "i18n", "ui.js")).href + `?test=${cacheBust}`;
  return import(url);
}

test("Browser-Sprach-Default: Erkennung, Fallback en und Vorrang der gespeicherten Wahl", async () => {
  const ja = await loadUiWith(null, ["ja-JP"], 1);
  assert.equal(ja.savedUiLanguage(), "ja");
  const pt = await loadUiWith(null, ["pt-BR", "en-US"], 2);
  assert.equal(pt.savedUiLanguage(), "pt");
  const unknown = await loadUiWith(null, ["xx-YY"], 3);
  assert.equal(unknown.savedUiLanguage(), "en"); // globaler Fallback
  const savedWins = await loadUiWith({ language: "tr" }, ["ja-JP"], 4);
  assert.equal(savedWins.savedUiLanguage(), "tr"); // gespeicherte Wahl gewinnt
  const german = await loadUiWith({ language: "de" }, ["ja-JP"], 5);
  assert.equal(german.savedUiLanguage(), "de"); // explizites Deutsch bleibt Deutsch
});

test("i18n-Runtime ist fail-safe und respektiert den Start-Lock (kein globales dir)", () => {
  assert.match(uiRuntime, /catch\s*\{/); // Ladefehler fallen auf Deutsch zurueck
  assert.match(uiRuntime, /RTL_LANGUAGES/);
  assert.doesNotMatch(uiRuntime, /document\.documentElement/); // niemals global lang/dir setzen
  assert.doesNotMatch(uiRuntime, /document\.body/);
});

test("settings-surface nutzt die i18n-Runtime und setzt lang/dir nur auf der View", () => {
  assert.match(settingsSurface, /from "\.\/i18n\/ui\.js/);
  assert.match(settingsSurface, /loadUiLanguage\(/);
  assert.match(settingsSurface, /view\.setAttribute\("lang", uiLanguage\(\)\)/);
  assert.match(settingsSurface, /view\.setAttribute\("dir", uiDirection\(\)\)/);
  assert.doesNotMatch(settingsSurface, /document\.documentElement\.(lang|dir)/);
});

test("Sprachwechsel rendert die Oberflaeche neu", () => {
  assert.match(settingsSurface, /settingsLanguage"\s*\)\s*\{\s*\n?\s*loadUiLanguage\(event\.target\.value\)\.then\(\(\) => render\(view\)\)/);
});

// Live gemessen am 2026-08-04 auf https://smejj.com mit einem en-US-Browser:
// Die Oberflaeche lief englisch, die Sprachauswahl zeigte "Deutsch". Ursache ist
// app.js (Start-Lock, bindSettings): sie belegt #settingsLanguage NACH dem
// Render mit `state.settings.language || "de"`. Weil save() hier ALLE Felder
// wegschreibt, hat schon ein Wechsel des Farbschemas dem Nutzer ungefragt "de"
// festgeschrieben — beim naechsten Besuch stand die ganze App auf Deutsch.
test("die Sprache wird NICHT aus dem Feld gespeichert (app.js belegt es vor)", () => {
  assert.match(settingsSurface, /next\.language = sprachwahlVomNutzer \|\| uiLanguage\(\)/,
    "save() muss die Laufzeitsprache schreiben, nicht den Feldwert");
  // Die bewusste Wahl des Nutzers muss VOR dem Speichern gemerkt werden,
  // sonst ginge genau diese Wahl verloren.
  assert.match(settingsSurface, /if \(event\.target\?\.id === "settingsLanguage"\) sprachwahlVomNutzer = event\.target\.value;\s*\n\s*save\(view\);/,
    "handleChange muss die Wahl vor save() merken");
  // Zuruecksetzen bleibt eine bewusste Wahl und stellt die Quellsprache her.
  assert.match(settingsSurface, /sprachwahlVomNutzer = DEFAULTS\.language;\s*\n\s*save\(view, t\("Standardeinstellungen wiederhergestellt"\)\)/);
});

test("die Sprachauswahl zeigt die Sprache, die wirklich laeuft", () => {
  assert.match(settingsSurface, /function zeigeAktiveSprache\(view\) \{/);
  assert.match(settingsSurface, /feld\.value !== uiLanguage\(\)\) feld\.value = uiLanguage\(\)/);
  // Einmal beim Render und einmal nach dem synchronen app.js-Boot-Stapel.
  assert.match(settingsSurface, /queueMicrotask\(\(\) => zeigeAktiveSprache\(view\)\)/);
  assert.match(settingsSurface, /applyValues\(view, readSettings\(\)\);\s*\n\s*zeigeAktiveSprache\(view\);/);
});
