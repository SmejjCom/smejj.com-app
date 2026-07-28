#!/usr/bin/env node
// smejj.com — Control-Server-Release aktivieren: zeigt die Salad-Container-Gruppe
// auf ein NEUES, bereits unveraenderlich auf IDrive e2 liegendes Release-Artefakt.
//
// Bewaehrter Weg (Memory_Bank: GitHub-Login-Secret 2026-07-27, Billing 3b):
// GET der Container-Definition, lokaler Merge der VOLLEN Env-Map, PATCH mit
// application/merge-patch+json — so geht keine der bestehenden Variablen
// verloren. Salad rollt danach automatisch neu aus (~10 Minuten).
//
// Dieses Skript aendert AUSSCHLIESSLICH die zwei Release-Zeiger
// SMEJJ_CONTROL_ARTIFACT_KEY und SMEJJ_CONTROL_ARTIFACT_SHA256. Es liest,
// zeigt oder schreibt keine Secrets; die Salad-Zugaenge kommen ueber
// loadSecureLocalEnv() aus ~/.config/smejj.com/env.local und bleiben im Prozess.
//
// Aufruf:
//   CONFIRM_CONTROL_ARTIFACT_SWITCH=YES \
//   SMEJJ_CONTROL_ARTIFACT_KEY=deployments/control/<datei>.tar.gz \
//   SMEJJ_CONTROL_ARTIFACT_SHA256=<64 hex> \
//   node scripts/deploy/set_control_artifact_env.mjs
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const CONTROL_KEY = /^deployments\/control\/[a-z0-9._/-]+\.tar\.gz$/i;
const SALAD_GROUP = "smejj-control";

function fail(message) {
  console.error(message);
  process.exit(1);
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

async function main() {
  if (process.env.CONFIRM_CONTROL_ARTIFACT_SWITCH !== "YES") {
    fail("Sicherung: CONFIRM_CONTROL_ARTIFACT_SWITCH=YES erforderlich (bewusster Release-Lauf).");
  }
  const key = String(process.env.SMEJJ_CONTROL_ARTIFACT_KEY || "").trim();
  const sha = String(process.env.SMEJJ_CONTROL_ARTIFACT_SHA256 || "").trim().toLowerCase();
  if (!CONTROL_KEY.test(key) || key.includes("..") || key.includes("//")) {
    fail("SMEJJ_CONTROL_ARTIFACT_KEY liegt ausserhalb des erlaubten Prefix deployments/control/.");
  }
  if (!/^[a-f0-9]{64}$/.test(sha)) fail("SMEJJ_CONTROL_ARTIFACT_SHA256 fehlt oder ist kein SHA-256.");

  // VOR loadSecureLocalEnv() lesen: Sonst zieht das Skript einen Wert aus
  // ~/.config/smejj.com/env.local heran, der fuer diesen Lauf gar nicht
  // gemeint war — und bricht an der Formatpruefung ab. Nur was der Aufrufer
  // ausdruecklich mitgibt, wird auf den Server geschrieben.
  const ownerAllowlistEingabe = String(process.env.SMEJJ_GITHUB_OWNER_ALLOWLIST || "").trim();
  // Optional: echtes Tool-Calling einschalten (2026-07-28). Gleiche Regel wie
  // oben — nur was der Aufrufer ausdruecklich mitgibt, wird geschrieben.
  const werkzeugeEingabe = String(process.env.SMEJJ_AGENT_TOOLS_ENABLED || "").trim().toUpperCase();
  // Optional: Owner-Bootstrap des Adminbereichs (Stufe 1, 2026-07-28). Gleiche
  // Regel wie oben — nur was der Aufrufer ausdruecklich mitgibt, wird geschrieben.
  const adminOwnerEingabe = String(process.env.SMEJJ_ADMIN_OWNER_EMAILS || "").trim().toLowerCase();
  // Optional: Kimi K3 einschalten (2026-07-28). K3 ist kostenpflichtig und
  // bleibt ohne dieses Flag inaktiv — auch mit gueltigem Key. Gleiche Regel wie
  // oben: nur was der Aufrufer ausdruecklich mitgibt, wird geschrieben.
  const kimiK3Eingabe = String(process.env.SMEJJ_KIMI_K3_ENABLED || "").trim().toUpperCase();
  loadSecureLocalEnv();
  const org = process.env.SALAD_ORGANIZATION_NAME;
  const project = process.env.SALAD_PROJECT_NAME;
  if (!process.env.SALAD_API_KEY || !org || !project) {
    fail("Salad-Zugaenge fehlen in ~/.config/smejj.com/env.local");
  }

  const group = await saladApi("GET", `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`);
  const existing = group?.container?.environment_variables || {};
  const existingCount = Object.keys(existing).length;
  if (existingCount < 10) {
    // Schutz gegen das versehentliche Wegpatchen der Env-Map: Eine gesunde
    // smejj-control-Gruppe traegt Dutzende Variablen (2026-07-27: 68).
    fail(`Unerwartet kleine Env-Map (${existingCount} Eintraege) — Abbruch, nichts geaendert.`);
  }
  const previousKey = existing.SMEJJ_CONTROL_ARTIFACT_KEY || "(leer)";
  const mergedEnv = {
    ...existing,
    SMEJJ_CONTROL_ARTIFACT_KEY: key,
    SMEJJ_CONTROL_ARTIFACT_SHA256: sha
  };
  // Optional: Owner-Allowlist fuer Coding-Auftraege (QA-Welle 3, Befund W3-02).
  // Seit die Allowlist fuer JEDE Repository-URL gilt, muss sie gesetzt sein —
  // sonst lehnt der Server fail-closed auch eigene Repositories ab. Nur
  // Kleinbuchstaben, Ziffern, Bindestrich und Komma sind zulaessig.
  const ownerAllowlist = ownerAllowlistEingabe;
  if (ownerAllowlist) {
    if (!/^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(ownerAllowlist)) {
      fail("SMEJJ_GITHUB_OWNER_ALLOWLIST: nur kleingeschriebene Owner-Namen, kommagetrennt.");
    }
    mergedEnv.SMEJJ_GITHUB_OWNER_ALLOWLIST = ownerAllowlist;
  }
  if (werkzeugeEingabe) {
    if (!/^(YES|NO)$/.test(werkzeugeEingabe)) fail("SMEJJ_AGENT_TOOLS_ENABLED: nur YES oder NO.");
    mergedEnv.SMEJJ_AGENT_TOOLS_ENABLED = werkzeugeEingabe;
  }
  // Adminbereich Stufe 1: die einzige Adresse(n), die als Owner einsteigen
  // duerfen. Ohne diese Variable antwortet /api/admin/* fail-closed mit 403.
  if (adminOwnerEingabe) {
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]{2,}(,[^\s@,]+@[^\s@,]+\.[^\s@,]{2,})*$/.test(adminOwnerEingabe)) {
      fail("SMEJJ_ADMIN_OWNER_EMAILS: nur gueltige E-Mail-Adressen, kommagetrennt.");
    }
    mergedEnv.SMEJJ_ADMIN_OWNER_EMAILS = adminOwnerEingabe;
  }
  if (kimiK3Eingabe) {
    if (!/^(YES|NO)$/.test(kimiK3Eingabe)) fail("SMEJJ_KIMI_K3_ENABLED: nur YES oder NO.");
    mergedEnv.SMEJJ_KIMI_K3_ENABLED = kimiK3Eingabe;
  }
  await saladApi("PATCH", `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`, {
    container: { environment_variables: mergedEnv }
  });
  const after = await saladApi("GET", `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`);
  const applied = after?.container?.environment_variables || {};
  console.log(JSON.stringify({
    ok: applied.SMEJJ_CONTROL_ARTIFACT_KEY === key && applied.SMEJJ_CONTROL_ARTIFACT_SHA256 === sha,
    group: SALAD_GROUP,
    version: after?.version ?? after?.container?.version ?? null,
    variableCount: Object.keys(applied).length,
    previousArtifactKey: previousKey,
    artifactKey: applied.SMEJJ_CONTROL_ARTIFACT_KEY,
    ownerAllowlist: applied.SMEJJ_GITHUB_OWNER_ALLOWLIST ?? "(nicht gesetzt)",
    werkzeuge: applied.SMEJJ_AGENT_TOOLS_ENABLED ?? "(nicht gesetzt)",
    adminOwner: applied.SMEJJ_ADMIN_OWNER_EMAILS ?? "(nicht gesetzt)",
    kimiK3: applied.SMEJJ_KIMI_K3_ENABLED ?? "(nicht gesetzt)",
    hint: "Salad rollt jetzt neu aus (~10 Minuten). Danach /api/health pruefen."
  }, null, 2));
}

await main();
