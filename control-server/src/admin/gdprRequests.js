// smejj.com — Betroffenenanfragen nach DSGVO (Single Responsibility: Fristen und Nachweis).
//
// Auskunft und Loeschung sind bei smejj.com bereits Endpunkte. Was fehlte, war
// das, wonach eine Aufsichtsbehoerde tatsaechlich fragt: **ein Vorgang mit Frist
// und Erledigungsnachweis.** Ein erledigter Endpunkt ohne Aktenlage nuetzt im
// Ernstfall nichts.
//
// Die Frist ist ein Monat ab Eingang (Art. 12 Abs. 3), einmal verlaengerbar um
// zwei Monate bei komplexen Faellen. Der Rest verwaltet sich nicht von selbst:
// die Restzeit wird bei jedem Lesen gerechnet, nie gespeichert — ein
// gespeicherter Countdown waere nach dem naechsten Neustart falsch.
import { createRecordStore, neueKennung } from "./recordStore.js";

const store = createRecordStore("admin/gdpr", { maximal: 500 });

const TAG_MS = 24 * 60 * 60 * 1000;
const FRIST_TAGE = 30;
const VERLAENGERUNG_TAGE = 60;

export const GDPR_ART = Object.freeze({
  auskunft: "auskunft",         // Art. 15
  loeschung: "loeschung",       // Art. 17
  uebertrag: "uebertrag",       // Art. 20
  berichtigung: "berichtigung", // Art. 16
  widerspruch: "widerspruch"    // Art. 21
});

export const GDPR_STATUS = Object.freeze({
  offen: "offen",
  inArbeit: "in_arbeit",
  abgeschlossen: "abgeschlossen",
  abgelehnt: "abgelehnt"
});

const ARTIKEL = Object.freeze({
  auskunft: "Art. 15", loeschung: "Art. 17", uebertrag: "Art. 20",
  berichtigung: "Art. 16", widerspruch: "Art. 21"
});

/** Restfrist in Tagen. Negativ heisst: ueberschritten. Wird gerechnet, nie gespeichert. */
export function restfristTage(vorgang, nowMs = Date.now()) {
  if (!vorgang?.faelligAm) return null;
  return Math.ceil((new Date(vorgang.faelligAm).getTime() - nowMs) / TAG_MS);
}

/** Wie dringend ist das? Fuer die Anzeige — und damit nichts durchrutscht. */
export function dringlichkeit(vorgang, nowMs = Date.now()) {
  if ([GDPR_STATUS.abgeschlossen, GDPR_STATUS.abgelehnt].includes(vorgang?.status)) return "erledigt";
  const rest = restfristTage(vorgang, nowMs);
  if (rest === null) return "unbekannt";
  if (rest < 0) return "ueberschritten";
  if (rest <= 5) return "kritisch";
  if (rest <= 10) return "bald";
  return "im_rahmen";
}

export function aufbereiten(vorgang, nowMs = Date.now()) {
  if (!vorgang) return null;
  return {
    ...vorgang,
    artikel: ARTIKEL[vorgang.art] || "",
    restfristTage: restfristTage(vorgang, nowMs),
    dringlichkeit: dringlichkeit(vorgang, nowMs)
  };
}

/** Erfasst eine Anfrage. Die Frist startet mit dem EINGANG, nicht mit der Erfassung. */
export async function erfasseAnfrage({
  art, betroffeneEmail, eingegangenAm, notiz
}, { actor, env = process.env, nowMs = Date.now() } = {}) {
  const gewaehlt = String(art || "").trim().toLowerCase();
  if (!Object.values(GDPR_ART).includes(gewaehlt)) {
    return { ok: false, error: "gdpr_art_invalid", erlaubt: Object.values(GDPR_ART) };
  }
  const email = String(betroffeneEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "gdpr_email_invalid" };

  // Rueckdatierung ist ausdruecklich erlaubt und wichtig: eine Anfrage, die vor
  // drei Tagen per E-Mail kam, hat schon drei Tage Frist verbraucht.
  const eingang = eingegangenAm ? new Date(`${String(eingegangenAm).slice(0, 10)}T00:00:00.000Z`) : new Date(nowMs);
  if (Number.isNaN(eingang.getTime())) return { ok: false, error: "gdpr_eingang_invalid" };
  if (eingang.getTime() > nowMs + TAG_MS) return { ok: false, error: "gdpr_eingang_in_zukunft" };

  const nowIso = new Date(nowMs).toISOString();
  const datensatz = {
    version: 1,
    id: neueKennung("dsgvo"),
    art: gewaehlt,
    betroffeneEmail: email.slice(0, 254),
    eingegangenAm: eingang.toISOString(),
    faelligAm: new Date(eingang.getTime() + FRIST_TAGE * TAG_MS).toISOString(),
    verlaengert: false,
    status: GDPR_STATUS.offen,
    notiz: String(notiz || "").trim().slice(0, 500),
    createdAt: nowIso,
    updatedAt: nowIso,
    erfasstVon: String(actor?.email || "").slice(0, 254),
    erledigtAm: null,
    nachweis: null,
    bearbeitetVon: null
  };
  await store.schreib(datensatz, { env });
  return { ok: true, vorgang: aufbereiten(datensatz, nowMs) };
}

/** Verlaengert einmalig um zwei Monate (Art. 12 Abs. 3). Ein zweites Mal geht nicht. */
export async function verlaengereFrist(id, begruendung, { actor, env = process.env, nowMs = Date.now() } = {}) {
  const vorgang = await store.lies(id, { env });
  if (!vorgang) return { ok: false, error: "gdpr_not_found" };
  if (vorgang.verlaengert) return { ok: false, error: "gdpr_already_extended" };
  if ([GDPR_STATUS.abgeschlossen, GDPR_STATUS.abgelehnt].includes(vorgang.status)) {
    return { ok: false, error: "gdpr_already_closed" };
  }
  if (String(begruendung || "").trim().length < 10) return { ok: false, error: "gdpr_extension_reason_required" };

  const vorher = aufbereiten(vorgang, nowMs);
  const neu = {
    ...vorgang,
    verlaengert: true,
    verlaengerungsgrund: String(begruendung).trim().slice(0, 400),
    faelligAm: new Date(new Date(vorgang.faelligAm).getTime() + VERLAENGERUNG_TAGE * TAG_MS).toISOString(),
    updatedAt: new Date(nowMs).toISOString()
  };
  await store.schreib(neu, { env });
  return { ok: true, before: vorher, after: aufbereiten(neu, nowMs) };
}

/** Setzt den Stand. Der Abschluss verlangt einen Nachweis — sonst ist er keiner. */
export async function setzeStatus(id, status, { nachweis, actor, env = process.env, nowMs = Date.now() } = {}) {
  const ziel = String(status || "").trim().toLowerCase();
  if (!Object.values(GDPR_STATUS).includes(ziel)) return { ok: false, error: "gdpr_status_invalid" };
  const vorgang = await store.lies(id, { env });
  if (!vorgang) return { ok: false, error: "gdpr_not_found" };
  if (vorgang.status === ziel) return { ok: false, error: "gdpr_no_change" };

  const brauchtNachweis = [GDPR_STATUS.abgeschlossen, GDPR_STATUS.abgelehnt].includes(ziel);
  if (brauchtNachweis && String(nachweis || "").trim().length < 5) {
    return { ok: false, error: "gdpr_nachweis_required" };
  }

  const nowIso = new Date(nowMs).toISOString();
  const vorher = aufbereiten(vorgang, nowMs);
  const neu = {
    ...vorgang,
    status: ziel,
    updatedAt: nowIso,
    bearbeitetVon: String(actor?.email || "").slice(0, 254),
    ...(brauchtNachweis
      ? { erledigtAm: nowIso, nachweis: String(nachweis).trim().slice(0, 500) }
      : {})
  };
  await store.schreib(neu, { env });
  return { ok: true, before: vorher, after: aufbereiten(neu, nowMs) };
}

/** Alle Vorgaenge, dringendste zuerst — nicht neueste zuerst. */
export async function listeAnfragen({ env = process.env, nowMs = Date.now() } = {}) {
  const ergebnis = await store.liste({ env, aufbereiten: (v) => aufbereiten(v, nowMs) });
  if (!ergebnis.ok) return { ok: false, error: ergebnis.error, vorgaenge: [] };

  const rang = { ueberschritten: 0, kritisch: 1, bald: 2, im_rahmen: 3, unbekannt: 4, erledigt: 5 };
  const sortiert = [...ergebnis.datensaetze].sort((a, b) => {
    const unterschied = (rang[a.dringlichkeit] ?? 9) - (rang[b.dringlichkeit] ?? 9);
    return unterschied !== 0 ? unterschied : String(a.faelligAm).localeCompare(String(b.faelligAm));
  });
  return {
    ok: true,
    total: ergebnis.total,
    offen: sortiert.filter((v) => [GDPR_STATUS.offen, GDPR_STATUS.inArbeit].includes(v.status)).length,
    ueberschritten: sortiert.filter((v) => v.dringlichkeit === "ueberschritten").length,
    vorgaenge: sortiert
  };
}

export function __clearGdprForTests() { store.__leeren(); }
