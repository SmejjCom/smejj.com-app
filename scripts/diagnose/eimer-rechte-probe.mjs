// Diagnose 2026-08-15: Welche Rechte hat der hinterlegte Schluessel je Eimer?
//
// Anlass: Produktion meldete live "IDrive e2 write failed for
// admin/audit/…json: 403 AccessDenied". Damit wird KEIN Nachweis mehr
// geschrieben und KEIN Step-up-Code mehr verschickt — jede schreibende
// Adminaktion steht.
//
// Die Probe unterscheidet drei Faelle je Eimer: gar kein Zugriff, nur Lesen,
// Lesen und Schreiben. Genau daran haengt, was zu tun ist.
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { appendAuditEntry, readAuditPage } from "../../control-server/src/admin/auditLog.js";

loadSecureLocalEnv();
const EIMER = ["smejj-model-files", "smejj-app"];

for (const eimer of EIMER) {
  const env = { ...process.env, IDRIVE_E2_BUCKET: eimer };
  let lesen = "?";
  let schreiben = "?";
  try {
    await readAuditPage({ limit: 1 }, { env });
    lesen = "ok";
  } catch (f) {
    lesen = String(f?.message || f).includes("403") ? "403 verweigert" : String(f?.message || f).slice(0, 60);
  }
  try {
    await appendAuditEntry({
      actor: { email: "diagnose@smejj-check.invalid", role: "owner" },
      action: "diagnose.eimerprobe",
      target: { type: "diagnose", id: eimer },
      reason: "Rechte-Probe je Eimer (2026-08-15)"
    }, { env });
    schreiben = "ok";
  } catch (f) {
    schreiben = String(f?.message || f).includes("403") ? "403 verweigert" : String(f?.message || f).slice(0, 60);
  }
  console.log(`${eimer.padEnd(20)} lesen=${lesen.padEnd(16)} schreiben=${schreiben}`);
}
