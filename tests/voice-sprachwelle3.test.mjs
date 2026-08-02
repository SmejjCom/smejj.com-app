// smejj.com — Logik-Tests fuer Sprachwelle Stufe 3a.
// Abgedeckt:
//   1) idleFor — semantisches Sprech-Ende statt starrer 850 ms
//   2) createSilenceWatchdog — der ALTE Aufrufweg bleibt unveraendert
//      (die eingefrorene Startseite ruft mit Wahrheitswert auf)
//   3) sollAnsagen / createThinkingCue — Denk-Laut nur wenn noetig, nur einmal
//   4) queue.sayAhead — die Ansage kann nicht in die Antwort hineinreden
// Standalone: node tests/voice-sprachwelle3.test.mjs
import { idleFor, createSilenceWatchdog } from "../public/voice-endpoint.js";
import { sollAnsagen, createThinkingCue } from "../public/voice-thinking-cue.js";
import { createSpeechQueue } from "../public/voice-speech-queue.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 1) idleFor: die Wartezeit richtet sich nach dem Gesagten ------------------

check("1a fertiger Satz wartet kurz",
  idleFor("Wie ist das Wetter morgen in Berlin?") === 420);
check("1b Punkt zaehlt genauso",
  idleFor("Das ist meine Frage.") === 420);
check("1c Satzzeichen schlaegt Kurztext",
  idleFor("Ja.") === 420);
check("1d Anfuehrungszeichen nach dem Punkt stoeren nicht",
  idleFor('Er sagte "hallo."') === 420);

check("1e Bindewort am Ende wartet lang",
  idleFor("Ich brauche das Wetter und") === 1500);
check("1f Fuellwort am Ende wartet lang",
  idleFor("Also ich wollte fragen aeh") === 1500);
check("1g Artikel am Ende wartet lang",
  idleFor("Zeig mir bitte die") === 1500);

check("1h sehr kurzer Anfang wartet lang",
  idleFor("Wie ist") === 1500);
check("1i normaler Satz ohne Satzzeichen bleibt bei 850",
  idleFor("Wie ist das Wetter morgen in Berlin") === 850);
check("1j leerer Text bleibt bei 850",
  idleFor("") === 850);
check("1k nur Satzzeichen ohne Woerter bleibt bei 850",
  idleFor("...") === 420 || idleFor("...") === 850);

// Grossschreibung darf nichts aendern (Erkennung liefert gemischt).
check("1l Bindewort erkennt Grossschreibung",
  idleFor("Ich brauche das Wetter UND") === 1500);

// --- 2) Rueckwaertskompatibilitaet: der alte Aufrufweg -------------------------
// Die Startseite (public/composer-tools.js) steht unter Start-Lock und ruft
// update(hasText) mit einem Wahrheitswert auf. Dieses Verhalten MUSS gleich
// bleiben, sonst aendert eine freie Datei das Verhalten einer gesperrten.
{
  const watchdog = createSilenceWatchdog(() => {}, { idleMs: 850, tickMs: 25 });
  watchdog.update(true);
  check("2a alter Weg (true) behaelt die feste Wartezeit",
    watchdog.wartezeitMs() === 850);
  watchdog.update(false);
  check("2b alter Weg (false) ebenfalls",
    watchdog.wartezeitMs() === 850);
  watchdog.stop();
}
{
  const watchdog = createSilenceWatchdog(() => {}, { idleMs: 850, tickMs: 25 });
  watchdog.update("Das ist fertig.");
  check("2c neuer Weg (Text) wird adaptiv",
    watchdog.wartezeitMs() === 420);
  watchdog.update("Das ist fertig und");
  check("2d ... und passt sich bei jedem Ergebnis neu an",
    watchdog.wartezeitMs() === 1500);
  watchdog.stop();
}
{
  const watchdog = createSilenceWatchdog(() => {}, { idleMs: 850, tickMs: 25, adaptiv: false });
  watchdog.update("Das ist fertig.");
  check("2e adaptiv:false erzwingt das alte Verhalten",
    watchdog.wartezeitMs() === 850);
  watchdog.stop();
}
{
  // Leerer Text darf den Waechter nicht scharf machen (wie bisher bei false).
  let fired = 0;
  const watchdog = createSilenceWatchdog(() => { fired += 1; }, { idleMs: 100, tickMs: 25 });
  watchdog.update("   ");
  await wait(220);
  check("2f leerer Text loest nicht aus", fired === 0);
  watchdog.stop();
}
{
  // Ende-zu-Ende: ein fertiger Satz feuert frueher als die alten 850 ms.
  let firedAt = 0;
  const start = Date.now();
  const watchdog = createSilenceWatchdog(() => { firedAt = Date.now() - start; }, { tickMs: 20 });
  watchdog.update("Das ist eine fertige Frage.");
  await wait(650);
  check("2g fertiger Satz feuert deutlich vor 850 ms",
    firedAt > 0 && firedAt < 700);
  watchdog.stop();
}

// --- 3) Denk-Laut: reine Regel -------------------------------------------------

check("3a vor Ablauf keine Ansage",
  sollAnsagen({ armedAt: 1000, jetzt: 1500, delayMs: 700 }) === false);
check("3b nach Ablauf Ansage",
  sollAnsagen({ armedAt: 1000, jetzt: 1700, delayMs: 700 }) === true);
check("3c laufende Antwort verhindert die Ansage",
  sollAnsagen({ armedAt: 1000, jetzt: 5000, delayMs: 700, antwortLaeuft: true }) === false);
check("3d bereits angesagt verhindert die Wiederholung",
  sollAnsagen({ armedAt: 1000, jetzt: 5000, delayMs: 700, schonAngesagt: true }) === false);
check("3e abgebrochene Frage sagt nichts an",
  sollAnsagen({ armedAt: 1000, jetzt: 5000, delayMs: 700, abgebrochen: true }) === false);
check("3f ohne Startzeitpunkt keine Ansage",
  sollAnsagen({ armedAt: 0, jetzt: 5000, delayMs: 700 }) === false);

// --- 3g..3k) Denk-Laut: Laufzeitverhalten mit injizierten Timern ---------------
{
  let gesagt = 0;
  let fn = null;
  const cue = createThinkingCue({
    sagen: () => { gesagt += 1; },
    delayMs: 50,
    planen: (callback) => { fn = callback; return 1; },
    abbrechen: () => { fn = null; }
  });
  cue.arm();
  check("3g arm plant die Ansage", typeof fn === "function");
  fn();
  check("3h nach Ablauf wird gesagt", gesagt === 1 && cue.hasSpoken() === true);
}
{
  let gesagt = 0;
  let fn = null;
  const cue = createThinkingCue({
    sagen: () => { gesagt += 1; },
    delayMs: 50,
    planen: (callback) => { fn = callback; return 1; },
    abbrechen: () => { fn = null; }
  });
  cue.arm();
  cue.disarm();
  check("3i disarm verhindert die Ansage", fn === null && gesagt === 0);
}
{
  // Der wichtigste Fall: die Antwort beginnt WAEHREND der Wartezeit.
  let gesagt = 0;
  let fn = null;
  let laeuft = false;
  const cue = createThinkingCue({
    sagen: () => { gesagt += 1; },
    antwortLaeuft: () => laeuft,
    delayMs: 50,
    planen: (callback) => { fn = callback; return 1; },
    abbrechen: () => { fn = null; }
  });
  cue.arm();
  laeuft = true;       // Antwort hat begonnen, bevor der Timer feuert
  fn();
  check("3j laufende Antwort im Moment des Feuerns verhindert das Hineinreden",
    gesagt === 0);
}
{
  let gesagt = 0;
  let fn = null;
  const cue = createThinkingCue({
    sagen: () => { gesagt += 1; },
    delayMs: 50,
    planen: (callback) => { fn = callback; return 1; },
    abbrechen: () => { fn = null; }
  });
  cue.arm();
  cue.arm(); // doppeltes Scharfmachen darf nichts verdoppeln
  fn();
  check("3k Ansage kommt hoechstens einmal", gesagt === 1);
}
{
  // Echte Timer: der Laut kommt tatsaechlich nach der Wartezeit.
  let gesagt = 0;
  const cue = createThinkingCue({ sagen: () => { gesagt += 1; }, delayMs: 60 });
  cue.arm();
  await wait(30);
  check("3l vor Ablauf ist es still", gesagt === 0);
  await wait(90);
  check("3m nach Ablauf kommt der Laut", gesagt === 1);
  cue.disarm();
}

// --- 4) sayAhead: die Ansage kann die Antwort nicht ueberreden -----------------

function testQueue() {
  const gesprochen = [];
  const queue = createSpeechQueue({
    speakFn: (text, { onend }) => { gesprochen.push(text); onend?.(); },
    stopFn: () => {},
    onQueueStart: () => {},
    onQueueEnd: () => {}
  });
  return { queue, gesprochen };
}

{
  const { queue, gesprochen } = testQueue();
  const ok = queue.sayAhead("Einen Moment ...");
  check("4a Ansage wird eingereiht, wenn nichts laeuft", ok === true);
  check("4b ... und tatsaechlich gesprochen", gesprochen[0] === "Einen Moment ...");
  check("4c ... und zaehlt als eigene Ausgabe (Echo-Filter)",
    queue.spokenText().includes("Einen Moment"));
}
{
  const { queue, gesprochen } = testQueue();
  queue.push("Das ist die echte Antwort. ");
  const ok = queue.sayAhead("Einen Moment ...");
  check("4d keine Ansage, wenn die Antwort schon spricht", ok === false);
  check("4e ... und nichts wird nachtraeglich eingeschoben",
    gesprochen.every((text) => !text.includes("Moment")));
}
{
  const { queue } = testQueue();
  queue.flush("Fertige Antwort.");
  check("4f keine Ansage nach dem Streamende", queue.sayAhead("Einen Moment ...") === false);
}
{
  const { queue } = testQueue();
  queue.cancel();
  check("4g keine Ansage nach Barge-in", queue.sayAhead("Einen Moment ...") === false);
}
{
  const { queue } = testQueue();
  check("4h leere Ansage wird abgelehnt", queue.sayAhead("   ") === false);
}
{
  // Reihenfolge: Ansage zuerst, danach die Antwort — nie umgekehrt.
  const { queue, gesprochen } = testQueue();
  queue.sayAhead("Einen Moment ...");
  queue.push("Die Antwort kommt jetzt. ");
  check("4i Ansage steht vor der Antwort",
    gesprochen[0] === "Einen Moment ..." && gesprochen[1]?.includes("Antwort"));
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
