// smejj.com — Regressionstest: der Denk-Platzhalter ist keine Antwort (2026-08-02).
//
// Warum es diesen Test gibt: Am 2026-08-02 live in Chrome gemessen. app.js haengt
// beim Absenden sofort einen Platzhalter in den Chat — technisch ein ganz normaler
// `<article class="entry assistant" data-thinking="true">smejj denkt nach...</article>`.
// Der Sprachmodus las den letzten `.entry.assistant` und hielt diesen Platzhalter
// fuer die Antwort. Aus EINEM fehlenden Selektor-Ausschluss folgten vier Fehler:
//
//   1. Status nach 68 ms auf "Ich spreche ..." — es gab noch keine Antwort.
//   2. "smejj denkt nach" wurde vorgelesen.
//   3. Das Mikrofon ging mitten in der Denkphase auf; die Erkennung hoerte den
//      eigenen Lautsprecher ("smeeting nach"), der Text-Echo-Filter liess es
//      durch (1 von 2 Woertern = 50 %, Schwelle 60 %) und brach die Antwort ab.
//   4. Die Sprech-Queue merkte sich 20 verbrauchte Zeichen — die ersten ~20
//      Zeichen der ECHTEN Antwort wurden nie gesprochen.
//
// Zusaetzlich abgedeckt: der Mikrofon-Knopf darf NIE senden (er schickte den
// halben Erkennungsrest als Frage ab und warf die laufende Antwort weg).
//
// Der Test faehrt die echte Queue-Logik gegen einen Fake-DOM, wie ihn der
// MutationObserver in composer-tools.js sieht. Zusaetzlich prueft er die Quelle
// strukturell — sonst faellt der Selektor beim naechsten Umbau still zurueck.
// Standalone: node tests/voice-denk-platzhalter.test.mjs
import { readFileSync } from "node:fs";
import { createSpeechQueue } from "../public/voice-speech-queue.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const PLATZHALTER = "smejj denkt nach...";
const ANTWORT = "Hier sind drei Vorteile vom Fahrradfahren in der Stadt. Erstens spart es Geld.";

// --- Fake-Log: genau die Knotenfolge, die app.js erzeugt ---------------------
// addEntry("", "assistant") setzt data-thinking="true"; clearThinkingState()
// entfernt das Attribut, sobald echter Text eintrifft.
function makeLog() {
  const eintraege = [];
  return {
    eintraege,
    platzhalterAnhaengen() {
      eintraege.push({ thinking: true, text: PLATZHALTER });
      return eintraege[eintraege.length - 1];
    },
    echterTextTrifftEin(knoten, text) {
      knoten.thinking = false; // clearThinkingState()
      knoten.text = text;
    },
    // So liest der Sprachmodus nach dem Fix: Platzhalter zaehlen nicht mit.
    antworten() {
      return eintraege.filter((eintrag) => !eintrag.thinking);
    }
  };
}

// --- 1. Verhalten: Platzhalter darf weder sprechen noch das Mikrofon oeffnen --
async function verhalten() {
  const log = makeLog();
  const bekannt = log.antworten().length; // knownEntries zum Sendezeitpunkt
  const gesprochen = [];
  let mikrofonAufAls = null;

  let queue = null;
  const currentReply = () => {
    const treffer = log.antworten();
    const letzter = treffer[treffer.length - 1];
    return letzter && treffer.length > bekannt ? letzter.text.trim() : "";
  };
  // Nachbau von armBargeIn() aus composer-tools.js: nur echter Antworttext
  // schaltet das Mikrofon scharf, nicht der Denk-Laut.
  let scharf = false;
  const armBargeIn = () => {
    if (scharf) return;
    if (!currentReply() || !queue?.spokenText()) return;
    scharf = true;
    mikrofonAufAls = queue.spokenText();
  };
  queue = createSpeechQueue({
    speakFn: (text, { onend } = {}) => { gesprochen.push(text); setTimeout(onend, 0); },
    stopFn: () => {},
    eagerFirst: true,
    onQueueStart: () => armBargeIn()
  });

  // Absenden: app.js haengt sofort den Platzhalter an, der Observer feuert.
  const knoten = log.platzhalterAnhaengen();
  queue.push(currentReply());
  armBargeIn();
  await tick(5);

  check("1a Platzhalter wird nicht vorgelesen", gesprochen.length === 0);
  check("1b Mikrofon bleibt in der Denkphase zu", mikrofonAufAls === null);

  // Denk-Laut nach 700 ms (voice-thinking-cue.js) — laeuft durch dieselbe Queue.
  check("1c Denk-Laut wird ueberhaupt eingereiht", queue.sayAhead("Einen Moment ...") === true);
  await tick(5);
  check("1d Denk-Laut wurde gesprochen", gesprochen.includes("Einen Moment ..."));
  check("1e Denk-Laut oeffnet das Mikrofon NICHT", mikrofonAufAls === null);

  // Jetzt trifft echter Text ein (clearThinkingState + Stream).
  log.echterTextTrifftEin(knoten, ANTWORT);
  queue.push(currentReply());
  armBargeIn();
  await tick(5);
  queue.flush(currentReply());
  await tick(20);

  const antwortText = gesprochen.filter((satz) => satz !== "Einen Moment ...").join(" ");
  check("1f erst echter Antworttext oeffnet das Mikrofon", mikrofonAufAls !== null);
  check("1g Antwort wird VOLLSTAENDIG gesprochen (kein abgeschnittener Anfang)",
    antwortText.startsWith("Hier sind drei Vorteile"));
  check("1h nichts vom Platzhalter im Gesprochenen", !antwortText.includes("denkt nach"));
  check("1i Echo-Filter kennt den Denk-Laut als eigene Ausgabe",
    queue.spokenText().includes("Einen Moment ..."));
}

// --- 2. Der alte Fehler, zum Vergleich festgehalten --------------------------
// Ohne den Ausschluss verschluckt die Queue die ersten Zeichen der Antwort.
// Der Test haelt fest, WARUM der Selektor noetig ist — nicht nur, dass er da ist.
async function alterFehlerBleibtErklaert() {
  const gesprochen = [];
  const queue = createSpeechQueue({
    speakFn: (text, { onend } = {}) => { gesprochen.push(text); setTimeout(onend, 0); },
    stopFn: () => {},
    eagerFirst: true
  });
  queue.push(PLATZHALTER); // <- so war es vor dem Fix
  await tick(5);
  queue.flush(ANTWORT);
  await tick(20);
  check("2a ohne Ausschluss wird der Platzhalter gesprochen", gesprochen.includes(PLATZHALTER));
  check("2b ohne Ausschluss fehlt der Anfang der Antwort",
    !gesprochen.some((satz) => satz.startsWith("Hier sind drei Vorteile")));
}

// --- 3. Struktur: der Fix muss in der Quelle stehen bleiben ------------------
function struktur() {
  const quelle = readFileSync(new URL("../public/composer-tools.js", import.meta.url), "utf8");

  check("3a ANSWER_SELECTOR schliesst den Denk-Platzhalter aus",
    /const ANSWER_SELECTOR = .*\.entry\.assistant:not\(\[data-thinking="true"\]\)/.test(quelle));

  // Kein Rueckfall auf den ungeschuetzten Selektor in den Vorlese-Pfaden.
  const ungeschuetzt = quelle.match(/querySelectorAll\("#startLog \.entry\.assistant"\)/g) || [];
  check("3b kein ungeschuetzter .entry.assistant-Zugriff mehr", ungeschuetzt.length === 0);

  // Stummschalten darf nicht senden: das Mute-Return muss VOR dem Abschluss
  // stehen (seit Stufe 4 heisst der Abschluss earSend; er prueft istStumm nach
  // der Server-Ohr-Wartezeit ein zweites Mal — doppelte Sicherung).
  const onend = quelle.slice(quelle.indexOf("recognition.onend = () => {\n              watchdog.stop();"));
  const mutePos = onend.indexOf("if (state.voiceMuted) return;");
  const sendPos = onend.indexOf("earSend(task");
  check("3c Mute-Pruefung steht vor dem Senden", mutePos > -1 && sendPos > -1 && mutePos < sendPos);
  check("3c2 earSend prueft Mute nach der Wartezeit erneut",
    quelle.includes("istStumm: () => state.voiceMuted"));

  check("3d Stummschalten verwirft (abort) statt abzuliefern (stop)",
    /state\.voiceRecognition\?\.abort\?\.\(\);/.test(quelle));

  check("3e Schonfrist gegen das eigene Echo ist verdrahtet",
    /const BARGE_GRACE_MS = \d+;/.test(quelle)
    && /Date\.now\(\) < state\.bargeGraceUntil/.test(quelle));
}

await verhalten();
await alterFehlerBleibtErklaert();
struktur();

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
