// smejj.com — Projekte-Sync: Server-Bausteine (2026-08-13).
//
// Projekte sind benannte Sammlungen fuer Chats (chat.projectId zeigt hinein).
// Spiegel der Chat-Architektur aus chatSyncStore.js — gleiche Grundsaetze:
// fail-closed hinter demselben Flag (Projekte sind Teil des Verlauf-Syncs),
// Kontokennung NUR aus der Sitzung, Grenzen vor Speicherplatz, Loeschen als
// Grabstein (der e2-Schluessel darf ohnehin nicht loeschen, und nur der
// Grabstein traegt die Loeschung auf alle Geraete).
//
// Ablage: `projekte/<kontoId>/<projektId>.json` auf IDrive e2.

import { signedS3Get, signedS3List, signedS3Put } from "../storage/s3Signer.js";
import { S3_TIMEOUT_MS, chatKennungGueltig, idriveConfig, konfliktSieger } from "./chatSyncStore.js";

export const PROJEKT_PRAEFIX = "projekte";
export const MAX_PROJEKTE_PRO_KONTO = 50;
// Ein Projekt ist nur {id, ownerId, name, createdAt, updatedAt} — 4 KB decken
// das mit weitem Abstand; alles Groessere ist kein Projekt.
export const MAX_PROJEKT_BYTES = 4096;
export const MAX_PROJEKT_NAME = 60;

export function projektSchluessel(kontoId, projektId) {
  return `${PROJEKT_PRAEFIX}/${kontoId}/${projektId}.json`;
}

/**
 * Pruefen, ob ein eingehendes Projekt gespeichert werden darf.
 * Reine Funktion — der Test braucht keinen Speicher. Ein Grabstein
 * (geloescht: true) ist ohne Namen gueltig; alles Lebende braucht einen.
 * @returns {{ok: true, projekt: object} | {ok: false, error: string}}
 */
export function pruefeProjekt(roh, { maxBytes = MAX_PROJEKT_BYTES } = {}) {
  if (!roh || typeof roh !== "object") return { ok: false, error: "projekt_ungueltig" };
  if (!chatKennungGueltig(roh.id)) return { ok: false, error: "projekt_id_ungueltig" };
  const updatedAt = String(roh.updatedAt || "");
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return { ok: false, error: "zeitstempel_ungueltig" };
  if (roh.geloescht !== true) {
    const name = String(roh.name || "").trim();
    if (!name || name.length > MAX_PROJEKT_NAME) return { ok: false, error: "projekt_name_ungueltig" };
  }
  const groesse = Buffer.byteLength(JSON.stringify(roh), "utf8");
  if (groesse > maxBytes) return { ok: false, error: "projekt_zu_gross" };
  return { ok: true, projekt: roh };
}

/** Legt ein Projekt ab (nur wenn es juenger ist als der gespeicherte Stand). */
export async function speichereProjekt({ kontoId, projekt, env = process.env, fetchImpl = fetch }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  const key = projektSchluessel(kontoId, projekt.id);
  let vorhanden = null;
  try {
    const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
    if (antwort?.body) vorhanden = JSON.parse(antwort.body);
  } catch { vorhanden = null; }
  if (vorhanden && konfliktSieger(projekt.updatedAt, vorhanden.updatedAt) !== "neu") {
    return { ok: true, uebersprungen: true, grund: "server_ist_neuer" };
  }
  await signedS3Put({
    ...cfg,
    key,
    body: `${JSON.stringify({ ...projekt, ownerId: kontoId }, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
    fetchImpl,
    timeoutMs: S3_TIMEOUT_MS
  });
  return { ok: true, key };
}

/** Holt alle Projekte eines Kontos, juengste zuerst. */
export async function ladeProjekte({ kontoId, env = process.env, fetchImpl = fetch, limit = MAX_PROJEKTE_PRO_KONTO }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet", projekte: [] };
  const prefix = `${PROJEKT_PRAEFIX}/${kontoId}/`;
  let schluesselListe = [];
  try {
    const { body } = await signedS3List({ ...cfg, prefix, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
    schluesselListe = [...String(body || "").matchAll(/<Key>([^<]+)<\/Key>/g)].map((treffer) => treffer[1]);
  } catch (error) {
    return { ok: false, error: String(error?.message || "liste_fehlgeschlagen").slice(0, 160), projekte: [] };
  }
  const projekte = [];
  for (const key of schluesselListe.slice(0, limit)) {
    try {
      const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
      if (antwort?.body) projekte.push(JSON.parse(antwort.body));
    } catch { /* ein defekter Eintrag darf den Rest nicht verhindern */ }
  }
  projekte.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return { ok: true, projekte };
}

/**
 * "Loescht" ein Projekt serverseitig — als GRABSTEIN, exakt das Chat-Muster
 * (chatSyncStore.loescheChat): kein S3-Delete moeglich, und nur der Grabstein
 * gewinnt per updatedAt gegen den Push eines Geraets, das das Projekt noch
 * haelt. Der Name wird dabei WIRKLICH entfernt.
 */
export async function loescheProjekt({ kontoId, projektId, env = process.env, fetchImpl = fetch, jetztMs = Date.now() }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  const grabstein = {
    id: projektId,
    ownerId: kontoId,
    geloescht: true,
    updatedAt: new Date(jetztMs).toISOString()
  };
  await signedS3Put({
    ...cfg,
    key: projektSchluessel(kontoId, projektId),
    body: `${JSON.stringify(grabstein, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
    fetchImpl,
    timeoutMs: S3_TIMEOUT_MS
  });
  return { ok: true, grabstein: true };
}
