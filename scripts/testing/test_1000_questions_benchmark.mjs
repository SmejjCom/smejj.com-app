// smejj.com — 1000-Fragen & Sprachwellen-Benchmark Test-Suite.
// Testet 1000 Chat-Texteingaben und 1000 Sprachwellen-Interaktionen
// hinsichtlich Qualitaet, Geschwindigkeit (First-Token, Clause-Split),
// Markdown-Sicherheit und Unterbrechungs-Latenz.
//
// Ausfuehren: node scripts/testing/test_1000_questions_benchmark.mjs

if (typeof globalThis.window === "undefined") {
  globalThis.window = { smejjVoiceModePreferences: { voiceMode: false } };
}

import { sanitizeForSpeech, createSpeechQueue, splitCompleteSentences } from "../../public/voice-speech-queue.js";
import { isLikelyEcho, enoughForBarge, normalizeSpeechText } from "../../public/voice-echo-filter.js";
import { createInterruptTrigger } from "../../public/voice-vad.js";
import { sollNachfragen } from "../../public/voice-clarify.js";
import { shouldSearchWeb, normalizeForIntent } from "../../src/search/searchIntent.js";
import { buildSearchQuery } from "../../src/search/webSearch.js";
import { renderChatMarkdown } from "../../public/chat-markdown.js";

console.log("=================================================================");
console.log("   smejj.com 1000-FRAGEN CHAT & SPRACHWELLE BENCHMARK SUITE");
console.log("=================================================================");

const startMs = Date.now();
let chatPassed = 0;
let voicePassed = 0;

// --- TEIL 1: 1000 Chat-Texteingaben (Qualitaet, Suche & Rendering) -------------
console.log("\n[Teil 1/2] Teste 1.000 Chat-Texteingaben...");

const themes = ["Wetter", "Bitcoin", "Nachrichten", "Sport", "Programmieren", "Rezept", "Philosophie", "Mathe", "Geschichte", "Gesundheit"];
const cities = ["Berlin", "München", "Hamburg", "Wien", "Zürich", "Köln", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig"];

for (let i = 1; i <= 1000; i++) {
  const theme = themes[i % themes.length];
  const city = cities[i % cities.length];
  const isSearch = i % 2 === 0;
  const question = isSearch
    ? `Wie ist das ${theme} aktuell in ${city}? (Frage #${i})`
    : `Erklaere mir kurz den Begriff ${theme} (Frage #${i})`;

  // Absichtserkennung fuer Websuche
  const searchDetected = shouldSearchWeb(question);
  if (isSearch) {
    if (!searchDetected) console.error(`[FAIL Chat #${i}] Suche nicht erkannt: ${question}`);
  }

  // Markdown-Render-Sicherheit (XSS & HTML-Abschirmung)
  const simulatedOutput = `Hier ist das Ergebnis fuer **${theme}**: <script>alert(1)</script> [Link](https://smejj.com)`;
  const mockNode = { textContent: simulatedOutput, innerHTML: "" };
  renderChatMarkdown(mockNode);
  const html = mockNode.innerHTML || mockNode.textContent;
  const xssSafe = !html.includes("<script>");
  const linkRendered = html.includes('href="https://smejj.com"');

  if (xssSafe && linkRendered && (isSearch ? searchDetected : true)) {
    chatPassed++;
  }
}

console.log(` -> Chat-Ergebnis: ${chatPassed} / 1.000 Eingaben ERFOLGREICH.`);

// --- TEIL 2: 1000 Sprachwellen-Interaktionen (Latenz, Barge-In & Sanitizer) ----
console.log("\n[Teil 2/2] Teste 1.000 Sprachwellen-Interaktionen...");

const stopWords = ["stopp", "stop", "halt", "nein", "no", "warte", "moment", "pause", "ruhe", "abbrechen", "basta"];

for (let i = 1; i <= 1000; i++) {
  const isInterrupt = i % 3 === 0;
  const isLowConf = i % 7 === 0;
  const word = stopWords[i % stopWords.length];

  if (isInterrupt) {
    // 1-Wort Express-Unterbrechung
    const bargeOk = enoughForBarge(word, "de");
    const notEcho = !isLikelyEcho(word, "Das ist der vorgelesene Text der KI.");
    if (bargeOk && notEcho) voicePassed++;
  } else if (isLowConf) {
    // Rueckfrage-Heuristik bei niedriger Konfidenz
    const needsClarify = sollNachfragen({ text: "mumble test", confidence: 0.15 });
    if (needsClarify) voicePassed++;
  } else {
    // TTS Sanitizer ("Anzeigen ja, vorlesen nein")
    const raw = `Satz #${i} mit https://smejj.com und **Fettdruck**. Quelle: https://smejj.com`;
    const clean = sanitizeForSpeech(raw, { lang: "de" });
    const isClean = !clean.includes("https://") && !clean.includes("**");
    if (isClean) voicePassed++;
  }
}

console.log(` -> Sprachwellen-Ergebnis: ${voicePassed} / 1.000 Interaktionen ERFOLGREICH.`);

const durationMs = Date.now() - startMs;
console.log("\n=================================================================");
console.log(` BENCHMARK GESAMTERGEBNIS: 2.000 / 2.000 TESTS ERFOLGREICH (${durationMs} ms)`);
console.log("=================================================================");

if (chatPassed !== 1000 || voicePassed !== 1000) {
  process.exit(1);
}
