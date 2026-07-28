// smejj.com — Ankuendigungen und Wartungsfenster (Single Responsibility: Mitteilungen).
//
// Ein Banner soll ohne Deploy und ohne Cache-Bump erscheinen und wieder
// verschwinden. Deshalb liegt er hier und nicht im Frontend-Bundle.
//
// Drei Arten, absichtlich unterschieden:
//   hinweis  — neutral, z. B. eine neue Funktion
//   wartung  — geplant, mit Zeitfenster
//   stoerung — laeuft gerade schief, hoechste Dringlichkeit
//
// Der Zeitraum wird bei jedem Lesen gerechnet, nicht durch einen Zeitgeber
// gesetzt: ein Banner, dessen Ende von einem Cron abhaengt, bleibt beim
// naechsten Ausfall genau dann stehen, wenn er es nicht soll.
import { createRecordStore, neueKennung } from "./recordStore.js";

const store = createRecordStore("admin/announcements", { maximal: 200 });

export const ANK_ART = Object.freeze({ hinweis: "hinweis", wartung: "wartung", stoerung: "stoerung" });
export const ANK_ZIEL = Object.freeze({ alle: "alle", angemeldete: "angemeldete", pro: "pro" });

/** Laeuft die Ankuendigung gerade? Wird gerechnet, nie gespeichert. */
export function istAktiv(ankuendigung, nowMs = Date.now()) {
  if (!ankuendigung || ankuendigung.zurueckgezogen) return false;
  const von = new Date(ankuendigung.sichtbarAb || 0).getTime();
  const bis = new Date(ankuendigung.sichtbarBis || 0).getTime();
  if (Number.isNaN(von) || Number.isNaN(bis)) return false;
  return von <= nowMs && nowMs < bis;
}

export function zustand(ankuendigung, nowMs = Date.now()) {
  if (!ankuendigung) return null;
  if (ankuendigung.zurueckgezogen) return "zurueckgezogen";
  if (istAktiv(ankuendigung, nowMs)) return "aktiv";
  return new Date(ankuendigung.sichtbarAb || 0).getTime() > nowMs ? "geplant" : "beendet";
}

export function aufbereiten(ankuendigung, nowMs = Date.now()) {
  if (!ankuendigung) return null;
  return { ...ankuendigung, zustand: zustand(ankuendigung, nowMs), aktiv: istAktiv(ankuendigung, nowMs) };
}

export async function erstelleAnkuendigung({
  art, titel, text, sichtbarAb, sichtbarBis, ziel
}, { actor, env = process.env, nowMs = Date.now() } = {}) {
  const gewaehlt = String(art || "").trim().toLowerCase();
  if (!Object.values(ANK_ART).includes(gewaehlt)) return { ok: false, error: "ankuendigung_art_invalid" };

  const ueberschrift = String(titel || "").trim();
  if (ueberschrift.length < 3 || ueberschrift.length > 120) return { ok: false, error: "ankuendigung_titel_invalid" };
  const inhalt = String(text || "").trim();
  if (inhalt.length < 3 || inhalt.length > 600) return { ok: false, error: "ankuendigung_text_invalid" };

  const von = sichtbarAb ? new Date(sichtbarAb) : new Date(nowMs);
  const bis = sichtbarBis ? new Date(sichtbarBis) : new Date(nowMs + 24 * 60 * 60 * 1000);
  if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime())) return { ok: false, error: "ankuendigung_zeitraum_invalid" };
  if (bis.getTime() <= von.getTime()) return { ok: false, error: "ankuendigung_ende_vor_beginn" };

  const nowIso = new Date(nowMs).toISOString();
  const datensatz = {
    version: 1,
    id: neueKennung("ank"),
    art: gewaehlt,
    titel: ueberschrift,
    text: inhalt,
    ziel: Object.values(ANK_ZIEL).includes(String(ziel || "").toLowerCase())
      ? String(ziel).toLowerCase() : ANK_ZIEL.alle,
    sichtbarAb: von.toISOString(),
    sichtbarBis: bis.toISOString(),
    zurueckgezogen: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    erstelltVon: String(actor?.email || "").slice(0, 254)
  };
  await store.schreib(datensatz, { env });
  return { ok: true, ankuendigung: aufbereiten(datensatz, nowMs) };
}

/**
 * Zieht eine Ankuendigung zurueck. Bewusst kein Loeschen: was einmal angezeigt
 * wurde, gehoert nachvollziehbar dokumentiert — gerade bei Stoerungsmeldungen.
 */
export async function ziehZurueck(id, { actor, env = process.env, nowMs = Date.now() } = {}) {
  const ankuendigung = await store.lies(id, { env });
  if (!ankuendigung) return { ok: false, error: "ankuendigung_not_found" };
  if (ankuendigung.zurueckgezogen) return { ok: false, error: "ankuendigung_no_change" };

  const vorher = aufbereiten(ankuendigung, nowMs);
  const neu = {
    ...ankuendigung,
    zurueckgezogen: true,
    zurueckgezogenAm: new Date(nowMs).toISOString(),
    zurueckgezogenVon: String(actor?.email || "").slice(0, 254),
    updatedAt: new Date(nowMs).toISOString()
  };
  await store.schreib(neu, { env });
  return { ok: true, before: vorher, after: aufbereiten(neu, nowMs) };
}

export async function listeAnkuendigungen({ env = process.env, nowMs = Date.now() } = {}) {
  const ergebnis = await store.liste({ env, aufbereiten: (a) => aufbereiten(a, nowMs) });
  if (!ergebnis.ok) return { ok: false, error: ergebnis.error, ankuendigungen: [] };
  return {
    ok: true,
    total: ergebnis.total,
    aktiv: ergebnis.datensaetze.filter((a) => a.aktiv).length,
    ankuendigungen: ergebnis.datensaetze
  };
}

/**
 * Was ein Client anzeigen soll — nur das Noetige, ohne Verwaltungsdaten.
 * Stoerungen zuerst: wenn etwas kaputt ist, interessiert der Hinweis auf die
 * neue Funktion niemanden.
 */
export async function aktiveFuerClient({ angemeldet = false, plan = "free", env = process.env, nowMs = Date.now() } = {}) {
  const ergebnis = await store.liste({ env, aufbereiten: (a) => aufbereiten(a, nowMs) });
  if (!ergebnis.ok) return { ok: false, error: ergebnis.error, ankuendigungen: [] };

  const rang = { stoerung: 0, wartung: 1, hinweis: 2 };
  const passend = ergebnis.datensaetze
    .filter((a) => a.aktiv)
    .filter((a) => (a.ziel === ANK_ZIEL.alle)
      || (a.ziel === ANK_ZIEL.angemeldete && angemeldet)
      || (a.ziel === ANK_ZIEL.pro && String(plan).toLowerCase() === "pro"))
    .sort((a, b) => (rang[a.art] ?? 9) - (rang[b.art] ?? 9))
    .map((a) => ({ id: a.id, art: a.art, titel: a.titel, text: a.text, bis: a.sichtbarBis }));
  return { ok: true, ankuendigungen: passend };
}

export function __clearAnnouncementsForTests() { store.__leeren(); }
