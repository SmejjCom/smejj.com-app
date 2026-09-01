// smejj.com — Selbstbedienung fuer die oeffentliche API: hier erzeugt, sieht
// und widerruft ein angemeldeter Nutzer seine EIGENEN smejj-Schluessel.
//
// Getrennt von /api/keys (das ist BYOK, also fremde Schluessel herein). Der
// Namensunterschied ist Absicht: /api/developer/keys gehoert zu dem, was wir
// nach aussen anbieten.
//
// Ohne diese drei Routen waere die oeffentliche API kein Produkt, sondern ein
// Gefallen — jeder neue Kunde brauchte einen Handgriff des Betreibers.
import { privateJson, readJson } from "../http/respond.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { benenneSchluesselUm, erzeugeSchluessel, listeSchluessel, setzeSchluesselAktiv, widerrufeSchluessel } from "../publicapi/publicApiKeys.js";
import { publicApiAktiv } from "../publicapi/publicApiRoutes.js";
import { verbrauchSnapshot } from "../publicapi/publicApiUsage.js";
import { AUFLADE_BETRAEGE_USD, erzeugeAufladung, leseKonto } from "../publicapi/publicApiLedger.js";
import { mikroZuUsd, preislistePayload } from "../publicapi/publicApiPreise.js";

const PREFIX = "/api/developer/keys";
const GUTHABEN = "/api/developer/guthaben";
// Schluessel erzeugen ist teuer (zwei verschluesselte Schreibvorgaenge) und
// wird selten gebraucht — 10 Vorrat, alle 20 s einer zurueck.
const bremse = createRateLimiter({ capacity: 10, refillPerSec: 0.05, maxKeys: 10_000 });

export async function handleDeveloperKeyRoute(req, url, res, { env = process.env } = {}) {
  const istGuthaben = url.pathname === `${GUTHABEN}/checkout`;
  if (!istGuthaben && url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const kontoId = authenticatedUserId(req.authUser);
  if (!kontoId) {
    privateJson(res, 401, { ok: false, error: "authentication_required" });
    return true;
  }
  if (!publicApiAktiv(env)) {
    // Ehrlich bleiben: Schluessel ausgeben, die nirgends gelten, waere die
    // schlechteste aller Antworten.
    privateJson(res, 503, { ok: false, error: "public_api_disabled" });
    return true;
  }
  const limit = bremse.take(kontoId, req.method === "POST" ? 1 : 0.2);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const rest = url.pathname.slice(PREFIX.length).replace(/^\//, "");
  try {
    if (istGuthaben && req.method === "POST") {
      // Aufladen: Stripe-Checkout fuer eine Einmalzahlung, Rueckkehr auf die
      // Entwicklerseite. Der Betrag muss einer der festen Stufen sein.
      const body = await readJson(req).catch(() => ({}));
      const email = String(req.authUser?.email || "").trim();
      const { url: checkoutUrl } = await erzeugeAufladung(kontoId, Number(body?.betragUsd), { env, email });
      privateJson(res, 200, { ok: true, url: checkoutUrl });
      return true;
    }
    if (istGuthaben) return privateJson(res, 404, { ok: false, error: "developer_key_route_not_found" }), true;
    if (req.method === "GET" && rest === "") {
      const [schluessel, verbrauch, konto] = await Promise.all([
        listeSchluessel(kontoId, env),
        verbrauchSnapshot(kontoId, env),
        leseKonto(kontoId, env)
      ]);
      privateJson(res, 200, {
        ok: true,
        basisUrl: basisUrlAus(req, env),
        schluessel,
        verbrauch,
        guthaben: {
          usd: mikroZuUsd(konto.guthabenMikro),
          aufgeladenUsd: mikroZuUsd(konto.aufgeladenMikro),
          verbrauchtUsd: mikroZuUsd(konto.verbrauchtMikro),
          anfragen: konto.anfragen,
          stufenUsd: AUFLADE_BETRAEGE_USD,
          aufladenMoeglich: Boolean(env.STRIPE_SECRET_KEY)
        },
        preise: preislistePayload()
      });
      return true;
    }
    if (req.method === "POST" && rest === "") {
      const body = await readJson(req).catch(() => ({}));
      const ergebnis = await erzeugeSchluessel(kontoId, { name: body?.name }, env);
      // Der Klartext geht GENAU HIER einmal heraus. Er steht in keinem Log und
      // ist danach nicht wiederherstellbar — der Speicher kennt nur den Abdruck.
      privateJson(res, 201, {
        ok: true,
        hinweis: "Dieser Schluessel wird nur jetzt angezeigt. Danach ist er nicht mehr abrufbar.",
        apiKey: ergebnis.klartext,
        basisUrl: basisUrlAus(req, env),
        modell: "smejj-1.0",
        schluessel: ergebnis.schluessel
      });
      return true;
    }
    const [keyId, aktion] = rest.split("/");
    if (req.method === "POST" && aktion === "revoke" && /^key_[a-f0-9]{12}$/.test(keyId)) {
      const schluessel = await widerrufeSchluessel(kontoId, keyId, env);
      privateJson(res, 200, { ok: true, schluessel });
      return true;
    }
    if (req.method === "POST" && aktion === "rename" && /^key_[a-f0-9]{12}$/.test(keyId)) {
      const body = await readJson(req).catch(() => ({}));
      const schluessel = await benenneSchluesselUm(kontoId, keyId, body?.name, env);
      privateJson(res, 200, { ok: true, schluessel });
      return true;
    }
    if (req.method === "POST" && aktion === "toggle" && /^key_[a-f0-9]{12}$/.test(keyId)) {
      const body = await readJson(req).catch(() => ({}));
      const schluessel = await setzeSchluesselAktiv(kontoId, keyId, Boolean(body?.aktiv), env);
      privateJson(res, 200, { ok: true, schluessel });
      return true;
    }
    privateJson(res, 404, { ok: false, error: "developer_key_route_not_found" });
    return true;
  } catch (error) {
    const status = [400, 403, 404, 409, 429, 502].includes(Number(error?.status)) ? Number(error.status) : 503;
    privateJson(res, status, { ok: false, error: String(error?.message || "developer_key_error").slice(0, 160) });
    return true;
  }
}

function basisUrlAus(req, env) {
  const gesetzt = String(env.SMEJJ_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (gesetzt) return gesetzt;
  const host = String(req?.headers?.host || "smejj.com").trim();
  const protokoll = /^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host) ? "http" : "https";
  return `${protokoll}://${host}/v1`;
}
