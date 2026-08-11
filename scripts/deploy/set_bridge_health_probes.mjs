#!/usr/bin/env node
// smejj.com — Bruecken-Sonden von TCP auf HTTP /health umstellen.
//
// Befund (Memory smejj-salad-sonden-wachhund, 2026-08-11 erneut gemessen): beide
// Sonden der Chat-Bruecke pruefen nur TCP — ein toter Node-Prozess mit offenem
// Port gilt als gesund, der 503-Ausfall wird NIE erkannt. HTTP auf /health
// erkennt ihn; Salad realloziert dann selbst.
//
// Sicherheit: gezieltes merge-patch NUR auf liveness_probe/startup_probe.
// KEIN container-Feld im Body — ein PATCH mit container ERSETZT die gesamte
// Umgebung samt Code-Buendel (teuer gelernt 2026-08-01).
//
// Aufruf:
//   CONFIRM_PROBE_PATCH=YES node scripts/deploy/set_bridge_health_probes.mjs
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const GRUPPE = process.env.SMEJJ_CHAT_BRIDGE_GROUP || "smejj-chat-bridge-v88b-live";
const PORT = 8080;

function abbruch(nachricht) {
  console.error(nachricht);
  process.exit(1);
}

async function main() {
  if (process.env.CONFIRM_PROBE_PATCH !== "YES") {
    abbruch("Sicherung: CONFIRM_PROBE_PATCH=YES erforderlich (bewusste Live-Aenderung der Sonden).");
  }
  loadSecureLocalEnv();
  for (const name of ["SALAD_API_KEY", "SALAD_ORGANIZATION_NAME", "SALAD_PROJECT_NAME"]) {
    if (!process.env[name]) abbruch(`${name} fehlt in ~/.config/smejj.com/env.local — nichts geaendert.`);
  }
  const basis = `https://api.salad.com/api/public/organizations/${process.env.SALAD_ORGANIZATION_NAME}/projects/${process.env.SALAD_PROJECT_NAME}/containers/${GRUPPE}`;
  const body = {
    liveness_probe: {
      http: { path: "/health", port: PORT, scheme: "http", headers: [] },
      initial_delay_seconds: 10, period_seconds: 10, timeout_seconds: 10,
      success_threshold: 1, failure_threshold: 6
    },
    startup_probe: {
      http: { path: "/health", port: PORT, scheme: "http", headers: [] },
      initial_delay_seconds: 0, period_seconds: 3, timeout_seconds: 10,
      success_threshold: 1, failure_threshold: 20
    }
  };
  const antwort = await fetch(basis, {
    method: "PATCH",
    headers: { "Salad-Api-Key": process.env.SALAD_API_KEY, "Content-Type": "application/merge-patch+json" },
    body: JSON.stringify(body)
  });
  const text = await antwort.text();
  if (!antwort.ok) abbruch(`Salad-PATCH: HTTP ${antwort.status} ${text.slice(0, 300)}`);
  const j = JSON.parse(text);
  // Beweis, dass die Umgebung heil blieb UND die Sonden jetzt HTTP sind.
  console.log(JSON.stringify({
    liveness: j.liveness_probe?.http || "FEHLT",
    startup: j.startup_probe?.http || "FEHLT",
    envVariablenAnzahl: Object.keys(j.container?.environment_variables || {}).length
  }, null, 1));
  if (!j.liveness_probe?.http || !j.startup_probe?.http) abbruch("Sonden NICHT auf HTTP — pruefen!");
  if (Object.keys(j.container?.environment_variables || {}).length === 0) abbruch("WARNUNG: Umgebung leer gemeldet — sofort pruefen (create_lora_trainer_group.mjs-Muster zur Rettung)!");
  console.log("Sonden umgestellt, Umgebung intakt.");
}

main().catch((fehler) => abbruch(String(fehler?.stack || fehler)));
