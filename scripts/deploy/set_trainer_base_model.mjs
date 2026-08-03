#!/usr/bin/env node
// smejj.com — Basismodell des LoRA-Trainers umstellen.
//
// WARUM (gemessen 2026-08-01/02): Der Trainer soll `Qwen/Qwen3-14B` laden. Beim
// Start laedt llama.cpp/PyTorch die Gewichte erst herunter, und diese Ladezeit
// laeuft gegen Salads Startsonde — deren Obergrenze ist hart bei 60 Minuten.
// Bei 14B (rund 28 GB in bf16) reicht das Fenster nicht: die Gruppe steht auf
// "running", die Anwendung antwortet aber nie. Genau dieses Fehlerbild lag am
// 2026-08-02 vor (Tuer: 403 ohne Schluessel, 503 MIT Schluessel).
//
// Und die kleinere Basis ist zugleich die bessere. Eigene Messung, dieselbe
// Quantisierung, dieselbe Suite, 14 Faelle je 5 Ziehungen:
//   Qwen3-8B  (5,14 GB)  92,9 % +- 2,3   0 Totalausfaelle   Median 659 ms
//   Qwen3-14B (9,2  GB)  87,6 % +- 1,3   1 Totalausfall     Median 974 ms
// Kleiner ist hier schneller, genauer UND startet zuverlaessig. Es gibt keinen
// Grund fuer 14B.
//
// SICHERUNG VOR DEM SCHREIBEN:
//   1. Das Zielmodell muss auf Hugging Face existieren und oeffentlich sein.
//   2. Die Gruppe muss GESTOPPT sein — eine laufende Gruppe wird nicht
//      angefasst, sonst aendert sich die Basis mitten im Lauf.
// Fail-closed ohne CONFIRM_TRAINER_BASIS=YES. Der Rueckweg wird ausgegeben.
//
// Der Wert ist KEIN Geheimnis, sondern eine Weiche — dieselbe Klasse wie
// set_control_default_model.mjs.
//
// Aufruf:
//   CONFIRM_TRAINER_BASIS=YES node scripts/deploy/set_trainer_base_model.mjs
//   CONFIRM_TRAINER_BASIS=YES SMEJJ_NEUE_TRAINER_BASIS=Qwen/Qwen3-14B \
//     node scripts/deploy/set_trainer_base_model.mjs        # Rueckweg
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const GRUPPE = "smejj-lora-trainer";
const STANDARD_ZIEL = "Qwen/Qwen3-8B";
const ZEITGRENZE_MS = 30_000;

function fail(nachricht) {
  console.error(nachricht);
  process.exit(1);
}

async function saladApi(methode, pfad, koerper) {
  const antwort = await fetch(`https://api.salad.com/api/public${pfad}`, {
    method: methode,
    headers: {
      "Salad-Api-Key": process.env.SALAD_API_KEY,
      // Salad verlangt bei PATCH merge-patch+json; mit application/json
      // antwortet es HTTP 415 (gemessen 2026-08-01).
      ...(koerper ? { "Content-Type": methode === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: koerper ? JSON.stringify(koerper) : undefined,
    signal: AbortSignal.timeout(ZEITGRENZE_MS)
  });
  const text = await antwort.text();
  if (!antwort.ok) fail(`Salad-API ${methode} ${pfad}: HTTP ${antwort.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

/** Existiert das Modell oeffentlich auf Hugging Face? Verhindert einen Tippfehler im Repo-Namen. */
export async function modellExistiert(repo, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`https://huggingface.co/api/models/${repo}`, { signal: AbortSignal.timeout(ZEITGRENZE_MS) });
    if (!r.ok) return { ok: false, grund: `http_${r.status}` };
    const d = await r.json();
    if (d?.gated) return { ok: false, grund: "gated_zugang_noetig" };
    if (d?.private) return { ok: false, grund: "privat" };
    return { ok: true, id: d?.id || repo };
  } catch (error) {
    return { ok: false, grund: String(error?.message || error).slice(0, 80) };
  }
}

async function main() {
  loadSecureLocalEnv();
  if (process.env.CONFIRM_TRAINER_BASIS !== "YES") {
    fail("Abbruch: CONFIRM_TRAINER_BASIS=YES fehlt — es wurde nichts geaendert.");
  }
  for (const k of ["SALAD_API_KEY", "SALAD_ORGANIZATION_NAME", "SALAD_PROJECT_NAME"]) {
    if (!process.env[k]) fail(`Abbruch: ${k} fehlt — fail-closed, nichts geaendert.`);
  }
  const ziel = String(process.env.SMEJJ_NEUE_TRAINER_BASIS || STANDARD_ZIEL).trim();
  const basis = `/organizations/${process.env.SALAD_ORGANIZATION_NAME}/projects/${process.env.SALAD_PROJECT_NAME}/containers/${GRUPPE}`;

  const vorher = await saladApi("GET", basis);
  const alt = String(vorher?.container?.environment_variables?.SMEJJ_TRAINER_BASIS_REPO || "(nicht gesetzt)");
  const zustand = String(vorher?.current_state?.status || "unbekannt");
  console.log(`Basismodell aktuell: ${alt}`);
  console.log(`Gruppenzustand    : ${zustand}`);

  if (alt === ziel) {
    console.log(`Bereits auf ${ziel} — nichts zu tun.`);
    return;
  }
  if (zustand.toLowerCase() === "running") {
    fail("Abbruch: Die Gruppe LAEUFT. Eine Basisaenderung mitten im Lauf wuerde einen " +
      "halb geladenen Trainer hinterlassen. Erst stoppen, dann umstellen, dann starten.");
  }

  console.log(`Pruefe, ob ${ziel} oeffentlich auf Hugging Face liegt ...`);
  const pruefung = await modellExistiert(ziel);
  if (!pruefung.ok) {
    fail(`Abbruch: ${ziel} ist nicht nutzbar (${pruefung.grund}). Nichts geaendert — ` +
      `ein nicht ladbares Modell wuerde den Trainer dauerhaft blockieren.`);
  }
  console.log(`  OK — ${pruefung.id} ist oeffentlich erreichbar.`);

  await saladApi("PATCH", basis, { container: { environment_variables: { SMEJJ_TRAINER_BASIS_REPO: ziel } } });
  const nachher = await saladApi("GET", basis);
  const neu = String(nachher?.container?.environment_variables?.SMEJJ_TRAINER_BASIS_REPO || "");
  if (neu !== ziel) fail(`Abbruch: Wert steht nach dem Schreiben auf "${neu}" statt "${ziel}".`);

  console.log(`\nGesetzt: SMEJJ_TRAINER_BASIS_REPO ${alt} -> ${neu}`);
  console.log(`Rueckweg: SMEJJ_NEUE_TRAINER_BASIS=${alt} CONFIRM_TRAINER_BASIS=YES node ${process.argv[1]}`);
  console.log("\nNaechster Schritt: Gruppe starten und danach den Zustand pruefen mit");
  console.log("  node scripts/diagnose/training-kette.mjs");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  await main();
}
