// smejj.com Dauertrainings-Schleife — Umgebungskonfiguration
// (Single Responsibility: Umgebung einlesen, nichts entscheiden).
//
// Drei voneinander unabhaengige Schalter, alle mit Standard "NO":
//   SMEJJ_LORA_LOOP_ENABLED   — der Prozess tickt ueberhaupt
//   SMEJJ_LORA_TRAINING_ENABLED — es darf trainiert (= Geld ausgegeben) werden
//   SMEJJ_LORA_NOTAUS         — sperrt sofort alles (in budget.js ausgewertet)
//
// Der Container ist damit im Aus-Zustand sicher deploybar: ohne jede Angabe
// antwortet nur /health, und es entsteht keine Sekunde GPU-Zeit.

import { chatEndpointFromEnv } from "../../src/evaluation/evalTransport.js";
import { wiederholungenAusEnv } from "../../src/evaluation/evalScoring.js";
import { leseKostengrenzen } from "./budget.js";

function flag(env, name) {
  return String(env[name] || "NO").trim().toUpperCase() === "YES";
}

function begrenzteZahl(wert, ersatz, min, max) {
  const zahl = Number(wert);
  if (!Number.isFinite(zahl)) return ersatz;
  return Math.min(max, Math.max(min, Math.round(zahl)));
}

export function ladeLoopKonfiguration(env = process.env) {
  return Object.freeze({
    port: begrenzteZahl(env.PORT, 8080, 1, 65535),
    host: env.SMEJJ_HOST || "0.0.0.0",
    loopEnabled: flag(env, "SMEJJ_LORA_LOOP_ENABLED"),
    trainingEnabled: flag(env, "SMEJJ_LORA_TRAINING_ENABLED"),

    grenzen: leseKostengrenzen(env),

    // Basismodell. Bewusst ein Konfigurationswert und kein fester Eintrag im
    // Code: welches Modell trainierbar ist, haengt an der GPU-Klasse, und die
    // entscheidet der Betreiber mit der Kostenfreigabe. Ein fest verdrahtetes
    // Modell wuerde diese Entscheidung stillschweigend vorwegnehmen.
    basismodell: Object.freeze({
      hfRepo: env.SMEJJ_LORA_BASIS_HF_REPO || "",
      revision: env.SMEJJ_LORA_BASIS_REVISION || "",
      lizenz: env.SMEJJ_LORA_BASIS_LIZENZ || "",
      ablagePrefix: env.SMEJJ_LORA_BASIS_PREFIX || "model-files/smejj-1-0/original/"
    }),

    datensatz: Object.freeze({
      schluessel: env.SMEJJ_LORA_DATENSATZ_SCHLUESSEL || "",
      manifestSchluessel: env.SMEJJ_LORA_DATENSATZ_MANIFEST || ""
    }),

    trainer: Object.freeze({
      basisUrl: env.SMEJJ_LORA_TRAINER_URL || "",
      apiKey: env.SMEJJ_LORA_TRAINER_KEY || ""
    }),

    // Messung: exakt die bestehende Suite. Pfad und Kennung sind
    // konfigurierbar, damit ein spaeterer Suite-Nachfolger ohne Codeaenderung
    // laeuft — aber der Standard zeigt auf die Suite, gegen die der
    // Vergleichswert 73,53–85,29 % gemessen wurde.
    suitePath: env.SMEJJ_LORA_SUITE_PATH || "evals/suites/smejj-chat-core-v1.json",
    suiteId: env.SMEJJ_LORA_SUITE_ID || "smejj-chat-core",
    evalWiederholungen: wiederholungenAusEnv(env),
    evalDelayMs: begrenzteZahl(env.SMEJJ_LORA_EVAL_DELAY_MS, 6000, 1000, 60000),
    vergleichsEndpunkt: chatEndpointFromEnv(env),

    maxRunden: begrenzteZahl(env.SMEJJ_LORA_MAX_RUNDEN, 3, 1, 20),
    // Abstand zwischen zwei Zyklen. Standard 10 Minuten: die Karte laeuft
    // waehrend eines Zyklus ohnehin, die Pause danach ist die Gelegenheit,
    // Notaus und Deckel neu zu bewerten, bevor wieder Geld fliesst.
    zyklusAbstandMs: begrenzteZahl(env.SMEJJ_LORA_ZYKLUS_ABSTAND_MS, 10 * 60 * 1000, 60 * 1000, 6 * 60 * 60 * 1000),
    abfrageAbstandMs: begrenzteZahl(env.SMEJJ_LORA_ABFRAGE_ABSTAND_MS, 30_000, 5_000, 300_000),
    verlaufMax: begrenzteZahl(env.SMEJJ_LORA_VERLAUF_MAX, 200, 1, 2000),

    zustandKey: env.SMEJJ_LORA_ZUSTAND_KEY || "ops/smejj-lora-loop/zustand.json",
    bestenKey: env.SMEJJ_LORA_BESTEN_KEY || "ops/smejj-lora-loop/bester-stand.json",
    versionsKey: env.SMEJJ_LORA_VERSIONEN_KEY || "ops/smejj-lora-loop/versionen.json"
  });
}

/**
 * Fasst zusammen, warum der Dienst gerade nichts tut. Zweck: /health soll die
 * Frage "warum trainiert es nicht" beantworten, ohne dass jemand Protokolle
 * durchsucht — das war bei frueheren Diensten die groesste Zeitverschwendung.
 */
export function startHindernisse(konfiguration) {
  const gruende = [];
  if (!konfiguration.loopEnabled) gruende.push("SMEJJ_LORA_LOOP_ENABLED!=YES");
  if (!konfiguration.trainingEnabled) gruende.push("SMEJJ_LORA_TRAINING_ENABLED!=YES");
  if (konfiguration.grenzen.notaus) gruende.push("SMEJJ_LORA_NOTAUS=YES");
  for (const fehlend of konfiguration.grenzen.fehlend) gruende.push(`kostengrenze_fehlt:${fehlend}`);
  if (!konfiguration.grenzen.freigabeId) gruende.push("keine_schriftliche_freigabe");
  if (!konfiguration.basismodell.hfRepo) gruende.push("kein_basismodell");
  if (!konfiguration.datensatz.schluessel) gruende.push("kein_datensatz");
  if (!konfiguration.trainer.basisUrl) gruende.push("keine_trainer_adresse");
  return gruende;
}
