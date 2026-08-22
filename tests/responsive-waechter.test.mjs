// Der Responsive-Waechter (scripts/testing/messe_responsive.mjs) braucht einen
// Browser und kann darum nicht in check:frontend laufen. Diese Tests halten
// fest, was ohne Browser pruefbar ist — und vor allem die Luecke, aus der er
// entstanden ist: bis 2026-08-22 wurde ausschliesslich bei 375 px gemessen.
// Alles zwischen Handy und Schreibtisch war nie nachgesehen, obwohl genau dort
// die Umschaltpunkte der Stylesheets liegen. Gefunden wurden dabei vier echte
// Fehler, drei davon erst bei 768 px.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skript = readFileSync(new URL("../scripts/testing/messe_responsive.mjs", import.meta.url), "utf8");
const routen = readFileSync(new URL("../public/view-routes.js", import.meta.url), "utf8");
const paket = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("gemessen wird vom kleinsten Handy bis zum Breitbild", () => {
  // Eine Messung nur bei 375 px beweist nichts ueber 768 px: die
  // Medienabfragen schalten bei 480, 600, 760 und 900 px um.
  for (const breite of [320, 375, 430, 768, 1024, 1280, 1440, 1920]) {
    assert.match(skript, new RegExp(`breite: ${breite}\\b`), `Breite ${breite} fehlt`);
  }
});

test("schmale Geraete werden als Finger-Geraete gemessen, breite als Maus-Geraete", () => {
  // resize_window allein macht aus einem Schreibtisch-Browser kein Tablet:
  // `pointer: fine` bleibt wahr, die Handy-Zweige greifen gar nicht.
  assert.match(skript, /setDeviceMetricsOverride/);
  assert.match(skript, /setEmulatedMedia/);
  assert.match(skript, /coarse.*fine|fine.*coarse/s);
  assert.match(skript, /Emulation griff nicht/, "bricht ab, statt falsch gruen zu melden");
});

test("der Waechter kennt jede Ansicht aus view-routes.js", () => {
  const pfade = [...routen.matchAll(/^\s+(\w+): "(\/[^"]*)",?$/gm)]
    .map((m) => ({ id: m[1], pfad: m[2] }))
    .filter((r) => !["offline", "error"].includes(r.id));
  assert.ok(pfade.length >= 15, `erwartet mindestens 15 Ansichten, gefunden ${pfade.length}`);
  for (const r of pfade) {
    assert.ok(skript.includes(`"${r.pfad}"`), `Ansicht ${r.id} (${r.pfad}) fehlt in ANSICHTEN`);
  }
});

test("gemessen wird mit echtem Inhalt, nicht mit leeren Ansichten", () => {
  // Eine leere Ansicht laeuft nie ueber. Die drei Klassiker muessen drin sein:
  // lange Adresse ohne Leerzeichen, breiter Code-Block, Tabelle mit vielen
  // Spalten.
  assert.match(skript, /INHALT_AUFBAUEN/);
  assert.match(skript, /https:\/\/smejj\.example\.com/, "lange Adresse");
  assert.match(skript, /<pre><code>/, "Code-Block");
  assert.match(skript, /<table>/, "Tabelle");
});

test("jede Geraeteklasse laedt die Seite frisch", () => {
  // Nur die Groesse umzustellen traegt den Zustand der vorigen Breite mit:
  // angedockte Flaechen blieben angedockt, und die Messung meldete Ueberlaeufe,
  // die kein Geraet je zeigt.
  assert.match(skript, /Frisch laden statt nur die Groesse zu aendern/);
});

test("beide Fehlerbilder werden gesucht: Ueberstand UND stilles Abschneiden", () => {
  // Ein Behaelter mit overflow-x: hidden verbirgt den Ueberlauf vor der
  // ersten Pruefung — auf dem Geraet fehlt dann einfach die rechte Haelfte.
  assert.match(skript, /ueberstand/);
  assert.match(skript, /abgeschnitten/);
  assert.match(skript, /scrolltAlsSeite/, "eine seitlich scrollende Seitenflaeche ist ebenfalls ein Fehler");
});

test("jede Ausnahme traegt eine Begruendung", () => {
  for (const name of ["const AUSNAHMEN = [", "const AUSNAHMEN_INNENLAUF = ["]) {
    const block = skript.split(name)[1]?.split("];")[0] || "";
    const auswahlen = [...block.matchAll(/auswahl:/g)].length;
    const gruende = [...block.matchAll(/grund:/g)].length;
    assert.ok(auswahlen > 0, `Ausnahmeliste ${name} nicht gefunden`);
    assert.equal(gruende, auswahlen, "eine Ausnahme ohne Grund ist eine stille Absenkung des Ziels");
  }
});

test("der Selbsttest ist eingebaut und kehrt die Erwartung um", () => {
  assert.match(skript, /SELBSTTEST/);
  assert.match(skript, /PROBE_EINSETZEN/, "eine zu breite Probe mitten in die Ansicht");
  assert.match(skript, /SELBSTTEST FEHLGESCHLAGEN/, "ohne Schutz MUSS es Verstoesse geben");
});

test("der Waechter ist als npm-Befehl erreichbar", () => {
  assert.equal(paket.scripts["measure:responsive"], "node scripts/testing/messe_responsive.mjs");
  assert.ok(paket.scripts["measure:responsive:selbsttest"], "Gegenprobe als eigener Befehl");
  assert.ok(paket.scripts.check.includes("messe_responsive.mjs"),
    "das Skript gehoert in die Syntaxpruefung — sonst faellt ein Tippfehler erst beim Messen auf");
});
