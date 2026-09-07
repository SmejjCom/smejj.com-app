// Waechter: eine Nachricht mit NUR einem Anhang muss sich senden lassen.
//
// Befund 2026-09-07 (A-bis-Z-Pruefung): PDF, Word/Excel/PowerPoint, das
// Tonspur-Transkript und eingefuegter Langtext landen als CHIP ueber dem
// Schreibfeld — nicht IM Feld. Der Senden-Knopf pruefte aber nur
// `feld.value.trim()`. Ergebnis: Wer nur eine Datei anhaengte, sah statt des
// Pfeils die Sprachwelle, und ein Druck darauf oeffnete den Sprachmodus. Die
// Frage ging nie raus, der Anhang blieb kleben. Vier Anhang-Wege waren damit
// tot, ohne dass irgendwo ein Fehler stand.
//
// composer-anhang-chips.js meldete seinen Bestand zwar ueber
// window.smejjAnhangChips.hatAnhaenge() — es rief es nur nie jemand auf.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wurzel = fileURLToPath(new URL("../", import.meta.url));
const taste = readFileSync(wurzel + "public/composer-sendetaste.js", "utf8");
const chips = readFileSync(wurzel + "public/composer-anhang-chips.js", "utf8");

test("der Senden-Knopf zaehlt Anhaenge mit, nicht nur Text", () => {
  assert.match(taste, /window\.smejjAnhangChips\?\.hatAnhaenge\?\.\(\) === true/,
    "hatText muss den Anhang-Bestand mitzaehlen");
  // Und das Feld zaehlt weiterhin: ein reiner Text bleibt sendbar.
  assert.match(taste, /feld\.value\.trim\(\)\.length > 0/);
  // Fail-safe: ein fehlendes Chip-Modul darf den Knopf nicht sprengen.
  assert.match(taste, /catch \{ return false; \}/);
});

test("der Knopf zeichnet sich neu, wenn ein Anhang dazukommt oder geht", () => {
  // Chips schreiben nicht ins Feld — ohne dieses Ereignis bliebe die
  // Sprachwelle stehen, obwohl laengst ein Anhang da ist.
  assert.match(taste, /addEventListener\("smejj:anhang-geaendert", zeichne\)/,
    "der Knopf muss auf den Anhang-Wechsel hoeren");
  assert.match(chips, /export function meldeAnhangWechsel/, "die Chips muessen den Wechsel melden");
});

test("gemeldet wird bei Hinzufuegen, Entfernen UND Leeren", () => {
  // Drei Stellen aendern den Bestand; jede muss melden, sonst haengt der Knopf
  // in einem falschen Zustand fest.
  const treffer = (chips.match(/meldeAnhangWechsel\(\);/g) || []).length;
  assert.ok(treffer >= 3, `nur ${treffer} Meldungen — Hinzufuegen, Entfernen und Leeren muessen melden`);
  // Gegenprobe an den konkreten Stellen.
  assert.match(chips, /anhaenge\.push\(eintrag\);[\s\S]{0,120}meldeAnhangWechsel\(\)/, "Hinzufuegen meldet nicht");
  assert.match(chips, /entferne\(a\.id\);[\s\S]{0,120}meldeAnhangWechsel\(\)/, "Entfernen meldet nicht");
  assert.match(chips, /anhangChipRow"\)\?\.remove\(\);\s*meldeAnhangWechsel\(\)/, "Leeren meldet nicht");
});

test("die Code-Ansicht zieht den Datei-Waehler mit", () => {
  // composer-tools.js verdrahtet #composerFileInput. Kam es nur ueber den
  // Plus-Knopf der Startseite, war der Datei-Anhang in "Programmieren" tot:
  // Dateiwaehler ging auf, danach passierte nichts.
  const nachladen = readFileSync(wurzel + "public/code-nachladen.js", "utf8");
  assert.match(nachladen, /import\("\.\/composer-tools\.js\?v=/, "die Code-Flaeche muss composer-tools mitziehen");
});
