// Waechter fuer die Bremsen des Chat-Weges.
//
// Betreiber-Befund 2026-08-17: "manchmal kommen komplette Modelle und
// manchmal nur 2, 3". Ursache war EINE Bremse fuer alles — sechs Chats in
// einer Minute liessen das Modell-MENUE leerlaufen. Geprueft wird darum
// beides: dass Lesen viel aushaelt und dass Chatten scharf gebremst bleibt.
//
// Seit 11.09. traegt apiKeysRoutes.js den einzigen Chat-Weg (providerRoutes.js
// alias Cline ist entfernt). Die Trennung steckt jetzt im PREIS statt in zwei
// Zaehlern: Chatten kostet 2 Marken, jedes Lesen 1 — bei Kapazitaet 20 sind das
// 20 Lese- gegen 10 Chat-Anfragen. Gleiches Versprechen, ein Zaehler weniger.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../control-server/src/routes/apiKeysRoutes.js", import.meta.url), "utf8");

test("Lesen haelt mehr aus als Chatten — getrennt ueber den Preis", () => {
  assert.match(quelle, /createRateLimiter\(\{ capacity: 20/, "Kapazitaet der Bremse");
  assert.match(quelle, /const cost = url\.pathname\.endsWith\("\/chat"\) \? 2 : 1/, "Chat kostet doppelt");
  assert.match(quelle, /requestGate\.take\(subjectId, cost\)/, "der Preis wird auch abgebucht");
});

test("ein 429 sagt, wie lange zu warten ist", () => {
  // Ohne retryAfterSec kann das Menue nicht selbst nachladen.
  assert.match(quelle, /retryAfterSec: limit\.retryAfterSec/);
  assert.match(quelle, /setHeader\("Retry-After", String\(limit\.retryAfterSec\)\)/);
});

test("ohne Anmeldung greift die Bremse gar nicht erst — 401 zuerst", () => {
  const vorBremse = quelle.indexOf("authentication_required");
  const bremse = quelle.indexOf("requestGate.take(");
  assert.ok(vorBremse > 0 && bremse > vorBremse, "erst Ausweis pruefen, dann bremsen");
});
