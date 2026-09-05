// smejj.com — Eingang fuer den Zweitweg der Webhooks (POST /api/webhooks/relay).
//
// WOFUER: Ein Webhook-Anbieter stellt direkt an api.smejj.com zu (Hauptweg).
// Faellt der aus, geht das Ereignis verloren — Stripe wiederholt zwar, aber
// begrenzt. Der Smee-Kanal ist der ZWEITE Weg: derselbe Webhook kommt dort
// ebenfalls an und wird von workers/smejj-smee hierher weitergereicht.
//
// WARUM DIESE ROUTE STRENGER IST ALS DER HAUPTWEG: Ein Smee-Kanal ist
// oeffentlich beschreibbar. Wer die Kanal-Adresse kennt, kann ein Ereignis
// hineinlegen. Diese Route ist damit ein Eingang, den ein Fremder erreichen
// kann — also gilt hier fail-closed in drei Stufen:
//
//   1. Ohne SMEJJ_SMEE_RELAY_SECRET ist die Route AUS (503). Nicht
//      eingerichtet heisst geschlossen, nicht offen.
//   2. Der Relay-Beweis wird zeitkonstant verglichen. Ein Unterschied in der
//      Laenge oder im ersten Zeichen darf nicht schneller antworten als einer
//      im letzten — sonst laesst sich das Geheimnis Zeichen fuer Zeichen raten.
//   3. Die Echtheitspruefung des ANBIETERS bleibt beim eigentlichen Handler.
//      Diese Route faelscht keine Signatur und legt keine an; sie reicht die
//      Kopfzeilen unveraendert weiter. Wer ohne gueltige Stripe-Signatur
//      hereinkommt, wird dort abgelehnt — genau wie auf dem Hauptweg.
//
// GEGEN DOPPELTE VERARBEITUNG: Kommt ein Ereignis ueber beide Wege, darf es
// nur EINMAL wirken. Die Kennung wird kurz gemerkt; eine Wiederholung
// beantwortet die Route mit 200 und tut nichts. 200, nicht 409: fuer den
// Absender IST es erledigt, und ein Fehler wuerde ihn zu weiteren Versuchen
// veranlassen.
import crypto from "node:crypto";

/** Wie lange eine Ereignis-Kennung als "schon gesehen" gilt. */
export const GEDAECHTNIS_MS = 15 * 60_000;
/** Deckel gegen unbegrenztes Wachsen — der Speicher darf nicht mit den Ereignissen mitwachsen. */
export const GEDAECHTNIS_MAX = 5000;
const MAX_KOERPER = 512 * 1024;

/** Zeitkonstanter Vergleich. Ungleiche Laengen sind sofort falsch, aber ohne Zeitverrat. */
export function beweisStimmt(gegeben, erwartet) {
  const a = Buffer.from(String(gegeben || ""), "utf8");
  const b = Buffer.from(String(erwartet || ""), "utf8");
  if (!b.length) return false;
  if (a.length !== b.length) {
    // timingSafeEqual verlangt gleiche Laenge. Trotzdem einmal vergleichen,
    // damit die Antwortzeit nicht von der Laenge abhaengt.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/** Das Kurzzeitgedaechtnis gegen doppelte Verarbeitung. */
export function baueGedaechtnis({ jetzt = () => Date.now(), maxAlterMs = GEDAECHTNIS_MS, deckel = GEDAECHTNIS_MAX } = {}) {
  const gesehen = new Map();
  return {
    /** @returns {boolean} true, wenn die Kennung NEU ist (also verarbeitet werden soll). */
    merke(kennung) {
      const t = jetzt();
      for (const [k, zeit] of gesehen) {
        if (t - zeit > maxAlterMs) gesehen.delete(k); else break;
      }
      if (gesehen.has(kennung)) return false;
      gesehen.set(kennung, t);
      // Aeltester zuerst: Map behaelt die Einfuegereihenfolge.
      while (gesehen.size > deckel) gesehen.delete(gesehen.keys().next().value);
      return true;
    },
    groesse: () => gesehen.size
  };
}

/** Ohne mitgelieferte Kennung dient der Rumpf selbst als Kennung. */
export function kennungFuer(kopfKennung, koerper) {
  const k = String(kopfKennung || "").trim();
  if (k) return k.slice(0, 200);
  return "sha256:" + crypto.createHash("sha256").update(String(koerper || "")).digest("hex").slice(0, 32);
}

/**
 * WOHIN das Ereignis gehoert — an der Signaturkopfzeile des Anbieters erkannt.
 *
 * Der Zweitweg fuehrt bewusst auf DENSELBEN Endpunkt wie der Hauptweg, ueber
 * einen internen HTTP-Aufruf an den eigenen Server. So gibt es keinen zweiten
 * Codepfad, der irgendwann auseinanderlaeuft: die Signaturpruefung, die
 * Fachlogik und das Fehlerverhalten sind Zeichen fuer Zeichen dieselben.
 * Eine Abkuerzung "wir rufen den Handler direkt auf" waere schneller und
 * genau deshalb gefaehrlich — sie umginge alles, was vor dem Handler steht.
 */
export const ZUORDNUNG = Object.freeze([
  { kopf: "stripe-signature", pfad: "/api/billing/stripe/webhook", name: "Stripe" },
  { kopf: "x-github-event", pfad: "/api/webhooks/github", name: "GitHub" }
]);

/** @returns {{pfad: string, name: string}|null} */
export function zielFuer(kopfzeilen = {}) {
  for (const eintrag of ZUORDNUNG) {
    if (kopfzeilen[eintrag.kopf]) return { pfad: eintrag.pfad, name: eintrag.name };
  }
  return null;
}

/** Baut die Weitergabe an den eigenen Server. Der Aufruf bleibt im Container. */
export function baueWeitergabe({ env = process.env, fetchImpl = fetch } = {}) {
  const port = Number(env.PORT) > 0 ? Number(env.PORT) : 8080;
  return async function weitergeben(kopfzeilen, koerper) {
    const ziel = zielFuer(kopfzeilen);
    // Ein Ereignis ohne bekannte Signaturkopfzeile wird NICHT weitergereicht.
    // Es koennte von jedem stammen, der die Kanal-Adresse kennt.
    if (!ziel) return { ok: false, status: 422 };
    const kopf = { "content-type": String(kopfzeilen["content-type"] || "application/json") };
    for (const eintrag of ZUORDNUNG) {
      if (kopfzeilen[eintrag.kopf]) kopf[eintrag.kopf] = String(kopfzeilen[eintrag.kopf]);
    }
    for (const name of ["x-github-delivery", "x-hub-signature-256"]) {
      if (kopfzeilen[name]) kopf[name] = String(kopfzeilen[name]);
    }
    const antwort = await fetchImpl(`http://127.0.0.1:${port}${ziel.pfad}`, {
      method: "POST", headers: kopf, body: koerper, signal: AbortSignal.timeout(20_000)
    });
    return { ok: antwort.ok, status: antwort.status, ziel: ziel.name };
  };
}

const gedaechtnis = baueGedaechtnis();

/**
 * Haengt die Route ein. Der eigentliche Webhook-Handler wird UNVERAENDERT mit
 * denselben Kopfzeilen aufgerufen — diese Route entscheidet nur, ob das
 * Ereignis ueberhaupt weitergegeben wird.
 *
 * @param {object} eingabe
 * @param {Function} eingabe.weitergeben async (kopf, koerper) => {status}
 */
export function erstelleWebhookRelayRoute({ env = process.env, weitergeben = null, speicher = gedaechtnis } = {}) {
  const weiter = weitergeben || baueWeitergabe({ env });
  return async function behandle(req, res, url, json) {
    if (req.method !== "POST" || url.pathname !== "/api/webhooks/relay") return false;
    const geheimnis = String(env.SMEJJ_SMEE_RELAY_SECRET || "").trim();
    if (!geheimnis) { json(res, 503, { ok: false, error: "relay_not_configured" }); return true; }
    if (!beweisStimmt(req.headers["x-smejj-relay"], geheimnis)) {
      json(res, 401, { ok: false, error: "relay_unauthorized" });
      return true;
    }
    let koerper = "";
    for await (const stueck of req) {
      koerper += stueck;
      if (koerper.length > MAX_KOERPER) { json(res, 413, { ok: false, error: "body_too_large" }); return true; }
    }
    const kennung = kennungFuer(req.headers["x-smejj-ereignis"], koerper);
    if (!speicher.merke(kennung)) {
      // Schon ueber den Hauptweg gekommen. Fuer den Absender ist es erledigt.
      json(res, 200, { ok: true, doppelt: true });
      return true;
    }
    try {
      const ergebnis = await weiter(req.headers, koerper);
      json(res, ergebnis?.status || 200, { ok: ergebnis?.ok !== false, weitergereicht: true });
    } catch (fehler) {
      json(res, 502, { ok: false, error: "relay_handler_failed", detail: String(fehler?.message || fehler).slice(0, 120) });
    }
    return true;
  };
}
