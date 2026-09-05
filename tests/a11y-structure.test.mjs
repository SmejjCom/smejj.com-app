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
  // Hero-Text 2026-08-13 vom Betreiber geaendert ("Womit kann ich helfen?").
  // Geprueft wird die STRUKTUR — genau ein h2 in der Kopfzeile der Startseite —
  // nicht mehr der Wortlaut: sonst reisst jede genehmigte Textaenderung den Test.
  assert.match(html, /<header class="home-hero">\s*<h2>[^<]+<\/h2>\s*<\/header>/);
});

test("visually-hidden CSS versteckt nur visuell (Screenreader lesen weiter)", () => {
  assert.match(css, /\.visually-hidden \{/);
  assert.match(css, /clip: rect\(0 0 0 0\)/);
  assert.doesNotMatch(css, /\.visually-hidden \{[^}]*display: none/s);
  assert.doesNotMatch(css, /\.visually-hidden \{[^}]*visibility: hidden/s);
});

test("Formularfelder haben programmatische Labels (WCAG 1.3.1/4.1.2)", () => {
  // Geprueft wird, DASS jedes Feld eine Beschriftung traegt — nicht welche.
  // Der feste Wortlaut liess den Test am 2026-09-05 reissen, als "Gestagte
  // Uploads" zu "Wartende Dateien" wurde: eine reine Textverbesserung faerbte
  // die Barrierefreiheits-Pruefung rot, obwohl die Zusage (jedes Feld hat ein
  // Label) unveraendert erfuellt war. Der Wortlaut gehoert der Oberflaeche,
  // die Zusage dem Test.
  const required = [
    'id="projectImportFile"', 'id="upload"', 'id="uploadList"',
    'id="aiModeSelect"', 'id="settingsLanguage"', 'id="settingsMode"',
    'id="language"', 'id="mode"'
  ];
  for (const idAttr of required) {
    const tagMatch = html.match(new RegExp(`<[^>]*${idAttr}[^>]*>`));
    assert.ok(tagMatch, `Element ${idAttr} nicht gefunden`);
    assert.match(tagMatch[0], /aria-label="[^"]{2,}"/, `${idAttr} ohne aussagekraeftiges aria-label`);
  }
  // Versteckte Composer-File-Inputs bleiben korrekt aria-hidden (Feature-Lock v2):
  assert.match(html, /id="composerFileInput"[^>]*aria-hidden="true"/);
  assert.match(html, /id="composerPhotoInput"[^>]*aria-hidden="true"/);
});
