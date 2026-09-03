// smejj.com — DIE OEFFENTLICHE API. Was ZCode, Cline, Cursor oder ein fremder
// Server ansprechen, wenn sie smejj als Modellanbieter einbinden.
//
// Die Schnittstelle ist absichtlich das OpenAI-Schema, Zeichen fuer Zeichen:
// Basis-URL + /chat/completions + /models, Bearer im Authorization-Kopf,
// dieselben Feldnamen, dasselbe Fehlerobjekt. Damit bindet jedes Werkzeug am
// Markt smejj ohne eine Zeile Sonderbehandlung ein. Eine eigene, schoenere
// Schnittstelle waere eine Schnittstelle, die niemand unterstuetzt.
//
// DREI DINGE, DIE HIER ANDERS SIND ALS IM CHAT DER APP:
//   1. Kein Cookie. Zugang ausschliesslich ueber einen von uns ausgegebenen
//      Schluessel (publicApiKeys.js). Damit ist die Route per CSRF nicht
//      angreifbar und darf CORS fuer jeden Ursprung oeffnen.
//   2. Kein Marken-Leck. Die Antwort nennt "smejj-1.0", nie das Backend, das
//      gerade geliefert hat — auch nicht im Stream, wo jeder Datenblock ein
//      eigenes model-Feld traegt.
//   3. Jede Anfrage wird gezaehlt (publicApiUsage.js) und gegen ein Tageslimit
//      geprueft. Ohne Deckel ist ein ausgegebener Schluessel eine offene
//      Rechnung auf unseren Namen.
//
// Fail-closed: ohne SMEJJ_PUBLIC_API_ENABLED antwortet alles mit 503. Ein
// versehentlich ausgerollter Stand verschenkt so keine Modellzeit.
import crypto from "node:crypto";
import { executeWithFallback, resolveModelRequest } from "../llm/modelRouter.js";
import { THINKING_DISABLED } from "../../../src/ai/chatThinkingPolicy.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { readJson } from "../http/respond.js";
import { bearerSchluessel, merkeBenutzung, pruefeSchluessel } from "./publicApiKeys.js";
import { PUBLIC_MODEL_DEFAULT, istPublicModel, modelListePayload, profilFuerModell } from "./publicApiModels.js";
import { verbrauchSnapshot, zaehleVerbrauch } from "./publicApiUsage.js";
import { bucheAnfrage, darfAnfragen, istUnbegrenzt } from "./publicApiLedger.js";
import { preislistePayload } from "./publicApiPreise.js";

export const PUBLIC_API_PREFIX = "/v1";
const TAGESLIMIT_VOREINSTELLUNG = 1_000_000;
// 60 Anfragen Vorrat, eine pro Sekunde zurueck: haelt Schleifenfehler auf,
// ohne einen normalen Coding-Client zu stoeren.
const anfrageBremse = createRateLimiter({ capacity: 60, refillPerSec: 1, maxKeys: 20_000 });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key",
  "Access-Control-Max-Age": "600"
};

export function istPublicApiPfad(pathname) {
  const pfad = String(pathname || "");
  return pfad === PUBLIC_API_PREFIX || pfad.startsWith(`${PUBLIC_API_PREFIX}/`);
}

export function publicApiAktiv(env = process.env) {
  return ["1", "true", "yes"].includes(String(env.SMEJJ_PUBLIC_API_ENABLED || "").trim().toLowerCase());
}

/**
 * @returns {Promise<boolean>} true = beantwortet, der Server-Verteiler ist fertig.
 */
export async function handlePublicApiRoute(req, url, res, { env = process.env, fetchImpl = fetch } = {}) {
  if (!istPublicApiPfad(url.pathname)) return false;
  const anfrageId = `req_${crypto.randomBytes(12).toString("hex")}`;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return true;
  }
  if (!publicApiAktiv(env)) {
    fehler(res, 503, "server_error", "public_api_disabled", "Die oeffentliche API ist auf diesem Server nicht eingeschaltet.", anfrageId);
    return true;
  }

  const zugang = await pruefeZugang(req, env);
  if (!zugang.ok) {
    const status = zugang.status || 401;
    res.setHeader("WWW-Authenticate", 'Bearer realm="smejj"');
    fehler(res, status, status === 503 ? "server_error" : "invalid_request_error", zugang.grund, meldungZu(zugang.grund), anfrageId);
    return true;
  }

  // Unbegrenzte Konten (Betreiber, SMEJJ_API_UNBEGRENZT) umgehen auch die
  // Anfrage-Bremse: im Agentenbetrieb entsteht je Denkschritt eine Anfrage,
  // 60 je Minute sind da schnell erreicht. Kunden bleiben gebremst.
  const unbegrenzt = istUnbegrenzt(zugang.kontoId, env);
  const bremse = unbegrenzt
    ? { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 }
    : anfrageBremse.take(zugang.kontoId, url.pathname.endsWith("/chat/completions") ? 1 : 0.2);
  res.setHeader("x-ratelimit-limit-requests", unbegrenzt ? "unlimited" : "60");
  res.setHeader("x-ratelimit-remaining-requests", unbegrenzt ? "unlimited" : String(Math.max(0, Math.floor(bremse.remaining))));
  if (!bremse.allowed) {
    res.setHeader("Retry-After", String(bremse.retryAfterSec));
    fehler(res, 429, "rate_limit_error", "rate_limit_exceeded", `Zu viele Anfragen. In ${bremse.retryAfterSec} s erneut versuchen.`, anfrageId);
    return true;
  }

  try {
    if (req.method === "GET" && url.pathname === `${PUBLIC_API_PREFIX}/models`) {
      const liste = modelListePayload();
      const preise = preislistePayload();
      for (const modell of liste.data) modell.pricing = preise[modell.id] || null;
      antworte(res, 200, liste, anfrageId);
      return true;
    }
    if (req.method === "GET" && url.pathname.startsWith(`${PUBLIC_API_PREFIX}/models/`)) {
      const id = decodeURIComponent(url.pathname.slice(`${PUBLIC_API_PREFIX}/models/`.length));
      const treffer = modelListePayload().data.find((modell) => modell.id === id);
      if (!treffer) fehler(res, 404, "invalid_request_error", "model_not_found", `Unbekanntes Modell: ${id}`, anfrageId);
      else antworte(res, 200, treffer, anfrageId);
      return true;
    }
    if (req.method === "POST" && url.pathname === `${PUBLIC_API_PREFIX}/chat/completions`) {
      await chatCompletions(req, res, zugang, { env, fetchImpl, anfrageId });
      return true;
    }
    fehler(res, 404, "invalid_request_error", "unknown_endpoint", `Unbekannter Endpunkt: ${req.method} ${url.pathname}`, anfrageId);
    return true;
  } catch (error) {
    if (!res.headersSent) {
      fehler(res, 500, "server_error", "internal_error", String(error?.message || error).slice(0, 200), anfrageId);
    } else {
      res.end();
    }
    return true;
  }
}

// ---- /v1/chat/completions ----------------------------------------------------

async function chatCompletions(req, res, zugang, { env, fetchImpl, anfrageId }) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    return fehler(res, 400, "invalid_request_error", "invalid_json", "Der Anfragekoerper ist kein gueltiges JSON.", anfrageId);
  }

  const angefragtesModell = String(body?.model || "").trim() || PUBLIC_MODEL_DEFAULT;
  if (!istPublicModel(angefragtesModell)) {
    return fehler(res, 404, "invalid_request_error", "model_not_found",
      `Unbekanntes Modell "${angefragtesModell}". Verfuegbar: ${modelListePayload().data.map((m) => m.id).join(", ")}.`, anfrageId);
  }
  const nachrichten = pruefeNachrichten(body?.messages);
  if (!nachrichten.ok) {
    return fehler(res, 400, "invalid_request_error", nachrichten.code, nachrichten.meldung, anfrageId);
  }

  const tageslimit = tageslimitAus(env);
  if (tageslimit > 0) {
    const stand = await verbrauchSnapshot(zugang.kontoId, env);
    if (stand.gesamtTokens >= tageslimit) {
      res.setHeader("Retry-After", "3600");
      return fehler(res, 429, "rate_limit_error", "daily_quota_exceeded",
        `Tageskontingent erreicht (${stand.gesamtTokens} von ${tageslimit} Token). Es setzt um 00:00 UTC zurueck.`, anfrageId);
    }
  }

  // Prepaid wie bei jedem Anbieter am Markt: ohne Guthaben keine Anfrage.
  // OpenAI-Code "insufficient_quota" mit 402 — SDKs zeigen das dem Nutzer an,
  // statt blind zu wiederholen (429 wuerden sie wiederholen).
  let guthaben;
  try {
    guthaben = await darfAnfragen(zugang.kontoId, env);
  } catch (error) {
    console.error(`[public-api] Guthaben nicht lesbar (${anfrageId})`, String(error?.message || error).slice(0, 200));
    return fehler(res, 503, "server_error", "billing_unavailable", "Das Guthabenkonto ist gerade nicht erreichbar. Bitte erneut versuchen.", anfrageId);
  }
  if (!guthaben.ok) {
    return fehler(res, 402, "insufficient_quota", "insufficient_quota",
      "Kein Guthaben. Bitte unter https://smejj.com/entwickler.html aufladen.", anfrageId);
  }

  const stream = body?.stream === true;
  const profil = profilFuerModell(angefragtesModell);
  const { chain } = resolveModelRequest(profil, "", env);
  const lauf = await executeWithFallback(chain, mitIdentitaet(nachrichten.messages), {
    fetchImpl,
    stream,
    env,
    // Denken AUS, ausser der Kunde bestellt ausdruecklich das Denk-Modell.
    // Live gemessen 2026-08-23: eine Anfrage mit max_tokens=50 verbrauchte
    // 50 Reasoning-Token und lieferte content:"" mit finish_reason "length" —
    // der Kunde bezahlt und bekommt NICHTS. Dieselbe Regel gilt seit dem
    // 2026-07-28 im internen Chat (chatThinkingPolicy.js).
    ...(profil === "reasoning" ? {} : { thinking: THINKING_DISABLED }),
    ...(body?.temperature === undefined ? {} : { temperature: zahlImBereich(body.temperature, 0, 2) }),
    ...(body?.max_tokens === undefined ? {} : { maxTokens: ganzzahlImBereich(body.max_tokens, 1, 32_000) }),
    ...(Array.isArray(body?.tools) && body.tools.length ? { tools: body.tools } : {}),
    ...(body?.tool_choice === undefined ? {} : { toolChoice: body.tool_choice }),
    ...(body?.response_format === undefined ? {} : { responseFormat: body.response_format })
  });

  if (!lauf.ok) {
    // Die Versuchsliste nennt Backend-Namen — die gehoeren dem Kunden nicht.
    // Er bekommt die Tatsache, wir bekommen den Grund ins Log.
    console.error(`[public-api] kein Backend erreichbar (${anfrageId})`, JSON.stringify(lauf.attempts || []).slice(0, 400));
    return fehler(res, 503, "server_error", "upstream_unavailable",
      "Kein Modell erreichbar. Bitte in Kuerze erneut versuchen.", anfrageId);
  }

  if (!stream) return await antworteEinmalig(res, lauf, { angefragtesModell, zugang, env, anfrageId });
  return await antworteStrom(res, lauf, { angefragtesModell, zugang, env, anfrageId, nachrichten: nachrichten.messages });
}

async function antworteEinmalig(res, lauf, { angefragtesModell, zugang, env, anfrageId }) {
  const rohdaten = await lauf.response.json().catch(() => null);
  if (!rohdaten) {
    return fehler(res, 502, "server_error", "upstream_invalid_response", "Das Modell lieferte keine lesbare Antwort.", anfrageId);
  }
  const nutzung = leseUsage(rohdaten?.usage);
  rohdaten.model = angefragtesModell; // Marke statt Lieferant
  antworte(res, 200, rohdaten, anfrageId, { "x-smejj-usage-source": nutzung.gemessen ? "measured" : "estimated" });
  await zaehleVerbrauch(zugang.kontoId, {
    keyId: zugang.keyId,
    promptTokens: nutzung.promptTokens,
    completionTokens: nutzung.completionTokens,
    modell: angefragtesModell,
    env
  });
  await bucheAnfrage(zugang.kontoId, {
    anfrageId, keyId: zugang.keyId, modell: angefragtesModell,
    promptTokens: nutzung.promptTokens, completionTokens: nutzung.completionTokens, gemessen: nutzung.gemessen, env
  });
  await merkeBenutzung(zugang.kontoId, zugang.keyId, nutzung, env);
}

async function antworteStrom(res, lauf, { angefragtesModell, zugang, env, anfrageId, nachrichten }) {
  if (!lauf.response.body) {
    return fehler(res, 502, "server_error", "upstream_invalid_response", "Das Modell lieferte keinen Datenstrom.", anfrageId);
  }
  res.writeHead(200, {
    ...CORS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "x-request-id": anfrageId
  });

  const gemessen = { promptTokens: 0, completionTokens: 0, gemessen: false };
  let ausgabeZeichen = 0;
  const leser = lauf.response.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  try {
    while (true) {
      const { value, done } = await leser.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
      const zeilen = rest.split("\n");
      rest = zeilen.pop() ?? "";
      for (const zeile of zeilen) {
        const umgeschrieben = verarbeiteStromZeile(zeile, angefragtesModell, gemessen);
        ausgabeZeichen += umgeschrieben.inhaltZeichen;
        res.write(`${umgeschrieben.zeile}\n`);
      }
    }
    if (rest) {
      const umgeschrieben = verarbeiteStromZeile(rest, angefragtesModell, gemessen);
      ausgabeZeichen += umgeschrieben.inhaltZeichen;
      res.write(umgeschrieben.zeile);
    }
  } finally {
    leser.releaseLock();
    res.end();
  }

  // Kein usage-Block vom Backend (nicht jedes kann stream_options): dann
  // schaetzen statt null zu zaehlen. Vier Zeichen je Token ist die uebliche
  // Faustregel; der Kopf x-smejj-usage-source sagt es dem Kunden nicht mehr,
  // weil die Kopfzeilen im Stream schon raus sind — das Konto merkt es sich.
  const promptTokens = gemessen.gemessen ? gemessen.promptTokens : schaetzeTokens(nachrichten);
  const completionTokens = gemessen.gemessen ? gemessen.completionTokens : Math.ceil(ausgabeZeichen / 4);
  await zaehleVerbrauch(zugang.kontoId, {
    keyId: zugang.keyId,
    promptTokens,
    completionTokens,
    modell: angefragtesModell,
    env
  });
  await bucheAnfrage(zugang.kontoId, {
    anfrageId, keyId: zugang.keyId, modell: angefragtesModell,
    promptTokens, completionTokens, gemessen: gemessen.gemessen, env
  });
  await merkeBenutzung(zugang.kontoId, zugang.keyId, { promptTokens, completionTokens }, env);
}

/** Eine SSE-Zeile: Marke ersetzen, usage mitnehmen, Rest unveraendert lassen. */
export function verarbeiteStromZeile(zeile, angefragtesModell, gemessen) {
  if (!zeile.startsWith("data:")) return { zeile, inhaltZeichen: 0 };
  const nutzlast = zeile.slice(5).trim();
  if (!nutzlast || nutzlast === "[DONE]") return { zeile, inhaltZeichen: 0 };
  let block;
  try {
    block = JSON.parse(nutzlast);
  } catch {
    // Unlesbarer Block: unveraendert weiterreichen. Ein Parserfehler unsererseits
    // darf einen laufenden Stream nicht abschneiden.
    return { zeile, inhaltZeichen: 0 };
  }
  if (block && typeof block === "object") {
    if (block.model) block.model = angefragtesModell;
    if (block.usage && gemessen) {
      const nutzung = leseUsage(block.usage);
      if (nutzung.gemessen) {
        gemessen.promptTokens = nutzung.promptTokens;
        gemessen.completionTokens = nutzung.completionTokens;
        gemessen.gemessen = true;
      }
    }
  }
  const inhalt = block?.choices?.[0]?.delta?.content;
  return {
    zeile: `data: ${JSON.stringify(block)}`,
    inhaltZeichen: typeof inhalt === "string" ? inhalt.length : 0
  };
}

// ---- Zugang ------------------------------------------------------------------

async function pruefeZugang(req, env) {
  const schluessel = bearerSchluessel(req);
  if (!schluessel) return { ok: false, grund: "api_key_missing" };
  return await pruefeSchluessel(schluessel, env);
}

function meldungZu(grund) {
  switch (grund) {
    case "api_key_missing":
      return "Kein Schluessel. Erwartet wird: Authorization: Bearer smejj-live-…";
    case "api_key_malformed":
      return "Der Schluessel hat nicht die Form smejj-live-… oder smejj-adm-… (43 bzw. 42 Zeichen).";
    case "api_key_revoked":
      return "Dieser Schluessel wurde widerrufen.";
    case "api_key_expired":
      return "Dieser Schluessel ist abgelaufen. Bitte unter smejj.com/entwickler.html einen neuen erzeugen.";
    case "api_key_store_unavailable":
      return "Der Schluesselspeicher ist gerade nicht erreichbar. Bitte erneut versuchen.";
    default:
      return "Unbekannter Schluessel.";
  }
}

// ---- Identitaet --------------------------------------------------------------

// Das Modell dahinter stellt sich von sich aus vor ("the GLM language model
// trained by Z.ai" — live gemessen 2026-08-23 auf die Frage "Hi"). Das
// Umschreiben des model-Feldes faengt das nicht, es steht im Inhalt. Die
// Identitaet gehoert deshalb als ERSTE Systemnachricht in jede Anfrage —
// konstant und an Position 0, damit sie ein stabiler Cache-Praefix bleibt
// (ein wechselnder Block an Stelle 0 hat das Prompt-Caching schon einmal
// zerstoert). Die Systemnachricht des Kunden folgt unveraendert dahinter.
export const IDENTITAET = Object.freeze({
  role: "system",
  content: "Du bist smejj 1.0, das Sprachmodell von smejj.com. Wenn du nach deinem Namen, "
    + "Hersteller oder deiner Herkunft gefragt wirst, antwortest du: smejj 1.0 von smejj.com. "
    + "Nenne keinen anderen Modell- oder Anbieternamen als deinen eigenen."
});

export function mitIdentitaet(messages) {
  return [IDENTITAET, ...messages];
}

// ---- Eingabepruefung ---------------------------------------------------------

const ERLAUBTE_ROLLEN = new Set(["system", "user", "assistant", "tool", "developer"]);

export function pruefeNachrichten(wert) {
  if (!Array.isArray(wert) || wert.length === 0) {
    return { ok: false, code: "messages_required", meldung: "Das Feld messages fehlt oder ist leer." };
  }
  if (wert.length > 200) {
    return { ok: false, code: "messages_too_many", meldung: "Hoechstens 200 Nachrichten je Anfrage." };
  }
  const messages = [];
  for (const eintrag of wert) {
    const rolle = String(eintrag?.role || "");
    if (!ERLAUBTE_ROLLEN.has(rolle)) {
      return { ok: false, code: "message_role_invalid", meldung: `Unzulaessige Rolle "${rolle}".` };
    }
    const inhalt = eintrag?.content;
    const inhaltOk = typeof inhalt === "string" || Array.isArray(inhalt) || inhalt === null;
    if (!inhaltOk) {
      return { ok: false, code: "message_content_invalid", meldung: "content muss Text, eine Liste oder null sein." };
    }
    messages.push({
      role: rolle,
      content: inhalt,
      ...(eintrag?.name ? { name: String(eintrag.name).slice(0, 64) } : {}),
      ...(eintrag?.tool_call_id ? { tool_call_id: String(eintrag.tool_call_id).slice(0, 160) } : {}),
      ...(Array.isArray(eintrag?.tool_calls) ? { tool_calls: eintrag.tool_calls } : {})
    });
  }
  return { ok: true, messages };
}

// ---- Kleinkram ---------------------------------------------------------------

function antworte(res, status, payload, anfrageId, zusatz = {}) {
  res.writeHead(status, {
    ...CORS,
    ...zusatz,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "x-request-id": anfrageId
  });
  res.end(JSON.stringify(payload));
}

function fehler(res, status, typ, code, meldung, anfrageId) {
  // OpenAI-Fehlerform. Clients lesen error.message und error.code — eine
  // eigene Form waere fuer sie ein unbekannter Fehler ohne Text.
  antworte(res, status, { error: { message: meldung, type: typ, code, request_id: anfrageId } }, anfrageId);
}

function leseUsage(usage) {
  const promptTokens = Number(usage?.prompt_tokens ?? usage?.promptTokens ?? 0);
  const completionTokens = Number(usage?.completion_tokens ?? usage?.completionTokens ?? 0);
  const gemessen = Number.isFinite(promptTokens) && Number.isFinite(completionTokens) && (promptTokens > 0 || completionTokens > 0);
  return {
    promptTokens: gemessen ? Math.max(0, Math.floor(promptTokens)) : 0,
    completionTokens: gemessen ? Math.max(0, Math.floor(completionTokens)) : 0,
    gemessen
  };
}

function schaetzeTokens(nachrichten) {
  const zeichen = nachrichten.reduce((summe, eintrag) => {
    if (typeof eintrag.content === "string") return summe + eintrag.content.length;
    if (Array.isArray(eintrag.content)) return summe + JSON.stringify(eintrag.content).length;
    return summe;
  }, 0);
  return Math.ceil(zeichen / 4);
}

function tageslimitAus(env) {
  const wert = Number(env.SMEJJ_PUBLIC_API_TAGESLIMIT_TOKENS);
  if (!Number.isFinite(wert)) return TAGESLIMIT_VOREINSTELLUNG;
  return wert < 0 ? 0 : Math.floor(wert); // 0 = ausdruecklich kein Deckel
}

function zahlImBereich(wert, min, max) {
  const zahl = Number(wert);
  if (!Number.isFinite(zahl)) return undefined;
  return Math.min(max, Math.max(min, zahl));
}

function ganzzahlImBereich(wert, min, max) {
  const zahl = zahlImBereich(wert, min, max);
  return zahl === undefined ? undefined : Math.floor(zahl);
}
