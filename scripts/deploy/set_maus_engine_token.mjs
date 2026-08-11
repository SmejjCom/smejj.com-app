#!/usr/bin/env node
// smejj.com — Maus freischalten: den Engine-Token des Control-Servers angleichen.
//
// WAS DIESES SKRIPT TUT: Es kopiert den bereits vorhandenen Wert
// SMEJJ_MAUS_ENGINE_TOKEN aus der lokalen Geheimablage
// (~/.config/smejj.com/env.local) in die Salad-Container-Gruppe smejj-control.
// Der Wert wird dabei NIE angezeigt, NIE geloggt und NIE in die Zwischenablage
// gelegt — er wandert ausschliesslich im Arbeitsspeicher dieses Prozesses von
// der Datei zur Salad-API. Ausgegeben wird nur ein Fingerabdruck (sha=...).
//
// WARUM DER MENSCH ES STARTET: Das Schreiben eines Geheimwerts ist bewusst
// keine Agenten-Handlung. Der Agent hat dieses Skript gebaut und geprueft; der
// Startknopf gehoert dem Betreiber. Genau dasselbe Muster wie beim
// Release-Upload (CONFIRM_CONTROL_RELEASE_UPLOAD=YES).
//
// SICHERUNG VOR DEM SCHREIBEN: Der Wert wird zuerst gegen die echte Engine
// geprueft (POST /run mit leerem Plan). Nur wenn die Engine ihn ANNIMMT
// (HTTP 422 statt 401), wird geschrieben. So kann dieses Skript unmoeglich
// einen falschen Token auf den Live-Server legen.
//
// Aufruf:
//   CONFIRM_MAUS_ENGINE_TOKEN=YES node scripts/deploy/set_maus_engine_token.mjs
import { createHash } from "node:crypto";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const SALAD_GROUP = "smejj-control";

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Nur ein kurzer Fingerabdruck — nie der Wert selbst.
function fingerabdruck(wert) {
  return createHash("sha256").update(String(wert)).digest("hex").slice(0, 8);
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

// Nimmt die Engine diesen Token an? 401 = nein, 422 = ja (Plan leer, aber
// authentifiziert). Alles andere ist unklar und gilt fail-closed als nein.
async function engineNimmtAn(workerUrl, token) {
  try {
    const antwort = await fetch(`${workerUrl.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ plan: {} })
    });
    return { status: antwort.status, angenommen: antwort.status === 422 };
  } catch (error) {
    return { status: 0, angenommen: false, fehler: String(error?.message || error).slice(0, 120) };
  }
}

async function main() {
  if (process.env.CONFIRM_MAUS_ENGINE_TOKEN !== "YES") {
    fail("Sicherung: CONFIRM_MAUS_ENGINE_TOKEN=YES erforderlich (bewusstes Schreiben eines Geheimwerts).");
  }
  loadSecureLocalEnv();
  const token = String(process.env.SMEJJ_MAUS_ENGINE_TOKEN || "").trim();
  const org = process.env.SALAD_ORGANIZATION_NAME;
  const project = process.env.SALAD_PROJECT_NAME;
  if (!process.env.SALAD_API_KEY || !org || !project) {
    fail("Salad-Zugaenge fehlen in ~/.config/smejj.com/env.local");
  }
  if (token.length !== 64) {
    fail(`SMEJJ_MAUS_ENGINE_TOKEN in der lokalen Ablage hat ${token.length} statt 64 Zeichen — Abbruch.`);
  }
  if (/\s/.test(token)) fail("Der lokale Token enthaelt ein Leerzeichen oder einen Zeilenumbruch — Abbruch.");

  const pfad = `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`;
  const group = await saladApi("GET", pfad);
  const existing = group?.container?.environment_variables || {};
  const anzahl = Object.keys(existing).length;
  if (anzahl < 10) fail(`Unerwartet kleine Env-Map (${anzahl} Eintraege) — Abbruch, nichts geaendert.`);

  const workerUrl = String(existing.SMEJJ_MAUS_ENGINE_WORKER_URL || "").trim();
  if (!workerUrl) fail("SMEJJ_MAUS_ENGINE_WORKER_URL fehlt auf dem Server — Abbruch.");

  // Vorher pruefen: nur einen Token schreiben, den die Engine wirklich annimmt.
  const probe = await engineNimmtAn(workerUrl, token);
  if (!probe.angenommen) {
    fail(`Die Engine nimmt den lokalen Token NICHT an (HTTP ${probe.status}). Es wurde nichts geschrieben.\n`
      + "Bedeutung: der Wert in der lokalen Ablage passt nicht mehr zum Zeabur-Dienst smejj-maus-engine.");
  }

  const vorher = String(existing.SMEJJ_MAUS_ENGINE_TOKEN || "");
  if (vorher === token) {
    console.log(JSON.stringify({ ok: true, unveraendert: true, fingerabdruck: fingerabdruck(token) }, null, 2));
    return;
  }

  await saladApi("PATCH", pfad, {
    container: { environment_variables: { ...existing, SMEJJ_MAUS_ENGINE_TOKEN: token } }
  });

  const nachher = await saladApi("GET", pfad);
  const applied = nachher?.container?.environment_variables || {};
  const ok = applied.SMEJJ_MAUS_ENGINE_TOKEN === token
    && applied.IDRIVE_E2_BUCKET === existing.IDRIVE_E2_BUCKET
    && Object.keys(applied).length === anzahl;
  console.log(JSON.stringify({
    ok,
    gruppe: SALAD_GROUP,
    version: nachher?.version ?? nachher?.container?.version ?? null,
    variablenVorher: anzahl,
    variablenNachher: Object.keys(applied).length,
    fingerabdruckVorher: vorher ? fingerabdruck(vorher) : "(nicht gesetzt)",
    fingerabdruckNachher: fingerabdruck(applied.SMEJJ_MAUS_ENGINE_TOKEN || ""),
    engineProbeVorDemSchreiben: `HTTP ${probe.status} (angenommen)`,
    hinweis: "Salad rollt jetzt neu aus (~10 Minuten). Danach: node scripts/diagnose/maus-abgleich.mjs"
  }, null, 2));
  if (!ok) process.exit(1);
}

await main();
