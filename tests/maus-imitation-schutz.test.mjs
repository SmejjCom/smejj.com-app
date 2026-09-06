// smejj.com — das Chat-Modell darf die Maus nicht nachspielen.
// Befund 2026-09-06: nach einem Maus-Lauf erfand das Modell "Maus 4/10"-Zeilen,
// ein Protokoll und Knoepfe, die es nicht gibt. Hier steht fest, wann der
// Server den Hinweis anhaengt — und wann ausdruecklich nicht.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ergaenzeMausSchutz, brauchtMausSchutz, MAUS_SCHUTZ_HINWEIS, MAUS_VORLAGE } from "../control-server/src/llm/mausImitationSchutz.js";

const SYSTEM = { role: "system", content: "Du bist der Assistent von smejj.com." };
const MAUS_LAUF = { role: "assistant", content: "Ich öffne gmail.com im Live-Browser rechts.\nDie Maus fängt an. Du siehst rechts jeden Schritt.\nMaus 1/10: sieht sich die Seite an ...\nMaus 1/10: Klicken: Create account\nMaus gestoppt: »Klicken: Next« ist zweimal fehlgeschlagen." };

test("nach einem Maus-Lauf bekommt das Modell den Hinweis — direkt hinter der System-Nachricht", () => {
  const rein = [SYSTEM, { role: "user", content: MAUS_VORLAGE + " gmail.com neu konto ofnen" }, MAUS_LAUF, { role: "user", content: "Name: AlanBestT" }];
  const raus = ergaenzeMausSchutz(rein);
  assert.equal(raus.length, rein.length + 1);
  assert.equal(raus[0], SYSTEM);
  assert.deepEqual(raus[1], { role: "system", content: MAUS_SCHUTZ_HINWEIS });
  assert.equal(raus[2], rein[1]);
  // Der Hinweis nennt die Vorlage, mit der die Maus wirklich startet, und
  // verbietet erfundene Schritte und Knoepfe ausdruecklich.
  assert.ok(MAUS_SCHUTZ_HINWEIS.includes(MAUS_VORLAGE));
  assert.match(MAUS_SCHUTZ_HINWEIS, /Erfinde KEINE Maus-Zeilen/);
  assert.match(MAUS_SCHUTZ_HINWEIS, /Knoepfe/);
  assert.match(MAUS_SCHUTZ_HINWEIS, /laeuft gerade NICHT/);
});

test("ohne Maus-Spur bleibt der Verlauf unangetastet — dieselbe Liste, kein Hinweis", () => {
  const rein = [SYSTEM, { role: "user", content: "Was ist 17 mal 23?" }, { role: "assistant", content: "391." }, { role: "user", content: "und mal 2?" }];
  assert.equal(ergaenzeMausSchutz(rein), rein);
  assert.equal(brauchtMausSchutz(rein), false);
});

test("ein NEUER Maus-Auftrag als letzte Nachricht bekommt keinen Hinweis — die Maus uebernimmt selbst", () => {
  const rein = [SYSTEM, MAUS_LAUF, { role: "user", content: MAUS_VORLAGE + " auf der offenen Seite Weiter klicken" }];
  assert.equal(ergaenzeMausSchutz(rein), rein);
});

test("ohne System-Nachricht steht der Hinweis vorn; ein schon vorhandener Hinweis wird nicht verdoppelt", () => {
  const rein = [MAUS_LAUF, { role: "user", content: "Log warum schreibst du nicht?" }];
  const raus = ergaenzeMausSchutz(rein);
  assert.equal(raus[0].role, "system");
  assert.equal(raus.length, 3);
  assert.equal(ergaenzeMausSchutz(raus), raus, "kein zweiter Hinweis");
});

test("Maus-Spuren werden auch in Teil-Inhalten (content als Liste) erkannt; Nutzertext mit dem Wort Maus reicht nicht", () => {
  const teile = [SYSTEM, { role: "assistant", content: [{ type: "text", text: "Maus 2/10: überlegt ...\nMaus fertig nach 1 Schritt: Example Domain" }] }, { role: "user", content: "und jetzt?" }];
  assert.equal(brauchtMausSchutz(teile), true);
  const nurNutzer = [SYSTEM, { role: "user", content: "Meine Maus am PC ist kaputt, Maus 1/10 steht nirgends" }];
  assert.equal(brauchtMausSchutz(nurNutzer), false, "nur ASSISTENT-Zeilen sind Maus-Spuren");
});

test("BEIDE Chat-Wege haengen den Schutz an — Cline und BYOK-Anbieter", () => {
  for (const datei of ["control-server/src/routes/providerRoutes.js", "control-server/src/routes/apiKeysRoutes.js"]) {
    const quelle = fs.readFileSync(datei, "utf8");
    assert.match(quelle, /import \{ ergaenzeMausSchutz \} from "\.\.\/llm\/mausImitationSchutz\.js"/, `${datei}: Import fehlt`);
    assert.match(quelle, /ergaenzeMausSchutz\(sanitizeMessages\(body\.messages\)\)/, `${datei}: Schutz nicht am Nachrichtenweg`);
  }
});
