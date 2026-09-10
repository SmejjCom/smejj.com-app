// smejj.com — bei abgelaufener Anmeldung hoert der Abgleich auf zu klopfen.
//
// GEMESSEN 2026-09-10 mit abgelaufener Sitzung: push() arbeitete sich durch die
// lokalen Chats und schickte fuer JEDEN eine Anfrage, die mit 401 zurueckkam.
// Der Kommentar an der Stelle begruendete das so: "4xx betrifft GENAU DIESEN
// Chat und wird sich von selbst nie aendern". Fuer 400 und 413 stimmt das —
// fuer 401 nicht: die betrifft die SITZUNG, und dann ist jede weitere Anfrage
// dieses Laufs genauso vergeblich.
//
// Bei den 113 Gespraechen, die chat-sync.js an anderer Stelle selbst als
// Normalfall nennt, sind das 113 vergebliche Anfragen — genau in dem Moment,
// in dem der Nutzer den Streifen "Deine Anmeldung ist abgelaufen" vor sich hat.
//
// KEIN dauerhafter Merker: serverSagtNein schaltet den Abgleich bis zum
// Neuladen ab. Bei 503 ist das richtig (der Server sagt "ich mache das nicht"),
// bei 401 waere es schlimmer als der Sturm — wer sich anmeldet, bekaeme seinen
// Abgleich erst nach einem Neuladen zurueck.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/chat-sync.js", import.meta.url), "utf8");

/** Der Rumpf einer Funktion, damit nicht versehentlich die Nachbarin geprueft wird. */
function rumpf(name) {
  const i = quelle.indexOf(`async function ${name}(`);
  assert.ok(i >= 0, `${name} nicht gefunden`);
  const naechste = quelle.indexOf("\nasync function ", i + 1);
  return quelle.slice(i, naechste > i ? naechste : undefined);
}

test("push bricht bei 401 und 403 ab, statt fuer jeden Chat erneut zu klopfen", () => {
  const p = rumpf("push");
  assert.match(p, /antwort\.status === 401 \|\| antwort\.status === 403\) break/,
    "401/403 muss den Lauf beenden");
  // Die Reihenfolge zaehlt: der 4xx-Zweig darf die Sitzungsfehler nicht vorher
  // als "betrifft nur diesen Chat" abfruehstuecken.
  const abbruch = p.indexOf("=== 401");
  const vierer = p.indexOf("status >= 400 && antwort.status < 500");
  assert.ok(abbruch > 0 && (vierer < 0 || abbruch < vierer),
    "die Sitzungspruefung muss VOR der allgemeinen 4xx-Behandlung stehen");
});

test("pushProjekte macht es genauso — dieselbe Luecke, derselbe Schluss", () => {
  assert.match(rumpf("pushProjekte"), /antwort\.status === 401 \|\| antwort\.status === 403\) break/);
});

test("KEIN dauerhafter Merker bei 401 — sonst bleibt der Abgleich nach dem Anmelden aus", () => {
  for (const name of ["push", "pushProjekte"]) {
    const p = rumpf(name);
    const zeile = p.split("\n").find((z) => z.includes("=== 401"));
    assert.ok(zeile, `${name}: keine 401-Zeile`);
    assert.doesNotMatch(zeile, /serverSagtNein/,
      `${name}: 401 darf den Abgleich nicht bis zum Neuladen abschalten`);
  }
});

test("503 behaelt seinen dauerhaften Merker — dort ist er richtig", () => {
  // Gegenprobe: der Umbau darf die vorhandene Bremse nicht mitnehmen.
  assert.match(rumpf("push"), /antwort\.status === 503\) \{ serverSagtNein = true; break; \}/);
  assert.match(rumpf("pushProjekte"), /antwort\.status === 503\) \{ serverSagtNeinProjekte = true; break; \}/);
});
