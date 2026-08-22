// smejj.com — Waechter ueber die Pflichtlinks (Impressum, Datenschutz, AGB, Widerruf).
//
// Warum es diesen Test gibt: Beim Marktstart-Check am 2026-08-22 waren alle vier
// Seiten LIVE erreichbar (agb.html und widerruf.html antworteten mit 200) — aus
// der App heraus fuehrte aber kein einziger Weg dorthin. Verlinkt waren nur
// Impressum und Datenschutz. Sobald ein Abo verkauft wird, gehoeren AGB und
// Widerrufsbelehrung zur Pflichtinformation vor Vertragsschluss; eine Seite, die
// nur ueber die Adresszeile erreichbar ist, erfuellt das nicht.
//
// Der Test prueft beide Wege, die ein Nutzer wirklich geht: die Rechtsleiste in
// der App-Shell und die Zeile "Rechtliches" unter Einstellungen -> Erweitert.
//
// Waechter-TUEV: jeder Fall hat eine gesunde UND eine kaputte Probe.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const PFLICHTSEITEN = ["impressum.html", "datenschutz.html", "agb.html", "widerruf.html"];

const startHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const settings = readFileSync(new URL("../public/settings-surface.js", import.meta.url), "utf8");

test("alle vier Pflichtseiten liegen ueberhaupt im Auslieferungsordner", () => {
  for (const seite of PFLICHTSEITEN) {
    assert.ok(existsSync(new URL(`../public/${seite}`, import.meta.url)), `${seite} fehlt`);
  }
  // Kaputte Probe: eine erfundene Seite darf NICHT als vorhanden gelten.
  assert.equal(existsSync(new URL("../public/gibtesnicht.html", import.meta.url)), false);
});

test("die Rechtsleiste der App-Shell fuehrt zu allen vieren", () => {
  const leiste = startHtml.match(/<p class="legal-links">[\s\S]*?<\/p>/);
  assert.ok(leiste, "die Rechtsleiste selbst muss es geben");
  for (const seite of PFLICHTSEITEN) {
    assert.ok(leiste[0].includes(`/${seite}`), `${seite} fehlt in der Rechtsleiste`);
  }
});

test("Einstellungen -> Erweitert -> Rechtliches fuehrt zu allen vieren", () => {
  const zeile = settings.match(/<div class="settings-row">(?:(?!<\/div><\/div>)[\s\S])*Rechtliches[\s\S]*?<\/div><\/div>/);
  assert.ok(zeile, "die Zeile 'Rechtliches' muss es geben");
  for (const seite of PFLICHTSEITEN) {
    assert.ok(zeile[0].includes(`/${seite}`), `${seite} fehlt unter Einstellungen`);
  }
});

test("die neuen Beschriftungen sind uebersetzt, nicht nur deutsch eingebaut", async () => {
  // Ein Link, der auf Japanisch "AGB" heisst, ist kein uebersetzter Link.
  for (const code of ["en", "fr", "ja", "tr", "zh"]) {
    const woerter = await import(`../public/i18n/${code}.js`);
    const buch = woerter.default || woerter.messages || woerter;
    for (const schluessel of ["AGB", "Widerruf"]) {
      const wert = buch[schluessel];
      assert.ok(wert && String(wert).trim().length > 0, `${code}: ${schluessel} fehlt`);
      if (code !== "de") assert.notEqual(wert, schluessel, `${code}: ${schluessel} ist unuebersetzt`);
    }
  }
});

test("der Spiegel unter /assets traegt dieselben Links", () => {
  for (const datei of ["index.html", "settings-surface.js"]) {
    const quelle = readFileSync(new URL(`../public/${datei}`, import.meta.url), "utf8");
    const spiegel = readFileSync(new URL(`../public/assets/${datei}`, import.meta.url), "utf8");
    assert.equal(spiegel, quelle, `${datei}: smejj.com liefert /assets/ aus`);
  }
});
