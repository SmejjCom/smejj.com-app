// smejj.com — Sprachmodus Ende-zu-Ende-Gespraechstest (2026-07-17).
//
// Warum es diesen Test gibt: Der Pfad "Nutzer spricht mitten ins Vorlesen"
// war bisher NICHT automatisiert abgedeckt und wurde als Nutzer-Aufgabe
// gefuehrt. Da der Betreiber keine technischen Schritte ausfuehrt
// (AI_Guidelines 0.1), bildet dieser Harness den Loop deterministisch nach:
// Fake-SpeechRecognition + Fake-speechSynthesis + Fake-DOM, echte Modul-Logik.
//
// Abgedeckt: satzweises Vorlesen waehrend des Streams, Echo-Filter,
// Rausch-Schwelle, echte Unterbrechung, Queue-Abbruch (kein Nachsprechen),
// Folgefrage, sauberes Schliessen.
//
// Restrisiko (ehrlich, nicht automatisierbar): echte Mikrofon-Akustik
// (Geraete-Echo-Unterdrueckung ohne Kopfhoerer) und iOS-Safari-Eigenheiten.
// Standalone: node tests/voice-mode-conversation.test.mjs
import { splitCompleteSentences, createSpeechQueue } from "../public/voice-speech-queue.js";
import { BARGE_MIN_WORDS } from "../public/voice-echo-filter.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Nachbau der Host-Verdrahtung aus composer-tools.js/voice-landing.js ----------
// (gleiche Vertragsflaeche: speakFn/stopFn/onQueueStart/onQueueEnd + Barge-Guards)
function makeVoiceHost() {
  const host = {
    spoken: [],
    pendingEnds: [],
    speaking: false,
    cancels: 0,
    status: "listening",
    bargeListenerRunning: false,
    bargeConfirmed: false,
    sentTasks: [],
    queue: null
  };
  host.speakFn = (text, { onend } = {}) => {
    host.spoken.push(text);
    host.speaking = true;
    host.pendingEnds.push(() => { host.speaking = false; onend?.(); });
  };
  host.stopFn = () => { host.cancels += 1; host.speaking = false; host.pendingEnds.length = 0; };
  host.finishCurrentUtterance = () => host.pendingEnds.shift()?.();
  host.startQueue = () => {
    host.queue = createSpeechQueue({
      speakFn: host.speakFn,
      stopFn: host.stopFn,
      onQueueStart: () => { host.status = "speaking"; host.bargeListenerRunning = true; },
      onQueueEnd: () => {
        if (host.bargeConfirmed) return;
        host.bargeListenerRunning = false;
        host.status = "listening";
      }
    });
    return host.queue;
  };
  // Echo-Filter identisch zur Modul-Heuristik (normalisiert, >=50% Wortdeckung;
  // Stufe 2: 0.6 -> 0.5, siehe voice-echo-filter.js).
  host.isLikelyEcho = (heard) => {
    const norm = (t) => (t || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    const h = norm(heard);
    if (!h) return true;
    const spokenText = norm(host.queue?.spokenText() || "");
    if (spokenText.includes(h)) return true;
    const spokenWords = new Set(spokenText.split(" "));
    const heardWords = h.split(" ");
    return heardWords.filter((w) => spokenWords.has(w)).length / heardWords.length >= 0.5;
  };
  // Barge-in-Entscheidung wie im Modul: >=BARGE_MIN_WORDS Woerter UND kein Echo
  // (Schwelle kommt aus voice-echo-filter.js, seit Stufe 2: 3).
  host.hear = (text, isFinal) => {
    if (!host.bargeListenerRunning) return "ignoriert (kein Listener)";
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (!host.bargeConfirmed) {
      if (words.length < BARGE_MIN_WORDS) return "ignoriert (Rauschen)";
      if (host.isLikelyEcho(text)) return "ignoriert (Echo)";
      host.bargeConfirmed = true;
      host.queue.cancel();
      host.status = "listening";
    }
    if (isFinal && host.bargeConfirmed) {
      host.bargeConfirmed = false;
      host.bargeListenerRunning = false;
      host.sentTasks.push(text);
      return "als neue Frage gesendet";
    }
    return "unterbrochen";
  };
  return host;
}

// --- Test 1: Vorlesen startet, waehrend die Antwort noch streamt -------------------
await (async () => {
  const host = makeVoiceHost();
  const queue = host.startQueue();
  queue.push("Das ist der erste Satz.");
  await tick();
  check("1a Satz 1 wird gesprochen, bevor der Stream fertig ist", host.spoken.length === 1);
  check("1b Status wechselt auf speaking", host.status === "speaking");
  check("1c Barge-Listener laeuft waehrend des Vorlesens", host.bargeListenerRunning === true);
})();

// --- Test 2: Echo und Rauschen unterbrechen NICHT -----------------------------------
await (async () => {
  const host = makeVoiceHost();
  const queue = host.startQueue();
  queue.push("Hier kommt der zweite Satz.");
  await tick();
  const cancelsVorher = host.cancels;
  check("2a Lautsprecher-Echo wird ignoriert",
    host.hear("hier kommt der zweite Satz", false) === "ignoriert (Echo)" && host.cancels === cancelsVorher);
  check("2b Rauschen (<3 Woerter) wird ignoriert",
    host.hear("ja", false) === "ignoriert (Rauschen)" && host.cancels === cancelsVorher);
  check("2c Vorlesen laeuft unbeirrt weiter", host.status === "speaking");
})();

// --- Test 3: echtes Reinsprechen bricht sofort ab, Rest wird NICHT nachgesprochen ---
await (async () => {
  const host = makeVoiceHost();
  const queue = host.startQueue();
  queue.push("Das ist der erste Satz. Hier kommt der zweite Satz. Und ein dritter Satz folgt.");
  await tick();
  host.finishCurrentUtterance(); // Satz 1 fertig -> Satz 2 laeuft
  await tick();
  check("3a Saetze laufen der Reihe nach", host.spoken.length === 2);
  const gesprochenVorBarge = host.spoken.length;
  check("3b Reinsprechen unterbricht sofort", host.hear("stopp warte mal kurz", false) === "unterbrochen");
  check("3c TTS wurde gestoppt", host.cancels === 1 && host.speaking === false);
  check("3d Status zurueck auf listening", host.status === "listening");
  // Stream laeuft aus: der Rest darf NICHT mehr gesprochen werden.
  queue.flush("Das ist der erste Satz. Hier kommt der zweite Satz. Und ein dritter Satz folgt.");
  await tick(50);
  check("3e Satz 3 wird nach dem Abbruch nicht nachgesprochen", host.spoken.length === gesprochenVorBarge);
  check("3f Gespraech endet nicht heimlich (kein onQueueEnd nach cancel)", host.status === "listening");
})();

// --- Test 4: die Unterbrechung wird zur neuen Frage ----------------------------------
await (async () => {
  const host = makeVoiceHost();
  const queue = host.startQueue();
  queue.push("Ein langer erster Satz zum Vorlesen.");
  await tick();
  host.hear("stopp erklaer mir lieber etwas anderes", false);
  const ergebnis = host.hear("stopp erklaer mir lieber etwas anderes", true);
  check("4a finale Phrase wird als neue Frage gesendet", ergebnis === "als neue Frage gesendet");
  check("4b genau eine Frage gesendet (kein Doppel-Senden)", host.sentTasks.length === 1);
  check("4c Fragetext korrekt", host.sentTasks[0] === "stopp erklaer mir lieber etwas anderes");
})();

// --- Test 5: Schliessen mitten im Vorlesen laesst nichts zurueck ---------------------
await (async () => {
  const host = makeVoiceHost();
  const queue = host.startQueue();
  queue.push("Satz eins hier. Satz zwei hier. Satz drei hier.");
  await tick();
  queue.cancel(); // entspricht closeVoiceMode -> stopSpeaking
  await tick(50);
  check("5a Queue nach dem Schliessen inaktiv", queue.isActive() === false && queue.isCancelled() === true);
  check("5b TTS gestoppt", host.speaking === false && host.cancels === 1);
  const gesprochen = host.spoken.length;
  queue.push("Satz eins hier. Satz zwei hier. Satz drei hier. Satz vier.");
  await tick(50);
  check("5c nach dem Schliessen spricht nichts mehr nach", host.spoken.length === gesprochen);
})();

// --- Test 6: Sprachprofil-Antworten (kurz, kein Markdown) werden sauber zerlegt ------
{
  const antwort = "Ja, das klappt. Ich kann dir dabei helfen. Sag einfach Bescheid!";
  const { sentences, rest } = splitCompleteSentences(antwort, { flush: true });
  check("6a typische Sprachantwort ergibt 3 Saetze", sentences.length === 3 && rest === "");
  check("6b erster Satz ist sofort sprechbar", sentences[0] === "Ja, das klappt.");
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
