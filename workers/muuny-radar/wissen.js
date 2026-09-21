// muuny ai radar — die Wissensbasis: versioniert, mit Herkunft, zuruecknehmbar.
//
// Wahrheit ist der INDEX (`<prefix>wissen/index.json`). Jede Fassung eines Eintrags
// liegt zusaetzlich unveraenderlich unter `wissen/versionen/<id>/<version>.json` —
// daraus wird zurueckgenommen. Geschrieben wird immer: erst die Fassungen, ZULETZT der
// Index. Faellt das Lager mittendrin aus, bleibt der alte Index gueltig; halb
// geschriebene Fassungen sind dann nur verwaiste Dateien, nie falsches Wissen.
//
// Ein Eintrag ist AKTIV (darf in Antworten), VERALTET (eine neuere geprüfte Fassung
// derselben Sache existiert — bleibt lesbar, wird aber so gekennzeichnet) oder
// ZURUECKGENOMMEN (per Admin oder Rueckgaengig; nie in Antworten).
//
// Modellgewichte beruehrt dieses Modul nie, und nichts von hier geht automatisch
// ins Training. Das ist keine Konfiguration, sondern es gibt schlicht keinen Weg.
import { createHash } from "node:crypto";

export const MAX_EINTRAEGE = 5000;

export function wissenSchluessel(prefix = "muuny/") {
  return {
    index: `${prefix}wissen/index.json`,
    versionen: `${prefix}wissen/versionen`,
    radar: `${prefix}radar`
  };
}

export function eintragId(schluessel) {
  return createHash("sha256").update(schluessel).digest("hex").slice(0, 16);
}

export function leererIndex() {
  return { format: 1, stand: 0, aktualisiert: null, eintraege: {} };
}

export async function leseIndex(lager, prefix) {
  const i = await lager.getJson(wissenSchluessel(prefix).index, null);
  if (i === null) return leererIndex();
  if (!i || typeof i !== "object" || !i.eintraege) throw new Error("wissensindex_unlesbar");
  return i;
}

/** Bestand fuer pruefeFunde: Schluessel -> Kern, plus die bekannten Zahlen. */
export function bestandAus(index) {
  const b = new Map();
  for (const e of Object.values(index.eintraege)) {
    if (e.status === "zurueckgenommen") continue;
    b.set(e.schluessel, { kernHash: e.kernHash, kurz: e.kurz });
    if (e.status !== "aktiv") continue;
    for (const z of e.zahlen || []) {
      const k = `zahl:${z.schluessel}`;
      const eintrag = b.get(k) || { werte: [] };
      eintrag.werte.push({ wert: z.wert, domain: z.domain });
      b.set(k, eintrag);
    }
  }
  return b;
}

/** Wie sicher ist ein Eintrag? Wird in jeder Antwort mitgegeben. */
export function unsicherheitVon(ergebnis) {
  const gruende = [];
  if (!ergebnis.quellen.some((q) => q.primaer)) gruende.push("nur_sekundaerquellen");
  if (ergebnis.quellen.length < 2 && !ergebnis.quellen.some((q) => q.primaer)) gruende.push("eine_quelle");
  if (!ergebnis.fund.veroeffentlicht) gruende.push("datum_unbekannt");
  if (String(ergebnis.fund.quelleId || "").startsWith("arxiv")) gruende.push("preprint_nicht_begutachtet");
  return { stufe: gruende.length ? "mittel" : "niedrig", gruende };
}

function kurzAus(fund) {
  const t = String(fund.text || "").replace(/\s+/g, " ").trim();
  return t.length > 400 ? `${t.slice(0, 397)}…` : t;
}

/** Releases desselben Repos: eine neuere macht die aeltere VERALTET. */
function releaseFamilie(schluessel) {
  const m = /^release:([^:]+):/.exec(schluessel);
  return m ? m[1] : null;
}

/**
 * Schreibt die geprueften Ergebnisse eines Laufs.
 * @returns {{gespeichert:[{id,schluessel,art}], veraltet:[id], index}}
 */
export async function speichere(lager, prefix, ergebnisse, { laufId, jetzt = new Date() }) {
  const s = wissenSchluessel(prefix);
  const index = await leseIndex(lager, prefix);
  const neu = structuredClone(index);
  const gespeichert = [];
  const veraltet = [];
  const schreiben = [];

  for (const r of ergebnisse) {
    if (r.status !== "geprueft" && r.status !== "aktualisiert") continue;
    const id = eintragId(r.schluessel);
    const alt = neu.eintraege[id];
    const version = (alt?.version || 0) + 1;
    const eintrag = {
      id, schluessel: r.schluessel, themaId: r.themaId, version, status: "aktiv",
      titel: r.fund.titel, kurz: kurzAus(r.fund), link: r.fund.link, anbieter: r.fund.anbieter,
      quellen: r.quellen, veroeffentlicht: r.fund.veroeffentlicht, abgerufen: jetzt.toISOString(),
      pruefgrund: r.grund, unsicherheit: unsicherheitVon(r), kernHash: r.kernHash,
      zahlen: r.zahlen, modelle: r.modelle, laufId, vorgaengerVersion: alt ? alt.version : null
    };
    schreiben.push([`${s.versionen}/${id}/${version}.json`, eintrag]);
    neu.eintraege[id] = eintrag;
    gespeichert.push({ id, schluessel: r.schluessel, art: alt ? "aktualisiert" : "neu" });
  }

  // Veraltet: aeltere Releases desselben Repos, sobald ein neueres geprueft da ist.
  const neuesteJeFamilie = new Map();
  for (const e of Object.values(neu.eintraege)) {
    const f = releaseFamilie(e.schluessel);
    if (!f || e.status === "zurueckgenommen") continue;
    const d = new Date(e.veroeffentlicht || 0).getTime();
    if (!neuesteJeFamilie.has(f) || d > neuesteJeFamilie.get(f).d) neuesteJeFamilie.set(f, { d, id: e.id });
  }
  for (const e of Object.values(neu.eintraege)) {
    const f = releaseFamilie(e.schluessel);
    if (!f || e.status !== "aktiv") continue;
    const neueste = neuesteJeFamilie.get(f);
    if (neueste.id !== e.id) {
      e.status = "veraltet";
      e.ersetztDurch = neueste.id;
      e.veraltetSeit = jetzt.toISOString();
      e.veraltetDurchLauf = laufId;
      veraltet.push(e.id);
    }
  }

  // Deckel: die aeltesten VERALTETEN gehen zuerst aus dem Index (ihre Fassungen bleiben).
  const ids = Object.keys(neu.eintraege);
  if (ids.length > MAX_EINTRAEGE) {
    const weg = ids.filter((i) => neu.eintraege[i].status !== "aktiv")
      .sort((a, b) => String(neu.eintraege[a].abgerufen).localeCompare(String(neu.eintraege[b].abgerufen)))
      .slice(0, ids.length - MAX_EINTRAEGE);
    for (const i of weg) delete neu.eintraege[i];
  }

  if (!gespeichert.length && !veraltet.length) return { gespeichert, veraltet, index };
  for (const [k, v] of schreiben) await lager.putJson(k, v);
  neu.stand = (index.stand || 0) + 1;
  neu.aktualisiert = jetzt.toISOString();
  await lager.putJson(s.index, neu);
  return { gespeichert, veraltet, index: neu };
}

/**
 * Nimmt alles zurueck, was ein Lauf geschrieben hat: neue Eintraege werden
 * ZURUECKGENOMMEN, aktualisierte bekommen ihre Vorgaengerfassung zurueck, und was
 * er als veraltet markiert hat, wird wieder aktiv. Loescht nichts.
 */
export async function rueckgaengig(lager, prefix, laufId, { jetzt = new Date(), wer = "admin" } = {}) {
  const s = wissenSchluessel(prefix);
  const index = await leseIndex(lager, prefix);
  const neu = structuredClone(index);
  const geaendert = [];
  for (const e of Object.values(neu.eintraege)) {
    if (e.laufId === laufId && e.status !== "zurueckgenommen") {
      if (e.vorgaengerVersion) {
        const alt = await lager.getJson(`${s.versionen}/${e.id}/${e.vorgaengerVersion}.json`, null);
        if (!alt) throw new Error(`vorgaenger_fehlt:${e.id}@${e.vorgaengerVersion}`);
        neu.eintraege[e.id] = { ...alt, status: "aktiv", wiederhergestellt: { am: jetzt.toISOString(), von: laufId, wer } };
      } else {
        neu.eintraege[e.id] = { ...e, status: "zurueckgenommen", zurueckgenommen: { am: jetzt.toISOString(), lauf: laufId, wer } };
      }
      geaendert.push(e.id);
    } else if (e.veraltetDurchLauf === laufId && e.status === "veraltet") {
      const { ersetztDurch, veraltetSeit, veraltetDurchLauf, ...rest } = e;
      neu.eintraege[e.id] = { ...rest, status: "aktiv" };
      geaendert.push(e.id);
    }
  }
  if (!geaendert.length) return { geaendert };
  neu.stand = (index.stand || 0) + 1;
  neu.aktualisiert = jetzt.toISOString();
  await lager.putJson(s.index, neu);
  return { geaendert };
}

/** Einen einzelnen Eintrag zuruecknehmen (Admin: "das stimmt nicht"). */
export async function nimmZurueck(lager, prefix, id, { jetzt = new Date(), wer = "admin", grund = "" } = {}) {
  const index = await leseIndex(lager, prefix);
  const e = index.eintraege[id];
  if (!e) return { ok: false, grund: "unbekannt" };
  e.status = "zurueckgenommen";
  e.zurueckgenommen = { am: jetzt.toISOString(), wer, grund: String(grund).slice(0, 200) };
  index.stand = (index.stand || 0) + 1;
  index.aktualisiert = jetzt.toISOString();
  await lager.putJson(wissenSchluessel(prefix).index, index);
  return { ok: true };
}

export async function versionenVon(lager, prefix, id) {
  const s = wissenSchluessel(prefix);
  const liste = await lager.liste(`${s.versionen}/${id}/`);
  const out = [];
  for (const { key } of liste.filter((x) => /\/\d+\.json$/.test(x.key) && !/\/\._/.test(x.key))) out.push(await lager.getJson(key, null));
  return out.filter(Boolean).sort((a, b) => a.version - b.version);
}
