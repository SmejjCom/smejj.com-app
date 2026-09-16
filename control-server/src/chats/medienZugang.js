// smejj.com — kurzlebige, signierte Anzeige-Adressen fuer PRIVATE Chat-Medien.
//
// WARUM (Betreiber-Auftrag 2026-09-17, Medien-System): Bisher holte der Browser
// jedes Medium per fetch mit Bearer-Token und zeigte es als blob: an. Das ist
// sicher, aber langsam: ein Video wurde komplett geladen, bevor es spielte, der
// Browser-Cache griff nicht bei jedem Aufruf gleich, und <img loading="lazy">
// konnte nicht arbeiten, weil ein <img> keinen Bearer-Kopf schicken kann.
//
// Das Muster der grossen Anbieter: der Server prueft die Sitzung EINMAL und gibt
// eine Adresse heraus, die fuer kurze Zeit genau dieses eine Medium oeffnet.
//
//   Chat → Medien-Kennung → Sitzungspruefung → signierte Adresse → Ablage
//
// Eigenschaften, die die Tests halten:
//   - Der Token ist VERSCHLUESSELT (AES-256-GCM), nicht nur signiert: er
//     verraet weder Konto, noch Kennung, noch Eimer, noch Pfad.
//   - Er laeuft ab (30–60 min). Die Ablaufzeit rastet auf 30-Minuten-Fenster
//     ein, damit dieselbe Adresse innerhalb eines Fensters gleich bleibt — nur
//     so kann der Browser-Cache sie wiedererkennen.
//   - Kein Schluessel im Token: abgeleitet per HMAC aus SMEJJ_SESSION_SECRET mit
//     eigenem Kontext (wie workerToken.js). Ohne Geheimnis: aus (fail-closed),
//     der Client faellt auf den alten fetch-Weg zurueck.
import crypto from "node:crypto";
import { kennungGueltig, kontoGueltig } from "./medienStore.js";

const KONTEXT = "smejj.com/medien-zugang/v1";
export const FENSTER_SEKUNDEN = 30 * 60;

export function zugangsSchluessel(env = process.env) {
  const geheimnis = String(env.SMEJJ_SESSION_SECRET || env.GOOGLE_SESSION_SECRET || "").trim();
  if (geheimnis.length < 32) return null;
  return crypto.createHmac("sha256", geheimnis).update(KONTEXT).digest();
}

/** Ablauf: Ende des NAECHSTEN 30-Minuten-Fensters (also 30–60 min ab jetzt). */
export function ablaufFuer(jetztMs = Date.now()) {
  const jetzt = Math.floor(jetztMs / 1000);
  return (Math.floor(jetzt / FENSTER_SEKUNDEN) + 2) * FENSTER_SEKUNDEN;
}

/**
 * Baut einen Token. Deterministisch innerhalb eines Fensters: der IV ist ein
 * HMAC ueber den Klartext. Gleicher Klartext → gleicher Token; das verraet
 * nichts, was die gleiche Adresse nicht ohnehin verriete.
 */
export function erzeugeZugang({ kontoId, id, vorschau = false, jetztMs = Date.now(), env = process.env }) {
  const schluessel = zugangsSchluessel(env);
  if (!schluessel || !kontoGueltig(kontoId) || !kennungGueltig(id)) return null;
  const ablauf = ablaufFuer(jetztMs);
  const klartext = Buffer.from(`1|${kontoId}|${id}|${vorschau ? "v" : "o"}|${ablauf}`, "utf8");
  const iv = crypto.createHmac("sha256", schluessel).update(klartext).digest().subarray(0, 12);
  const chiffre = crypto.createCipheriv("aes-256-gcm", schluessel, iv);
  const inhalt = Buffer.concat([chiffre.update(klartext), chiffre.final()]);
  const token = Buffer.concat([iv, inhalt, chiffre.getAuthTag()]).toString("base64url");
  return { token, ablauf };
}

/**
 * Prueft einen Token. Jede Abweichung — kaputt, manipuliert, fremder
 * Schluessel, abgelaufen — ergibt `ok: false`. Nie eine Ausnahme.
 */
export function pruefeZugang(token, { jetztMs = Date.now(), env = process.env } = {}) {
  const schluessel = zugangsSchluessel(env);
  if (!schluessel) return { ok: false, error: "zugang_aus" };
  const roh = String(token || "");
  if (!/^[A-Za-z0-9_-]{60,400}$/.test(roh)) return { ok: false, error: "zugang_ungueltig" };
  try {
    const bytes = Buffer.from(roh, "base64url");
    if (bytes.length < 12 + 16 + 1) return { ok: false, error: "zugang_ungueltig" };
    const iv = bytes.subarray(0, 12);
    const tag = bytes.subarray(bytes.length - 16);
    const entschluessler = crypto.createDecipheriv("aes-256-gcm", schluessel, iv);
    entschluessler.setAuthTag(tag);
    const klartext = Buffer.concat([entschluessler.update(bytes.subarray(12, bytes.length - 16)), entschluessler.final()]).toString("utf8");
    const [version, kontoId, id, art, ablaufText] = klartext.split("|");
    const ablauf = Number(ablaufText);
    if (version !== "1" || !kontoGueltig(kontoId) || !kennungGueltig(id) || !["v", "o"].includes(art) || !Number.isInteger(ablauf)) {
      return { ok: false, error: "zugang_ungueltig" };
    }
    const restSekunden = ablauf - Math.floor(jetztMs / 1000);
    if (restSekunden <= 0) return { ok: false, error: "zugang_abgelaufen" };
    return { ok: true, kontoId, id, vorschau: art === "v", ablauf, restSekunden };
  } catch {
    return { ok: false, error: "zugang_ungueltig" };
  }
}
