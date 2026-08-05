#!/usr/bin/env node
// smejj.com — kurzlebigen Anmelde-Nachweis fuer den Qualitaets-Messlauf erzeugen.
//
// WARUM ES DAS GIBT: Seit dem 2026-08-05 (Bridge v121) weist `/api/chat` jede
// Anfrage ohne gueltiges Token mit HTTP 401 ab. Der Messlauf misst absichtlich
// den ECHTEN Nutzerweg (ueber die Bridge, nicht am Control Server vorbei) — also
// braucht er einen Nachweis wie ein angemeldeter Nutzer.
//
// EIGENSCHAFTEN, alle drei notwendig:
//   1. Der Sitzungsschluessel wird aus der LAUFENDEN Salad-Gruppe gelesen. Der
//      Wert in ~/.config/smejj.com/env.local ist ein anderer und ergibt 401.
//   2. `method: "local-e2e"` — NICHT "email". `emailSessionStillValid()` prueft
//      nur bei method === "email" gegen den Sitzungsspeicher; ein gemintetes
//      Token haette dort keine Sitzung und fiele fail-closed durch.
//   3. Kurze Laufzeit (Standard 15 Minuten). Das Token wird nur ueber die
//      Umgebung weitergereicht, nie in eine Datei geschrieben, nie protokolliert.
//
// Aufruf:
//   SMEJJ_EVAL_SESSION_TOKEN=$(node scripts/verlauf/mint-eval-token.mjs) npm run eval:models
//
// Ausgabe: ausschliesslich das Token auf stdout (fuer die Kommandoersetzung).
// Alle Meldungen gehen auf stderr, damit sie die Ausgabe nicht verunreinigen.
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { issueSessionToken } from "../../control-server/src/auth/sessionToken.js";

const GRUPPE = process.env.SMEJJ_CONTROL_GROUP || "smejj-control";
const LAUFZEIT_MS = Number(process.env.SMEJJ_EVAL_TOKEN_TTL_MS || 15 * 60 * 1000);

function abbruch(nachricht) {
  process.stderr.write(`${nachricht}\n`);
  process.exit(1);
}

loadSecureLocalEnv();

for (const name of ["SALAD_API_KEY", "SALAD_ORGANIZATION_NAME", "SALAD_PROJECT_NAME"]) {
  if (!process.env[name]) abbruch(`${name} fehlt — kein Token erzeugt.`);
}

const pfad = `https://api.salad.com/api/public/organizations/${process.env.SALAD_ORGANIZATION_NAME}`
  + `/projects/${process.env.SALAD_PROJECT_NAME}/containers/${GRUPPE}`;

let definition;
try {
  const antwort = await fetch(pfad, {
    headers: { "Salad-Api-Key": process.env.SALAD_API_KEY, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!antwort.ok) abbruch(`Salad-API HTTP ${antwort.status} — kein Token erzeugt.`);
  definition = await antwort.json();
} catch (fehler) {
  abbruch(`Salad-API nicht erreichbar (${fehler.name}) — kein Token erzeugt.`);
}

const secret = definition?.container?.environment_variables?.SMEJJ_SESSION_SECRET;
if (!secret) abbruch(`SMEJJ_SESSION_SECRET nicht in ${GRUPPE} gefunden — kein Token erzeugt.`);

const token = issueSessionToken({
  secret,
  user: { userId: "eval-harness", email: "smejjcom@gmail.com", method: "local-e2e" },
  ttlMs: LAUFZEIT_MS
});

process.stderr.write(`Anmelde-Nachweis erzeugt (${Math.round(LAUFZEIT_MS / 60000)} Minuten gueltig).\n`);
process.stdout.write(token);
