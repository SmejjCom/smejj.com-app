// smejj.com — Bereitschaft des Trainings-Autopiloten: was fehlt noch zum Einschalten?
//
// Beantwortet EINE Frage: Wenn der Dienst smejj-lora-loop jetzt startete, wuerde
// er trainieren — und wenn nicht, woran liegt es?
//
// Das Skript SCHALTET NICHTS EIN und gibt kein Geheimnis aus. Es nennt Werte
// beim Namen und sagt "gesetzt" oder "fehlt". Der eigentliche Schalter liegt im
// Zeabur-Portal beim Betreiber, weil er Geld kostet.
//
// Aufruf:  node scripts/deploy/lora-autopilot-bereitschaft.mjs
//          node scripts/deploy/lora-autopilot-bereitschaft.mjs --zeabur   (nur die Liste)

import { pathToFileURL } from "node:url";
import { ladeLoopKonfiguration, startHindernisse } from "../../workers/smejj-lora-loop/config.js";
import { pruefeFreigabe } from "../../workers/smejj-lora-loop/budget.js";

/**
 * Die Werte, die im Zeabur-Portal stehen muessen.
 *
 * `geheim: true` heisst: der Wert wird hier NIE ausgegeben, nur sein Name und
 * ob er gesetzt ist. `wert` ist der empfohlene Inhalt, wo er keine Geheimnis-
 * eigenschaft hat — damit der Betreiber ihn abschreiben kann statt zu raten.
 */
export const ZEABUR_WERTE = Object.freeze([
  { name: "SMEJJ_LORA_LOOP_ENABLED", wert: "YES", warum: "der Prozess tickt ueberhaupt" },
  { name: "SMEJJ_LORA_TRAINING_ENABLED", wert: "YES", warum: "es darf Geld ausgegeben werden" },
  { name: "SMEJJ_LORA_TRAINER", wert: "salad-job", warum: "EIN Job je Lauf statt Dauerdienst — der Weg, der seit 03.09. laeuft" },

  { name: "SMEJJ_LORA_GPU_KLASSE", wert: "rtx3090", warum: "24 GB, guenstigste Klasse; 0,09 USD/h auf Stapel-Prioritaet" },
  { name: "SMEJJ_LORA_PRIORITAET", wert: "batch", warum: "Training muss nicht sofort starten — ein Drittel des Preises" },
  { name: "SMEJJ_LORA_MAX_USD_GESAMT", wert: "108", warum: "harte Obergrenze; 100 EUR, Betreiber-Anweisung 07.09." },
  { name: "SMEJJ_LORA_MAX_ZYKLUS_MINUTEN", wert: "660", warum: "Training bis 420 + Messung bis 210 + Puffer" },

  { name: "SMEJJ_LORA_FREIGABE_ID", wert: "betreiber-2026-09-07-100-eur", warum: "Referenz der schriftlichen Freigabe" },
  { name: "SMEJJ_LORA_FREIGABE_GPU_KLASSE", wert: "rtx3090", warum: "muss zur gebuchten Klasse passen — eine 3090-Freigabe deckt keine 5090" },
  { name: "SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD", wert: "108", warum: "muss die echten Monatskosten decken" },

  { name: "SMEJJ_LORA_BASIS_HF_REPO", wert: "Qwen/Qwen3-4B-Instruct-2507", warum: "Basismodell" },
  { name: "SMEJJ_LORA_BASIS_PREFIX", wert: "models/staging/qwen3-4b-instruct", warum: "gespiegelt in e2, 8 GB" },
  { name: "SMEJJ_LORA_DATENSATZ_NAME", wert: "smejj-1-1", warum: "4.506 handgeschriebene Paare, 0 % Satzwiederholung" },
  { name: "SMEJJ_LORA_DATENSATZ_SCHLUESSEL", wert: "datasets/smejj-1-1/train.jsonl", warum: "Trainingsanteil in e2" },
  { name: "SMEJJ_LORA_SUITE_PATH", wert: "evals/suites/smejj-chat-breit-v1.json", warum: "295 Faelle; die schmale Suite mit 14 Faellen misst zu grob" },
  { name: "SMEJJ_LORA_VERSION_START", wert: "5", warum: "smejj 1.0 bis 1.4 sind von Hand gebaut — der Autopilot faengt dahinter an" },

  { name: "IDRIVE_E2_ENDPOINT", geheim: false, ausEnvLocal: true, warum: "Ablage" },
  { name: "IDRIVE_E2_BUCKET", geheim: false, ausEnvLocal: true, warum: "Ablage" },
  { name: "IDRIVE_E2_REGION", geheim: false, ausEnvLocal: true, warum: "Ablage" },
  { name: "IDRIVE_E2_ACCESS_KEY", geheim: true, ausEnvLocal: true, warum: "Ablage" },
  { name: "IDRIVE_E2_SECRET_KEY", geheim: true, ausEnvLocal: true, warum: "Ablage" },
  { name: "SALAD_ORGANIZATION_NAME", geheim: false, ausEnvLocal: true, warum: "GPU-Anbieter" },
  { name: "SALAD_PROJECT_NAME", geheim: false, ausEnvLocal: true, warum: "GPU-Anbieter" },
  { name: "SALAD_API_KEY", geheim: true, ausEnvLocal: true, warum: "GPU-Anbieter" }
]);

/** Was fehlt, gemessen an einer Umgebung. Rein und testbar. */
export function fehlendeWerte(env = process.env, werte = ZEABUR_WERTE) {
  return werte.filter((w) => !String(env[w.name] || "").trim()).map((w) => w.name);
}

export function zeigeZeaburListe(env = process.env, ausgabe = console.log) {
  ausgabe("\nWERTE FUER DEN ZEABUR-DIENST 'smejj-lora-loop'");
  ausgabe("=".repeat(78));
  for (const w of ZEABUR_WERTE) {
    const gesetzt = Boolean(String(env[w.name] || "").trim());
    if (w.ausEnvLocal) {
      ausgabe(`  ${w.name.padEnd(38)} = ${w.geheim ? "<GEHEIM — aus env.local uebernehmen>" : "<aus env.local uebernehmen>"}`);
      ausgabe(`  ${" ".repeat(38)}   ${gesetzt ? "hier gesetzt" : "HIER NICHT GESETZT"} — ${w.warum}`);
    } else {
      ausgabe(`  ${w.name.padEnd(38)} = ${w.wert}`);
      ausgabe(`  ${" ".repeat(38)}   ${w.warum}`);
    }
  }
  ausgabe("=".repeat(78));
  ausgabe("Notaus jederzeit:  SMEJJ_LORA_NOTAUS=YES  — sperrt sofort und beendet einen laufenden Lauf.");
}

function main() {
  const argv = process.argv.slice(2);
  const konfig = ladeLoopKonfiguration(process.env);

  if (!argv.includes("--zeabur")) {
    console.log("BEREITSCHAFT DES TRAININGS-AUTOPILOTEN (smejj-lora-loop)");
    console.log("-".repeat(78));

    const hindernisse = startHindernisse(konfig);
    if (hindernisse.length === 0) {
      console.log("Alle Startbedingungen erfuellt — der Dienst wuerde trainieren.");
    } else {
      console.log(`${hindernisse.length} Hindernis(se) — der Dienst wuerde NICHT trainieren:`);
      for (const h of hindernisse) console.log(`   - ${h}`);
    }

    // Das Feld heisst `freigegeben`, nicht `ok`. Der erste Anlauf las `.ok`
    // und meldete deshalb IMMER "FEHLT" — auch bei gueltiger Freigabe. Ein
    // Fehlalarm in einem Bereitschaftsbericht ist besonders teuer: er schickt
    // den Betreiber Werte suchen, die laengst stimmen.
    const freigabe = pruefeFreigabe(konfig.grenzen);
    console.log(`\nSchriftliche Freigabe: ${freigabe.freigegeben ? "liegt vor" : "FEHLT"}`);
    if (!freigabe.freigegeben) for (const g of freigabe.gruende) console.log(`   - ${g}`);

    console.log(`\nTrainer-Weg:  ${konfig.trainer.art}${konfig.trainer.art === "salad-job" ? "  (kein Dauerdienst, kein Leerlauf-Kosten)" : "  (Dauerdienst — am 03.08. gescheitert)"}`);
    console.log(`Deckel:       ${konfig.grenzen.maxGesamtUsd || "?"} USD gesamt, ${konfig.grenzen.maxZyklusMinuten || "?"} min je Zyklus`);
    console.log(`Karte:        ${konfig.grenzen.gpuKlasse || "?"} auf ${konfig.grenzen.prioritaet}, ${konfig.grenzen.preisProStundeUsd || "?"} USD/h`);
    console.log(`Datensatz:    ${konfig.datensatzName}`);
    console.log(`Suite:        ${konfig.suitePath}`);
    console.log(`Erste Version: ${konfig.versionPraefix}${konfig.versionStart}`);

    const fehlt = fehlendeWerte(process.env);
    console.log(`\nVon ${ZEABUR_WERTE.length} Werten sind hier ${ZEABUR_WERTE.length - fehlt.length} gesetzt, ${fehlt.length} fehlen.`);
    console.log("Diese Pruefung gilt fuer DIESEN Rechner. Massgeblich ist die Umgebung im Zeabur-Portal.");
  }

  zeigeZeaburListe(process.env);
  console.log("\nSO WIRD DARAUS EIN LAUFENDER DIENST:");
  console.log("  1. Zeabur-Portal → Projekt smejj.com → Add Service → Git → dasselbe Repo.");
  console.log("     Zeabur waehlt Dockerfile.smejj-lora-loop, wenn der Dienst 'smejj-lora-loop' heisst.");
  console.log("  2. Die Werte oben als Environment Variables eintragen.");
  console.log("  3. Deploy. Danach beantwortet GET /health die Frage, warum gerade nicht trainiert wird.");
  console.log("\nDer Dienst kostet als CPU-Instanz wenige USD im Monat und rechnet nie selbst.");
  console.log("Die GPU-Zeit entsteht nur waehrend eines Laufs und ist durch den Deckel begrenzt.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
