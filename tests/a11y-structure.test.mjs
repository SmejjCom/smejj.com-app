// smejj.com — Schutztests fuer H1/SEO und Formular-Labels (Freigabe 2026-07-04:
// "Ja, Option A + Labels"). Das versteckte H1 und die aria-labels duerfen nicht
// entfernt werden; das sichtbare Start-Design bleibt unveraendert (h2 bleibt h2).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const css = fs.readFileSync("public/styles.css", "utf8");

test("Startseite hat genau ein verstecktes H1 (Option A, pixel-identisch)", () => {
  const h1Matches = html.match(/<h1[^>]*>/g) || [];
  assert.equal(h1Matches.length, 1, "genau ein H1 erwartet");
  assert.match(html, /<h1 class="visually-hidden">smejj\.com — KI- und Code-Assistent<\/h1>/);
  // Sichtbare Hauptueberschrift bleibt unveraendert ein h2 (Design-Lock):
  assert.match(html, /<h2>Womit kann ich dir helfen\?<\/h2>/);
});

test("visually-hidden CSS versteckt nur visuell (Screenreader lesen weiter)", () => {
  assert.match(css, /\.visually-hidden \{/);
  assert.match(css, /clip: rect\(0 0 0 0\)/);
  assert.doesNotMatch(css, /\.visually-hidden \{[^}]*display: none/s);
  assert.doesNotMatch(css, /\.visually-hidden \{[^}]*visibility: hidden/s);
});

test("Formularfelder haben programmatische Labels (WCAG 1.3.1/4.1.2)", () => {
  const required = [
    ['id="projectImportFile"', 'aria-label="Import-Datei auswählen"'],
    ['id="upload"', 'aria-label="Dateien für Upload auswählen"'],
    ['id="uploadList"', 'aria-label="Gestagte Uploads"'],
    ['id="aiModeSelect"', 'aria-label="KI-Modus"'],
    ['id="settingsLanguage"', 'aria-label="Sprache"'],
    ['id="settingsMode"', 'aria-label="Sicherheitsmodus"'],
    ['id="language"', 'aria-label="Sprache"'],
    ['id="mode"', 'aria-label="Antwortmodus"']
  ];
  for (const [idAttr, label] of required) {
    const tagMatch = html.match(new RegExp(`<[^>]*${idAttr}[^>]*>`));
    assert.ok(tagMatch, `Element ${idAttr} nicht gefunden`);
    assert.ok(tagMatch[0].includes(label), `${idAttr} ohne ${label}`);
  }
  // Versteckte Composer-File-Inputs bleiben korrekt aria-hidden (Feature-Lock v2):
  assert.match(html, /id="composerFileInput"[^>]*aria-hidden="true"/);
  assert.match(html, /id="composerPhotoInput"[^>]*aria-hidden="true"/);
});
