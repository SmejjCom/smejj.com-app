#!/usr/bin/env node
// smejj.com — ein bezahltes Abo vom Mac aus auf ein Konto haengen (Betreiber-Notweg).
//
// WANN: Die Adminaktion user.billing.relink verlangt einen Step-up-Code per Mail —
// der Weg fuer den Alltag. Dieses Skript ist der Weg, wenn der Betreiber den
// Vorgang aus seiner Sitzung heraus nicht abschliessen kann (2026-08-23: Code
// nicht bestaetigt, Auftrag "mach komplett fertig"). Es tut EXAKT dasselbe wie die
// Adminaktion (billing/aboUmhaengen.js) und schreibt denselben Audit-Eintrag —
// nur mit den Speicher-Schluesseln aus ~/.config/smejj.com/env.local statt aus
// der Zeabur-Umgebung.
//
// Aufruf:
//   CONFIRM_ABO_UMHAENGEN=YES node scripts/billing/abo_umhaengen_lokal.mjs <konto-email> <cus_...> "<Grund>"
//
// Werte aus env.local werden nie ausgegeben.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aboAufKontoUmhaengen } from "../../control-server/src/billing/aboUmhaengen.js";
import { appendAuditEntry } from "../../control-server/src/admin/auditLog.js";

function envAusLocal() {
  const datei = path.join(os.homedir(), ".config", "smejj.com", "env.local");
  const env = {};
  for (const zeile of fs.readFileSync(datei, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(zeile.trim());
    if (m && /^IDRIVE_E2_/.test(m[1])) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

async function main() {
  const [konto, kundenId, grund] = process.argv.slice(2);
  if (process.env.CONFIRM_ABO_UMHAENGEN !== "YES") { console.log("Nichts getan. CONFIRM_ABO_UMHAENGEN=YES setzen."); return; }
  if (!konto || !kundenId || !grund || grund.length < 3) { console.error("Aufruf: <konto-email> <cus_...> \"<Grund>\""); process.exitCode = 1; return; }
  const env = envAusLocal();
  for (const n of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) {
    if (!env[n]) { console.error("env.local ohne " + n); process.exitCode = 1; return; }
  }
  const ergebnis = await aboAufKontoUmhaengen(konto, kundenId, { env });
  if (!ergebnis.ok) { console.error("Abbruch: " + ergebnis.error + (ergebnis.status ? " (" + ergebnis.status + ")" : "")); process.exitCode = 1; return; }
  const nachweis = await appendAuditEntry({
    actor: { email: "smejjcom@gmail.com", role: "owner", roleSource: "betreiber-notweg" },
    action: "user.billing.relink", target: konto.toLowerCase(),
    before: ergebnis.before, after: { ...ergebnis.after, weg: "scripts/billing/abo_umhaengen_lokal.mjs" },
    reason: grund, ip: "mac-des-betreibers"
  }, { env });
  console.log("Umgehaengt: " + kundenId + " -> " + konto.toLowerCase() + " (Plan " + ergebnis.after.plan + ", " + ergebnis.after.status + "). Audit: " + (nachweis.ok ? "geschrieben" : "FEHLER " + nachweis.error));
}

main().catch((e) => { console.error("Fehler: " + String(e?.message || e).slice(0, 200)); process.exitCode = 1; });
