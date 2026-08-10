// Der Waechter fuer Touch-Ziele misst gegen die LIVE-Seite und braucht einen
// Browser — er kann darum nicht in check:frontend laufen. Diese Tests halten
// stattdessen das fest, was ohne Browser pruefbar ist und was am 2026-08-09
// schiefgegangen war: der alte Waechter deckte nur die Chat-Aktionsleiste ab,
// waehrend 130 Ziele daneben unbemerkt unter dem Ziel lagen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skript = readFileSync(new URL("../scripts/testing/measure_touch_targets_app.mjs", import.meta.url), "utf8");
const leiste = readFileSync(new URL("../scripts/testing/measure_touch_targets.mjs", import.meta.url), "utf8");
const routen = readFileSync(new URL("../public/view-routes.js", import.meta.url), "utf8");
const paket = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("beide Waechter fordern 44 px", () => {
  // Apple (HIG) und Google (Material) nennen 44 px als Untergrenze. Bis
  // 2026-08-09 stand hier 42 — knapp darunter und damit wirkungslos.
  assert.match(skript, /const MIN_ZIEL = 44;/, "App-Waechter");
  assert.match(leiste, /const MIN_ZIEL = 44;/, "Leisten-Waechter");
  assert.match(leiste, /const MIN_SCHRITT = 44;/, "auch die Versionspfeile");
});

test("der App-Waechter kennt jede Ansicht aus view-routes.js", () => {
  // Kommt eine Ansicht dazu und niemand traegt sie hier ein, misst der
  // Waechter sie stillschweigend nicht — genau die Art Luecke, die er
  // schliessen soll.
  const pfade = [...routen.matchAll(/^\s+(\w+): "(\/[^"]*)",?$/gm)]
    .map((m) => ({ id: m[1], pfad: m[2] }))
    .filter((r) => !["start", "offline", "error"].includes(r.id));
  assert.ok(pfade.length >= 15, `erwartet mindestens 15 Ansichten, gefunden ${pfade.length}`);
  for (const r of pfade) {
    assert.ok(skript.includes(`"${r.pfad}"`), `Ansicht ${r.id} (${r.pfad}) fehlt in ANSICHTEN`);
  }
});

test("der App-Waechter misst die Startseite in mehreren Zustaenden", () => {
  // Das meiste wird erst nach einem Tap sichtbar. Der erste Audit-Durchlauf am
  // 2026-08-09 sah das Logo nur bei geschlossenem Menue und uebersah, dass es
  // offen wieder 28 px hoch war.
  assert.match(skript, /Nachrichten-Menue offen/, "Ueberlaufmenue einer Nachricht");
  assert.match(skript, /linkes Menue offen/, "linkes Menue");
});

test("der App-Waechter faellt nicht still auf eine Desktop-Messung zurueck", () => {
  // resize_window allein macht aus einem Desktop-Browser kein Touch-Geraet;
  // ohne coarse greifen die Handy-Zweige nicht und alles waere gruen.
  assert.match(skript, /setEmulatedMedia/);
  assert.match(skript, /pointer.*coarse/s);
  assert.match(skript, /Emulation griff nicht/, "bricht ab, statt falsch gruen zu melden");
});

test("der App-Waechter prueft auch den Ueberlauf, nicht nur die Groesse", () => {
  // Ein Ziel zu vergroessern kann die Spalte ueber den Rand ziehen (Grid-Items
  // haben min-width: auto). Genau so ist es der Eingabezeile ergangen.
  assert.match(skript, /ueberlauf/);
});

test("jede Ausnahme traegt eine Begruendung", () => {
  const block = skript.split("const AUSNAHMEN = [")[1]?.split("];")[0] || "";
  const auswahlen = [...block.matchAll(/auswahl:/g)].length;
  const gruende = [...block.matchAll(/grund:\s*\n?\s*"/g)].length;
  assert.ok(auswahlen > 0, "Ausnahmeliste nicht gefunden");
  assert.equal(gruende, auswahlen, "eine Ausnahme ohne Grund ist eine stille Absenkung des Ziels");
});

test("der Selbsttest ist eingebaut und kehrt die Erwartung um", () => {
  assert.match(skript, /SELBSTTEST/);
  assert.match(skript, /SELBSTTEST FEHLGESCHLAGEN/, "ohne Schutz MUSS es Verstoesse geben");
});

test("beide Waechter sind als npm-Befehl erreichbar", () => {
  assert.equal(paket.scripts["measure:touch"], "node scripts/testing/measure_touch_targets.mjs");
  assert.equal(paket.scripts["measure:touch:app"], "node scripts/testing/measure_touch_targets_app.mjs");
  assert.ok(paket.scripts["measure:touch:app:selbsttest"], "Gegenprobe als eigener Befehl");
  assert.ok(paket.scripts.check.includes("measure_touch_targets_app.mjs"),
    "das Skript gehoert in die Syntaxpruefung — sonst faellt ein Tippfehler erst beim Messen auf");
});
