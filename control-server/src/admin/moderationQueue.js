// smejj.com — Missbrauch und Moderation (Single Responsibility: Auffaelligkeiten entscheiden).
//
// Der Zweck ist nicht, automatisch zu sperren. Der Zweck ist, dass
// Auffaelligkeiten als **Warteschlange mit Entscheidung und Begruendung**
// erscheinen statt als Bauchgefuehl.
//
// Deshalb gilt hier ausdruecklich: **keine automatische Sperre.** Ein Signal
// ist ein Verdacht, kein Urteil. Fehlalarme treffen echte Menschen, und ein
// automatisch gesperrtes Konto merkt niemand, bis sich jemand beschwert. Die
// Erkennung schlaegt vor; ein Mensch entscheidet und begruendet.
//
// Die Signale selbst werden hier NICHT berechnet — das taeten Auswertungen an
// anderer Stelle. Dieses Modul nimmt sie entgegen, haelt sie fest und
// dokumentiert die Entscheidung.
import { createRecordStore, neueKennung } from "./recordStore.js";

const store = createRecordStore("admin/moderation", { maximal: 500 });

export const SIGNAL_ART = Object.freeze({
  tokenAusreisser: "token_ausreisser",
  registrierungswelle: "registrierungswelle",
  wegwerfAdresse: "wegwerf_adresse",
  anfragefrequenz: "anfragefrequenz",
  meldung: "meldung"
});

export const SCHWERE = Object.freeze({ hoch: "hoch", mittel: "mittel", niedrig: "niedrig" });

export const MOD_STATUS = Object.freeze({
  offen: "offen",
  inPruefung: "in_pruefung",
  bestaetigt: "bestaetigt",   // Missbrauch bestaetigt
  entwarnung: "entwarnung"    // Fehlalarm
});

const RANG = { hoch: 0, mittel: 1, niedrig: 2 };

/** Nimmt ein Signal entgegen. Es passiert nichts weiter — das ist Absicht. */
export async function meldeSignal({
  art, subjekt, beleg, schwere
}, { actor, env = process.env, nowMs = Date.now() } = {}) {
  const gewaehlt = String(art || "").trim().toLowerCase();
  if (!Object.values(SIGNAL_ART).includes(gewaehlt)) {
    return { ok: false, error: "moderation_art_invalid", erlaubt: Object.values(SIGNAL_ART) };
  }
  const ziel = String(subjekt || "").trim();
  if (!ziel) return { ok: false, error: "moderation_subjekt_required" };
  const nachweis = String(beleg || "").trim();
  if (nachweis.length < 5) {
    return { ok: false, error: "moderation_beleg_required", hinweis: "Ein Signal ohne Beleg ist ein Geruecht." };
  }

  const nowIso = new Date(nowMs).toISOString();
  const datensatz = {
    version: 1,
    id: neueKennung("mod"),
    art: gewaehlt,
    subjekt: ziel.slice(0, 254),
    beleg: nachweis.slice(0, 500),
    schwere: Object.values(SCHWERE).includes(String(schwere || "").toLowerCase())
      ? String(schwere).toLowerCase() : SCHWERE.mittel,
    status: MOD_STATUS.offen,
    createdAt: nowIso,
    updatedAt: nowIso,
    gemeldetVon: String(actor?.email || "system").slice(0, 254),
    entschiedenVon: null,
    entschiedenAm: null,
    entscheidungsgrund: null,
    massnahme: null
  };
  await store.schreib(datensatz, { env });
  return { ok: true, signal: datensatz };
}

/**
 * Entscheidet ueber ein Signal. Die Begruendung ist Pflicht — sie ist das
 * Einzige, was einen Fehlalarm spaeter von einer richtigen Entscheidung
 * unterscheidbar macht.
 *
 * Wichtig: Diese Funktion sperrt NICHTS. Sie haelt die Entscheidung fest.
 * Das Sperren laeuft ueber die regulaere Kontoaktion mit eigenem Nachweis —
 * damit gibt es keinen zweiten, stilleren Weg zur Sperre.
 */
export async function entscheide(id, { bewertung, begruendung, massnahme }, {
  actor, env = process.env, nowMs = Date.now()
} = {}) {
  const ziel = String(bewertung || "").trim().toLowerCase();
  if (![MOD_STATUS.bestaetigt, MOD_STATUS.entwarnung, MOD_STATUS.inPruefung].includes(ziel)) {
    return { ok: false, error: "moderation_bewertung_invalid" };
  }
  const grund = String(begruendung || "").trim();
  if (grund.length < 10) {
    return { ok: false, error: "moderation_begruendung_required", hinweis: "Mindestens zehn Zeichen — eine Entscheidung ohne Begruendung ist keine." };
  }

  const signal = await store.lies(id, { env });
  if (!signal) return { ok: false, error: "moderation_not_found" };
  if ([MOD_STATUS.bestaetigt, MOD_STATUS.entwarnung].includes(signal.status)) {
    return { ok: false, error: "moderation_already_decided", status: signal.status };
  }

  const nowIso = new Date(nowMs).toISOString();
  const vorher = { status: signal.status, schwere: signal.schwere };
  const neu = {
    ...signal,
    status: ziel,
    updatedAt: nowIso,
    entschiedenVon: String(actor?.email || "").slice(0, 254),
    entschiedenAm: ziel === MOD_STATUS.inPruefung ? null : nowIso,
    entscheidungsgrund: grund.slice(0, 500),
    massnahme: String(massnahme || "").trim().slice(0, 200) || null
  };
  await store.schreib(neu, { env });
  return {
    ok: true,
    before: vorher,
    after: { status: neu.status, massnahme: neu.massnahme },
    hinweis: ziel === MOD_STATUS.bestaetigt
      ? "Entscheidung festgehalten. Das Sperren laeuft getrennt ueber die Kontoaktion — mit eigenem Grund und eigenem Nachweis."
      : undefined
  };
}

/** Warteschlange: offene zuerst, darin nach Schwere. Erledigtes faellt nach hinten. */
export async function listeSignale({ env = process.env } = {}) {
  const ergebnis = await store.liste({ env });
  if (!ergebnis.ok) return { ok: false, error: ergebnis.error, signale: [] };

  const offen = (s) => [MOD_STATUS.offen, MOD_STATUS.inPruefung].includes(s.status);
  const sortiert = [...ergebnis.datensaetze].sort((a, b) => {
    if (offen(a) !== offen(b)) return offen(a) ? -1 : 1;
    const nachSchwere = (RANG[a.schwere] ?? 9) - (RANG[b.schwere] ?? 9);
    return nachSchwere !== 0 ? nachSchwere : String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return {
    ok: true,
    total: ergebnis.total,
    offen: sortiert.filter(offen).length,
    hoch: sortiert.filter((s) => offen(s) && s.schwere === SCHWERE.hoch).length,
    signale: sortiert
  };
}

export function __clearModerationForTests() { store.__leeren(); }
