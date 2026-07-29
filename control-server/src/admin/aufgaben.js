// smejj.com — Modul Y: Aufgaben und Notizen (Single Responsibility: Betreiber-Aufgabenliste).
//
// Die Betreiber-Aufgabenliste gehoert ins System, nicht in eine Markdown-Datei:
// eine Datei kennt keinen Zustaendigen, keine Frist und keinen Bezug zu dem
// Modul, um das es geht — und wer sie zuletzt geaendert hat, steht nur in der
// Git-Historie.
//
// ZWEI ENTSCHEIDUNGEN, die von den uebrigen Modulen uebernommen sind:
//
//   - ERLEDIGEN BRAUCHT EINEN NACHWEIS (mindestens 5 Zeichen), genau wie der
//     Abschluss eines DSGVO-Vorgangs. Eine Aufgabe, die ohne Wort verschwindet,
//     ist spaeter nicht von "vergessen" zu unterscheiden.
//   - NICHTS WIRD GELOESCHT. Erledigt und verworfen sind Zustaende, keine
//     Entfernung. Eine Liste, aus der Dinge spurlos verschwinden, taugt nicht
//     als Nachweis.
import { createRecordStore } from "./recordStore.js";

const store = createRecordStore("admin/aufgaben");

export const AUFGABE_STATUS = Object.freeze({
  offen: "offen",
  inArbeit: "in_arbeit",
  erledigt: "erledigt",
  verworfen: "verworfen"
});

// Bezug auf ein Modul des Adminbereichs — damit eine Aufgabe dort landet, wo
// man sie braucht, statt in einer allgemeinen Liste zu versanden.
const BEREICHE = Object.freeze([
  "allgemein", "nutzer", "sicherheit", "recht", "betrieb", "geld", "produkt"
]);

const TAG_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT = 400;

export async function erfasseAufgabe(eingabe = {}, { actor, env = process.env, jetztMs = Date.now() } = {}) {
  const titel = String(eingabe.titel || "").trim().slice(0, 160);
  if (titel.length < 5) return { ok: false, error: "aufgabe_titel_zu_kurz", hinweis: "Mindestens 5 Zeichen." };

  const bereich = String(eingabe.bereich || "allgemein").trim().toLowerCase();
  if (!BEREICHE.includes(bereich)) return { ok: false, error: "aufgabe_bereich_unbekannt", erlaubt: BEREICHE };

  const faelligAm = eingabe.faelligAm ? `${String(eingabe.faelligAm).slice(0, 10)}T00:00:00.000Z` : null;
  if (faelligAm && !Number.isFinite(Date.parse(faelligAm))) return { ok: false, error: "aufgabe_frist_ungueltig" };

  const aufgabe = {
    id: `auf_${zufall()}`,
    titel,
    notiz: String(eingabe.notiz || "").trim().slice(0, MAX_TEXT),
    bereich,
    status: AUFGABE_STATUS.offen,
    zustaendig: String(eingabe.zustaendig || "").trim().toLowerCase().slice(0, 160) || null,
    faelligAm,
    erstelltAm: new Date(jetztMs).toISOString(),
    erstelltVon: actor?.email || "",
    geaendertAm: new Date(jetztMs).toISOString(),
    nachweis: null,
    abgeschlossenVon: null
  };
  await store.schreib(aufgabe, { env });
  return { ok: true, aufgabe: aufbereiten(aufgabe, jetztMs) };
}

export async function setzeAufgabenStatus(id, status, { nachweis = "", actor, env = process.env, jetztMs = Date.now() } = {}) {
  const ziel = String(status || "").trim().toLowerCase();
  if (!Object.values(AUFGABE_STATUS).includes(ziel)) return { ok: false, error: "aufgabe_status_unbekannt" };

  const alt = await store.lies(id, { env });
  if (!alt) return { ok: false, error: "aufgabe_not_found" };
  if (alt.status === ziel) return { ok: false, error: "aufgabe_no_change" };

  // Abschliessen und Verwerfen brauchen ein Wort. Eine Aufgabe, die ohne
  // Begruendung verschwindet, ist spaeter nicht von "vergessen" zu unterscheiden.
  const abschluss = ziel === AUFGABE_STATUS.erledigt || ziel === AUFGABE_STATUS.verworfen;
  const text = String(nachweis || "").trim().slice(0, MAX_TEXT);
  if (abschluss && text.length < 5) {
    return { ok: false, error: "aufgabe_nachweis_noetig", hinweis: "Mindestens 5 Zeichen." };
  }

  const neu = {
    ...alt,
    status: ziel,
    geaendertAm: new Date(jetztMs).toISOString(),
    ...(abschluss ? { nachweis: text, abgeschlossenVon: actor?.email || "" } : {})
  };
  await store.schreib(neu, { env });
  return { ok: true, before: aufbereiten(alt, jetztMs), after: aufbereiten(neu, jetztMs) };
}

/** Offene zuerst, darin die dringendsten. Nichts wird ausgeblendet. */
export async function listeAufgaben({ env = process.env, jetztMs = Date.now() } = {}) {
  const ergebnis = await store.liste({ env, aufbereiten: (a) => aufbereiten(a, jetztMs) });
  if (!ergebnis.ok) return { ok: false, error: ergebnis.error, aufgaben: [] };

  const rang = { offen: 0, in_arbeit: 1, erledigt: 2, verworfen: 3 };
  const sortiert = [...ergebnis.datensaetze].sort((a, b) => {
    const unterschied = (rang[a.status] ?? 9) - (rang[b.status] ?? 9);
    if (unterschied !== 0) return unterschied;
    // Innerhalb der offenen: was eine Frist hat und naeher dran ist, steht oben.
    const fa = a.restfristTage ?? 9999;
    const fb = b.restfristTage ?? 9999;
    return fa - fb;
  });

  const offen = sortiert.filter((a) => [AUFGABE_STATUS.offen, AUFGABE_STATUS.inArbeit].includes(a.status));
  return {
    ok: true,
    total: ergebnis.total,
    offen: offen.length,
    ueberfaellig: offen.filter((a) => (a.restfristTage ?? 1) < 0).length,
    ohneZustaendige: offen.filter((a) => !a.zustaendig).length,
    aufgaben: sortiert,
    bereiche: BEREICHE,
    hinweis: "Nichts wird geloescht: erledigt und verworfen sind Zustaende. Der Abschluss "
      + "braucht einen Nachweis — sonst ist er spaeter nicht von \"vergessen\" zu unterscheiden."
  };
}

function aufbereiten(a, jetztMs) {
  const faelligMs = a.faelligAm ? Date.parse(a.faelligAm) : NaN;
  return {
    ...a,
    restfristTage: Number.isFinite(faelligMs) ? Math.ceil((faelligMs - jetztMs) / TAG_MS) : null,
    abgeschlossen: [AUFGABE_STATUS.erledigt, AUFGABE_STATUS.verworfen].includes(a.status)
  };
}

function zufall() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function __clearAufgabenForTests() { store.__leeren(); }
