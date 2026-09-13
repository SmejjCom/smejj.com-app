// smejj 1 — das eigene Modell als eigene Zeile im Modell-Menue.
//
// Der Anlass (13.09.): smejj-1 stand auf dem Server als "ready", und im Chat
// gab es keinen Knopf dafuer. Die vier Zeilen "smejj 1.0" bis "smejj 1.3" sind
// Antwortstufen, die ueber fremde Modelle laufen. Wer das eigene Modell wollte,
// konnte es nicht waehlen.
//
// Diese Faelle halten die drei Stellen fest, an denen die Wahl sonst lautlos
// verpufft: der Name muss beim Server-Router ankommen, die Stufe muss die
// Schnellspur abgeben, und die App darf die Wahl nicht auf "smejj 1.0"
// zurueckfallen lassen.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EIGENES_MODELL, SMEJJ_STAFFEL } from "../public/code-modell-menue.js";
import { normalizeModelId } from "../src/shared/modelRegistry.js";

test("der Menue-Name kommt beim Server-Router als das eigene Modell an", () => {
  // Kein Umbenennen unterwegs: app.js schickt den Titel als body.model, die
  // Bruecke reicht ihn durch, der Router loest ihn ueber die Registry auf.
  assert.equal(normalizeModelId(EIGENES_MODELL.titel), "smejj-1");
});

test("die Stufe gibt die Groq-Schnellspur ab", () => {
  // Nur "gruendlich" laesst die Bruecke IMMER am Groq vorbei an den Router
  // gehen (chat-bridge.js, leseStufe/streamFastLane). Mit jeder anderen Stufe
  // haette Groq geantwortet — unter dem Namen des eigenen Modells.
  assert.equal(EIGENES_MODELL.stufe, "gruendlich");
});

test("die App kennt den Namen — sonst faellt die Wahl still auf smejj 1.0", () => {
  // applySelectedModel nimmt nur Namen aus MODEL_MODES an; alles andere wird
  // ohne Meldung zu "smejj 1.0".
  const app = readFileSync("public/app.js", "utf8");
  assert.match(app, /"smejj 1": AI_MODES\.disabled/);
});

test("das eigene Modell steht NICHT in der Staffel", () => {
  // Die Staffel wird nach Versionsnummer sortiert. "smejj 1" hat keine zweite
  // Stelle und landete dort irgendwo zwischen den Stufen — und wer die
  // naechste Stufe ergaenzt, wuerde es fuer eine Stufe halten.
  assert.equal(SMEJJ_STAFFEL.some((e) => e.titel === EIGENES_MODELL.titel), false);
});

test("das Menue zeichnet die Zeile unter der Staffel und vor Automatisch", () => {
  const menue = readFileSync("public/code-modell-menue.js", "utf8");
  const staffel = menue.indexOf("for (const eintrag of nachVersionAbsteigend(SMEJJ_STAFFEL))");
  const eigen = menue.indexOf("titel: EIGENES_MODELL.titel");
  const automatisch = menue.indexOf('TRENNER.textContent = "Automatisch"');
  assert.ok(staffel > 0 && eigen > staffel && automatisch > eigen,
    "Reihenfolge: Staffel, dann smejj 1, dann der Bereich Automatisch");
});

test("der Hinweis sagt vorher, dass es langsamer ist", () => {
  // Ohne diesen Hinweis sieht eine 30-Sekunden-Wartezeit wie ein Ausfall aus.
  assert.match(EIGENES_MODELL.klein, /langsam/i);
  assert.match(EIGENES_MODELL.hinweis, /30 Sekunden/);
});
