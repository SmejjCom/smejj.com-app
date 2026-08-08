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
  // Optional: Denktiefe von K3 fest vorgeben (low|high|max) statt der Regel aus
  // src/ai/reasoningEffortPolicy.js. Dient dem Messen im A/B-Vergleich und als
  // Notbremse. Der Sonderwert "RULE" loescht die Vorgabe wieder.
  const k3EffortEingabe = String(process.env.SMEJJ_LLM_KIMI_K3_REASONING_EFFORT || "").trim().toLowerCase();
  // Optional: Herzschlag-Schluessel der Autopiloten (Modul AP, 2026-08-07).
  // Gleiche Regel wie oben — nur was der Aufrufer ausdruecklich mitgibt, wird
  // geschrieben. Der Wert wird nie ausgegeben, nur seine Eintragszahl.
  const autopilotKeysEingabe = String(process.env.SMEJJ_AUTOPILOT_KEYS || "").trim();
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
  // WAECHTER GEGEN DAS UEBERFAHREN FREMDER RELEASES (2026-08-07 fast passiert):
  // In einer geteilten Arbeitskopie rollt jederzeit eine Parallelsitzung etwas
  // aus. Wer sein Artefakt vor 20 Minuten gebaut hat, ersetzt damit womoeglich
  // einen Stand, den er nie gesehen hat. `previousArtifactKey` in der Ausgabe
  // meldet das — aber erst NACH dem Schreiben, also zu spaet.
  //
  // Wer SMEJJ_CONTROL_EXPECTED_PREVIOUS setzt, bekommt die Pruefung DAVOR:
  // stimmt der laufende Stand nicht mit der eigenen Bau-Basis ueberein, bricht
  // das Skript ab, ohne etwas zu aendern. Ohne die Variable bleibt es beim
  // alten Verhalten plus deutlichem Hinweis — kein stiller Zwang, aber auch
  // keine Ausrede mehr.
  const erwartetVorher = String(process.env.SMEJJ_CONTROL_EXPECTED_PREVIOUS || "").trim();
  if (erwartetVorher) {
    if (previousKey !== erwartetVorher) {
      fail(`Abbruch, NICHTS geaendert: live laeuft "${previousKey}", erwartet war "${erwartetVorher}". `
        + "Eine andere Sitzung hat zwischenzeitlich ausgerollt — Artefakt auf dem NEUEN Live-Stand neu bauen.");
    }
  } else {
    console.error(`Hinweis: live laeuft gerade "${previousKey}". Stammt dein Artefakt von dieser Basis? `
      + "Mit SMEJJ_CONTROL_EXPECTED_PREVIOUS=<key> wird das kuenftig vorher geprueft statt nachher gemeldet.");
  }
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
  if (k3EffortEingabe) {
    if (!/^(low|high|max|rule)$/.test(k3EffortEingabe)) {
      fail("SMEJJ_LLM_KIMI_K3_REASONING_EFFORT: nur low, high, max oder rule.");
    }
    // "rule" = keine feste Vorgabe; die Regel im Code entscheidet wieder.
    mergedEnv.SMEJJ_LLM_KIMI_K3_REASONING_EFFORT = k3EffortEingabe === "rule" ? "" : k3EffortEingabe;
  }
  if (autopilotKeysEingabe) {
    // Format: id1:schluessel1,id2:schluessel2 — Kennungen wie in opsAutopiloten.js.
    if (!/^[a-z0-9-]+:[A-Za-z0-9_-]{16,}(,[a-z0-9-]+:[A-Za-z0-9_-]{16,})*$/.test(autopilotKeysEingabe)) {
      fail("SMEJJ_AUTOPILOT_KEYS: Format id:schluessel, kommagetrennt, Schluessel min. 16 Zeichen.");
    }
    mergedEnv.SMEJJ_AUTOPILOT_KEYS = autopilotKeysEingabe;
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
    kimiK3Denktiefe: applied.SMEJJ_LLM_KIMI_K3_REASONING_EFFORT || "(Regel im Code)",
    autopilotKeys: applied.SMEJJ_AUTOPILOT_KEYS
      ? applied.SMEJJ_AUTOPILOT_KEYS.split(",").length + " Eintraege gesetzt"
      : "(nicht gesetzt)",
    hint: "Salad rollt jetzt neu aus (~10 Minuten). Danach /api/health pruefen."
  }, null, 2));
}

await main();
