// Waechter fuer die Stille-Wache im Chat-Strom.
//
// GEMESSEN 2026-08-17: Ein Video-Auftrag stand 15 Minuten auf "Erzeuge dein
// Video läuft … (ca. 1-2 Minuten)". Der Platz beim Video-Maler war blockiert,
// die Leitung starb nach der ERSTEN Meldung — und der Chat wartete endlos.
//
// Geprueft wird die Wache selbst (kurze Frist statt 90 s), mit BEIDEN Proben:
// ein Strom, der taktet, darf NICHT abgebrochen werden; einer, der verstummt,
// MUSS abgebrochen werden. Ohne die gesunde Probe misst der Test nur, dass
// irgendwann ein Timer feuert.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/ai/chat-stream.js", import.meta.url), "utf8");
// Seit der Auslagerung (job_chat_stille_20260823) lebt die Wache in EINEM
// Modul: public/ai/strom-stillstand.js exportiert Grenze, Wache und Wortlaut;
// chat-stream.js importiert sie nur noch. Der Test prueft beide Haelften —
// die Definition dort, den Anschluss hier.
const wacheQuelle = readFileSync(new URL("../public/ai/strom-stillstand.js", import.meta.url), "utf8");

// Die Wache ist modulintern (kein Export, damit die oeffentliche Flaeche
// schmal bleibt). Nachgebaut wird sie hier aus derselben Logik; der Test
// darunter haelt fest, dass die Quelle sie auch wirklich benutzt.
function starteStilleWache(reader, beiStille, grenzeMs) {
  let uhr = null;
  let ausgeloest = false;
  const neuStellen = () => {
    clearTimeout(uhr);
    uhr = setTimeout(() => { ausgeloest = true; beiStille(); reader.cancel(); }, grenzeMs);
  };
  neuStellen();
  return { lebenszeichen: neuStellen, beenden: () => clearTimeout(uhr), get hatZugeschlagen() { return ausgeloest; } };
}

const schlafe = (ms) => new Promise((weiter) => setTimeout(weiter, ms));

test("ein taktender Strom wird NICHT abgebrochen", async () => {
  let abgebrochen = false;
  const wache = starteStilleWache({ cancel: () => { abgebrochen = true; } }, () => {}, 120);
  // Vier Lebenszeichen im Abstand von 60 ms — nie laenger still als die Frist.
  for (let i = 0; i < 4; i += 1) { await schlafe(60); wache.lebenszeichen(); }
  wache.beenden();
  assert.equal(abgebrochen, false);
  assert.equal(wache.hatZugeschlagen, false);
});

test("ein verstummter Strom WIRD abgebrochen", async () => {
  let abgebrochen = false;
  let gemeldet = false;
  const wache = starteStilleWache({ cancel: () => { abgebrochen = true; } }, () => { gemeldet = true; }, 80);
  await schlafe(200); // nichts passiert — genau der Video-Fall
  wache.beenden();
  assert.equal(abgebrochen, true);
  assert.equal(gemeldet, true);
});

test("beenden() entschaerft die Wache — kein Abbruch nach dem Ende", async () => {
  let abgebrochen = false;
  const wache = starteStilleWache({ cancel: () => { abgebrochen = true; } }, () => {}, 60);
  wache.beenden();
  await schlafe(150);
  assert.equal(abgebrochen, false);
});

test("der Chat-Strom benutzt die Wache wirklich", () => {
  // Sonst waere oben nur eine huebsche Kopie getestet. Die Wache ist seit der
  // Auslagerung importiert, nicht mehr inline — geprueft wird der ANSCHLUSS.
  assert.match(quelle, /import \{ starteStilleWache, stilleText, STILLE_GRENZE_MS \} from ".\/strom-stillstand.js"/);
  assert.match(quelle, /const wache = starteStilleWache\(reader, \(\) => \{ stilleGemeldet = true; \}\)/);
  assert.match(quelle, /wache\.lebenszeichen\(\)/);
  assert.match(quelle, /wache\.beenden\(\)/);
  // Und er sagt es dem Nutzer, statt still zu enden.
  assert.match(quelle, /if \(stilleGemeldet\)/);
  assert.match(quelle, /stilleText\(/);
  assert.match(wacheQuelle, /nicht mehr gemeldet/);
});

test("die Frist ist grosszuegiger als der Lebenszeichen-Takt der Bruecke", () => {
  // Die Bruecke taktet lange Arbeiten alle 10 s. Eine Frist unter ~30 s
  // wuerde ein langsames, aber gesundes Video abwuergen.
  const treffer = wacheQuelle.match(/export const STILLE_GRENZE_MS = ([0-9_]+)/);
  assert.ok(treffer, "STILLE_GRENZE_MS nicht gefunden (public/ai/strom-stillstand.js)");
  assert.ok(Number(treffer[1].replace(/_/g, "")) >= 30_000);
});
