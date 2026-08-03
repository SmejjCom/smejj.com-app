// smejj.com — Stufe 3: Rueckfrage statt Blindantwort + Doppel-Sende-Schutz (2026-08-03).
//
// Herkunft: Live-Vergleich mit ChatGPT Voice. Auch ChatGPT hoert Umgebung und
// Fremdsprache als Text mit (englischer Stoersatz -> "Sieht genug aus."), aber
// es antwortet auf Unverstandenes mit einer Rueckfrage statt einer Blindantwort
// — und genau eine Aeusserung wurde dort doppelt segmentiert und doppelt
// beantwortet. Beide Muster deckt dieses Modul ab.
//
// WICHTIGSTE REGEL (gebranntes Kind): Ein frueheres Konfidenz-Gate (Schwelle
// 0.6) hat echte Spracheingaben STILL verworfen. Deshalb prueft dieser Test
// ausdruecklich, dass normale Saetze mit mittlerer Konfidenz DURCHGEHEN und
// nur fast sicher Verhoertes die Rueckfrage ausloest.
// Standalone: node tests/voice-clarify.test.mjs
import { readFileSync } from "node:fs";
import { sollNachfragen, clarifyLine, createDoppelschutz } from "../public/voice-clarify.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}

// --- 1. Rueckfrage-Regel ------------------------------------------------------
// Der gemessene Fehlerfall: kurz UND unsicher -> nachfragen.
check("1a kurzes unsicheres Transkript loest Rueckfrage aus",
  sollNachfragen({ text: "smeeting nach", confidence: 0.3 }) === true);
check("1b fast sicher verhoert loest immer Rueckfrage aus",
  sollNachfragen({ text: "dies ist ein laengerer verhoerter satz", confidence: 0.2 }) === true);

// Die Lehre aus dem 0.6-Gate: echte Eingaben muessen durch.
check("1c echter Satz mit mittlerer Konfidenz geht DURCH (0.6-Gate-Lehre)",
  sollNachfragen({ text: "kannst du Schlagzeile Nachrichten ueber Berlin lesen", confidence: 0.55 }) === false);
check("1d kurzer Befehl mit guter Konfidenz geht durch",
  sollNachfragen({ text: "Wetter Berlin", confidence: 0.8 }) === false);
check("1e ohne Konfidenzwert fail-open (Safari)",
  sollNachfragen({ text: "irgendwas", confidence: undefined }) === false);
check("1f leeres Transkript: keine Rueckfrage (Host hoert einfach weiter)",
  sollNachfragen({ text: "   ", confidence: 0.1 }) === false);

// --- 2. Sprachzeilen ----------------------------------------------------------
const sprachen = ["de", "en", "fr", "es", "it", "pt", "ru", "tr", "ja", "ko", "zh", "hi", "ar", "id", "bn"];
check("2a alle 15 Sprachen der Sprachwelle haben eine Rueckfrage-Zeile",
  sprachen.every((code) => typeof clarifyLine(code) === "string" && clarifyLine(code).length > 5));
check("2b unbekannte Sprache faellt auf Englisch zurueck",
  clarifyLine("xx") === clarifyLine("en"));
check("2c Gross-/Kleinschreibung egal", clarifyLine("DE") === clarifyLine("de"));

// --- 3. Doppel-Sende-Schutz ---------------------------------------------------
{
  const schutz = createDoppelschutz({ fensterMs: 5000 });
  check("3a erste Frage geht durch", schutz.blockiert("Wie ist das Wetter?", 1000) === false);
  check("3b identische Frage im Fenster wird geblockt",
    schutz.blockiert("wie ist das wetter", 3000) === true);
  check("3c Blocken verlaengert das Fenster NICHT (bewusste Wiederholung kommt durch)",
    schutz.blockiert("Wie ist das Wetter?", 6500) === false);
  check("3d andere Frage geht sofort durch", schutz.blockiert("Wie spaet ist es?", 6600) === false);
  check("3e leerer Text blockt nie", schutz.blockiert("", 6700) === false);
}

// --- 4. Struktur: die Verdrahtung muss in BEIDEN Hosts stehen bleiben --------
{
  const composer = readFileSync(new URL("../public/composer-tools.js", import.meta.url), "utf8");
  const landing = readFileSync(new URL("../public/voice-landing.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

  for (const [name, quelle] of [["composer-tools", composer], ["voice-landing", landing]]) {
    check(`4a ${name} importiert voice-clarify.js`, quelle.includes('from "./voice-clarify.js"'));
    // Seit Stufe 4 laeuft die Entscheidung durch den gemeinsamen Abschluss
    // earSend (voice-ear.js) — die Regel bleibt sollNachfragen, nur die Naht wandert.
    check(`4b ${name} entscheidet mit sollNachfragen (via earSend)`,
      quelle.includes("sollNachfragenFn: sollNachfragen")
      && (quelle.match(/earSend\(task, bestConfidence\)/g) || []).length === 2);
    check(`4c ${name} erfasst die Konfidenz der finalen Ergebnisse`, quelle.includes("bestConfidence"));
    check(`4d ${name} schuetzt nur erkannte Fragen (getippt laeuft durch)`,
      quelle.includes("getippt: true") && quelle.includes("doppelschutz.blockiert(task)"));
  }
  check("4e sw.js fuehrt voice-clarify.js im Precache", sw.includes('"/assets/voice-clarify.js"'));
  check("4f sw.js fuehrt voice-browser-tts.js im Precache", sw.includes('"/assets/voice-browser-tts.js"'));
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
