// smejj.com — Routen fuer die Medien-Ablage des Chat-Verlaufs.
//
// MIT SITZUNG (nur das eigene Konto):
//   POST   /api/chat-medien                → Datei ablegen: roh (Content-Type =
//                                            Medientyp) oder alt als {dataUrl}
//   GET    /api/chat-medien?id=<id>        → eigenes Medium (alter Weg, Bearer)
//   DELETE /api/chat-medien?id=<id>        → Medium zum Aufraeumen vormerken
//   POST   /api/chat-medien/zugang         → {ids} → kurzlebige Anzeige-Adressen
//   POST   /api/chat-medien/vorschau?id=   → WebP-Anzeigefassung eines Bildes
//   POST   /api/chat-medien/teilen         → {id, tage, maxAufrufe} → Teilen-Link
//   GET    /api/chat-medien/teilen?id=     → eigene Links (eines Mediums)
//   DELETE /api/chat-medien/teilen?token=  → Link widerrufen
//
// OHNE SITZUNG (die Pruefung steckt im Token):
//   GET/HEAD /medium/<token>  → privates Medium ueber signierte, ablaufende Adresse
//   GET/HEAD /m/<token>       → bewusst geteiltes Medium ueber Teilen-Link
//
// Warum es sie gibt: siehe Kopf von chats/medienStore.js — Bilder und Videos
// haben bisher kein Neuladen ueberlebt. Ab jetzt liegt das Medium neben dem
// Chat statt in ihm; im Verlauf steht nur noch die kurze Adresse.
//
// Die Kontokennung kommt ausschliesslich aus der Sitzung (oder aus einem Token,
// den nur der Server erzeugen kann): ein Aufrufer kann damit nur seine EIGENEN
// Medien lesen, auch wenn er eine fremde Kennung erraet.
import {
  ALLE_TYPEN, MAX_DATEI_BYTES, kennungGueltig, kontoKennung, ladeMedium, speichereMedium,
  speichereRohdatei, speichereVorschau, syncAktiv, typFuerKennung
} from "../chats/medienStore.js";
import { erzeugeZugang, pruefeZugang, zugangsSchluessel } from "../chats/medienZugang.js";
import { holeMedienDienste } from "../chats/medienDienste.js";
import { tokenGueltig } from "../chats/medienTeilen.js";
import { findeBildAuftrag, merkeBildAuftrag } from "../chats/bildAblageRegister.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { corsHeadersFor } from "../http/cors.js";

// Ein Medium je Antwort, ein paar Antworten je Minute — 120/Stunde ist reichlich
// und deckelt zugleich, was ein einzelnes Konto in den Eimer schieben kann.
const schreibGrenze = createRateLimiter({ capacity: 120, refillPerSec: 120 / 3600, maxKeys: 5_000 });

const INHALTSFEHLER = ["kein_data_url", "typ_nicht_erlaubt", "base64_kaputt", "leer", "zu_gross", "inhalt_passt_nicht_zum_typ", "kennung_ungueltig"];

// Link-Vorschau-Roboter (Messenger, soziale Netze, Suchmaschinen). Sie sollen
// einen begrenzten Link nicht verbrauchen.
const ROBOTER = /whatsapp|telegrambot|facebookexternalhit|facebookcatalog|slackbot|twitterbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|applebot|embedly|iframely|pinterest|redditbot|vkshare|mastodon|signal|threema|preview/i;

export function istRoboter(userAgent) {
  return ROBOTER.test(String(userAgent || ""));
}

/**
 * Die Adresse des Besuchers fuer Bremsen und Nachlauf.
 *
 * NICHT der erste Eintrag von X-Forwarded-For (Live-Test 17.09.): den setzt der
 * Besucher selbst, und der Proxy haengt die echte Adresse nur HINTEN an. Mit
 * wechselnden Fantasie-Adressen liesse sich sonst jede Bremse umgehen. Genommen
 * wird von rechts die erste oeffentliche Adresse — die hat der Proxy gesehen.
 */
export function besucherAdresse(req) {
  const kette = String(req?.headers?.["x-forwarded-for"] || "").split(",").map((teil) => teil.trim()).filter(Boolean);
  const intern = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|fc|fd|fe80:)/i;
  for (let i = kette.length - 1; i >= 0; i -= 1) {
    if (!intern.test(kette[i])) return kette[i];
  }
  return String(req?.socket?.remoteAddress || kette[0] || "").trim();
}

/** Nur der Anfang zaehlt als Aufruf — spaetere Bereiche sind Spulen im selben Aufruf. */
export function istErsterAbruf(range) {
  const wert = String(range || "").trim();
  return !wert || wert === "bytes=0-" || wert === "bytes=0-1";
}

function dateiname(id, token) {
  const endung = String(id).split(".").pop();
  return `smejj-${String(token).slice(0, 10)}.${endung}`;
}

/** Sicherheitskoepfe fuer jede Medien-Antwort, egal welcher Weg. */
export function medienKoepfe({ mime, laenge, dispositionArt = "inline", name, cache, cors = null, fremdEinbettbar = false }) {
  return {
    "Content-Type": mime,
    "Content-Length": String(laenge),
    "Accept-Ranges": "bytes",
    "Cache-Control": cache,
    // PDF nie im Browser-Rahmen der API-Adresse oeffnen: herunterladen.
    "Content-Disposition": `${mime === "application/pdf" ? "attachment" : dispositionArt}; filename="${name}"`,
    "X-Content-Type-Options": "nosniff",
    // Selbst wenn eine Datei den Typ-Waechter ueberlistete: kein Skript, kein
    // Formular, kein Zugriff auf den Ursprung.
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "Cross-Origin-Resource-Policy": fremdEinbettbar ? "cross-origin" : "same-site",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    ...(cors || {})
  };
}

function textAntwort(res, status, text, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    ...extra
  });
  res.end(text);
}

/** Liest einen rohen Rumpf mit harter Grenze — bricht ab, statt 25 MB+ zu puffern. */
export function leseRohdaten(req, maxBytes = MAX_DATEI_BYTES) {
  return new Promise((resolve, reject) => {
    const angekuendigt = Number(req.headers?.["content-length"] || 0);
    if (angekuendigt > maxBytes) {
      reject(Object.assign(new Error("zu_gross"), { code: "zu_gross" }));
      return;
    }
    const teile = [];
    let laenge = 0;
    req.on("data", (teil) => {
      laenge += teil.length;
      if (laenge > maxBytes) {
        reject(Object.assign(new Error("zu_gross"), { code: "zu_gross" }));
        req.destroy?.();
        return;
      }
      teile.push(Buffer.isBuffer(teil) ? teil : Buffer.from(teil));
    });
    req.on("end", () => resolve(Buffer.concat(teile)));
    req.on("error", reject);
  });
}

export function createChatMedienRoutes({ env = process.env, readSession, json, readJson, fetchImpl = fetch, dienste = null, jetzt = () => Date.now() }) {
  // Lesegrenzen je Adresse: gross genug fuer einen Verlauf voller Bilder und
  // spulende Videos, klein genug gegen Durchprobieren.
  const anzeigeGrenze = createRateLimiter({ capacity: 600, refillPerSec: 10, maxKeys: 20_000 });
  const teilenGrenze = createRateLimiter({ capacity: 120, refillPerSec: 2, maxKeys: 20_000 });
  const fehlGrenze = createRateLimiter({ capacity: 30, refillPerSec: 30 / 600, maxKeys: 20_000 });
  // Wer einen begrenzten Link gerade gezaehlt geoeffnet hat, darf 10 Minuten
  // lang darin spulen (Token+Adresse → bis).
  const nachlauf = new Map();

  function holeDienste() {
    return dienste || holeMedienDienste({ env, fetchImpl });
  }

  function zustaendig(pfad) {
    return pfad === "/api/chat-medien" || pfad.startsWith("/api/chat-medien/") || pfad.startsWith("/medium/") || pfad.startsWith("/m/");
  }

  async function sendeMedium(req, res, { kontoId, id, vorschau = false, cache, name, fremdEinbettbar = false, download = false }) {
    const range = String(req.headers?.range || "");
    const ergebnis = await ladeMedium({ id, kontoId, env, fetchImpl, range, vorschau });
    if (!ergebnis.ok) {
      if (ergebnis.error === "bereich_ungueltig") {
        textAntwort(res, 416, "Bereich ungueltig.");
        return;
      }
      const fehlt = ["nicht_gefunden", "kennung_ungueltig"].includes(ergebnis.error);
      textAntwort(res, fehlt ? 404 : 503, fehlt ? "Nicht gefunden." : "Voruebergehend nicht verfuegbar.");
      return;
    }
    const koepfe = medienKoepfe({
      mime: ergebnis.mime,
      laenge: ergebnis.daten.length,
      dispositionArt: download ? "attachment" : "inline",
      name,
      cache,
      cors: corsHeadersFor(req.headers?.origin, env),
      fremdEinbettbar
    });
    if (ergebnis.status === 206 && ergebnis.contentRange) koepfe["Content-Range"] = ergebnis.contentRange;
    res.writeHead(ergebnis.status, koepfe);
    res.end(req.method === "HEAD" ? undefined : ergebnis.daten);
  }

  // ---- /medium/<token>: private Anzeige ueber signierte Adresse -------------
  async function signierteAnzeige(req, res, token) {
    const adresse = besucherAdresse(req);
    if (!anzeigeGrenze.take(adresse, 1).allowed) {
      textAntwort(res, 429, "Zu viele Anfragen.", { "Retry-After": "10" });
      return;
    }
    const zugang = pruefeZugang(token, { jetztMs: jetzt(), env });
    if (!zugang.ok) {
      fehlGrenze.take(adresse, 1);
      // 403 fuer abgelaufen UND kaputt: der Client holt in beiden Faellen neu.
      textAntwort(res, zugang.error === "zugang_aus" ? 503 : 403, zugang.error === "zugang_abgelaufen" ? "Adresse abgelaufen." : "Kein Zugriff.");
      return;
    }
    const url = new URL(req.url || "/", "https://api.smejj.com");
    await sendeMedium(req, res, {
      kontoId: zugang.kontoId,
      id: zugang.id,
      vorschau: zugang.vorschau,
      // Privat: nur der Browser dieses Nutzers darf behalten, und nur so lange
      // die Adresse gilt. Nie ein geteilter Cache (CDN/Proxy).
      cache: `private, max-age=${Math.max(0, Math.min(3600, zugang.restSekunden))}, immutable`,
      name: `smejj-medium.${String(zugang.id).split(".").pop()}`,
      download: url.searchParams.get("download") === "1"
    });
  }

  // ---- /m/<token>: bewusst geteilter Link ------------------------------------
  async function teilenAnzeige(req, res, token) {
    const adresse = besucherAdresse(req);
    if (!teilenGrenze.take(adresse, 1).allowed) {
      textAntwort(res, 429, "Zu viele Anfragen.", { "Retry-After": "30" });
      return;
    }
    // Wer schon oft ins Leere getroffen hat, probiert Tokens durch.
    const fehlStand = fehlGrenze.take(adresse, 0);
    if (!fehlStand.allowed || fehlStand.remaining < 1) {
      textAntwort(res, 429, "Zu viele Anfragen.", { "Retry-After": String(fehlStand.retryAfterSec || 60) });
      return;
    }
    if (!tokenGueltig(token)) {
      fehlGrenze.take(adresse, 1);
      textAntwort(res, 404, "Dieser Link existiert nicht.");
      return;
    }
    const roboter = istRoboter(req.headers?.["user-agent"]);
    const range = req.headers?.range;
    const nachlaufSchluessel = `${token}|${adresse}`;
    const imNachlauf = (nachlauf.get(nachlaufSchluessel) || 0) > jetzt();
    const zaehlen = req.method === "GET" && !roboter && istErsterAbruf(range) && !imNachlauf;
    const { teilen } = holeDienste();
    const offen = await teilen.oeffne({ token, zaehlen, nachlauf: imNachlauf });
    if (!offen.ok) {
      if (offen.error === "nicht_gefunden") fehlGrenze.take(adresse, 1);
      const texte = {
        nicht_gefunden: [404, "Dieser Link existiert nicht."],
        widerrufen: [410, "Dieser Link wurde widerrufen."],
        abgelaufen: [410, "Dieser Link ist abgelaufen."],
        aufgebraucht: [410, "Dieser Link wurde bereits genutzt."]
      };
      const [status, text] = texte[offen.error] || [503, "Voruebergehend nicht verfuegbar."];
      textAntwort(res, status, text);
      return;
    }
    // Ein begrenzter Link verraet sich nicht an Vorschau-Roboter: sonst waere
    // ein Einmal-Link schon verbraucht, bevor der Empfaenger ihn sieht.
    if (offen.begrenzt && roboter) {
      textAntwort(res, 403, "Vorschau nicht verfuegbar.");
      return;
    }
    if (zaehlen && offen.begrenzt) {
      nachlauf.set(nachlaufSchluessel, jetzt() + 10 * 60 * 1000);
      if (nachlauf.size > 5000) nachlauf.delete(nachlauf.keys().next().value);
    }
    await sendeMedium(req, res, {
      kontoId: offen.kontoId,
      id: offen.id,
      // no-store: ein Widerruf wirkt sofort, auch fuer den, der ihn schon sah.
      cache: "no-store",
      name: dateiname(offen.id, token),
      fremdEinbettbar: true
    });
  }

  // ---- Mit Sitzung ------------------------------------------------------------
  async function mitSitzung(req, res, url, kontoId) {
    const pfad = url.pathname;
    const { teilen, aufraeumer } = holeDienste();

    if (pfad === "/api/chat-medien/zugang" && req.method === "POST") {
      if (!zugangsSchluessel(env)) {
        json(res, 503, { ok: false, error: "zugang_aus" });
        return;
      }
      const rumpf = await readJson(req).catch(() => ({}));
      const ids = Array.isArray(rumpf?.ids) ? [...new Set(rumpf.ids.map(String))].slice(0, 200) : [];
      const vorschau = rumpf?.vorschau === true;
      const basis = String(env.SMEJJ_MEDIEN_ANZEIGE_BASIS || "https://api.smejj.com").replace(/\/+$/, "");
      const adressen = {};
      let gueltigBis = 0;
      for (const id of ids) {
        if (!kennungGueltig(id)) continue;
        const zugang = erzeugeZugang({ kontoId, id, vorschau: vorschau && typFuerKennung(id).startsWith("image/"), jetztMs: jetzt(), env });
        if (!zugang) continue;
        adressen[id] = `${basis}/medium/${zugang.token}`;
        gueltigBis = zugang.ablauf;
      }
      aufraeumer.taeglich(kontoId, jetzt());
      json(res, 200, { ok: true, adressen, gueltigBis: gueltigBis ? new Date(gueltigBis * 1000).toISOString() : null });
      return;
    }

    if (pfad === "/api/chat-medien/vorschau" && req.method === "POST") {
      if (!schreibGrenze.take(kontoId, 1).allowed) {
        json(res, 429, { ok: false, error: "medien_rate_limit" });
        return;
      }
      let daten;
      try { daten = await leseRohdaten(req, 2 * 1024 * 1024); } catch {
        json(res, 413, { ok: false, error: "zu_gross" });
        return;
      }
      const ergebnis = await speichereVorschau({ id: url.searchParams.get("id") || "", daten, kontoId, env, fetchImpl });
      json(res, ergebnis.ok ? 200 : (INHALTSFEHLER.includes(ergebnis.error) || ergebnis.error === "nicht_gefunden" ? 400 : 503), ergebnis);
      return;
    }

    if (pfad === "/api/chat-medien/teilen") {
      if (req.method === "POST") {
        const rumpf = await readJson(req).catch(() => ({}));
        const id = String(rumpf?.id || "");
        if (!kennungGueltig(id)) {
          json(res, 400, { ok: false, error: "kennung_ungueltig" });
          return;
        }
        // Nur was es im eigenen Konto WIRKLICH gibt, bekommt einen Link.
        const vorhanden = await ladeMedium({ id, kontoId, env, fetchImpl, range: "bytes=0-0" });
        if (!vorhanden.ok) {
          json(res, vorhanden.error === "nicht_gefunden" ? 404 : 503, { ok: false, error: vorhanden.error });
          return;
        }
        const ergebnis = await teilen.erstelle({ kontoId, id, tage: rumpf?.tage ?? 7, maxAufrufe: rumpf?.maxAufrufe ?? null }).catch(() => ({ ok: false, error: "speicher_fehler" }));
        json(res, ergebnis.ok ? 200 : (ergebnis.error === "speicher_fehler" ? 503 : 400), ergebnis);
        return;
      }
      if (req.method === "GET") {
        const ergebnis = await teilen.liste({ kontoId, id: url.searchParams.get("id") || "" }).catch(() => ({ ok: false, error: "speicher_fehler" }));
        json(res, ergebnis.ok ? 200 : 503, ergebnis);
        return;
      }
      if (req.method === "DELETE") {
        const ergebnis = await teilen.widerrufe({ kontoId, token: url.searchParams.get("token") || "" }).catch(() => ({ ok: false, error: "speicher_fehler" }));
        json(res, ergebnis.ok ? 200 : (ergebnis.error === "speicher_fehler" ? 503 : 404), ergebnis);
        return;
      }
    }

    // Register "Bildauftrag -> Medium" (26.09.2026): die Bruecke traegt nach dem Malen ein ({auftrag, id}),
    // die Rettung nach einem App-Neustart sucht ({auftrag}). Auftrag im Rumpf, nie in der Adresse.
    if (pfad === "/api/chat-medien/auftrag" && req.method === "POST") {
      let rumpf;
      try { rumpf = await readJson(req); } catch { json(res, 400, { ok: false, error: "rumpf_ungueltig" }); return; }
      const auftrag = String(rumpf?.auftrag || "").slice(0, 2000);
      if (!auftrag.trim()) { json(res, 400, { ok: false, error: "auftrag_fehlt" }); return; }
      if (rumpf?.id !== undefined) {
        // Nur ein Medium, das im EIGENEN Konto liegt, darf eingetragen werden.
        const da = kennungGueltig(rumpf.id) ? await ladeMedium({ id: rumpf.id, kontoId, env, fetchImpl, range: "bytes=0-0" }) : { ok: false };
        if (!da.ok) { json(res, 404, { ok: false, error: "medium_fehlt" }); return; }
        const r = await merkeBildAuftrag({ kontoId, auftrag, id: rumpf.id, env, fetchImpl, jetzt: jetzt() });
        json(res, r.ok ? 200 : 503, r);
        return;
      }
      json(res, 200, await findeBildAuftrag({ kontoId, auftrag, env, fetchImpl, jetzt: jetzt() }));
      return;
    }

    if (pfad !== "/api/chat-medien") {
      json(res, 404, { ok: false, error: "nicht_gefunden" });
      return;
    }

    if (req.method === "POST") {
      const limit = schreibGrenze.take(kontoId, 1);
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSec));
        json(res, 429, { ok: false, error: "medien_rate_limit", retryAfterSec: limit.retryAfterSec });
        return;
      }
      const typ = String(req.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase();
      let ergebnis;
      if (ALLE_TYPEN[typ]) {
        let daten;
        try { daten = await leseRohdaten(req); } catch {
          json(res, 413, { ok: false, error: "zu_gross", maxBytes: MAX_DATEI_BYTES });
          return;
        }
        ergebnis = await speichereRohdatei({ daten, contentType: typ, kontoId, env, fetchImpl });
      } else if (typ === "application/json" || !typ) {
        let rumpf;
        try { rumpf = await readJson(req); } catch (fehler) {
          // Zu grosser JSON-Rumpf ehrlich als 413 — frueher wurde daraus still
          // "kein_data_url", und der Client hielt das Medium fuer kaputt.
          const zuGross = /zu_gross|too large/i.test(String(fehler?.message || fehler?.code || ""));
          json(res, zuGross ? 413 : 400, { ok: false, error: zuGross ? "zu_gross" : "kein_data_url" });
          return;
        }
        ergebnis = await speichereMedium({ dataUrl: rumpf?.dataUrl, kontoId, env, fetchImpl });
      } else {
        json(res, 415, { ok: false, error: "typ_nicht_erlaubt" });
        return;
      }
      if (!ergebnis.ok) {
        // 400 fuer alles, was am Inhalt liegt — 503 nur, wenn die Ablage selbst
        // nicht mitspielt. Der Client kann so unterscheiden zwischen "nimm ein
        // anderes Medium" und "spaeter nochmal".
        json(res, ergebnis.error === "zu_gross" ? 413 : INHALTSFEHLER.includes(ergebnis.error) ? 400 : 503, ergebnis);
        return;
      }
      aufraeumer.taeglich(kontoId, jetzt());
      json(res, 200, ergebnis);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const id = url.searchParams.get("id") || "";
      if (!kennungGueltig(id)) {
        json(res, 404, { ok: false, error: "kennung_ungueltig" });
        return;
      }
      // NICHT speichern (Live-Test 17.09.): Chrome lieferte eine mit Bearer
      // geholte Antwort spaeter auch OHNE Anmeldung aus dem HTTP-Cache — auf
      // einem geteilten Geraet nach dem Abmelden ein Leck. Schnell ist der neue
      // Weg ueber /medium/; dieser hier ist nur noch Rueckfall.
      await sendeMedium(req, res, {
        kontoId, id, cache: "private, no-store", name: `smejj-medium.${id.split(".").pop()}`
      });
      return;
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id") || "";
      if (!kennungGueltig(id)) {
        json(res, 400, { ok: false, error: "kennung_ungueltig" });
        return;
      }
      // Nicht sofort loeschen: dasselbe Medium kann in einem anderen Chat
      // stehen. Der Aufraeumer prueft das und loescht erst dann.
      aufraeumer.plane(kontoId, [id]);
      json(res, 202, { ok: true, vorgemerkt: id });
      return;
    }

    json(res, 405, { ok: false, error: "methode_nicht_erlaubt" });
  }

  async function handle(req, res, url) {
    if (!zustaendig(url.pathname)) return false;

    if (!syncAktiv(env)) {
      json(res, 503, { ok: false, error: "chat_sync_deaktiviert" });
      return true;
    }

    const oeffentlich = url.pathname.match(/^\/(medium|m)\/([^/]+)$/);
    if (url.pathname.startsWith("/medium/") || url.pathname.startsWith("/m/")) {
      if (!oeffentlich || !["GET", "HEAD"].includes(req.method)) {
        textAntwort(res, oeffentlich ? 405 : 404, oeffentlich ? "Methode nicht erlaubt." : "Nicht gefunden.");
        return true;
      }
      if (oeffentlich[1] === "medium") await signierteAnzeige(req, res, oeffentlich[2]);
      else await teilenAnzeige(req, res, oeffentlich[2]);
      return true;
    }

    const sitzung = readSession(req);
    const kontoId = kontoKennung(sitzung);
    if (!sitzung || !kontoId) {
      json(res, 401, { ok: false, error: "authentication_required" });
      return true;
    }
    await mitSitzung(req, res, url, kontoId);
    return true;
  }

  return { handle, zustaendig };
}
