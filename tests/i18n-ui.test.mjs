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
    + profileDock + profilePictureControl + profilePictureStore;
  for (const key of Object.keys(await loadMessages("en"))) {
    assert.ok(combined.includes(key), `Verwaister Schluessel (nicht im Quellcode): ${key}`);
  }
});

// Die Gegenrichtung. Der Test darueber findet Schluessel OHNE Quelltext; am
// 2026-08-10 fiel auf, dass der umgekehrte Fall gar nicht geprueft wurde:
// Commit 65781ea hatte 20 neue deutsche Texte in die Oberflaeche gebracht,
// ohne sie zu uebersetzen — in allen 13 Fremdsprachen standen sie auf Deutsch,
// darunter Anmelde- und Einwilligungs-Meldungen. Niemandem ist es aufgefallen,
// weil kein Check danach gesucht hat.
//
// Bewusst unuebersetzt: die Zahlungs-Rechtstexte. Eine Uebersetzung ist dort
// eine rechtliche Aussage und gehoert zur Anwaltspruefung, nicht in einen
// Fleiss-Commit (Betreiber-Entscheidung 2026-08-10). Wird einer davon
// uebersetzt, faellt er einfach aus dieser Liste — der Test verlangt nicht,
// dass eine Ausnahme unuebersetzt BLEIBT.
const UNUEBERSETZT_ERLAUBT = [
  { text: "AGB", grund: "Rechtstext-Link, wartet auf Anwaltspruefung" },
  { text: "Widerrufsbelehrung", grund: "Rechtstext-Link, wartet auf Anwaltspruefung" },
  { text: "und die", grund: "Bindeglied zwischen den beiden Rechtstext-Links" },
  { text: "Verträge hier kündigen", grund: "Kuendigungs-Link nach § 312k BGB" },
  { text: "Mit „Zahlungspflichtig abonnieren“", grund: "Stripe-Weiterleitungshinweis" },
  { text: "Alle Preise sind Gesamtpreise", grund: "Preis- und Laufzeitangabe" },
  { text: "Aktuell Stripe-TESTMODUS", grund: "Hinweis zum Zahlungs-Testbetrieb" },
  { text: "Kündigung: Im Stripe-Kundenportal", grund: "Kuendigungsweg" },
  { text: "Kündigung: Eine vorbereitete E-Mail", grund: "Kuendigungsbestaetigung in Textform" },
  { text: "Kündigung meines smejj.com Abonnements", grund: "Betreff der Kuendigungserklaerung — Rechtstext" },
  { text: "Hiermit kündige ich mein kostenpflichtiges", grund: "Wortlaut der Kuendigungserklaerung — Rechtstext" }
];

test("jeder t()-Text der Oberflaeche ist uebersetzt (oder begruendet ausgenommen)", async () => {
  const combined = settingsSurface + accountPrivacy + authPage + authLoginHtml + authRegisterHtml
    + profileDock + profilePictureControl + profilePictureStore;
  // Wortgrenze davor: sonst zaehlt `createElement("img")` als `t("img")`.
  const quelltexte = [...combined.matchAll(/(?<![\w$.])t\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  assert.ok(quelltexte.length >= 100, `nur ${quelltexte.length} t()-Aufrufe gefunden — Regex vermutlich kaputt`);

  const uebersetzt = new Set(Object.keys(await loadMessages("en")));
  const erlaubt = (text) => UNUEBERSETZT_ERLAUBT.some((a) => text.includes(a.text));
  const fehlend = [...new Set(quelltexte)].filter((t) => !uebersetzt.has(t) && !erlaubt(t));
  assert.deepEqual(fehlend, [],
    `Diese Texte erscheinen in jeder Fremdsprache auf Deutsch:\n  ${fehlend.join("\n  ")}`);
});

// Zweite Luecke, gefunden am 2026-08-10 beim Erstellen der Anwaltsvorlage:
// der Test oben sieht nur `t("Text")`. Die Oberflaeche baut ihre Zeilen aber
// ueber Hilfsfunktionen — `dataAction("Plus", "…", "id", "Zahlungspflichtig
// abonnieren")` —, und DIE uebersetzen ihre Argumente erst im Rumpf. So blieb
// ausgerechnet die Schaltflaechenbeschriftung nach § 312j Abs. 3 BGB in 14
// Sprachen deutsch, ohne dass etwas anschlug.
//
// Deshalb hier ein kleiner Parser statt einer Regex: Klammern und
// Zeichenketten muessen mitgezaehlt werden, sonst trennt ein Komma IM Text die
// Argumente an der falschen Stelle und die Zuordnung Parameter->Text kippt.

/** Liest ab `start` (hinter der oeffnenden Klammer) bis zur passenden zu. */
function leseBlock(text, start, zuZeichen) {
  let tiefe = 1;
  let i = start;
  const grenzen = [start];
  while (i < text.length && tiefe > 0) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === quote) break;
        i += 1;
      }
    } else if ("([{".includes(c)) {
      tiefe += 1;
    } else if (")]}".includes(c)) {
      tiefe -= 1;
      if (tiefe === 0 && c === zuZeichen) break;
    } else if (c === "," && tiefe === 1) {
      grenzen.push(i + 1);
    }
    i += 1;
  }
  return { ende: i, grenzen, inhalt: text.slice(start, i) };
}

function argumente(text, start) {
  const { ende, grenzen } = leseBlock(text, start, ")");
  return grenzen.map((von, k) => text.slice(von, k + 1 < grenzen.length ? grenzen[k + 1] - 1 : ende).trim());
}

/** Hilfsfunktionen samt der Parameter, die im Rumpf durch t() laufen. */
function uebersetzendeHelfer(quelle) {
  const gefunden = new Map();
  for (const m of quelle.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/g)) {
    const params = m[2].split(",").map((p) => p.trim().split("=")[0].trim()).filter(Boolean);
    const rumpf = leseBlock(quelle, m.index + m[0].length, "}").inhalt;
    const durchT = params.filter((p) => new RegExp(`t\\(\\s*${p}\\s*\\)`).test(rumpf));
    if (durchT.length) gefunden.set(m[1], { params, durchT });
  }
  return gefunden;
}

// Texte, die durch eine Hilfsfunktion laufen und trotzdem deutsch bleiben.
const HELFER_AUSNAHMEN = [
  { text: "Zahlungspflichtig abonnieren", grund: "Schaltflaeche § 312j Abs. 3 BGB — Wortlaut je Sprache ist Anwaltssache" },
  { text: "Gesamtpreis 9 € pro Monat", grund: "Preis- und USt-Angabe, wartet auf Anwaltspruefung" },
  { text: "Gesamtpreis 19 € pro Monat", grund: "Preis- und USt-Angabe, wartet auf Anwaltspruefung" },
  { text: "Gesamtpreis 39 € pro Monat", grund: "Preis- und USt-Angabe, wartet auf Anwaltspruefung" },
  { text: "GitHub", grund: "Eigenname eines Dienstes" },
  { text: "Google Drive", grund: "Eigenname eines Dienstes" },
  { text: "Slack", grund: "Eigenname eines Dienstes" }
];

test("auch Texte hinter Hilfsfunktionen sind uebersetzt (§ 312j-Falle)", async () => {
  const combined = settingsSurface + accountPrivacy + profileDock;
  const helfer = uebersetzendeHelfer(combined);
  assert.ok(helfer.size >= 8,
    `nur ${helfer.size} uebersetzende Hilfsfunktionen erkannt — Parser vermutlich kaputt`);
  assert.ok(helfer.has("dataAction"), "dataAction fehlt — genau dort sass die § 312j-Schaltflaeche");

  const literal = /^"((?:[^"\\]|\\.)*)"$/;
  const texte = [];
  for (const [name, { params, durchT }] of helfer) {
    for (const m of combined.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "g"))) {
      const args = argumente(combined, m.index + m[0].length);
      params.forEach((p, i) => {
        if (!durchT.includes(p) || i >= args.length) return;
        const treffer = literal.exec(args[i]);
        if (treffer) texte.push({ name, param: p, text: treffer[1] });
      });
    }
  }
  assert.ok(texte.length >= 100, `nur ${texte.length} Texte gefunden — Aufruf-Erkennung vermutlich kaputt`);

  const uebersetzt = new Set(Object.keys(await loadMessages("en")));
  const erlaubt = (t) => HELFER_AUSNAHMEN.some((a) => t.includes(a.text));
  const fehlend = [...new Set(texte.filter((e) => !uebersetzt.has(e.text) && !erlaubt(e.text))
    .map((e) => `[${e.name}/${e.param}] ${e.text}`))];
  assert.deepEqual(fehlend, [],
    `Diese Texte erscheinen in jeder Fremdsprache auf Deutsch:\n  ${fehlend.join("\n  ")}`);
});

test("die Kuendigungs-E-Mail ist uebersetzbar aufgebaut", async () => {
  // § 312k-Notweg ohne Stripe-Portal: der Knopf oeffnet eine vorformulierte
  // E-Mail. Bis zum 2026-08-10 waren Betreff und Text fest verdrahtet — ein
  // Verbraucher mit tuerkischer Oberflaeche bekam eine deutsche
  // Kuendigungserklaerung zum Absenden. Der Wortlaut bleibt deutsch, bis die
  // Kanzlei liefert; die Technik steht, damit dafuer kein Code mehr faellt.
  assert.match(accountPrivacy, /encodeURIComponent\(t\("Kündigung meines smejj\.com Abonnements"\)\)/,
    "Betreff laeuft nicht durch t()");
  assert.match(accountPrivacy, /t\("Hiermit kündige ich mein kostenpflichtiges/,
    "Wortlaut der Erklaerung laeuft nicht durch t()");

  // Die Feldnamen sind keine rechtliche Aussage — die muessen uebersetzt sein.
  const uebersetzt = new Set(Object.keys(await loadMessages("en")));
  for (const feld of ["Konto-E-Mail", "Name", "Datum"]) {
    assert.match(accountPrivacy, new RegExp(`t\\("${feld}"\\)`), `${feld} laeuft nicht durch t()`);
    assert.ok(uebersetzt.has(feld), `${feld} ist nicht uebersetzt`);
  }
});

test("keine Ausnahme der Uebersetzungspflicht ist veraltet", () => {
  // Eine Ausnahme, deren Text es nicht mehr gibt, deckt nichts mehr ab und
  // verschleiert beim naechsten Mal den Blick auf die echte Liste.
  const combined = settingsSurface + accountPrivacy + authPage + authLoginHtml + authRegisterHtml
    + profileDock + profilePictureControl + profilePictureStore;
  for (const { text, grund } of [...UNUEBERSETZT_ERLAUBT, ...HELFER_AUSNAHMEN]) {
    assert.ok(grund && grund.length > 8, `Ausnahme "${text}" ohne brauchbare Begruendung`);
    assert.ok(combined.includes(text), `Ausnahme "${text}" kommt im Quellcode nicht mehr vor`);
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
