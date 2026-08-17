// Waechter fuer die getrennten Bremsen der Cline-Route.
//
// Betreiber-Befund 2026-08-17: "manchmal kommen komplette Modelle und
// manchmal nur 2, 3". Ursache war EINE Bremse fuer alles — sechs Chats in
// einer Minute (je 2 Marken bei Kapazitaet 12) liessen das Modell-MENUE
// leerlaufen. Geprueft wird darum beides: dass Lesen viel aushaelt und dass
// Chatten weiterhin scharf gebremst bleibt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../control-server/src/routes/providerRoutes.js", import.meta.url), "utf8");

test("Lesen und Chatten haben getrennte Bremsen", () => {
  assert.match(quelle, /const requestGate = createRateLimiter\(\{ capacity: 12/);
  assert.match(quelle, /const leseGate = createRateLimiter\(\{ capacity: 60, refillPerSec: 1/);
  assert.match(quelle, /LESEWEGE = new Set\(\[`\$\{PREFIX\}\/status`, `\$\{PREFIX\}\/models`\]\)/);
});

test("nur GET auf status und models nimmt die Lese-Bremse", () => {
  assert.match(quelle, /const lesend = req\.method === "GET" && LESEWEGE\.has\(url\.pathname\)/);
  assert.match(quelle, /lesend[\s\S]{0,40}leseGate\.take\(subjectId, 1\)/);
});

test("Chatten bleibt scharf gebremst — zwei Marken je Nachricht", () => {
  // Gegenprobe: die Lockerung darf NICHT auf den teuren Weg durchschlagen.
  assert.match(quelle, /requestGate\.take\(subjectId, url\.pathname\.endsWith\("\/chat"\) \? 2 : 1\)/);
});

test("ein 429 sagt, wie lange zu warten ist", () => {
  // Ohne retryAfterSec kann das Menue nicht selbst nachladen.
  assert.match(quelle, /retryAfterSec: limit\.retryAfterSec/);
  assert.match(quelle, /res\.setHeader\("Retry-After", String\(limit\.retryAfterSec\)\)/);
});
