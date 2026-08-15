// smejj.com control-server — short-lived IDrive e2 presigned URL API.
// Large file bytes go directly browser/client -> IDrive e2; this route only signs.
//
// ============================================================================
// WER DARF WAS SIGNIEREN LASSEN — Befund und Fix vom 2026-08-15
// ============================================================================
//
// Bis hierher nahm diese Route `body.key` und `body.operation` ungeprueft
// entgegen und reichte beides an den Gatekeeper weiter. Der Gatekeeper prueft
// den PFAD (Erlaubnisliste von Praefixen), aber nicht, WER fragt.
//
// Die Route selbst verlangt nur "angemeldet", keine Rolle. Und registrieren
// kann sich jeder. Damit konnte JEDER, der ein Konto anlegt, sich eine
// signierte PUT-Adresse ausstellen lassen fuer:
//
//   deployments/control/*.tar.gz   <- die Release-Artefakte des Control-Servers
//   model-files/**                 <- Modelldateien
//   rag/**                         <- das Projektwissen, das in Antworten fliesst
//   backups/**, objects/**, manifests/**, checksums/**, indexes/**, static-assets/**
//
// `deployments/` wiegt am schwersten: wer dort ein Artefakt austauscht, legt
// Code ab, den der Betreiber spaeter ausrollt (opsDeploy.js, opsSpeicher.js,
// bootstrap-control-release.mjs lesen genau dieses Praefix). Das ist keine
// Dateiablage mehr, das ist die Lieferkette.
//
// WAS DER NORMALE WEG WIRKLICH BRAUCHT: genau eine Sache. public/maus-replay.js
// ist der einzige Aufrufer im Frontend, und er macht ausschliesslich
// `operation: "download"` auf `capsules/maus-engine/` (Stufe B, schriftlich
// freigegeben 2026-07-15). Kein Nutzerweg laedt ueber diese Route hoch.
//
// Deshalb die Regel: Angemeldete duerfen genau diesen Lesefall. Alles andere —
// jeder Upload und jeder Download ausserhalb der Replay-Aufnahmen — verlangt
// eine Adminrolle.
//
// Reihenfolge mit Bedacht: Der Nutzerfall wird ZUERST geprueft und kommt ohne
// Store-Zugriff aus. Nur wer darueber hinaus will, loest die Adminrolle auf.
// Sonst haenge der Replay-Weg an einer Store-Abfrage, die auch 503 werden kann.
// ============================================================================
import { createPresignedIdriveUrl } from "../../../gatekeeper/presignIdrive.js";
import { requireIdrivePresignConfig } from "../../../gatekeeper/policy.js";
import { evaluateQuota } from "../../../gatekeeper/quota.js";
import { json, readJson } from "../http/respond.js";
import { resolveAdminActor } from "../admin/adminAuth.js";

/**
 * Der eine Fall, den ein angemeldeter Nutzer ohne Adminrolle haben darf:
 * eine Replay-Aufnahme LESEN. Muss zum Praefix in gatekeeper/policy.js passen
 * (DOWNLOAD_ONLY_KEY_PREFIXES) — wer dort etwas aendert, aendert es hier mit.
 */
const NUTZER_LESEN = /^capsules\/maus-engine\//;

export function istNutzerfall({ operation, key } = {}) {
  return operation === "download" && NUTZER_LESEN.test(String(key || "").trim());
}

export async function handleStoragePresign(req, res, { env = process.env } = {}) {
  const config = requireIdrivePresignConfig(env);
  if (!config.ok) return json(res, config.status, config);

  const quota = evaluateQuota({ env, provider: "idrive-e2", operation: "presign-idrive" });
  if (!quota.ok) return json(res, quota.status, quota);

  const body = await readJson(req);

  // Alles ausser dem Replay-Lesefall braucht eine Adminrolle.
  if (!istNutzerfall(body)) {
    const akteur = await resolveAdminActor(req.authUser, { env });
    if (!akteur.ok) {
      return json(res, akteur.status === 401 ? 401 : 403, {
        ok: false,
        error: "presign_admin_required",
        hinweis: "Signierte Adressen ausserhalb der Replay-Aufnahmen sind der Betreiberverwaltung vorbehalten."
      });
    }
  }

  const result = await createPresignedIdriveUrl({
    env,
    operation: body.operation,
    key: body.key,
    contentType: body.contentType,
    contentLength: body.contentLength
  });
  return json(res, result.status, result);
}
