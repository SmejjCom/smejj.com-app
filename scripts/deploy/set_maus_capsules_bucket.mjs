#!/usr/bin/env node
// smejj.com — Maus-Wiedergabe sichtbar machen: IDRIVE_E2_CAPSULES_BUCKET setzen.
//
// Warum eigenes Skript und nicht set_control_artifact_env.mjs: Dort haengt der
// Wert an einem Release-Wechsel (Artefakt-Key + SHA sind Pflicht). Hier soll
// GENAU EINE Variable umgestellt werden, ohne einen Release anzufassen — SRP,
// und der Rueckweg bleibt ein einzelner Wert.
//
// Bewaehrter Weg (Memory_Bank 2026-07-27): GET der Container-Definition,
// lokaler Merge der VOLLEN Env-Map, PATCH mit application/merge-patch+json.
// So geht keine der bestehenden Variablen verloren.
//
// KEIN GEHEIMWERT: IDRIVE_E2_CAPSULES_BUCKET ist ein Eimername. Dieses Skript
// liest, zeigt und schreibt keine Secrets; die Salad-Zugaenge kommen ueber
// loadSecureLocalEnv() aus ~/.config/smejj.com/env.local und bleiben im Prozess.
//
// Wirkung: gatekeeper/presignIdrive.js, resolveBucketForKey() lenkt NUR den
// Prefix capsules/maus-engine/ auf diesen Eimer. IDRIVE_E2_BUCKET und alle
// anderen Daten (Nutzer, Anmeldung) bleiben unberuehrt.
//
// Aufruf:
//   CONFIRM_MAUS_CAPSULES_BUCKET=YES node scripts/deploy/set_maus_capsules_bucket.mjs
//   CONFIRM_MAUS_CAPSULES_BUCKET=YES SMEJJ_MAUS_CAPSULES_BUCKET=smejj-app \
//     node scripts/deploy/set_maus_capsules_bucket.mjs      # Rueckweg
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const SALAD_GROUP = "smejj-control";
const ZIEL_DEFAULT = "smejj-model-files";
const EIMER_MUSTER = /^[a-z0-9][a-z0-9.-]{2,62}$/;

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
  if (process.env.CONFIRM_MAUS_CAPSULES_BUCKET !== "YES") {
    fail("Sicherung: CONFIRM_MAUS_CAPSULES_BUCKET=YES erforderlich (bewusste Aenderung an der Live-Konfiguration).");
  }
  // VOR loadSecureLocalEnv() lesen — sonst zieht das Skript einen Wert aus der
  // lokalen Ablage heran, der fuer diesen Lauf gar nicht gemeint war.
  const ziel = String(process.env.SMEJJ_MAUS_CAPSULES_BUCKET || ZIEL_DEFAULT).trim();
  if (!EIMER_MUSTER.test(ziel)) fail(`Kein gueltiger Eimername: ${ziel.slice(0, 40)}`);

  loadSecureLocalEnv();
  const org = process.env.SALAD_ORGANIZATION_NAME;
  const project = process.env.SALAD_PROJECT_NAME;
  if (!process.env.SALAD_API_KEY || !org || !project) {
    fail("Salad-Zugaenge fehlen in ~/.config/smejj.com/env.local");
  }
  const pfad = `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`;

  const group = await saladApi("GET", pfad);
  const existing = group?.container?.environment_variables || {};
  const anzahl = Object.keys(existing).length;
  // Schutz gegen das versehentliche Wegpatchen der Env-Map: eine gesunde
  // smejj-control-Gruppe traegt Dutzende Variablen (2026-07-27: 68).
  if (anzahl < 10) fail(`Unerwartet kleine Env-Map (${anzahl} Eintraege) — Abbruch, nichts geaendert.`);

  const vorher = existing.IDRIVE_E2_CAPSULES_BUCKET || "(nicht gesetzt)";
  // Sicherung: an IDRIVE_E2_BUCKET wird NIE geruehrt. Daran haengen Nutzer und
  // Anmeldung; ein Vertippen dort waere ein Totalausfall statt eines Schoenheitsfehlers.
  const datenEimer = existing.IDRIVE_E2_BUCKET || "";
  if (vorher === ziel) {
    console.log(JSON.stringify({ ok: true, unveraendert: true, IDRIVE_E2_CAPSULES_BUCKET: ziel }, null, 2));
    return;
  }

  await saladApi("PATCH", pfad, {
    container: { environment_variables: { ...existing, IDRIVE_E2_CAPSULES_BUCKET: ziel } }
  });

  const nachher = await saladApi("GET", pfad);
  const applied = nachher?.container?.environment_variables || {};
  const ok = applied.IDRIVE_E2_CAPSULES_BUCKET === ziel
    && applied.IDRIVE_E2_BUCKET === datenEimer
    && Object.keys(applied).length === anzahl;
  console.log(JSON.stringify({
    ok,
    gruppe: SALAD_GROUP,
    version: nachher?.version ?? nachher?.container?.version ?? null,
    variablenVorher: anzahl,
    variablenNachher: Object.keys(applied).length,
    IDRIVE_E2_CAPSULES_BUCKET: { vorher, nachher: applied.IDRIVE_E2_CAPSULES_BUCKET },
    IDRIVE_E2_BUCKET: `${applied.IDRIVE_E2_BUCKET} (unveraendert)`,
    hinweis: "Salad rollt jetzt neu aus (~10 Minuten). Danach: node scripts/diagnose/maus-abgleich.mjs"
  }, null, 2));
  if (!ok) process.exit(1);
}

await main();
