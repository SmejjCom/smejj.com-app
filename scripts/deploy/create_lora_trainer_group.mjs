#!/usr/bin/env node
// smejj.com — Salad Container Group fuer den LoRA-Trainingsdienst anlegen/aktualisieren.
//
// Trockenlauf (Standard, ruft nichts auf):
//   node scripts/deploy/create_lora_trainer_group.mjs
// Wirklich anlegen:
//   CONFIRM_TRAINER_GROUP=YES node scripts/deploy/create_lora_trainer_group.mjs
//
// KOSTEN: RTX 3090 in der Stufe batch = 0,09 USD je Stunde = 64,80 USD im Monat.
// Freigegeben am 2026-08-01 (RTX 3090, 180 USD/Monat, Deckel 50 USD) — die
// Batch-Stufe liegt darunter und ist damit gedeckt.
//
// DREI GEMESSENE FALLEN, die dieser Aufruf umgeht:
//
// 1. STARTSONDE. Salads startup_probe laeuft maximal rund 60 Minuten
//    (initial_delay 1200 s + failure_threshold 20 x period 120 s; hoehere Werte
//    weist die API mit HTTP 400 ab). Ein Dienst, der erst Gewichte laedt und
//    dann horcht, faellt da heraus und startet endlos neu — am 2026-08-01
//    zweimal live passiert. Unser Dienst horcht zuerst, deshalb genuegt hier
//    eine kurze Sonde.
// 2. KEIN REGISTRY-ZUGANG. Es wird ein OEFFENTLICHES PyTorch-Abbild benutzt und
//    der eigene Code als base64-Buendel in einer Umgebungsvariable mitgegeben.
//    Nichts muss gepusht werden. (Das Repository ist privat, ein curl von
//    GitHub scheidet aus — geprueft, HTTP 404.)
// 3. FLACHE ENV. Die Salad-API verlangt {container:{environment_variables:...}};
//    flach gesendet antwortet sie 200 und aendert NICHTS. Deshalb wird nach
//    jedem Schreibvorgang zurueckgelesen.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GRUPPE = process.env.SMEJJ_TRAINER_GRUPPE || "smejj-lora-trainer";
const MODUS = process.env.SMEJJ_TRAINER_MODUS || "attrappe";

// Oeffentliches Abbild mit CUDA und Python. Bewusst ein Laufzeit-Abbild
// (kein devel): es ist kleiner und laedt damit schneller — die Ladezeit ist
// laut Messung die knappe Ressource, nicht der Plattenplatz.
const ABBILD = process.env.SMEJJ_TRAINER_ABBILD
  || "docker.io/pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime";

loadSecureLocalEnv();

function pflicht(name) {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt`);
  return wert;
}

const API_KEY = pflicht("SALAD_API_KEY");
const ORG = pflicht("SALAD_ORGANIZATION_NAME");
const PROJEKT = pflicht("SALAD_PROJECT_NAME");
const BASIS = `https://api.salad.com/api/public/organizations/${ORG}/projects/${PROJEKT}/containers`;

async function api(pfad, methode = "GET", koerper = null) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: methode,
    headers: {
      "Salad-Api-Key": API_KEY,
      accept: "application/json",
      // PATCH verlangt application/merge-patch+json. Mit application/json
      // antwortet die API HTTP 415 "Unsupported Media Type" — gemessen am
      // 2026-08-01. Der Anlegepfad (POST) fiel nie darauf herein, weil er
      // application/json nutzt; der Aktualisierungspfad waere beim ersten
      // echten Einsatz gescheitert.
      ...(koerper ? { "content-type": methode === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: koerper ? JSON.stringify(koerper) : undefined
  });
  const text = await antwort.text();
  let daten = null;
  try { daten = text ? JSON.parse(text) : null; } catch { /* Rohtext genuegt */ }
  return { ok: antwort.ok, status: antwort.status, daten, text };
}

/** Der Trainer-Code als base64-tar.gz — das Buendel, das der Container auspackt. */
function baueBuendel() {
  const roh = execFileSync(
    "tar",
    ["czf", "-", "--exclude", "README.md", "--exclude", "__pycache__", "smejj-lora-trainer"],
    { cwd: path.join(REPO, "workers"), maxBuffer: 8 * 1024 * 1024 }
  );
  return roh.toString("base64");
}

/**
 * Startbefehl. Reihenfolge ist der Kern: auspacken, HTTP-Server SOFORT starten,
 * die schweren Pakete erst danach im Hintergrund nachziehen. Der Dienst
 * antwortet damit binnen Sekunden auf /health, lange bevor torch bereit ist.
 */
function startBefehl() {
  // Zeilenweise statt mit && verkettet: die Hintergrund-Installation darf den
  // Startpfad nicht an eine Erfolgsbedingung haengen. Schlaegt pip fehl, muss
  // der Server trotzdem laufen und ehrlich 'nicht bereit' melden — ein toter
  // Container koennte das nicht mehr sagen.
  const skript = [
    "set -eu",
    // bash -l setzt PATH ueber /etc/profile zurueck; /opt/conda/bin (python3,
    // pip im pytorch-Abbild) muss danach wieder vorn stehen.
    'export PATH="/opt/conda/bin:$PATH"',
    "mkdir -p /app",
    "cd /app",
    'printf %s "$SMEJJ_TRAINER_BUNDLE_B64" | base64 -d | tar xzf -',
    "cd /app/smejj-lora-trainer",
    'if [ "${SMEJJ_TRAINER_MODUS:-attrappe}" = "echt" ]; then',
    // Exit-Code als Markerdatei: laufwerk.py wartet darauf, bevor es die
    // Pakete importiert. Ohne den Marker verliert der Import den Wettlauf
    // gegen pip (gemessen am 2026-08-03: ModuleNotFoundError: transformers).
    //
    // PINS statt neuester Stand, gemessen am 2026-08-03: ungepinnt zieht pip
    // transformers/accelerate, die torch>=2.5 erwarten — das Abbild hat 2.4.0
    // ("cannot import name 'DTensor' from 'torch.distributed.tensor'").
    // Qwen3 wiederum braucht transformers>=4.51. Deshalb ein kohaerenter
    // Stand vom April 2025 samt torch-Upgrade; das laeuft im Hintergrund und
    // der Marker haelt den Motor-Import solange zurueck.
    "  ( pip install --no-cache-dir torch==2.6.0 transformers==4.51.3 peft==0.15.2"
      + " accelerate==1.6.0 bitsandbytes==0.45.5 'safetensors>=0.4.5'"
      + " > /tmp/pip.log 2>&1; echo $? > /tmp/smejj-pip.rc ) &",
    "fi",
    "exec python3 server.py"
  ].join("\n");
  return ["bash", "-lc", skript];
}

function umgebung() {
  const werte = {
    PORT: "8080",
    // "::" statt "0.0.0.0": Salads Gateway und Sonden sprechen nur IPv6
    // (gemessen am Sprachserver, Control v103). Mit reinem IPv4-Bind bleibt
    // das Gateway auf 503 und die Instanz pendelt running -> creating.
    SMEJJ_HOST: "::",
    SMEJJ_TRAINER_MODUS: MODUS,
    SMEJJ_TRAINER_BUNDLE_B64: baueBuendel(),
    SMEJJ_TRAINER_BASIS_REPO: process.env.SMEJJ_LORA_BASIS_HF_REPO || "",
    IDRIVE_E2_ENDPOINT: process.env.IDRIVE_E2_ENDPOINT || "",
    IDRIVE_E2_REGION: process.env.IDRIVE_E2_REGION || "us-west-2",
    IDRIVE_E2_MODEL_BUCKET: process.env.IDRIVE_E2_MODEL_BUCKET || process.env.IDRIVE_E2_BUCKET || "",
    IDRIVE_E2_ACCESS_KEY: process.env.IDRIVE_E2_ACCESS_KEY || "",
    IDRIVE_E2_SECRET_KEY: process.env.IDRIVE_E2_SECRET_KEY || ""
  };
  // Leere Werte weglassen statt leer setzen: eine gesetzte leere Variable sieht
  // in der Oberflaeche aus wie ein gepflegter Eintrag und verdeckt, dass sie fehlt.
  return Object.fromEntries(Object.entries(werte).filter(([, v]) => v !== ""));
}

function koerper() {
  return {
    name: GRUPPE,
    display_name: GRUPPE,
    container: {
      image: ABBILD,
      resources: {
        cpu: 4,
        memory: 16384,
        gpu_classes: [process.env.SMEJJ_TRAINER_GPU_ID || "a5db5c50-cbcb-4596-ae80-6a0c8090d80f"],
        storage_amount: 80 * 1024 * 1024 * 1024
      },
      command: startBefehl(),
      // MUSS verschachtelt sein — flach antwortet die API 200 und tut nichts.
      environment_variables: umgebung(),
      priority: process.env.SMEJJ_LORA_PRIORITAET || "batch"
    },
    autostart_policy: false,
    restart_policy: "always",
    replicas: 1,
    networking: { protocol: "http", port: 8080, auth: true, client_request_timeout: 100000 },
    // Kurze Sonde: der Dienst horcht sofort. Waere er wie llama.cpp gebaut
    // (erst laden, dann horchen), muesste hier das 60-Minuten-Maximum stehen —
    // und selbst das reichte nicht.
    // Von der API gemessen abgelehnte Werte (HTTP 400, 2026-08-01):
    //   failure_threshold > 20        -> "must be between 1 and 20"
    //   http ohne headers-Feld        -> "The Headers field is required"
    // Beides steht in keiner Fehlermeldung vorher; nur der Versuch zeigt es.
    startup_probe: {
      http: { path: "/health", port: 8080, scheme: "http", headers: [] },
      initial_delay_seconds: 10,
      period_seconds: 10,
      timeout_seconds: 5,
      failure_threshold: 20
    }
  };
}

async function main() {
  const plan = koerper();
  const buendelGroesse = plan.container.environment_variables.SMEJJ_TRAINER_BUNDLE_B64.length;
  console.log(`Gruppe:      ${GRUPPE}`);
  console.log(`Abbild:      ${ABBILD}`);
  console.log(`Modus:       ${MODUS}`);
  console.log(`Stufe:       ${plan.container.priority}`);
  console.log(`Buendel:     ${buendelGroesse} Zeichen base64`);
  console.log(`Autostart:   ${plan.autostart_policy} (bewusst aus — Starten ist ein eigener Schritt)`);

  if (process.env.CONFIRM_TRAINER_GROUP !== "YES") {
    console.log("\nTrockenlauf — nichts angelegt. Zum Anlegen: CONFIRM_TRAINER_GROUP=YES");
    return;
  }

  const vorhanden = await api(`/${GRUPPE}`);
  const ergebnis = vorhanden.status === 200
    ? await api(`/${GRUPPE}`, "PATCH", { container: plan.container, replicas: plan.replicas })
    : await api("", "POST", plan);

  if (!ergebnis.ok) {
    console.error(`FEHLER HTTP ${ergebnis.status}: ${ergebnis.text.slice(0, 600)}`);
    process.exitCode = 1;
    return;
  }

  // Zuruecklesen ist Pflicht: die Salad-API bestaetigt Schreibvorgaenge auch
  // dann mit 200, wenn sie nichts geaendert hat.
  const kontrolle = await api(`/${GRUPPE}`);
  const gesetzt = Object.keys(kontrolle.daten?.container?.environment_variables || {});
  console.log(`\nAngelegt/aktualisiert. Zustand: ${kontrolle.daten?.current_state?.status || "?"}`);
  console.log(`Env zurueckgelesen: ${gesetzt.length} Variablen (${gesetzt.filter((k) => !k.includes("SECRET")).join(", ")})`);
  console.log(`Adresse: ${kontrolle.daten?.networking?.dns || "(noch keine)"}`);
  console.log("\nStarten (kostet ab dann Geld):");
  console.log(`  curl -X POST -H "Salad-Api-Key: ***" ${BASIS}/${GRUPPE}/start`);
}

main().catch((fehler) => {
  console.error(`FEHLER: ${String(fehler?.stack || fehler)}`);
  process.exitCode = 1;
});
