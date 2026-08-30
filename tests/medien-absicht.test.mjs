// Waechter-TUEV: kaputte UND gesunde Proben (Projektregel).
import test from "node:test";
import assert from "node:assert/strict";
import { istMedienAuftrag } from "../public/medien-absicht.js";

test("Medien-Auftraege werden erkannt (nehmen NIE den Cline-Text-Weg)", () => {
  const auftraege = [
    "Generiere ein Bild von: einem kleinen roten Leuchtturm an einer Felsenküste",
    "Generiere ein Video von: einem Sonnenaufgang am Meer",
    "Zeichne mir einen Leuchtturm",
    "Male eine Katze im Regen",
    "Erstelle ein Logo für meine Firma",
    "mach mir ein foto von einem berg"
  ];
  for (const probe of auftraege) assert.equal(istMedienAuftrag(probe), true, probe);
});

// Betreiber-Auftrag 2026-08-17: "Bilder und Video generieren sollen mit
// ALLEN Modellen einwandfrei funktionieren." Vorher warf eine harte
// 600-Zeichen-Grenze jeden AUSFUEHRLICHEN Bildauftrag auf den Textweg —
// der Nutzer bekam eine Beschreibung statt eines Bildes.
test("auch LANGE Bild- und Video-Auftraege nehmen die Medien-Spur", () => {
  const details = " ".repeat(0) + "sehr detailliert, ".repeat(60); // > 600 Zeichen
  assert.equal(istMedienAuftrag(`Generiere ein Bild von einem Leuchtturm, ${details}`), true);
  assert.equal(istMedienAuftrag(`Erstelle ein Video von einer Stadt bei Nacht, ${details}`), true);
  assert.equal(istMedienAuftrag(`Bitte zeichne mir ein Logo, ${details}`), true);
});

test("langer Fliesstext wird NICHT zum Bildauftrag", () => {
  // Gegenprobe zur Lockerung: in langem Text stehen "erstellen" und "Bild"
  // schnell zufaellig beieinander. Nur ein Auftrag, der MIT dem Malauftrag
  // beginnt, zaehlt in voller Laenge.
  const fuellung = "Der Bericht beschreibt das Vorgehen im Detail. ".repeat(20);
  assert.equal(istMedienAuftrag(`In diesem Kapitel erstellen wir eine Uebersicht. ${fuellung} Das Bild dazu folgt.`), false);
  assert.equal(istMedienAuftrag(`Schreib eine Funktion, die Bilder skaliert. ${fuellung}`), false);
});

test("Textfragen bleiben Textfragen (Cline-Weg erlaubt)", () => {
  const texte = [
    "Was ist der Unterschied zwischen einem Bild und einer Grafik?",
    "Erkläre mir, wie ein Foto entsteht",
    "Schreibe eine Funktion summe(a,b)",
    "Wie ist das Wetter morgen?",
    "Erstelle mir einen Trainingsplan",
    ""
  ];
  for (const probe of texte) assert.equal(istMedienAuftrag(probe), false, probe);
});
