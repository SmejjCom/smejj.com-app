// smejj.com — Autorisierung des Adminbereichs (Single Responsibility: die eine Tuer).
// JEDE Admin-Route laeuft durch dieses Modul. Die Oberflaeche darf zusaetzlich
// ausblenden, aber der Schutz liegt hier — nicht im Browser.
//
// Drei Festlegungen, die den Rest tragen:
//   1. Die Rolle wird NIE aus dem Sitzungs-Token gelesen, sondern bei jeder
//      Anfrage aus dem Nutzer-Store (hoechstens 30 s zwischengespeichert, jede
//      Schreibung verwirft den Speicher — siehe ladeAdminDatensatz). Ein Entzug
//      ueber die Konsole wirkt damit sofort und
//      ein manipuliertes Token bringt keine Rechte. (sessionToken.js filtert
//      "role" ohnehin heraus — wir verlassen uns aber nicht darauf.)
//   2. Fail-closed: Storage-Stoerung, unbekannte Rolle, gesperrtes Konto und
//      fehlende E-Mail fuehren alle zur Ablehnung.
//   3. Owner-Bootstrap ueber SMEJJ_ADMIN_OWNER_EMAILS, damit der erste Zugang
//      ohne Datenbankeingriff moeglich ist. Der Weg ist protokollpflichtig und
//      als Quelle "bootstrap" erkennbar.
import { getUserByEmail, normalizeEmail, nutzerSchreibStand, nutzerStoreIstEntfernt, userRole, userStatus } from "../auth/emailUserStore.js";
import { GRANT, can, isAdminRole } from "./adminRoles.js";

// ---- Kurzer Zwischenspeicher fuer den Konto-Datensatz --------------------------
// A-bis-Z-Livetest 15.09.2026, Befund M8: /api/admin/me brauchte 5-13 s, beim
// Kaltstart einmal "Nutzerverzeichnis nicht erreichbar". Jeder Seitenaufruf
// der Konsole las den Datensatz frisch aus IDrive e2 (2,5 s Zeitgrenze, zwei
// Wiederholungen) — und die Konsole ruft viele Routen kurz hintereinander.
//
// Was Festlegung 1 (oben) davon unberuehrt laesst:
//   - Die Rolle kommt weiter aus dem STORE, nie aus dem Token; gespeichert wird
//     nur der Store-Datensatz, und die Pruefung darauf laeuft bei JEDER Anfrage.
//   - Hoechstens 30 s alt (Obergrenze laut Auftrag ~60 s).
//   - Jede Schreibung in diesem Prozess (Rollenaenderung, Sperre, Loeschung)
//     verwirft ALLE Eintraege sofort (Schreibstand aus emailUserStore.js).
//   - Fail-closed: Fehler werden nie gespeichert; kein alter Eintrag springt
//     bei einer Stoerung ein.
//   - Nur fuer den entfernten Store — der Speicher-Zweig (lokal, Tests) ist
//     ohnehin sofort und bleibt ungepuffert.
const ZWISCHENSPEICHER_MS = 30_000;
const ZWISCHENSPEICHER_MAX = 200;
// Kaltstart: der erste TLS-Aufbau zu IDrive e2 reisst die 2,5-s-Grenze. Ein
// zweiter Anlauf mit mehr Geduld, bevor "nicht erreichbar" gemeldet wird.
const KALTSTART_TIMEOUT_MS = 8_000;
const zwischenspeicher = new Map(); // email -> { am, stand, text }

/**
 * Konto-Datensatz fuer die Admin-Pruefung laden: Zwischenspeicher, sonst Store
 * mit einer geduldigeren Wiederholung. Wirft, wenn beide Anlaeufe scheitern.
 * Exportiert fuer die Tests (lese/jetztMs/aktiv injizierbar).
 */
export async function ladeAdminDatensatz(email, env = process.env, {
  lese = getUserByEmail, jetztMs = Date.now(), aktiv = nutzerStoreIstEntfernt(env)
} = {}) {
  const stand = nutzerSchreibStand();
  const eintrag = aktiv ? zwischenspeicher.get(email) : null;
  if (eintrag && eintrag.stand === stand && jetztMs - eintrag.am >= 0 && jetztMs - eintrag.am < ZWISCHENSPEICHER_MS) {
    return eintrag.text === null ? null : JSON.parse(eintrag.text); // Kopie: niemand veraendert den Eintrag
  }
  let record;
  try {
    record = await lese(email, env);
  } catch {
    record = await lese(email, env, { timeoutMs: KALTSTART_TIMEOUT_MS }); // wirft weiter -> 503
  }
  // Nur ablegen, wenn waehrenddessen niemand geschrieben hat.
  if (aktiv && nutzerSchreibStand() === stand) {
    if (zwischenspeicher.size >= ZWISCHENSPEICHER_MAX) zwischenspeicher.delete(zwischenspeicher.keys().next().value);
    zwischenspeicher.set(email, { am: jetztMs, stand, text: record ? JSON.stringify(record) : null });
  }
  return record;
}

/** Nur fuer Tests. */
export function _adminZwischenspeicherLeeren() {
  zwischenspeicher.clear();
}

/** E-Mail-Liste aus der Umgebung: "a@x.de, b@y.de" -> Set normalisierter Adressen. */
export function bootstrapOwnerEmails(env = process.env) {
  const raw = String(env.SMEJJ_ADMIN_OWNER_EMAILS || "");
  const emails = new Set();
  for (const part of raw.split(/[,;\s]+/)) {
    const email = normalizeEmail(part);
    if (email) emails.add(email);
  }
  return emails;
}

/**
 * Ermittelt den handelnden Admin zur aktuellen Sitzung.
 *
 * `erlaubeUnbestaetigt` ist die Ausnahme fuer genau zwei Stellen und darf
 * nirgends sonst gesetzt werden:
 *   - die Auslieferung der Konsolen-DATEIEN (dort stehen keine Kontodaten),
 *   - die Step-up-Routen selbst.
 * Ohne diese Ausnahme waere die Bestaetigungspflicht eine Falle: Wer seine
 * Adresse noch nicht bestaetigt hat, kaeme an den einzigen Weg, sie zu
 * bestaetigen, gar nicht erst heran — auch der Betreiber nicht.
 *
 * @returns {Promise<{ok: true, actor: object} | {ok: false, status: number, error: string}>}
 */
export async function resolveAdminActor(authUser, { env = process.env, erlaubeUnbestaetigt = false } = {}) {
  const email = normalizeEmail(authUser?.email);
  if (!email) return deny(401, "admin_authentication_required");

  const bootstrap = bootstrapOwnerEmails(env);
  let record = null;
  try {
    record = await ladeAdminDatensatz(email, env);
  } catch {
    // Storage-Stoerung darf niemals zu mehr Rechten fuehren.
    return deny(503, "admin_directory_unavailable");
  }

  // Bootstrap gewinnt nur nach oben: die hinterlegte Rolle wird nie abgewertet.
  const storedRole = record ? userRole(record) : "";
  const isBootstrapOwner = bootstrap.has(email);
  const role = isBootstrapOwner ? "owner" : storedRole;

  if (!isAdminRole(role)) return deny(403, "admin_role_required");
  if (record && userStatus(record) !== "active") return deny(403, "admin_account_not_active");

  // Bestaetigte Adresse ist Pflicht (2026-08-06). Der Step-up schickt seinen
  // Code an genau diese Adresse — wenn niemand je nachgewiesen hat, dass sie
  // dem Konto gehoert, waere der zweite Faktor ein Faktor ins Blaue.
  const emailVerified = Boolean(record?.emailVerifiedAt);
  if (!emailVerified && !erlaubeUnbestaetigt) {
    return deny(403, "admin_email_not_verified");
  }

  return {
    ok: true,
    actor: {
      userId: String(record?.userId || authUser?.userId || "").slice(0, 200),
      email,
      name: String(record?.name || authUser?.name || email.split("@")[0]).slice(0, 120),
      role,
      // "bootstrap" heisst: die Rolle stammt aus der Umgebung, nicht aus dem Konto.
      roleSource: isBootstrapOwner ? "bootstrap" : "store",
      storedRole: storedRole || null,
      emailVerified
    }
  };
}

/**
 * Prueft Sitzung UND Berechtigung in einem Schritt.
 * Nur die Abstufung "allow" laesst durch — "dual" und "consent" brauchen den
 * jeweiligen Zusatzschritt und werden hier bewusst noch nicht erteilt.
 */
export async function requireAdminPermission(authUser, permission, { env = process.env } = {}) {
  const resolved = await resolveAdminActor(authUser, { env });
  if (!resolved.ok) return resolved;
  return checkActorPermission(resolved.actor, permission);
}

/**
 * Reine Pruefung auf einem bereits aufgeloesten Akteur — ohne erneuten
 * Store-Zugriff. Die Routen loesen einmal auf und pruefen danach hiermit.
 */
export function checkActorPermission(actor, permission) {
  const grant = can(actor?.role, permission);
  if (grant === GRANT.allow) return { ok: true, actor, grant };
  if (grant === GRANT.dual) return deny(403, "admin_second_approval_required", { grant, permission });
  if (grant === GRANT.consent) return deny(403, "admin_subject_consent_required", { grant, permission });
  return deny(403, "admin_permission_denied", { grant: GRANT.deny, permission });
}

function deny(status, error, extra = {}) {
  return { ok: false, status, error, ...extra };
}
