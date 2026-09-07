// smejj.com — Waechter fuer die installierte App (iOS/Android, display: standalone).
//
// BEFUND 2026-09-07, iPhone-17-Pro-Simulator (iOS 26.5), Web-App vom Home-Bildschirm:
// auf willkommen.html lagen Logo und Uhrzeit uebereinander, auf der Anmeldeseite
// verschwand die Marke hinter der Dynamic Island. Grund: die Seiten tragen
// `viewport-fit=cover` (die Seite reicht bis unter die Statusleiste), kannten
// aber `env(safe-area-inset-*)` nicht. Im Browser faellt das nie auf — dort sind
// die Werte 0. In der Android-App (Pixel 7, 412 px) war programmieren.html
// zusaetzlich 439 px breit, weil ihr die Handy-Leiste von willkommen.html fehlte.
//
// Dieser Test verhindert, dass eine der drei Regeln still wieder verschwindet.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lesen = (pfad) => readFileSync(new URL(`../public/${pfad}`, import.meta.url), "utf8");

// Jede eigenstaendige Seite mit viewport-fit=cover braucht die Sicherheitsraender.
const SEITEN_MIT_COVER = ["willkommen.html", "programmieren.html"];

for (const seite of SEITEN_MIT_COVER) {
  test(`${seite}: viewport-fit=cover nur mit Safe-Area-Raendern oben und unten`, () => {
    const html = lesen(seite);
    assert.match(html, /viewport-fit=cover/, `${seite} traegt viewport-fit=cover`);
    assert.match(html, /env\(safe-area-inset-top/, `${seite}: Leiste kennt safe-area-inset-top`);
    assert.match(html, /env\(safe-area-inset-bottom/, `${seite}: Fuss kennt safe-area-inset-bottom`);
  });

  test(`${seite}: Handy-Leiste bricht die Bereichs-Links in eine eigene Reihe um`, () => {
    const html = lesen(seite);
    assert.match(html, /@media \(max-width: 640px\)[\s\S]*\.leiste nav \{[^}]*order: 3;[^}]*width: 100%/,
      `${seite}: unter 640 px bekommt nav order: 3 und volle Breite — sonst laeuft die Leiste seitlich ueber`);
  });

  test(`${seite}: Logo traegt feste Masse, damit es vor dem Laden nicht die Leiste sprengt`, () => {
    const html = lesen(seite);
    assert.match(html, /smejj_full_logo_on_dark\.svg" alt="smejj\.com" width="\d+" height="\d+"/);
  });
}

test("auth.css: Anmelde-Huelle kennt die Sicherheitsraender (Marke lag hinter der Dynamic Island)", () => {
  const css = lesen("auth/auth.css");
  const huelle = css.match(/\.auth-shell \{[^}]*\}/);
  assert.ok(huelle, ".auth-shell ist definiert");
  assert.match(huelle[0], /env\(safe-area-inset-top/);
  assert.match(huelle[0], /env\(safe-area-inset-bottom/);
});

test("Auth-Seiten tragen viewport-fit=cover — sonst greift auth.css ins Leere", () => {
  for (const seite of ["auth/login/index.html", "auth/register/index.html"]) {
    assert.match(lesen(seite), /viewport-fit=cover/, seite);
  }
});
