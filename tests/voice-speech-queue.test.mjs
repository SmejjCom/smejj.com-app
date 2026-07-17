// smejj.com — Logik-Tests fuer das satzweise Vorlesen (Stufe 1c).
// Standalone: node tests/voice-speech-queue.test.mjs
import { splitCompleteSentences, createSpeechQueue } from "../public/voice-speech-queue.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`ok   ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

// Fake-TTS: sammelt Utterances, onend wird manuell (oder sofort) ausgeloest.
function makeFakeTts({ autoEnd = true } = {}) {
  const spokenList = [];
  const pendingEnds = [];
  return {
    spokenList,
    pendingEnds,
    speakFn(text, { onend } = {}) {
      spokenList.push(text);
      if (autoEnd) queueMicrotask(() => onend?.());
      else pendingEnds.push(onend);
    },
    endNext() {
      const onend = pendingEnds.shift();
      onend?.();
    }
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// --- Test 1: Satz-Zerlegung Basis ------------------------------------------------
{
  const { sentences, rest } = splitCompleteSentences("Hallo Welt. Wie geht es dir? Gut soweit");
  check("1a Zerlegung: zwei fertige Saetze", sentences.length === 2
    && sentences[0] === "Hallo Welt." && sentences[1] === "Wie geht es dir?");
  check("1b Zerlegung: Rest ohne Satzzeichen bleibt", rest === " Gut soweit");
}

// --- Test 2: flush nimmt den Rest mit ---------------------------------------------
{
  const { sentences, rest } = splitCompleteSentences("Erster Satz. Und der Rest", { flush: true });
  check("2 flush: Rest wird letzter Satz", sentences.length === 2
    && sentences[1] === "Und der Rest" && rest === "");
}

// --- Test 3: Dezimalzahlen nicht zerteilen ----------------------------------------
{
  const { sentences } = splitCompleteSentences("Pi ist ungefaehr 3.14159 und mehr.", { flush: true });
  check("3 Dezimalzahl bleibt ganz", sentences.length === 1);
}

// --- Test 4: CJK-Interpunktion ----------------------------------------------------
{
  const { sentences, rest } = splitCompleteSentences("你好世界。今天怎么样");
  check("4 CJK: Satzende erkannt", sentences.length === 1
    && sentences[0] === "你好世界。" && rest === "今天怎么样");
}

// --- Test 5: Ellipse und Mehrfach-Zeichen ------------------------------------------
{
  const { sentences } = splitCompleteSentences("Moment ... Fertig! Wirklich?", { flush: true });
  check("5 Ellipse/!/? als Satzenden", sentences.length === 3);
}

// --- Test 6: Erster Satz startet, waehrend der Rest streamt -------------------------
await (async () => {
  const tts = makeFakeTts();
  let started = 0;
  let ended = 0;
  const queue = createSpeechQueue({
    speakFn: tts.speakFn,
    stopFn: () => {},
    onQueueStart: () => { started += 1; },
    onQueueEnd: () => { ended += 1; }
  });
  queue.push("Der erste Satz ist da. Der zwei");
  await tick();
  check("6a Streaming: erster Satz sofort gesprochen", tts.spokenList.length === 1
    && tts.spokenList[0] === "Der erste Satz ist da.");
  check("6b Streaming: onQueueStart genau einmal", started === 1);
  check("6c Streaming: noch kein onQueueEnd", ended === 0);
  queue.push("Der erste Satz ist da. Der zweite folgt jetzt. Und ein Re");
  await tick();
  check("6d Streaming: zweiter Satz folgt in Reihenfolge", tts.spokenList.length === 2
    && tts.spokenList[1] === "Der zweite folgt jetzt.");
  queue.flush("Der erste Satz ist da. Der zweite folgt jetzt. Und ein Rest ohne Punkt");
  await tick();
  check("6e flush: Rest gesprochen", tts.spokenList.length === 3
    && tts.spokenList[2] === "Und ein Rest ohne Punkt");
  check("6f flush: onQueueEnd genau einmal", ended === 1);
  check("6g Queue danach inaktiv", queue.isActive() === false);
  check("6h spokenText enthaelt alles Gesprochene",
    queue.spokenText() === "Der erste Satz ist da. Der zweite folgt jetzt. Und ein Rest ohne Punkt");
})();

// --- Test 7: cancel (Barge-in) leert Queue, stoppt TTS, kein onQueueEnd -------------
await (async () => {
  const tts = makeFakeTts({ autoEnd: false });
  let ended = 0;
  let stopped = 0;
  const queue = createSpeechQueue({
    speakFn: tts.speakFn,
    stopFn: () => { stopped += 1; },
    onQueueEnd: () => { ended += 1; }
  });
  queue.push("Satz eins ist fertig. Satz zwei ist fertig. Satz drei");
  check("7a Erster Satz beim TTS", tts.spokenList.length === 1);
  queue.cancel();
  tts.endNext(); // onend der abgebrochenen Utterance (cancel loest onend aus)
  await tick();
  check("7b cancel: stopFn gerufen", stopped === 1);
  check("7c cancel: kein weiterer Satz gesprochen", tts.spokenList.length === 1);
  check("7d cancel: kein onQueueEnd", ended === 0);
  queue.push("Satz eins ist fertig. Satz zwei ist fertig. Satz drei ist auch da.");
  queue.flush("egal");
  await tick();
  check("7e cancel: push/flush danach wirkungslos", tts.spokenList.length === 1 && ended === 0);
  check("7f cancel: isCancelled", queue.isCancelled() === true);
})();

// --- Test 8: kein Doppelsprechen bei wiederholtem push desselben Textes -------------
await (async () => {
  const tts = makeFakeTts();
  const queue = createSpeechQueue({ speakFn: tts.speakFn, stopFn: () => {} });
  const text = "Ein stabiler Satz. Noch ein Satz.";
  queue.push(text);
  queue.push(text);
  queue.push(text);
  await tick();
  check("8 idempotenter push: jeder Satz nur einmal", tts.spokenList.length === 2);
})();

// --- Test 9: leere/whitespace Antwort -> flush ohne Utterance, aber onQueueEnd ------
await (async () => {
  const tts = makeFakeTts();
  let ended = 0;
  let started = 0;
  const queue = createSpeechQueue({
    speakFn: tts.speakFn,
    stopFn: () => {},
    onQueueStart: () => { started += 1; },
    onQueueEnd: () => { ended += 1; }
  });
  queue.push("   ");
  queue.flush("   ");
  await tick();
  check("9 leer: nichts gesprochen, genau ein onQueueEnd", tts.spokenList.length === 0
    && started === 0 && ended === 1);
})();

// --- Test 10: sequentielles Sprechen (naechster Satz erst nach onend) ----------------
await (async () => {
  const tts = makeFakeTts({ autoEnd: false });
  const queue = createSpeechQueue({ speakFn: tts.speakFn, stopFn: () => {} });
  queue.flush("Satz nummer eins. Satz nummer zwei. Satz nummer drei.");
  check("10a nur der erste Satz laeuft", tts.spokenList.length === 1);
  tts.endNext();
  check("10b zweiter Satz nach onend", tts.spokenList.length === 2);
  tts.endNext();
  tts.endNext();
  check("10c alle drei in Reihenfolge", tts.spokenList.join("|")
    === "Satz nummer eins.|Satz nummer zwei.|Satz nummer drei.");
})();

// --- Test 11: Getter-kompatibler spokenText waechst satzweise ------------------------
await (async () => {
  const tts = makeFakeTts({ autoEnd: false });
  const queue = createSpeechQueue({ speakFn: tts.speakFn, stopFn: () => {} });
  const getter = () => queue.spokenText();
  queue.push("Erst dieser Satz hier. Dann noch ein weiterer Satz. ");
  check("11a Getter nach Satz 1", getter() === "Erst dieser Satz hier.");
  tts.endNext();
  check("11b Getter nach Satz 2", getter() === "Erst dieser Satz hier. Dann noch ein weiterer Satz.");
})();

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
