// smejj.com — Diktat, Vorlesen und Sprachmodus sprechen die Sprache der Oberflaeche.
//
// Geraetetest v955 (22.09.2026, Android + iPhone, Oberflaeche Englisch): index.html
// traegt unter dem Start-Lock fest <html lang="de">. composer-tools.js las die
// Sprache EINMAL beim Laden daraus — Diktat hoerte Deutsch, die Browser-Stimme
// sprach englischen Text mit deutscher Stimme, und 14 Sprachmodus-Texte
// ("Ich höre zu ...", "Einen Moment ...") hatten in KEINER Sprachdatei einen
// Eintrag. Diese Reihe haelt die drei Eigenschaften fest, an denen es scheiterte.
// Standalone: node --test tests/sprachmodus-sprache.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserTts } from "../public/voice-browser-tts.js";
import { setzeSeitenSprache } from "../public/huelle-sprache.js";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => fs.readFileSync(path.join(wurzel, "public", p), "utf8");
const SPRACHEN = ["en", "es", "fr", "it", "pt", "tr", "ru", "ja", "ko", "zh", "ar", "hi", "bn", "id"];
const TEXTE = [
  "Ich höre zu ...", "Ich spreche ...", "Einen Moment ...", "Verbinde …",
  "Spracherkennung nicht verfügbar", "Spracherkennung nicht verfügbar — Frage unten eintippen.",
  "Frage unten eintippen — die Antwort wird vorgelesen. Beenden mit X oder Escape.",
  "Frage unten eintippen — die Antwort wird vorgelesen.", "Mikrofon nicht erlaubt — Frage unten eintippen.",
  "Spracherkennung startet auf diesem Geraet nicht — Frage unten eintippen.",
  "Keine Antwort erhalten — Frage unten eintippen.", "Keine Antwort erhalten — ich höre weiter zu.",
  "Spracherkennung ist auf diesem Gerät nicht verfügbar — bitte das Eingabefeld nutzen.",
  "Spracherkennung ist auf diesem Gerät nicht verfügbar — Frage unten eintippen."
];

test("composer-tools liest die Sprache bei JEDEM Aufruf, nicht einmal beim Laden", () => {
  const q = lies("composer-tools.js");
  assert.doesNotMatch(q, /const (PAGE_LANG|SPEECH_LANG|SPEECH_BASE)\b/, "feste Sprach-Konstante beim Laden");
  assert.match(q, /const speechLang = \(\) =>/);
  // v956 gemessen: <html lang> wird erst gesetzt, wenn huelle-sprache.js nachgeladen ist — die gespeicherte Wahl kommt zuerst.
  assert.match(q, /import \{ t, savedUiLanguage \} from "\.\/i18n\/ui\.js/, "gespeicherte Sprache importiert");
  assert.match(q, /const pageLang = \(\) => \{ let s = ""; try \{ s = savedUiLanguage\(\) \|\| ""; \}/, "gespeicherte Sprache zuerst, lang-Attribut als Rueckfall");
  assert.equal((q.match(/recognition\.lang = speechLang\(\);/g) || []).length, 2, "beide Erkennungen fragen die Sprache beim Start");
  assert.match(q, /createBrowserTts\(\{ lang: speechLang, base: speechBase,/, "Browser-Stimme bekommt Funktionen");
  assert.match(q, /lang: speechLang,\n/, "Diktat bekommt die Funktion");
  assert.doesNotMatch(q, /\bSPEECH_BASE\b/, "keine feste Basis mehr");
  // rohe Attribute laufen ueber t(); Statuszeilen uebersetzt setVoiceModeStatus selbst (stimmText -> t)
  assert.match(q, /mic\.title = t\("Spracherkennung nicht verfügbar"\)/);
  assert.match(q, /hint\.textContent = t\("Frage unten eintippen/);
  assert.match(q, /showToast\(t\("Spracherkennung ist auf diesem Gerät nicht verfügbar — bitte das Eingabefeld nutzen\."\)\)/);
  assert.ok(q.split("\n").length <= 801, "800-Zeilen-Regel");
});

test("Diktat nimmt die Sprache zum Zeitpunkt des Starts (Funktion), Vorlesen ebenso", async () => {
  const dikt = lies("composer-dictation.js");
  assert.match(dikt, /rec\.lang = typeof lang === "function" \? lang\(\) : lang/);
  // Browser-Stimme: die Sprache kann zwischen zwei Saetzen wechseln (Sprachwechsel ohne Neuladen).
  let aktuell = "de-DE";
  const gesprochen = [];
  globalThis.window = {
    speechSynthesis: {
      cancel() {}, resume() {}, getVoices: () => [{ lang: "de-DE", name: "Anna" }, { lang: "en-US", name: "Samantha" }],
      speak(u) { gesprochen.push({ lang: u.lang, stimme: u.voice?.lang }); u.onend?.(); }
    }
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  try {
    const tts = createBrowserTts({ lang: () => aktuell, base: () => aktuell.split("-")[0], supported: () => true });
    tts.speak("Hallo");
    aktuell = "en-US";
    tts.speak("Hello");
    assert.deepEqual(gesprochen, [{ lang: "de-DE", stimme: "de-DE" }, { lang: "en-US", stimme: "en-US" }]);
    // feste Werte (alter Aufrufstil) funktionieren weiter
    const fest = createBrowserTts({ lang: "fr-FR", base: "fr", supported: () => true });
    fest.speak("Bonjour");
    assert.equal(gesprochen.at(-1).lang, "fr-FR");
  } finally {
    delete globalThis.window; delete globalThis.SpeechSynthesisUtterance;
  }
});

test("<html lang> folgt der gespeicherten Oberflaechensprache — und nur gueltigen Codes", () => {
  const doc = { documentElement: { lang: "de" } };
  assert.equal(setzeSeitenSprache("en", doc), "en"); assert.equal(doc.documentElement.lang, "en");
  assert.equal(setzeSeitenSprache("pt-BR", doc), "pt"); assert.equal(doc.documentElement.lang, "pt");
  assert.equal(setzeSeitenSprache("", doc), null); assert.equal(doc.documentElement.lang, "pt", "leer aendert nichts");
  assert.equal(setzeSeitenSprache("<script>", doc), null); assert.equal(doc.documentElement.lang, "pt", "Muell aendert nichts");
  assert.equal(setzeSeitenSprache("en", null), null, "ohne Dokument kein Fehler");
  const q = lies("huelle-sprache.js");
  assert.match(q, /setzeSeitenSprache\(savedUiLanguage\(\) \|\| "de"\);/, "beim Start aus der GESPEICHERTEN Wahl (Lehre 20.09.: uiLanguage() steht da noch auf de)");
  assert.match(q, /addEventListener\("smejj:sprache", \(e\) => \{\n\s+setzeSeitenSprache\(e\?\.detail\?\.sprache\);/, "beim Sprachwechsel nachziehen");
});

test("alle 14 Sprachmodus-Texte haben in jeder der 14 Sprachen einen Eintrag", async () => {
  for (const sprache of SPRACHEN) {
    const bundle = (await import(`../public/i18n/${sprache}.js`)).default;
    for (const text of TEXTE) {
      assert.ok(typeof bundle[text] === "string" && bundle[text].length > 2 && bundle[text] !== text, `${sprache}: "${text}" fehlt`);
    }
  }
  const q = lies("composer-tools.js");
  for (const text of TEXTE) assert.ok(q.includes(`"${text}"`), `Quelltext ohne "${text}" — Schluessel und Aufruf auseinander`);
});
