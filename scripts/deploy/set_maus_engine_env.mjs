#!/usr/bin/env node
// smejj.com — Maus-Blocker Teil 0 beheben: die zwei Env-Zeilen am Dienst
// smejj-control (Salad), die jeden Maus-Auftrag ueber die App scheitern lassen.
// Freigabe: docs/approvals/2026-08-13-maus-blocker-freigabe.md
//
// Bewaehrter Weg wie set_control_artifact_env.mjs: GET der Container-
// Definition, lokaler Merge der VOLLEN Env-Map, PATCH mit
// application/merge-patch+json — keine bestehende Variable geht verloren.
//
// Sicherheitsregeln dieses Skripts:
// - Es zeigt NIEMALS einen Geheimwert; vom Token nur Laenge + SHA-256-Prefix.
// - Der Token wird VOR dem Schreiben an der Engine geprobt: nur ein Wert,
//   den die Engine nachweislich annimmt (HTTP != 401), wird gesetzt.
// - IDRIVE_E2_BUCKET wird nie angefasst.
//
// Aufruf (beide Zeilen):
//   CONFIRM_MAUS_ENV=YES node scripts/deploy/set_maus_engine_env.mjs
// Nur der Eimer-Wert (kein Geheimnis, Token bleibt unangetastet):
//   CONFIRM_MAUS_ENV=YES SMEJJ_NUR_EIMER=YES node scripts/deploy/set_maus_engine_env.mjs
import crypto from "node:crypto";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const SALAD_GROUP = "smejj-control";
const CAPSULES_EIMER = "smejj-model-files";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function fingerabdruck(wert) {
  if (!wert) return "(leer)";
  const sha8 = crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8);
  return `laenge=${wert.length} sha=${sha8}`;
}

async function saladApi(method, apiPath, body) {
  const response = await fetch(`https://api.salad.com/api/public${apiPath}`, {
    method,
    headers: {
      "Salad-Api-Key": process.env.SALAD_API_KEY,
      ...(body ? { "Content-Type": method === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) fail(`Salad API ${method} ${apiPath} -> ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.status === 204 ? {} : response.json();
}

// Nimmt die Engine diesen Token an? 401 = abgelehnt; alles andere (z. B. 422
// wegen leerem Plan) heisst: Auth bestanden.
async function engineNimmtToken(workerUrl, token) {
  const antwort = await fetch(`${workerUrl}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}"
  });
  return antwort.status !== 401;
}

async function main() {
  if (process.env.CONFIRM_MAUS_ENV !== "YES") {
    fail("Sicherung: CONFIRM_MAUS_ENV=YES erforderlich (bewusster Lauf mit Freigabe).");
  }
  const nurEimer = process.env.SMEJJ_NUR_EIMER === "YES";
  loadSecureLocalEnv();
  const org = process.env.SALAD_ORGANIZATION_NAME;
  const project = process.env.SALAD_PROJECT_NAME;
  if (!process.env.SALAD_API_KEY || !org || !project) {
    fail("Salad-Zugaenge fehlen in ~/.config/smejj.com/env.local");
  }
  const token = String(process.env.SMEJJ_MAUS_ENGINE_TOKEN || "").trim();
  if (!nurEimer && !/^\S{64}$/.test(token)) {
    fail("SMEJJ_MAUS_ENGINE_TOKEN aus der lokalen Ablage fehlt oder hat nicht 64 Zeichen ohne Leerraum.");
  }

  const group = await saladApi("GET", `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`);
  const existing = group?.container?.environment_variables || {};
  const existingCount = Object.keys(existing).length;
  if (existingCount < 10) {
    fail(`Unerwartet kleine Env-Map (${existingCount} Eintraege) — Abbruch, nichts geaendert.`);
  }
  const workerUrl = String(existing.SMEJJ_MAUS_ENGINE_WORKER_URL || "").trim().replace(/\/$/, "");
  if (!/^https:\/\//.test(workerUrl)) fail("SMEJJ_MAUS_ENGINE_WORKER_URL fehlt auf smejj-control — Abbruch.");

  if (!nurEimer && !(await engineNimmtToken(workerUrl, token))) {
    fail("Die Engine lehnt den lokalen Token ab (401) — nichts geschrieben. Erst maus-abgleich.mjs pruefen.");
  }

  const mergedEnv = {
    ...existing,
    IDRIVE_E2_CAPSULES_BUCKET: CAPSULES_EIMER,
    ...(nurEimer ? {} : { SMEJJ_MAUS_ENGINE_TOKEN: token })
  };
  await saladApi("PATCH", `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`, {
    container: { environment_variables: mergedEnv }
  });
  const after = await saladApi("GET", `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`);
  const applied = after?.container?.environment_variables || {};
  console.log(JSON.stringify({
    ok: applied.IDRIVE_E2_CAPSULES_BUCKET === CAPSULES_EIMER
      && (nurEimer || String(applied.SMEJJ_MAUS_ENGINE_TOKEN || "").trim() === token),
    modus: nurEimer ? "nur Eimer-Wert (Token unangetastet)" : "Eimer + Token",
    group: SALAD_GROUP,
    variableCount: Object.keys(applied).length,
    capsulesEimer: applied.IDRIVE_E2_CAPSULES_BUCKET,
    idriveBucketUnveraendert: applied.IDRIVE_E2_BUCKET,
    tokenVorher: fingerabdruck(String(existing.SMEJJ_MAUS_ENGINE_TOKEN || "").trim()),
    tokenNachher: fingerabdruck(String(applied.SMEJJ_MAUS_ENGINE_TOKEN || "").trim()),
    hint: "Salad rollt jetzt neu aus (~10 Minuten). Danach maus-abgleich.mjs erneut fahren."
  }, null, 2));
}

await main();
