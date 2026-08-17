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
