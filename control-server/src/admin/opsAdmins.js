// smejj.com — Modul Z: Admin-Verwaltung (Single Responsibility: wer darf hier hinein).
//
// Beantwortet drei Fragen, die sonst nur im Kopf einer einzelnen Person stehen:
//   1. Wer hat gerade Zugang, mit welcher Rolle, seit wann?
//   2. Wer hat einen zweiten Faktor — und wer nicht?
//   3. Wie kommt man herein, wenn alles andere ausfaellt?
//
// Der wichtigste Befund ist nicht eine Liste, sondern eine Rechnung:
// **Vier Augen brauchen zwei Menschen.** Loeschen und Rollenvergabe sind fuer
// jede Rolle "dual" — gibt es nur eine Person mit dem Recht, ist die Aktion
// nicht etwa unsicher, sondern schlicht unmoeglich. Das faellt sonst erst in
// dem Moment auf, in dem man sie braucht.
import { readUserIndex } from "./userIndex.js";
import { listCredentials } from "../auth/passkeyStore.js";
import { bootstrapOwnerEmails } from "./adminAuth.js";
import { ADMIN_ROLES, GRANT, can } from "./adminRoles.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";

export async function adminUebersicht({
  env = process.env,
  jetztMs = Date.now(),
  leseIndex = readUserIndex,
  leseFaktoren = listCredentials
} = {}) {
  const index = await leseIndex({ env });
  if (!index?.ok) return { ok: false, error: index?.error || "index_nicht_lesbar", admins: [] };

  const alle = Array.isArray(index.entries) ? index.entries : [];
  const rollen = new Set(ADMIN_ROLES);
  const admins = alle.filter((e) => rollen.has(String(e.role || "").toLowerCase()));

  // Zweiter Faktor je Zugang. Begrenzt parallel: das sind wenige Konten, aber
  // eine Schleife mit einem GET je Eintrag ist genau die Falle aus Stufe 3.
  const mitFaktor = await mapMitGrenze(admins, async (a) => {
    let faktoren = 0;
    try {
      const liste = await leseFaktoren(a.userId, env);
      faktoren = Array.isArray(liste) ? liste.length : 0;
    } catch {
      faktoren = -1; // nicht ermittelbar — nicht dasselbe wie "keiner"
    }
    return { ...oeffentlich(a, jetztMs), zweiterFaktor: faktoren };
  }, 6);

  const fertig = mitFaktor.filter(Boolean).sort(sortiere);
  const notzugang = notzugangsLage(env, fertig);

  return {
    ok: true,
    total: fertig.length,
    aktiv: fertig.filter((a) => a.status === "active").length,
    ohneZweitenFaktor: fertig.filter((a) => a.zweiterFaktor === 0).length,
    admins: fertig,
    notzugang,
    vierAugen: vierAugenLage(fertig),
    rollen: nachRollen(fertig),
    gemessenAm: new Date(jetztMs).toISOString()
  };
}

/**
 * Vier Augen brauchen zwei Menschen — sonst ist die Absicherung keine Huerde,
 * sondern eine Sperre. Geprueft wird gegen die Rechte, die tatsaechlich "dual"
 * sind, nicht gegen eine fest verdrahtete Liste.
 */
export function vierAugenLage(admins) {
  const dualRechte = ["users.delete", "users.role.grant"];
  const aktive = admins.filter((a) => a.status === "active");
  const ergebnis = dualRechte.map((recht) => {
    const berechtigte = aktive.filter((a) => can(a.rolle, recht) === GRANT.dual);
    return {
      recht,
      berechtigte: berechtigte.length,
      moeglich: berechtigte.length >= 2,
      wer: berechtigte.map((a) => a.email)
    };
  });
  const blockiert = ergebnis.filter((e) => !e.moeglich);
  return {
    rechte: ergebnis,
    erfuellt: blockiert.length === 0,
    hinweis: blockiert.length === 0
      ? "Fuer jedes Vier-Augen-Recht gibt es mindestens zwei aktive Zugaenge."
      : "Mit weniger als zwei Berechtigten ist die Aktion nicht abgesichert, sondern unmoeglich: "
        + "der Antragsteller darf die eigene Anfrage nicht freigeben."
  };
}

/**
 * Der Notzugang laeuft ueber SMEJJ_ADMIN_OWNER_EMAILS: diese Adressen gelten
 * auch dann als Owner, wenn im Verzeichnis nichts steht. Genau das ist der
 * Weg zurueck, wenn eine Rollenvergabe schiefgeht — und genau deshalb gehoert
 * sichtbar hin, welche Adressen das sind.
 */
export function notzugangsLage(env, admins) {
  // bootstrapOwnerEmails liefert eine Menge, keine Liste — sortiert, damit die
  // Reihenfolge bei jedem Aufruf dieselbe ist.
  const adressen = [...bootstrapOwnerEmails(env)].sort();
  const bekannt = new Map(admins.map((a) => [String(a.email || "").toLowerCase(), a]));
  const eintraege = adressen.map((adresse) => {
    const konto = bekannt.get(adresse);
    return {
      email: adresse,
      kontoVorhanden: Boolean(konto),
      rolleImVerzeichnis: konto?.rolle || null,
      status: konto?.status || null
    };
  });
  return {
    eingerichtet: eintraege.length > 0,
    anzahl: eintraege.length,
    eintraege,
    ohneKonto: eintraege.filter((e) => !e.kontoVorhanden).length,
    hinweis: eintraege.length === 0
      ? "Kein Notzugang hinterlegt. Geht die letzte Owner-Rolle verloren, kommt niemand mehr herein."
      : "Diese Adressen gelten als Owner, auch wenn im Verzeichnis nichts steht. "
        + "Sie sind der Weg zurueck — und muessen deshalb selbst besonders geschuetzt sein."
  };
}

function oeffentlich(eintrag, jetztMs) {
  const gesperrtBis = eintrag.loginLockedUntil ? Date.parse(eintrag.loginLockedUntil) : NaN;
  return {
    userId: eintrag.userId,
    email: eintrag.email,
    name: eintrag.name,
    rolle: String(eintrag.role || "").toLowerCase(),
    status: eintrag.status,
    anmeldeart: eintrag.method,
    emailBestaetigt: eintrag.emailVerified === true,
    seit: eintrag.createdAt || null,
    offeneSitzungen: Number(eintrag.activeSessions || 0),
    angemeldetGesperrt: Number.isFinite(gesperrtBis) && gesperrtBis > jetztMs
  };
}

/** Owner zuerst, dann nach Rolle, innerhalb der Rolle nach Adresse. */
function sortiere(a, b) {
  const reihenfolge = ADMIN_ROLES;
  const links = reihenfolge.indexOf(a.rolle);
  const rechts = reihenfolge.indexOf(b.rolle);
  const unterschied = (links < 0 ? 99 : links) - (rechts < 0 ? 99 : rechts);
  if (unterschied !== 0) return unterschied;
  return String(a.email || "").localeCompare(String(b.email || ""));
}

function nachRollen(admins) {
  return ADMIN_ROLES.map((rolle) => ({
    rolle,
    anzahl: admins.filter((a) => a.rolle === rolle).length,
    aktiv: admins.filter((a) => a.rolle === rolle && a.status === "active").length
  })).filter((r) => r.anzahl > 0);
}
