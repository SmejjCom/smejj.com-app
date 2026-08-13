// smejj.com — Verlauf-Sync Stufe 3 (docs/verlauf-pro-konto-plan.md).
//
// Zweck: Der Chat-Verlauf soll dem KONTO folgen, nicht dem Geraet — wie bei
// Claude/ChatGPT. Ablage: IDrive e2 unter `chats/<userId>/<chatId>.json`.
//
// Drei Grundsaetze, die hier alles bestimmen:
//
// 1. FAIL-CLOSED UND AUS. Ohne `SMEJJ_CHAT_SYNC_ENABLED=1` passiert nichts.
//    Chats sind Nutzerinhalte; sie verlassen das Geraet erst, wenn der Betreiber
//    das ausdruecklich einschaltet (und die Datenschutzerklaerung das deckt).
// 2. DER SERVER GLAUBT DEM CLIENT NICHT. userId kommt IMMER aus der geprueften
//    Sitzung, nie aus dem Datensatz. Sonst koennte ein Aufrufer in fremde
//    Ablagen schreiben — genau die Trennung, die Stufe 2 lokal hergestellt hat.
// 3. GRENZEN VOR SPEICHERPLATZ. Zu grosse oder zu viele Chats werden abgewiesen
//    bzw. gekappt, damit ein Endlos-Verlauf keine Kosten treibt.

import { signedS3Delete, signedS3Get, signedS3List, signedS3Put } from "../storage/s3Signer.js";

export const PRAEFIX = "chats";
export const MAX_CHATS_PRO_KONTO = 100;
export const MAX_CHAT_BYTES = 512 * 1024; // ein Chat mit 8 Fassungen bleibt klar darunter
// S3-Schreibwege ohne Zeitlimit scheitern STILL (Befund 2026-08-xx, S3-Timeout).
export const S3_TIMEOUT_MS = 2500;

export function syncAktiv(env = process.env) {
  return /^(1|true|yes|on)$/i.test(String(env.SMEJJ_CHAT_SYNC_ENABLED || ""));
}

export function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

// Aus der Sitzung eine stabile, dateisystem-sichere Kontokennung machen —
// dieselbe Regel wie im Frontend (auth-page.js), damit beide Seiten denselben
// Nutzer meinen.
export function kontoKennung(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  if (email) return `user_${email.replace(/[^a-z0-9]+/g, "_")}`;
  const id = String(user?.sub || user?.userId || "").trim().toLowerCase();
  return id ? `user_${id.replace(/[^a-z0-9]+/g, "_")}` : "";
}

// Chat-Kennungen kommen vom Client. Alles, was nicht wie eine Kennung aussieht,
// wird abgewiesen — ein "../" darin waere ein Weg in fremde Ablagen.
export function chatKennungGueltig(id) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ""));
}

export function schluessel(kontoId, chatId) {
  return `${PRAEFIX}/${kontoId}/${chatId}.json`;
}

/**
 * Pruefen, ob ein eingehender Chat gespeichert werden darf.
 * Reine Funktion — der Test braucht keinen Speicher.
 * @returns {{ok: true, chat: object} | {ok: false, error: string}}
 */
export function pruefeChat(roh, { maxBytes = MAX_CHAT_BYTES } = {}) {
  if (!roh || typeof roh !== "object") return { ok: false, error: "chat_ungueltig" };
  if (!chatKennungGueltig(roh.id)) return { ok: false, error: "chat_id_ungueltig" };
  if (!Array.isArray(roh.messages)) return { ok: false, error: "nachrichten_fehlen" };
  const updatedAt = String(roh.updatedAt || "");
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return { ok: false, error: "zeitstempel_ungueltig" };
  const groesse = Buffer.byteLength(JSON.stringify(roh), "utf8");
  if (groesse > maxBytes) return { ok: false, error: "chat_zu_gross" };
  return { ok: true, chat: roh };
}

/**
 * Wer gewinnt bei einem Konflikt? Der juengere Stand.
 * Gleichstand heisst: nichts tun — sonst schreiben zwei Geraete sich gegenseitig
 * im Kreis, ohne dass sich etwas aendert.
 * @returns {"neu"|"server"|"gleich"}
 */
export function konfliktSieger(neuUpdatedAt, serverUpdatedAt) {
  const a = Date.parse(String(neuUpdatedAt || "")) || 0;
  const b = Date.parse(String(serverUpdatedAt || "")) || 0;
  if (a > b) return "neu";
  if (b > a) return "server";
  return "gleich";
}

/** Legt einen Chat ab (nur wenn er juenger ist als der gespeicherte Stand). */
export async function speichereChat({ kontoId, chat, env = process.env, fetchImpl = fetch }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  const key = schluessel(kontoId, chat.id);
  let vorhanden = null;
  try {
    const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
    if (antwort?.body) vorhanden = JSON.parse(antwort.body);
  } catch { vorhanden = null; }
  if (vorhanden && konfliktSieger(chat.updatedAt, vorhanden.updatedAt) !== "neu") {
    return { ok: true, uebersprungen: true, grund: "server_ist_neuer" };
  }
  await signedS3Put({
    ...cfg,
    key,
    body: `${JSON.stringify({ ...chat, ownerId: kontoId }, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
    fetchImpl,
    timeoutMs: S3_TIMEOUT_MS
  });
  return { ok: true, key };
}

/** Holt alle Chats eines Kontos, juengste zuerst. */
export async function ladeChats({ kontoId, env = process.env, fetchImpl = fetch, limit = MAX_CHATS_PRO_KONTO }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet", chats: [] };
  const prefix = `${PRAEFIX}/${kontoId}/`;
  let schluesselListe = [];
  try {
    const { body } = await signedS3List({ ...cfg, prefix, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
    schluesselListe = [...String(body || "").matchAll(/<Key>([^<]+)<\/Key>/g)].map((treffer) => treffer[1]);
  } catch (error) {
    return { ok: false, error: String(error?.message || "liste_fehlgeschlagen").slice(0, 160), chats: [] };
  }
  const chats = [];
  for (const key of schluesselListe.slice(0, limit)) {
    try {
      const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
      if (antwort?.body) chats.push(JSON.parse(antwort.body));
    } catch { /* ein defekter Eintrag darf den Rest nicht verhindern */ }
  }
  chats.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return { ok: true, chats };
}

/** Loescht einen Chat serverseitig (Konto-Loeschung und "Chat loeschen"). */
export async function loescheChat({ kontoId, chatId, env = process.env, fetchImpl = fetch }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  await signedS3Delete({ ...cfg, key: schluessel(kontoId, chatId), fetchImpl, timeoutMs: S3_TIMEOUT_MS });
  return { ok: true };
}
