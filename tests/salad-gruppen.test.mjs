// TUEV fuer die Salad-Aufraeumung: vor allem die Namen, die NIEMALS
// ausgewaehlt werden duerfen.
//
// Der Anlass (2026-09-08): 32 Container-Gruppen, davon 13 eindeutige
// Wegwerf-Artefakte aus dem Juli — und dazwischen vier Definitionen, zu denen
// es KEIN Zeabur-Gegenstueck gibt (voice-stt, voice-tts, remote-browser,
// llm-qwen3). Eine zu breite Auswahlregel haette die mit weggeraeumt, und
// eine geloeschte GPU-Konfiguration ist unwiederbringlich.
//
// Deshalb steht hier mehr ueber das, was bleiben MUSS, als ueber das, was
// gehen darf.
import test from "node:test";
import assert from "node:assert/strict";
import { waehleWegwerf } from "../scripts/diagnose/salad-gruppen.mjs";

const gestoppt = (name) => ({ name, status: "stopped" });

test("WEG: Einmal-Jobs mit Hash-Namen", () => {
  const gewaehlt = waehleWegwerf([
    gestoppt("smejj-job-426689a929adabe3b1794f8fb9e1d1de"),
    gestoppt("smejj-job-8662e95807478bf4287ae42e2d91bd16")
  ]);
  assert.equal(gewaehlt.length, 2);
});

test("WEG: Testfassungen, die sich selbst so nennen", () => {
  const gewaehlt = waehleWegwerf([
    gestoppt("smejj-control-rc9-staging"),
    gestoppt("smejj-browser-agent-rc1-staging"),
    gestoppt("smejj-control-pages-layout-rc3-final2-staging-20260712")
  ]);
  // Die dritte endet NICHT auf "-staging" (es folgt noch ein Datum) und wird
  // deshalb bewusst nicht gewaehlt: lieber eine zu wenig als eine zu viel.
  assert.deepEqual(gewaehlt, ["smejj-browser-agent-rc1-staging", "smejj-control-rc9-staging"]);
});

test("BLEIBT: die Dienste ohne Zeabur-Gegenstueck", () => {
  // Fuer diese vier antwortet unter *.zeabur.app nichts. Ihre Salad-Definition
  // ist die einzige, die es gibt — sie zu loeschen waere echter Verlust.
  const gewaehlt = waehleWegwerf([
    gestoppt("smejj-voice-stt"),
    gestoppt("smejj-voice-tts"),
    gestoppt("smejj-remote-browser"),
    gestoppt("smejj-llm-qwen3"),
    gestoppt("smejj-llm-qwen3-v2")
  ]);
  assert.deepEqual(gewaehlt, []);
});

test("BLEIBT: con-job — con ruht auf Betreiber-Wunsch", () => {
  assert.deepEqual(waehleWegwerf([gestoppt("con-job")]), []);
});

test("BLEIBT: Trainingskette und Spiegel", () => {
  assert.deepEqual(waehleWegwerf([
    gestoppt("smejj-lora-trainer-batch"),
    gestoppt("smejj-spiegel"),
    gestoppt("smejj-fast-1")
  ]), []);
});

test("BLEIBT: was LAEUFT, wird nie gewaehlt — auch als Testfassung nicht", () => {
  // Sonst reisst ein Aufraeumlauf mitten in einer Arbeit den Boden weg.
  const gewaehlt = waehleWegwerf([
    { name: "smejj-control-rc9-staging", status: "running" },
    { name: "smejj-job-426689a929adabe3b1794f8fb9e1d1de", status: "running" }
  ]);
  assert.deepEqual(gewaehlt, []);
});

test("BLEIBT: aehnlich klingende Namen sind nicht dasselbe", () => {
  // Ein zu weiches Muster ist hier die eigentliche Gefahr.
  assert.deepEqual(waehleWegwerf([
    gestoppt("smejj-job"),
    gestoppt("smejj-jobs-archiv"),
    gestoppt("smejj-job-kurz"),
    gestoppt("staging"),
    gestoppt("smejj-staging-wichtig"),
    gestoppt("smejj-control")
  ]), []);
});

test("BLEIBT: leere und kaputte Eintraege stuerzen nicht ab", () => {
  assert.deepEqual(waehleWegwerf([]), []);
  assert.deepEqual(waehleWegwerf([{}, { name: null }, { name: "" }]), []);
});
