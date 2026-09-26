// smejj.com — dauerhaftes Register "Bildauftrag -> Medium" (Betreiber-Freigabe 26.09.2026, Punkt 4).
//
// WARUM: Die Bruecke merkt sich fertige Bilder nur im Arbeitsspeicher (chat-bridge-bildablage.js).
// Jede Bruecken-Auslieferung leert ihn, und der Schluessel haengt am Anmelde-Token. Wurde die App
// mitten im Malen beendet und erst nach einem Bruecken-Neustart wieder geoeffnet, war das Bild fuer
// die Rettung verloren, obwohl es fertig gemalt war.
//
// Jetzt legt die Bruecke jedes fertige Bild als normales Medium des KONTOS ab (medienStore, 30 Tage
// Schonfrist auch ohne Chat-Verweis) und traegt hier ein, zu welchem Auftrag es gehoert. Der Schluessel
// ist das Konto (vom Server aus der Sitzung bestimmt) plus der Hash des Auftrags — kein Token, kein
// Klartext im Speicher. Eigener Praefix: der Medien-Aufraeumer listet nur MEDIEN_PRAEFIX/<konto>/.
import crypto from "node:crypto";
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";
import { idriveConfig, syncAktiv } from "./chatSyncStore.js";
import { MEDIEN_PRAEFIX, kennungGueltig, kontoGueltig } from "./medienStore.js";

export const REGISTER_PRAEFIX = `${MEDIEN_PRAEFIX}-auftraege`;
export const REGISTER_GUELTIG_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

/** Hash des Auftrags — Gross/Klein und Leerraum egal (wie in der Bruecke). */
export function auftragHash(auftrag) {
  const text = String(auftrag || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text || text.length > 2000) return "";
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 40);
}

export function registerSchluessel(kontoId, hash) {
  if (!kontoGueltig(kontoId) || !/^[a-f0-9]{40}$/.test(String(hash || ""))) throw new Error("register_schluessel_ungueltig");
  return `${REGISTER_PRAEFIX}/${kontoId}/${hash}.json`;
}

/** Traegt ein: dieser Auftrag hat dieses (schon abgelegte) Medium ergeben. */
export async function merkeBildAuftrag({ kontoId, auftrag, id, env = process.env, fetchImpl = fetch, jetzt = Date.now() }) {
  if (!syncAktiv(env)) return { ok: false, error: "sync_aus" };
  const hash = auftragHash(auftrag);
  if (!hash || !kennungGueltig(id) || !kontoGueltig(kontoId)) return { ok: false, error: "eingabe_ungueltig" };
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "ablage_nicht_konfiguriert" };
  try {
    await signedS3Put({
      ...cfg, key: registerSchluessel(kontoId, hash), fetchImpl, timeoutMs: TIMEOUT_MS,
      body: Buffer.from(JSON.stringify({ id, bis: jetzt + REGISTER_GUELTIG_MS })), contentType: "application/json"
    });
  } catch (fehler) {
    return { ok: false, error: String(fehler?.message || "schreiben_fehlgeschlagen").slice(0, 160) };
  }
  return { ok: true, id };
}

/** Sucht das Medium zu einem Auftrag. {ok:true,id} oder {ok:false} (nichts da / abgelaufen). */
export async function findeBildAuftrag({ kontoId, auftrag, env = process.env, fetchImpl = fetch, jetzt = Date.now() }) {
  if (!syncAktiv(env)) return { ok: false, error: "sync_aus" };
  const hash = auftragHash(auftrag);
  if (!hash || !kontoGueltig(kontoId)) return { ok: false, error: "eingabe_ungueltig" };
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "ablage_nicht_konfiguriert" };
  try {
    const antwort = await signedS3Get({ ...cfg, key: registerSchluessel(kontoId, hash), fetchImpl, timeoutMs: TIMEOUT_MS, allowNotFound: true });
    if (!antwort?.ok || !antwort.body) return { ok: false, error: "nicht_gefunden" };
    const eintrag = JSON.parse(String(antwort.body));
    if (!kennungGueltig(eintrag?.id) || !(Number(eintrag?.bis) > jetzt)) return { ok: false, error: "nicht_gefunden" };
    return { ok: true, id: eintrag.id };
  } catch {
    return { ok: false, error: "nicht_gefunden" };
  }
}
