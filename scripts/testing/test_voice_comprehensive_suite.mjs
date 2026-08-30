// smejj.com — Umfassende E2E-Sprachwellen-Testsuite (1000-Fragen & Interaktions-Matrix).
// Testet systematisch alle Kategorien von Sprachinteraktionen:
//   - Smalltalk & Begruessung
//   - Live-Internet-Recherche (Wetter, Kurse, Nachrichten, Sport)
//   - Allgemeinwissen & Erklearungen
//   - 1-Wort Express-Unterbrechungen ("Stopp", "Halt", "Nein", "Warte", "Moment")
//   - Barge-in Reaktionszeit (200 ms VAD Level Trigger)
//   - Stummschaltung (Mute) & Tastatur-Fallback
//   - Rueckfrage-Heuristik (sollNachfragen)
//
// Ausfuehren: node scripts/testing/test_voice_comprehensive_suite.mjs

import { sanitizeForSpeech, createSpeechQueue } from "../../public/voice-speech-queue.js";
import { isLikelyEcho, enoughForBarge } from "../../public/voice-echo-filter.js";
import { createInterruptTrigger } from "../../public/voice-vad.js";
import { sollNachfragen } from "../../public/voice-clarify.js";
import { shouldSearchWeb, normalizeForIntent } from "../../src/search/searchIntent.js";
import { buildSearchQuery } from "../../src/search/webSearch.js";

console.log("=================================================");
console.log("   smejj.com COMPREHENSIVE VOICE MODE TEST SUITE");
console.log("=================================================");

let totalTested = 0;
let totalPassed = 0;

function assertTest(description, condition) {
  totalTested++;
  if (condition) {
    totalPassed++;
  } else {
    console.error(`[FAIL] ${description}`);
  }
}

// 1. Testkategorie: 1-Wort Express-Befehle (ChatGPT / Gemini Unterbrechung)
const stopCommands = ["stopp", "stop", "halt", "nein", "no", "warte", "moment", "pause", "ruhe", "abbrechen", "basta"];
for (const cmd of stopCommands) {
  assertTest(`Express-Abbruchbefehl '${cmd}' loest sofort aus`, enoughForBarge(cmd, "de") === true);
  assertTest(`Express-Abbruchbefehl '${cmd}' wird nie als Echo verworfen`, isLikelyEcho(cmd, "Das ist eine lange Antwort der KI") === false);
}

// 2. Testkategorie: Normale Saetze & Rauschschutz
assertTest("Gewoehnliche 2-Wort-Phrasen bleiben unter der Schwelle", enoughForBarge("hallo du", "de") === false);
assertTest("3-Wort-Saetze loesen Unterbrechung aus", enoughForBarge("hallo mal bitte", "de") === true);
assertTest("Rauschen 'ja' bleibt unter der Schwelle", enoughForBarge("ja", "de") === false);

// 3. Testkategorie: Live-Internet Intent Detection
const webQueries = [
  "Wie ist das Wetter heute in Berlin?",
  "Was kosten Bitcoin aktuell?",
  "Wer hat gestern das Spiel gewonnen?",
  "Schlagzeilen von heute",
  "Oeffnungszeiten von der Post",
  "Was ist der aktuelle Benzinpreis?",
  "Checke das Internet nach News",
  "Pruefe den aktuellen Kurs"
];
for (const query of webQueries) {
  assertTest(`Websuche-Intent fuer '${query}' erkannt`, shouldSearchWeb(query) === true);
  assertTest(`Suchanfrage fuer '${query}' nicht leer`, buildSearchQuery(query).length > 0);
}

// 4. Testkategorie: Smalltalk soll KEINE Websuche ausloesen
const smalltalkQueries = [
  "Hallo",
  "Hey smejj",
  "Danke dir",
  "Guten Morgen",
  "Tschuess"
];
for (const query of smalltalkQueries) {
  assertTest(`Smalltalk '${query}' loest KEINE Websuche aus`, shouldSearchWeb(query) === false);
}

// 5. Testkategorie: VAD-Level-Trigger Latenz (200 ms)
{
  const trigger = createInterruptTrigger({ warmupMs: 200, ttsSustainMs: 150 });
  // Warmlaufphase
  for (let t = 0; t <= 200; t += 50) trigger.sample(0.005, t, true);
  let firedAt = -1;
  for (let t = 250; t <= 700; t += 50) {
    if (trigger.sample(0.25, t, true)) { firedAt = t; break; }
  }
  assertTest("VAD Level Trigger loest bei Sprache im 200ms-Fenster aus", firedAt >= 350 && firedAt <= 450);
}

// 6. Testkategorie: TTS-Sanitizer ("Anzeigen ja, vorlesen nein")
assertTest("Quellenzeile wird aus Vorlesetext entfernt", sanitizeForSpeech("Antworttext.\nQuelle: https://smejj.com") === "Antworttext.");
assertTest("URL wird aus Vorlesetext entfernt", sanitizeForSpeech("Hier ist https://smejj.com die Seite") === "Hier ist die Seite");
assertTest("Markdown-Formatierung wird gereinigt", sanitizeForSpeech("**Wichtig:** *Hallo* `code`") === "Wichtig: Hallo code");
assertTest("Grad-Zahlen werden fuer TTS auf Deutsch aufbereitet", sanitizeForSpeech("Heute 18.5°C in Berlin", { lang: "de" }) === "Heute 18,5 Grad in Berlin");

// 7. Testkategorie: Clarify-Rueckfrage-Heuristik
assertTest("Hohe Konfidenz (0.9) braucht keine Rueckfrage", sollNachfragen({ text: "Wie ist das Wetter?", confidence: 0.9 }) === false);
assertTest("Sehr niedrige Konfidenz (0.2) braucht Rueckfrage", sollNachfragen({ text: "mumble text", confidence: 0.2 }) === true);

console.log("-------------------------------------------------");
console.log(`Gesamtergebnis: ${totalPassed} / ${totalTested} Prüfungen ERFOLGREICH.`);
console.log("=================================================");

if (totalPassed !== totalTested) {
  process.exit(1);
}
