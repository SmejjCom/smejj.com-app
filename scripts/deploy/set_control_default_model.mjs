#!/usr/bin/env node
// smejj.com — Standardmodell des Control-Servers umstellen.
//
// WARUM ES DIESES SKRIPT GIBT (live gemessen 2026-08-02):
// Jede Coding-Frage auf smejj.com endete mit HTTP 502. Ursache war kein Fehler
// im Code, sondern eine Weiche: `SMEJJ_MODEL_DEFAULT=glm-5-2`, waehrend der
// Server ueber sein eigenes /api/health meldete
//   glm-5-2: status "degraded", runtimeAvailable false, fallbackModelId null.
// Die Kandidatenkette in resolveModelSelection() enthaelt bei
// selected === default nur diesen einen Eintrag — faellt er aus, gibt es
// keinen zweiten. Gemessen am Live-Endpunkt:
//   (auto)        -> HTTP 502
//   glm-5-2       -> HTTP 502
//   kimi-k2-7     -> HTTP 200
//   smejj-fast-1  -> HTTP 200
//
// Der Wert ist KEIN Geheimnis, sondern eine Weiche — deshalb darf eine Sitzung
// ihn setzen. Ein Geheimwert bliebe dem Betreiber vorbehalten (siehe
// set_maus_engine_token.mjs).
//
// SICHERUNG VOR DEM SCHREIBEN: Das Zielmodell muss auf dem LIVE-Server eine
// echte Coding-Antwort liefern. Erst dann wird geschrieben. So kann dieses
// Skript unmoeglich ein totes Modell zum Standard machen.
//
// Aufruf:
//   CONFIRM_CONTROL_DEFAULT_MODEL=YES node scripts/deploy/set_control_default_model.mjs
//   CONFIRM_CONTROL_DEFAULT_MODEL=YES SMEJJ_NEUES_STANDARDMODELL=glm-5-2 \
//     node scripts/deploy/set_control_default_model.mjs      # Rueckweg
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const SALAD_GROUP = "smejj-control";
const CONTROL_ORIGIN = "https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud";
const PROBE_TASK = "Schreibe eine JavaScript-Funktion add(a, b), die die Summe zurueckgibt.";
const PROBE_TIMEOUT_MS = 90_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function saladApi(method, apiPath, body) {
  const response = await fetch(`https://api.salad.com/api/public${apiPath}`, {
    method,
    headers: {
      "Salad-Api-Key": process.env.SALAD_API_KEY,
      // Salad verlangt bei PATCH ausdruecklich merge-patch+json; mit
      // application/json antwortet es HTTP 415 (gemessen 2026-08-01).
      ...(body ? { "Content-Type": method === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  if (!response.ok) fail(`Salad-API ${method} ${apiPath}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

/** Beweist am LIVE-Server, dass ein Modell eine Coding-Frage beantwortet. */
export async function modellAntwortet(modelId, { origin = CONTROL_ORIGIN, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${origin}/api/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Accept: "text/event-stream" },
      body: JSON.stringify({ messages: [{ role: "user", content: PROBE_TASK }], model: modelId })
    });
    if (!response.ok) return { ok: false, grund: `http_${response.status}` };
    const text = await response.text();
    // Ein 200 mit leerem Strom waere kein Beweis — der Inhalt zaehlt.
    return text.includes("delta") && text.trim().length > 40
      ? { ok: true, zeichen: text.length }
      : { ok: false, grund: "leere_antwort" };
  } catch (error) {
    return { ok: false, grund: error?.name === "AbortError" ? "timeout" : String(error?.message || error).slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  loadSecureLocalEnv();
  if (process.env.CONFIRM_CONTROL_DEFAULT_MODEL !== "YES") {
    fail("Abbruch: CONFIRM_CONTROL_DEFAULT_MODEL=YES fehlt — es wurde nichts geaendert.");
  }
  for (const key of ["SALAD_API_KEY", "SALAD_ORGANIZATION_NAME", "SALAD_PROJECT_NAME"]) {
    if (!process.env[key]) fail(`Abbruch: ${key} fehlt — fail-closed, nichts geaendert.`);
  }
  const ziel = String(process.env.SMEJJ_NEUES_STANDARDMODELL || "kimi-k2-7").trim();
  const basis = `/organizations/${process.env.SALAD_ORGANIZATION_NAME}/projects/${process.env.SALAD_PROJECT_NAME}/containers/${SALAD_GROUP}`;

  const vorher = await saladApi("GET", basis);
  const alt = String(vorher?.container?.environment_variables?.SMEJJ_MODEL_DEFAULT || "(nicht gesetzt)");
  console.log(`Standardmodell aktuell: ${alt}`);
  if (alt === ziel) {
    console.log(`Bereits auf ${ziel} — nichts zu tun.`);
    return;
  }

  console.log(`Pruefe am Live-Server, ob ${ziel} eine Coding-Frage beantwortet ...`);
  const probe = await modellAntwortet(ziel);
  if (!probe.ok) {
    fail(`Abbruch: ${ziel} antwortet nicht (${probe.grund}). Nichts geaendert — ` +
      `ein totes Modell wird niemals zum Standard gemacht.`);
  }
  console.log(`  OK — ${probe.zeichen} Zeichen Antwort.`);

  await saladApi("PATCH", basis, { container: { environment_variables: { SMEJJ_MODEL_DEFAULT: ziel } } });
  const nachher = await saladApi("GET", basis);
  const neu = String(nachher?.container?.environment_variables?.SMEJJ_MODEL_DEFAULT || "");
  if (neu !== ziel) fail(`Abbruch: Wert steht nach dem Schreiben auf "${neu}" statt "${ziel}".`);

  console.log(`Gesetzt: SMEJJ_MODEL_DEFAULT ${alt} -> ${neu}`);
  console.log(`Rueckweg: SMEJJ_NEUES_STANDARDMODELL=${alt} CONFIRM_CONTROL_DEFAULT_MODEL=YES node ${process.argv[1]}`);
  console.log("Die Gruppe muss neu starten, damit der Wert greift (Salad laedt die Umgebung nur beim Start).");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  await main();
}
