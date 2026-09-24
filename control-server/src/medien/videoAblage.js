// smejj.com control-server — erzeugte Videos in IDrive e2 ablegen und als
// 7 Tage gueltigen, vorsignierten Link zurueckgeben.
//
// WARUM (Betreiber 24.09.2026, Wahl "IDrive e2, 7 Tage"): Das fertige Video
// reiste bisher als base64 im Chat-Strom der Bruecke. Gemessen vom Betreiber-
// Anschluss: Zeabur liefert dorthin 10-15 KB/s (ein 650-KB-Video = 40 s bis
// mehrere Minuten), IDrive e2 140-160 KB/s. Die Bruecke gibt das Video jetzt
// intern hier ab; der Browser laedt es direkt aus e2.
//
// Wer darf: nur die Bruecke, mit dem Schluessel, den sie ohnehin fuer die
// Evolution-Meldungen hat (x-smejj-evolution-token, geprueft vom Aufrufer in
// autopilotRoutes.js). Fail-closed: ohne Speicher-Konfiguration 503, ohne
// gueltiges MP4/WebM 400 — nie ein unbekanntes Format im Eimer.
//
// Der Link ist privat (nicht erratbar, signiert) und laeuft nach 7 Tagen ab;
// die App zeigt danach "Video abgelaufen". 7 Tage sind die Obergrenze von
// SigV4 (604800 s).
import crypto from "node:crypto";
import { signedS3Put } from "../storage/s3Signer.js";
import { idriveConfig } from "../chats/chatSyncStore.js";
import { inhaltPasstZuTyp } from "../chats/medienStore.js";
import { json } from "../http/respond.js";

export const PFAD_VIDEO_ABLAGE = "/api/medien/video";
export const VIDEO_GUELTIG_S = 7 * 24 * 60 * 60;
export const VIDEO_PRAEFIX = "medien-video";
// Deckel wie in der Bruecke (VIDEO_MAX_B64) plus JSON-Huelle.
const MAX_KOERPER_BYTES = 8_200_000;
const TYPEN = Object.freeze({ mp4: "video/mp4", webm: "video/webm" });

/** Liest den Koerper mit eigenem Deckel (readJson deckelt bei 1 MB — zu klein fuer Videos). */
export function liesKoerper(req, max = MAX_KOERPER_BYTES) {
  return new Promise((fertig, fehler) => {
    const teile = [];
    let laenge = 0;
    req.on("data", (stueck) => {
      laenge += stueck.length;
      if (laenge > max) { fehler(Object.assign(new Error("zu_gross"), { status: 413 })); req.destroy?.(); return; }
      teile.push(stueck);
    });
    req.on("end", () => fertig(Buffer.concat(teile).toString("utf8")));
    req.on("error", fehler);
  });
}

/** Objektschluessel: medien-video/JJJJ-MM-TT/<zufall>.<endung> — nicht erratbar. */
export function videoSchluessel(format, jetzt = new Date()) {
  const tag = jetzt.toISOString().slice(0, 10);
  return `${VIDEO_PRAEFIX}/${tag}/${crypto.randomBytes(16).toString("hex")}.${format}`;
}

const hmac = (schluessel, text) => crypto.createHmac("sha256", schluessel).update(text).digest();

/** SigV4-Abfrage-Signatur (GET) mit waehlbarer Gueltigkeit — rein, ohne Netz. */
export function vorsignierteLeseAdresse({ endpoint, region, accessKey, secretKey, bucket, key, gueltigS = VIDEO_GUELTIG_S, jetzt = new Date() }) {
  const basis = new URL(endpoint);
  const host = basis.host;
  const iso = jetzt.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const tag = iso.slice(0, 8);
  const bereich = `${tag}/${region}/s3/aws4_request`;
  const pfad = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const abfrage = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${bereich}`,
    "X-Amz-Date": iso,
    "X-Amz-Expires": String(Math.min(Math.max(1, gueltigS), VIDEO_GUELTIG_S)),
    "X-Amz-SignedHeaders": "host"
  });
  const kanonischeAbfrage = [...abfrage.entries()]
    .map(([n, w]) => `${encodeURIComponent(n)}=${encodeURIComponent(w)}`).sort().join("&");
  const anfrage = ["GET", pfad, kanonischeAbfrage, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const zuSignieren = ["AWS4-HMAC-SHA256", iso, bereich, crypto.createHash("sha256").update(anfrage).digest("hex")].join("\n");
  const signierSchluessel = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, tag), region), "s3"), "aws4_request");
  abfrage.set("X-Amz-Signature", crypto.createHmac("sha256", signierSchluessel).update(zuSignieren).digest("hex"));
  return `${basis.protocol}//${host}${pfad}?${abfrage.toString()}`;
}

/** POST {b64, format} -> {ok, url, gueltigBis}. Den Ausweis prueft der Aufrufer. */
export async function handleVideoAblage(req, res, { env = process.env, fetchImpl = fetch, jetzt = () => new Date() } = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return json(res, 503, { ok: false, error: "medien_speicher_nicht_konfiguriert" });
  let daten;
  try {
    daten = JSON.parse(await liesKoerper(req));
  } catch (fehler) {
    return json(res, fehler?.status || 400, { ok: false, error: fehler?.status === 413 ? "video_zu_gross" : "ungueltiges_json" });
  }
  const format = String(daten?.format || "");
  const b64 = String(daten?.b64 || "");
  if (!TYPEN[format] || !b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return json(res, 400, { ok: false, error: "ungueltiges_video" });
  const inhalt = Buffer.from(b64, "base64");
  if (!inhaltPasstZuTyp(inhalt, TYPEN[format])) return json(res, 400, { ok: false, error: "kein_echtes_video" });

  const key = videoSchluessel(format, jetzt());
  try {
    await signedS3Put({ ...cfg, key, body: inhalt, contentType: TYPEN[format], fetchImpl, timeoutMs: 60_000 });
  } catch (fehler) {
    console.log(`medien-video: Ablage fehlgeschlagen (${fehler?.name || "Fehler"})`);
    return json(res, 502, { ok: false, error: "ablage_fehlgeschlagen" });
  }
  const start = jetzt();
  const url = vorsignierteLeseAdresse({ ...cfg, key, jetzt: start });
  return json(res, 200, { ok: true, url, gueltigBis: new Date(start.getTime() + VIDEO_GUELTIG_S * 1000).toISOString(), bytes: inhalt.length });
}
