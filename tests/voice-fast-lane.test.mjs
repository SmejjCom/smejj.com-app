// smejj.com — Logik-Tests fuer das Sprachwellen-Blitz-Paket (Stufe 1e).
// Abgedeckt: fruehes Lossprechen am Teilsatz (eagerFirst), Mikrofonpegel-
// Ausloeser (createLevelTrigger, pure Logik) und der geteilte Echo-/Rausch-
// Filter mit der neuen 2-Wort-Schwelle.
// Standalone: node tests/voice-fast-lane.test.mjs
import { splitFirstEagerClause, createSpeechQueue } from "../public/voice-speech-queue.js";
import { createLevelTrigger } from "../public/voice-vad.js";
import { BARGE_MIN_WORDS, enoughForBarge, isLikelyEcho, normalizeSpeechText } from "../public/voice-echo-filter.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// --- Teil 1: splitFirstEagerClause -------------------------------------------------
check("1a Teilsatz am Komma (mit Leerraum danach)",
  splitFirstEagerClause("Heute ist es in Berlin bewoelkt, aber morgen wird es sonnig") === "Heute ist es in Berlin bewoelkt,");
check("1b Zahlen wie 21,5 werden NIE zerschnitten",
  splitFirstEagerClause("Es sind 21,5 Grad") === "");
check("1c zu kurzer Teilsatz wird nicht gesprochen",
  splitFirstEagerClause("Ja, das stimmt so weit wirklich") === "");
check("1d ohne Grenze kein Teilsatz",
  splitFirstEagerClause("Ein Text ohne jede Pause im Fluss") === "");
check("1e Doppelpunkt zaehlt als Grenze",
  splitFirstEagerClause("Kurz zusammengefasst gilt: es funktioniert") === "Kurz zusammengefasst gilt:");
check("1f CJK-Komma zaehlt ohne Leerraum",
  splitFirstEagerClause("今日はベルリンの天気は曇りです、明日は晴れます") === "今日はベルリンの天気は曇りです、");

// --- Teil 2: eagerFirst in der Vorlese-Queue ---------------------------------------
await (async () => {
  const spoken = [];
  const queue = createSpeechQueue({
    speakFn: (text, { onend } = {}) => { spoken.push(text); queueMicrotask(() => onend?.()); },
    stopFn: () => {},
    eagerFirst: true
  });
  // Stream-Verlauf wie live: das Leerzeichen nach dem Komma kommt im selben
  // Chunk wie das naechste Wort — erst dann darf der Teilsatz feuern.
  queue.push("Heute ist es in Berlin bewoelkt, aber");
  await tick();
  check("2a erster Teilsatz wird VOR dem Satzende gesprochen",
    spoken.length === 1 && spoken[0] === "Heute ist es in Berlin bewoelkt,");
  queue.push("Heute ist es in Berlin bewoelkt, aber trocken bei 21 Grad. Morgen regnet es.");
  await tick();
  check("2b Satzrest folgt ohne Doppelung",
    spoken.length >= 2 && spoken[1].includes("aber trocken") && !spoken[1].includes("bewoelkt"));
  queue.flush("Heute ist es in Berlin bewoelkt, aber trocken bei 21 Grad. Morgen regnet es.");
  await tick();
  check("2c kompletter Text genau einmal gesprochen",
    normalizeSpeechText(spoken.join(" ")) === normalizeSpeechText("Heute ist es in Berlin bewoelkt aber trocken bei 21 Grad Morgen regnet es"));
})();
await (async () => {
  const spoken = [];
  const queue = createSpeechQueue({
    speakFn: (text, { onend } = {}) => { spoken.push(text); queueMicrotask(() => onend?.()); },
    stopFn: () => {},
    eagerFirst: true
  });
  queue.push("Der erste Satz ist schon fertig. Der zweite Satz haengt noch, weil");
  await tick();
  check("2d fertiger Satz hat Vorrang vor dem Teilsatz-Schnitt",
    spoken[0] === "Der erste Satz ist schon fertig.");
})();
await (async () => {
  const spoken = [];
  const queue = createSpeechQueue({
    speakFn: (text, { onend } = {}) => { spoken.push(text); queueMicrotask(() => onend?.()); },
    stopFn: () => {}
  });
  queue.push("Ohne eagerFirst bleibt alles beim Alten, auch mit Komma im Text");
  await tick();
  check("2e ohne eagerFirst kein Teilsatz-Schnitt (Bestandsverhalten)", spoken.length === 0);
})();

// --- Teil 3: createLevelTrigger (Mikrofonpegel-Ausloeser) --------------------------
{
  const trigger = createLevelTrigger();
  let fired = false;
  for (let t = 0; t <= 400; t += 50) fired = trigger.sample(0.5, t) || fired;
  check("3a Warmlaufphase loest nie aus (auch bei lautem Pegel)", fired === false);
}
{
  const trigger = createLevelTrigger();
  for (let t = 0; t <= 600; t += 50) trigger.sample(0.005, t); // leises Grundrauschen
  let firedAt = -1;
  for (let t = 650; t <= 1200; t += 50) {
    if (trigger.sample(0.2, t)) { firedAt = t; break; }
  }
  check("3b anhaltende Sprache loest nach ~300 ms aus", firedAt >= 950 && firedAt <= 1050);
  check("3c danach nie wieder (genau einmal)", trigger.sample(0.9, 2000) === false && trigger.hasFired());
}
{
  const trigger = createLevelTrigger();
  for (let t = 0; t <= 600; t += 50) trigger.sample(0.005, t);
  let fired = false;
  fired = trigger.sample(0.2, 650) || fired;   // kurzer Knall
  fired = trigger.sample(0.2, 700) || fired;
  fired = trigger.sample(0.004, 750) || fired; // wieder still
  fired = trigger.sample(0.2, 800) || fired;   // neuer kurzer Knall
  check("3d kurze Geraeusch-Spitzen loesen nicht aus", fired === false);
}
{
  const trigger = createLevelTrigger();
  for (let t = 0; t <= 2000; t += 50) trigger.sample(0.1, t); // lautes TTS-Restecho
  let fired = false;
  for (let t = 2050; t <= 2400; t += 50) fired = trigger.sample(0.12, t) || fired;
  check("3e Grundrauschen wird mitgelernt (12% ueber Floor reicht nicht)", fired === false);
}

// --- Teil 4: geteilter Echo-/Rausch-Filter mit 2-Wort-Schwelle ---------------------
check("4a Schwelle ist 2 Woerter (schnelleres Unterbrechen)", BARGE_MIN_WORDS === 2);
check("4b zwei Woerter reichen fuer eine Unterbrechung", enoughForBarge("stopp bitte", "de") === true);
check("4c ein Wort bleibt Rauschen", enoughForBarge("ja", "de") === false);
check("4d zh: 3 Zeichen reichen", enoughForBarge("等一下", "zh") === true);
check("4e Echo bleibt Echo (Filter unveraendert)",
  isLikelyEcho("heute ist es bewoelkt", "Heute ist es in Berlin bewoelkt.") === true);
check("4f echte Zwischenfrage ist kein Echo",
  isLikelyEcho("was kostet das Abo", "Heute ist es in Berlin bewoelkt.") === false);

console.log(`\nvoice-fast-lane: ${passed} ok, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
