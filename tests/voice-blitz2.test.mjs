// smejj.com — Logik-Tests fuer Sprachwelle Stufe 2a (Blitz-Paket 2).
// Abgedeckt: Zwei-Ebenen-Ausloeser (createInterruptTrigger — Unterbrechen auch
// auf Geraeten, deren Echounterdrueckung die System-TTS nicht entfernt) und
// Interim-Waechter (createSilenceWatchdog — Sprech-Ende ~1 s frueher).
// Standalone: node tests/voice-blitz2.test.mjs
import { createInterruptTrigger } from "../public/voice-vad.js";
import { createSilenceWatchdog } from "../public/voice-endpoint.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hilfsfunktion: Pegelfolge einspielen; liefert den Zeitpunkt des Ausloesens.
function feed(trigger, samples) {
  for (const [level, now, tts] of samples) {
    if (trigger.sample(level, now, tts)) return now;
  }
  return -1;
}

// --- Teil 1: Zwei-Ebenen-Ausloeser -------------------------------------------------

// 1a: Lautes TTS-Echo (Handy ohne AEC fuer System-TTS) loest NICHT aus —
// der Echo-Pegel wird im Warmup gelernt, danach bleibt konstantes Echo unter der Schwelle.
{
  const trigger = createInterruptTrigger();
  const samples = [];
  for (let t = 0; t <= 4000; t += 50) samples.push([0.15, t, true]);
  check("1a konstantes TTS-Echo loest nie aus", feed(trigger, samples) === -1);
}

// 1b: Nutzer spricht DEUTLICH lauter ins laufende TTS — loest nach ttsSustainMs aus.
{
  const trigger = createInterruptTrigger();
  const samples = [];
  for (let t = 0; t <= 2000; t += 50) samples.push([0.15, t, true]);   // Echo einlernen
  for (let t = 2050; t <= 3000; t += 50) samples.push([0.6, t, true]); // Nutzer lauter
  const firedAt = feed(trigger, samples);
  check("1b lautes Reinsprechen waehrend TTS loest aus", firedAt > 0);
  check("1c ... erst nach der robusten Nachweisdauer (>=350 ms)", firedAt >= 2400);
}

// 1d: In der Sprechpause (Lautsprecher still) reicht normales Sprechen — schnell.
{
  const trigger = createInterruptTrigger();
  const samples = [];
  for (let t = 0; t <= 2000; t += 50) samples.push([0.15, t, true]);    // TTS-Phase
  for (let t = 2050; t <= 2500; t += 50) samples.push([0.004, t, false]); // Pause: still
  for (let t = 2550; t <= 3200; t += 50) samples.push([0.07, t, false]);  // normales Sprechen
  const firedAt = feed(trigger, samples);
  check("1d normales Sprechen in der Pause loest aus", firedAt > 0);
  check("1e ... schnell (Pausen-Nachweis <= 250 ms nach Sprachbeginn)", firedAt > 0 && firedAt <= 2800);
}

// 1f: Kurzer Stoer-Knacks in der Pause (<180 ms) loest NICHT aus.
{
  const trigger = createInterruptTrigger();
  const samples = [];
  for (let t = 0; t <= 1000; t += 50) samples.push([0.004, t, false]);
  samples.push([0.2, 1050, false], [0.2, 1100, false]); // 100 ms Knacks
  for (let t = 1150; t <= 2000; t += 50) samples.push([0.004, t, false]);
  check("1f kurzer Knacks in der Pause loest nicht aus", feed(trigger, samples) === -1);
}

// 1g: Ausloeser feuert genau einmal (hasFired sperrt weitere Meldungen).
{
  const trigger = createInterruptTrigger();
  const samples = [];
  for (let t = 0; t <= 1000; t += 50) samples.push([0.004, t, false]);
  for (let t = 1050; t <= 3000; t += 50) samples.push([0.3, t, false]);
  const firedAt = feed(trigger, samples);
  check("1g feuert genau einmal", firedAt > 0 && trigger.hasFired() && trigger.sample(0.9, 5000, false) === false);
}

// --- Teil 2: Interim-Waechter -------------------------------------------------------

// 2a: Nach Text + Stille feuert der Waechter genau einmal.
{
  let fired = 0;
  const watchdog = createSilenceWatchdog(() => { fired += 1; }, { idleMs: 120, tickMs: 25 });
  watchdog.update(true);
  await wait(260);
  check("2a Stille nach Text feuert", fired === 1);
  check("2b hasFired meldet den Zustand", watchdog.hasFired() === true);
  await wait(150);
  check("2c ... und feuert nie doppelt", fired === 1);
}

// 2d: Ohne Text (nur leere Ergebnisse) feuert der Waechter nicht.
{
  let fired = 0;
  const watchdog = createSilenceWatchdog(() => { fired += 1; }, { idleMs: 120, tickMs: 25 });
  watchdog.update(false);
  await wait(260);
  check("2d ohne Text keine Ausloesung", fired === 0);
  watchdog.stop();
}

// 2e: Laufende Zwischenergebnisse halten den Waechter zurueck.
{
  let fired = 0;
  const watchdog = createSilenceWatchdog(() => { fired += 1; }, { idleMs: 150, tickMs: 25 });
  for (let index = 0; index < 6; index += 1) {
    watchdog.update(true);
    await wait(60); // immer unter idleMs
  }
  check("2e laufende Ergebnisse verhindern die Ausloesung", fired === 0);
  await wait(220);
  check("2f nach der letzten Aktualisierung feuert er dann doch", fired === 1);
}

// 2g: stop() beendet den Waechter endgueltig.
{
  let fired = 0;
  const watchdog = createSilenceWatchdog(() => { fired += 1; }, { idleMs: 100, tickMs: 25 });
  watchdog.update(true);
  watchdog.stop();
  await wait(200);
  check("2g stop() verhindert jede Ausloesung", fired === 0);
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
