// smejj.com — schreibende Aktionen der Autopiloten-Ampel (Modul AP, Stufe 2b).
//
// Freigabe des Betreibers vom 2026-08-08, im Wortlaut:
//   "Freigabe: Autopiloten-Steuerung (Start/Pause) als schreibende Adminaktion
//    mit Step-up-Code und Audit-Eintrag; admin lock v1 danach neu einfrieren."
//
// ZWEI AKTIONEN, und zwar genau die zwei, die der Server WIRKLICH ausfuehren
// kann. Am 2026-08-08 in der Umgebung nachgesehen: es gibt weder einen
// Zeabur- noch einen claude.ai-Zugang. Ein "Radar jetzt starten"-Knopf haette
// also nichts gestartet. Lieber zwei echte Knoepfe als fuenf, von denen drei
// luegen — in einer Ansicht, die "gemessen statt behauptet" verspricht, ist
// eine Attrappe der schlimmste Baustein.
//
//   wartung   Eine Automatik stummschalten, von der man WEISS, dass sie
//             gerade stillsteht. Ohne das bleibt nur, den Alarm zu ignorieren
//             — und eine Ampel, die man ignorieren lernt, ist keine mehr.
//   pruefen   Den Bruecken-Waechter sofort abfragen, statt auf den
//             5-Minuten-Takt zu warten.
//
// Beide gehen durch dieselbe Kette wie jede andere Adminaenderung: frische
// Rolle, Step-up-Bestaetigung, Pflichtgrund, unveraenderlicher Audit-Eintrag.
import { privateJson, readJson } from "../http/respond.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { istErhoeht } from "../admin/stepUp.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { AUTOPILOTEN, frageWaechterAb, setzeWartung } from "../admin/opsAutopiloten.js";

const PFAD = "/api/admin/ops/autopiloten/aktion";
const RECHT = "ops.write";
const MIN_GRUND = 10;

export async function handleAutopilotAktion(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PFAD) return false;
  if (req.method !== "POST") {
    privateJson(res, 405, { ok: false, error: "method_not_allowed" });
    return true;
  }

  const resolved = await resolveAdminActor(req.authUser, { env });
  if (!resolved.ok) {
    privateJson(res, resolved.status, { ok: false, error: resolved.error });
    return true;
  }
  const { actor } = resolved;
  // Zuschauen darf jede Rolle (ops.read), aendern nur owner und admin.
  if (can(actor.role, RECHT) !== GRANT.allow) {
    privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht: RECHT });
    return true;
  }
  if (!istErhoeht(actor.email)) {
    privateJson(res, 403, {
      ok: false,
      error: "admin_step_up_required",
      hinweis: "Frische Bestaetigung noetig: Code unter /api/admin/step-up/request anfordern und unter /api/admin/step-up/confirm bestaetigen."
    });
    return true;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    privateJson(res, 400, { ok: false, error: "body_invalid" });
    return true;
  }

  const aktion = String(body?.aktion || "");
  const id = String(body?.id || "");
  const grund = String(body?.grund || "").trim();
  const eintrag = AUTOPILOTEN.find((a) => a.id === id);
  if (!eintrag) {
    privateJson(res, 404, { ok: false, error: "autopilot_unknown" });
    return true;
  }

  if (aktion === "wartung.ein" || aktion === "wartung.aus") {
    // Pflichtgrund: Eine Stummschaltung ohne Begruendung ist im Nachhinein
    // nicht von einem Versehen zu unterscheiden — genau wie beim Sperren
    // eines Kontos.
    if (grund.length < MIN_GRUND) {
      privateJson(res, 400, { ok: false, error: "grund_zu_kurz", hinweis: `Mindestens ${MIN_GRUND} Zeichen.` });
      return true;
    }
    const an = aktion === "wartung.ein";
    const ergebnis = await setzeWartung(id, an, { grund, wer: actor.email, env });
    if (!ergebnis.ok) {
      privateJson(res, 400, ergebnis);
      return true;
    }
    await appendAuditEntry({
      actor: { email: actor.email, role: actor.role },
      action: an ? "autopilot.wartung.ein" : "autopilot.wartung.aus",
      target: { type: "autopilot", id },
      reason: grund,
      after: { wartung: an }
    }, { env }).catch(() => {});
    privateJson(res, 200, { ok: true, id, wartung: an, name: eintrag.name });
    return true;
  }

  if (aktion === "pruefen") {
    if (id !== "brueckenwaechter") {
      privateJson(res, 400, {
        ok: false,
        error: "pruefen_nicht_moeglich",
        hinweis: "Nur der Bruecken-Waechter hat eine Adresse, die dieser Server abfragen kann."
      });
      return true;
    }
    const erfolg = await frageWaechterAb();
    await appendAuditEntry({
      actor: { email: actor.email, role: actor.role },
      action: "autopilot.pruefen",
      target: { type: "autopilot", id },
      reason: grund || "Sofortprüfung aus der Konsole",
      after: { erfolg }
    }, { env }).catch(() => {});
    privateJson(res, 200, {
      ok: true,
      id,
      geantwortet: erfolg,
      hinweis: erfolg ? "Der Wächter hat geantwortet." : "Der Wächter hat NICHT geantwortet — die Ampel bleibt beim letzten Stand."
    });
    return true;
  }

  privateJson(res, 400, { ok: false, error: "aktion_unbekannt", erlaubt: ["wartung.ein", "wartung.aus", "pruefen"] });
  return true;
}
