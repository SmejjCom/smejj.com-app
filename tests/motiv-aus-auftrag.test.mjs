// Waechter-TUEV fuer motivAusAuftrag: der Auftragssatz darf das Motiv nie
// verschlucken — und ein Motiv nie verstuemmelt werden.
import test from "node:test";
import assert from "node:assert/strict";
import { motivAusAuftrag } from "../public/chat-bridge-bilder.js";

test("Einleitung faellt weg, Motiv bleibt vollstaendig", () => {
  const faelle = [
    ["Generiere ein Bild von: einem kleinen roten Leuchtturm", "einem kleinen roten Leuchtturm"],
    ["Erstelle ein Foto von einer Katze im Regen", "einer Katze im Regen"],
    // Steht der Artikel in der Einleitung, faellt er mit ihr weg — das Motiv
    // selbst bleibt unversehrt (das allein zaehlt fuer den Maler).
    ["Zeichne mir einen Leuchtturm am Meer", "Leuchtturm am Meer"],
    ["Male eine Bergkette bei Sonnenaufgang", "Bergkette bei Sonnenaufgang"],
    ["Generiere ein Bild von: einem Hund", "einem Hund"]
  ];
  for (const [ein, erwartet] of faelle) assert.equal(motivAusAuftrag(ein), erwartet, ein);
});

test("Ohne erkennbare Einleitung bleibt der Text unangetastet", () => {
  const unveraendert = [
    "ein roter Leuchtturm an einer Felsenkueste bei Sonnenuntergang",
    "Sonnenaufgang ueber dem Meer, fotorealistisch"
  ];
  for (const probe of unveraendert) assert.equal(motivAusAuftrag(probe), probe, probe);
});

test("Fail-safe: bleibt zu wenig uebrig, gilt der ganze Satz", () => {
  assert.equal(motivAusAuftrag("Generiere ein Bild von: X"), "Generiere ein Bild von: X");
  assert.equal(motivAusAuftrag(""), "");
});
