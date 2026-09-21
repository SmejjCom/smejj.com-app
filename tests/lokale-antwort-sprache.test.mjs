// smejj.com — das Geraetemodell (eingebautes Modell in Desktop-Chrome) antwortet in der Sprache der Frage.
// Desktop-Test 21.09.2026 (v943, Oberflaeche Englisch): "What is the capital of Austria?" → "Wien ist die
// Hauptstadt Österreichs. — Auf deinem Gerät beantwortet — ohne Server, ohne Kosten." Dieselbe Wurzel wie der
// Bruecken-Fehler von v912: die Sprachregel stand als Nebensatz in einer deutschen Anweisung, und ein kleines
// Modell folgt dann der Sprache der ANWEISUNG. Auf den Handys gibt es diesen Weg nicht — darum sah es kein Geraetetest.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quelle = fs.readFileSync(path.join(wurzel, "public", "ai", "chat-stream.js"), "utf8");
const SPRACHEN = ["en", "es", "fr", "it", "pt", "tr", "ru", "ja", "ko", "zh", "ar", "hi", "bn", "id"];

test("die Anweisung ans Geraetemodell traegt KEINE Sprachregel (am Modell gemessen: die Regel selbst kippt die Sprache)", () => {
  // Messung 22.09.2026 im Desktop-Chrome (LanguageModel, available), Frage "What is the capital of Austria? One short sentence.":
  //   ohne Anweisung ............................ "The capital of Austria is Vienna."
  //   neutrale Anweisung (de ODER en) ............ "Vienna is the capital of Austria."  — de- und fr-Fragen ebenfalls richtig
  //   mit Sprachregel (alt, neu zweisprachig,
  //   rein englisch, mit expectedOutputs en) ..... "Wien ist die Hauptstadt von Österreich."
  // Ein kleines Modell liest "answer in the language of the user" offenbar als Auftrag, eine Sprache zu WAEHLEN.
  const m = /system:\s*"([^"]+)"/.exec(quelle);
  assert.ok(m, "system-Anweisung nicht gefunden");
  const text = m[1];
  assert.equal(text, "Du bist der Assistent von smejj.com. Antworte kurz und korrekt.");
  assert.doesNotMatch(text, /Sprache|language|LANGUAGE/i, "Sprachregel ist zurueck — sie kippt beim Geraetemodell die Antwortsprache");
});

test("der Hinweis unter der lokalen Antwort ist uebersetzbar und in allen 14 Sprachen vorhanden", async () => {
  const schluessel = "Auf deinem Gerät beantwortet — ohne Server, ohne Kosten.";
  assert.ok(quelle.includes(`t("${schluessel}")`), "Hinweis laeuft nicht durch t()");
  assert.doesNotMatch(quelle, /const hinweis = "\\n\\nAuf deinem Gerät/, "fester deutscher Hinweis ist zurueck");
  for (const sprache of SPRACHEN) {
    const woerter = (await import(path.join(wurzel, "public", "i18n", `${sprache}.js`))).default;
    assert.ok(woerter[schluessel] && woerter[schluessel] !== schluessel, `${sprache}: Hinweis fehlt`);
  }
});
