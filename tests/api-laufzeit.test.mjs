// smejj.com — Laufzeit der API-Schluessel: Server und Oberflaeche muessen
// dieselben Codes kennen (Plan docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md).
//
// Warum ein eigener Test: Die Oberflaeche traegt ihre Laufzeit-Liste als Text
// (Anzeige-Reihenfolge + deutsche Beschriftung), der Server seine als Tage.
// Laufen die beiden auseinander, schickt die Flaeche einen Code, den der
// Server mit 400 api_key_laufzeit_invalid ablehnt — und der Nutzer sieht nur
// "Fehler". Dieser Test wuerde das vor dem Deploy rot machen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LAUFZEITEN, LAUFZEIT_VORAUSWAHL, laeuftAbAus, istAbgelaufen } from "../control-server/src/publicapi/publicApiKeys.js";

const publicDir = path.resolve("public");
const surface = fs.readFileSync(path.join(publicDir, "api-center-surface.js"), "utf8");

function oberflaechenLaufzeiten() {
  const block = /const LAUFZEITEN = \[([\s\S]*?)\];/.exec(surface);
  assert.ok(block, "api-center-surface.js traegt keine LAUFZEITEN-Liste");
  return [...block[1].matchAll(/\["([a-z0-9]+)", "([^"]+)"\]/g)].map((m) => ({ code: m[1], text: m[2] }));
}

test("Oberflaeche und Server kennen dieselben Laufzeit-Codes, gleiche Vorauswahl", () => {
  const ui = oberflaechenLaufzeiten();
  assert.deepEqual(ui.map((e) => e.code).sort(), Object.keys(LAUFZEITEN).sort());
  const vorauswahl = /const LAUFZEIT_VORAUSWAHL = "([a-z0-9]+)";/.exec(surface)?.[1];
  assert.equal(vorauswahl, LAUFZEIT_VORAUSWAHL);
  assert.equal(LAUFZEIT_VORAUSWAHL, "1j", "Vorauswahl ist 1 Jahr (Beschluss 2026-09-03)");
  // Unbefristet ist die letzte Wahl und die einzige mit 0 Tagen.
  assert.equal(ui.at(-1).code, "unbefristet");
  assert.equal(LAUFZEITEN.unbefristet, 0);
  assert.ok(Object.entries(LAUFZEITEN).every(([code, tage]) => code === "unbefristet" ? tage === 0 : tage > 0));
});

test("Formular hat die Laufzeit-Auswahl, Unbefristet fragt nach, Liste zeigt Ablauf und Zustaende", () => {
  assert.match(surface, /<select data-ac-laufzeit/);
  assert.match(surface, /laufzeit === "unbefristet" && !confirm\(/);
  assert.match(surface, /body: \{ name, laufzeit \}/);
  assert.match(surface, /t\("Abgelaufen"\)/);
  assert.match(surface, /t\("Läuft bald ab"\)/);
  assert.match(surface, /t\("Läuft ab"\)/);
  assert.match(surface, /laeuftAb: datum\(k\.laeuftAbAm\)/);
});

test("Jeder Laufzeit-Text der Oberflaeche ist in allen Sprachdateien uebersetzt", async () => {
  const codes = [...fs.readFileSync(path.join(publicDir, "language-options.js"), "utf8").matchAll(/\["([a-z]{2})",/g)]
    .map((m) => m[1]).filter((code) => code !== "de");
  const texte = oberflaechenLaufzeiten().map((e) => e.text).concat([
    "Laufzeit", "Abgelaufen", "Läuft bald ab", "Läuft ab",
    "Nach der Laufzeit lehnt die API ihn ab. Verlängern heißt: neuen Schlüssel erzeugen, alten widerrufen.",
    "Unbefristet wirklich? Dieser Schlüssel läuft nie von selbst ab. Er gilt, bis du ihn widerrufst."
  ]);
  for (const code of codes) {
    const messages = (await import(pathToFileURL(path.join(publicDir, "i18n", `${code}.js`)).href)).default;
    for (const text of texte) {
      assert.equal(typeof messages[text], "string", `${code}.js: fehlt "${text}"`);
      assert.ok(messages[text].trim(), `${code}.js: leer fuer "${text}"`);
    }
  }
});

test("laeuftAbAus rechnet Tage, kennt unbefristet und Altverhalten, lehnt Unsinn ab", () => {
  const ab = new Date("2026-09-03T12:00:00.000Z");
  assert.equal(laeuftAbAus("30t", ab), "2026-10-03T12:00:00.000Z");
  assert.equal(laeuftAbAus("1j", ab), "2027-09-03T12:00:00.000Z");
  assert.equal(laeuftAbAus("unbefristet", ab), "");
  assert.equal(laeuftAbAus(undefined, ab), "", "kein Wunsch = unbefristet (alte Clients)");
  assert.equal(laeuftAbAus(" 1J ", ab), "2027-09-03T12:00:00.000Z", "Gross/Klein und Leerraum sind egal");
  assert.throws(() => laeuftAbAus("3 wochen", ab), /api_key_laufzeit_invalid/);
  assert.equal(istAbgelaufen("", 0), false);
  assert.equal(istAbgelaufen("2026-09-03T12:00:00.000Z", ab.getTime() - 1), false);
  assert.equal(istAbgelaufen("2026-09-03T12:00:00.000Z", ab.getTime()), true);
});
