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
  const admins = effektiveZugaenge(alle, env);

  // Zweiter Faktor je Zugang. Begrenzt parallel: das sind wenige Konten, aber
  // eine Schleife mit einem GET je Eintrag ist genau die Falle aus Stufe 3.
  const mitFaktor = await mapMitGrenze(admins, async (a) => {
    let faktoren = 0;
    if (!a.userId) return { ...oeffentlich(a, jetztMs), zweiterFaktor: -1 };
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
 * WER KANN TATSAECHLICH HEREIN — nicht: wer steht mit einer Rolle im Verzeichnis.
 *
 * Live gefunden (28.07.2026): die Ansicht meldete "0 Zugaenge", waehrend ein
 * Owner angemeldet war. Grund: dessen Rolle kommt aus
 * SMEJJ_ADMIN_OWNER_EMAILS, nicht aus einem Rollenfeld. `resolveAdminActor`
 * erteilt diesen Adressen Owner-Rechte auch ganz ohne Verzeichniseintrag —
 * sie sind also vollwertige Zugaenge und muessen mitgezaehlt werden.
 *
 * Eine Sicherheitsuebersicht, die wirksame Zugaenge uebersieht, ist schlimmer
 * als keine: sie behauptet Leere, wo Macht liegt.
 *
 * Der Status wird dabei genau so abgebildet wie in der Pruefung: ein
 * hinterlegtes, aber gesperrtes Konto kommt NICHT herein, auch nicht als
 * Notzugang. Ohne Konto gibt es nichts zu sperren — dann gilt der Zugang.
 */
export function effektiveZugaenge(alleKonten, env) {
  const rollen = new Set(ADMIN_ROLES);
  const bootstrap = new Set([...bootstrapOwnerEmails(env)]);
  const nachEmail = new Map(alleKonten.map((e) => [String(e.email || "").toLowerCase(), e]));
  const ergebnis = new Map();

  for (const eintrag of alleKonten) {
    const email = String(eintrag.email || "").toLowerCase();
    const gespeichert = String(eintrag.role || "").toLowerCase();
    const istNotzugang = bootstrap.has(email);
    if (!rollen.has(gespeichert) && !istNotzugang) continue;
    ergebnis.set(email, {
      ...eintrag,
      // Bootstrap gewinnt nur nach oben — genau wie in resolveAdminActor.
      role: istNotzugang ? "owner" : gespeichert,
      herkunft: istNotzugang ? (rollen.has(gespeichert) ? "beides" : "notzugang") : "verzeichnis",
      imVerzeichnis: true
    });
  }

  for (const email of bootstrap) {
    if (ergebnis.has(email)) continue;
    if (nachEmail.has(email)) continue;
    ergebnis.set(email, {
      userId: "", email, name: "", method: "", role: "owner",
      // Ohne Konto gibt es nichts zu sperren: der Zugang steht.
      status: "active", emailVerified: false, createdAt: null,
      activeSessions: 0, loginLockedUntil: null,
      herkunft: "notzugang", imVerzeichnis: false
    });
  }

  return [...ergebnis.values()];
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
      kontoVorhanden: Boolean(konto) && konto.imVerzeichnis !== false,
      rolleImVerzeichnis: konto && konto.imVerzeichnis !== false ? konto.rolle : null,
      status: konto?.status || null,
      // Wirksam heisst: kommt tatsaechlich herein. Ein gesperrtes Konto nicht.
      wirksam: !konto || konto.status === "active"
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
    angemeldetGesperrt: Number.isFinite(gesperrtBis) && gesperrtBis > jetztMs,
    herkunft: eintrag.herkunft || "verzeichnis",
    imVerzeichnis: eintrag.imVerzeichnis !== false
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
