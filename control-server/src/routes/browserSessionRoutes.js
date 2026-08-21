// smejj.com control-server — Live-Browser-Session-Bridge.
// Der Control Server fuehrt selbst keine Browser-Aktionen aus. Er prueft
// Origin, Ziel, Rate-Limit, Konfiguration und Budget-Gate und leitet dann an
// den Remote-Browser-Worker weiter (POST /session, /session/act,
// /session/close). Antworten werden defensiv uebernommen (nur erwartete
// Felder, nur gueltige Screenshots). Fail-closed in jedem Zweifelsfall.
import { createHash } from "node:crypto";
import { json, readJson } from "../http/respond.js";
import { clientKeyFromRequest, createRateLimiter } from "../http/rateLimiter.js";
import { isAllowedBrowserCaller, parseBrowserTarget } from "./browserProxyRoutes.js";
import { buildRemoteBrowserPlan, readRemoteBrowserConfig } from "./browserRemoteRoutes.js";

const SESSION_TIMEOUT_MS = 45_000;
// Interaktion braucht deutlich mehr Requests als Einmal-Rendern (jeder Klick
// ist ein Request) — eigener, grosszuegigerer Limiter, weiterhin pro Client.
const RATE_CAPACITY = clampInt(process.env.SMEJJ_BROWSER_SESSION_RATE_CAPACITY, 90, 1, 600);
const RATE_REFILL_PER_SEC = clampFloat(process.env.SMEJJ_BROWSER_SESSION_RATE_REFILL_PER_SEC, 1.5, 0.01, 30);
const defaultLimiter = createRateLimiter({ capacity: RATE_CAPACITY, refillPerSec: RATE_REFILL_PER_SEC });

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function clampFloat(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function sanitizeSessionId(value) {
  const id = String(value || "");
  return /^[a-f0-9]{16,64}$/i.test(id) ? id : "";
}

function isSessionScreenshot(value) {
  const text = String(value || "");
  return text.startsWith("data:image/jpeg;base64,") || text.startsWith("data:image/png;base64,");
}

// Worker-Antwort defensiv uebernehmen: nur bekannte Felder, nur gueltige Werte.
export function sanitizeSessionPayload(payload, fallbackUrl = "") {
  if (!payload || payload.ok !== true) return null;
  const sessionId = sanitizeSessionId(payload.sessionId);
  if (!sessionId || !isSessionScreenshot(payload.screenshot)) return null;
  const viewport = payload.viewport || {};
  return {
    ok: true,
    remote: true,
    interactive: true,
    sessionId,
    screenshot: String(payload.screenshot),
    finalUrl: typeof payload.finalUrl === "string" && /^https?:\/\//i.test(payload.finalUrl)
      ? payload.finalUrl.slice(0, 2000)
      : fallbackUrl,
    title: String(payload.title || "").slice(0, 300),
    viewport: {
      width: clampInt(viewport.width, 1365, 360, 1920),
      height: clampInt(viewport.height, 900, 360, 1200)
    },
    expiresInMs: clampInt(payload.expiresInMs, 0, 0, 3_600_000),
    // Trefferzahl der Suche. MUSS hier eingetragen sein: diese Liste ist eine
    // Erlaubnisliste, sie laesst NUR bekannte Felder durch. Am 2026-08-18 hat
    // sie prompt mein eigenes neues Feld verschluckt — die Aktion lief, die
    // Zahl kam nie an. Das ist kein Fehler der Liste, sondern ihr Zweck:
    // was der Worker schickt, ist nicht automatisch vertrauenswuerdig.
    // Merkregel: ein neues Feld im Worker ist erst dann da, wenn das Tor es
    // kennt.
    treffer: Number.isFinite(Number(payload.treffer))
      ? clampInt(payload.treffer, 0, 0, 500)
      : undefined,
    // Von einer Selektor-Leseaktion zurueckgegebener Text. Gleiche Lehre wie
    // bei `treffer`: ein neues Feld im Worker ist erst dann da, wenn das Tor
    // es kennt. Hart gekuerzt — was der Worker schickt, ist nicht automatisch
    // vertrauenswuerdig.
    gelesen: typeof payload.gelesen === "string"
      ? payload.gelesen.slice(0, 2000)
      : undefined,
    // Seitenzustand fuers Hinsehen. Dritte Runde derselben Lehre: ein neues
    // Feld ist erst da, wenn das Tor es kennt. Hart begrenzt — der Zustand
    // geht als UNTRUSTED Text in einen Modell-Prompt, also darf er weder
    // beliebig gross noch beliebig tief sein.
    // VIERTE RUNDE DERSELBEN LEHRE, und diesmal hat sie die ganze Maus
    // gekostet (gemessen 2026-08-19 an der laufenden Seite):
    //
    // Der Worker liefert laengst den Bedienbaum aus workers/maus-engine/
    // observer.mjs — { textExcerpt, truncated, elements:[{n, tag, x, y,
    // role, text, href, ...}] }. Dieses Tor kannte davon KEIN einziges Feld.
    // Es liess nur `text` und `elements:[{role,name,selector}]` durch, und
    // beides schickt der Worker gar nicht mehr. Ergebnis: die Beobachtung kam
    // vollstaendig LEER beim Modell an — text:"" und Elemente, in denen jedes
    // Feld ein leerer String war.
    //
    // Die Folgen sahen wie drei verschiedene Fehler aus und waren einer:
    //   * entscheidung_abgelehnt in Dauerschleife (aus nichts laesst sich kein
    //     gueltiger Schritt bilden)
    //   * planer_leere_antwort (der Prompt war praktisch leer)
    //   * "keine relevanten Elemente oder Textinhalte gefunden" — die Maus hat
    //     die Wahrheit gesagt, niemand hat ihr geglaubt
    //
    // Gegenprobe, die es bewiesen hat: selectorText auf css=body lieferte auf
    // DERSELBEN Seite den vollen Text. Der Weg war offen, nur dieses Tor zu.
    //
    // Erlaubnisliste BLEIBT Erlaubnisliste: jedes Feld ist einzeln genannt und
    // hart begrenzt. Der Zustand geht als UNTRUSTED Text in einen Modell-
    // Prompt — er darf weder beliebig gross noch beliebig tief sein. `text`
    // bleibt erhalten, damit ein aelterer Worker weiter funktioniert.
    beobachtung: payload.beobachtung && typeof payload.beobachtung === "object"
      ? {
        url: String(payload.beobachtung.url || "").slice(0, 2000),
        title: String(payload.beobachtung.title || "").slice(0, 300),
        text: String(payload.beobachtung.text || "").slice(0, 6000),
        textExcerpt: String(payload.beobachtung.textExcerpt || "").slice(0, 6000),
        truncated: payload.beobachtung.truncated === true ? true : undefined,
        elements: Array.isArray(payload.beobachtung.elements)
          ? payload.beobachtung.elements.slice(0, 60).map((e) => saubereBeobachtungsElement(e))
          : []
      }
      : undefined,
    // Der ARIA-Bedienbaum (Aktion ariaObserve, ZCode-Vorbild). GEMESSEN
    // 2026-08-21 am Live-Dienst: die Aktion antwortete ok:true, und das Feld
    // fiel GENAU HIER still weg — dieselbe Erlaubnisliste, die oben im
    // Kommentar schon einmal die ganze Beobachtung geleert hat. Ein Feld
    // bauen und es hier nicht nennen heisst: es kommt nie an.
    //
    // Erlaubnisliste bleibt Erlaubnisliste: einzeln genannt, hart gekappt.
    // Das Zeichenlimit ist dasselbe wie im Worker (BEDIENBAUM_LIMIT_CHARS);
    // der Baum geht als UNTRUSTED Text in einen Modell-Prompt.
    ariaBeobachtung: payload.ariaBeobachtung && typeof payload.ariaBeobachtung === "object"
      ? {
        url: String(payload.ariaBeobachtung.url || "").slice(0, 2000),
        titel: String(payload.ariaBeobachtung.titel || "").slice(0, 300),
        baum: String(payload.ariaBeobachtung.baum || "").slice(0, 6000),
        knoten: Number.isFinite(Number(payload.ariaBeobachtung.knoten))
          ? Math.max(0, Math.min(5000, Math.round(Number(payload.ariaBeobachtung.knoten))))
          : undefined,
        gekappt: payload.ariaBeobachtung.gekappt === true ? true : undefined
      }
      : undefined
  };
}

// Ein Element des Bedienbaums, Feld fuer Feld erlaubt und gekappt.
//
// `n` ist die KENNUNG, mit der das Modell spaeter auf genau dieses Element
// zeigt ("klicke n=12"). Faellt sie weg, kann die Maus zwar sehen, aber nicht
// zielen — deshalb steht sie hier an erster Stelle und nicht als Beiwerk.
export function saubereBeobachtungsElement(e) {
  const zahl = (wert, hoechstens) => (Number.isFinite(Number(wert)) ? Math.max(-hoechstens, Math.min(hoechstens, Math.round(Number(wert)))) : undefined);
  const text = (wert, laenge) => {
    const t = String(wert ?? "").slice(0, laenge);
    return t || undefined;
  };
  const sauber = {
    n: zahl(e?.n, 1000),
    tag: text(e?.tag, 20),
    x: zahl(e?.x, 20000),
    y: zahl(e?.y, 20000),
    role: text(e?.role, 40),
    type: text(e?.type, 30),
    name: text(e?.name, 200),
    id: text(e?.id, 80),
    href: text(e?.href, 300),
    placeholder: text(e?.placeholder, 120),
    label: text(e?.label, 120),
    text: text(e?.text, 120),
    // Passwortfelder tragen im Beobachter bereits "***". Die Marke wird
    // durchgereicht, damit das Modell weiss, dass es dort nichts zu holen gibt.
    masked: e?.masked === true ? true : undefined,
    ausserhalbBild: e?.ausserhalbBild === true ? true : undefined,
    // Alte Worker schicken einen fertigen Selektor mit. Bleibt erlaubt.
    selector: e?.selector && typeof e.selector === "object"
      ? { strategy: text(e.selector.strategy, 20), value: text(e.selector.value, 300) }
      : undefined
  };
  for (const [schluessel, wert] of Object.entries(sauber)) {
    if (wert === undefined) delete sauber[schluessel];
  }
  return sauber;
}

// Body-Validierung pro Endpunkt (fail-closed). Die Engine im Worker validiert
// erneut — hier wird nur weitergegeben, was plausibel ist.
/**
 * Profil-Kennung eines Kontos — der Schluessel, unter dem der Fern-Browser
 * seine Cookies ablegt.
 *
 * WARUM GEHASHT (Betreiber-Wunsch 2026-08-20 "angemeldet bleiben"): Der
 * Worker legt je Kennung ein Browser-Profil an. Stuende dort die Adresse im
 * Klartext, waere aus einem Verzeichnisnamen ablesbar, WER die Plattform
 * benutzt. Der Hash trennt genauso zuverlaessig, verraet aber nichts.
 *
 * KEINE Identitaet -> KEIN Profil (null): dann arbeitet der Fern-Browser wie
 * bisher in einem fluechtigen Fenster. Fail-closed, denn ein geteiltes
 * Profil waere das Schlimmste ueberhaupt — ein Nutzer saesse in der
 * Anmeldung eines anderen.
 */
export function profilKennung(authUser) {
  const kennung = String(authUser?.userId || authUser?.email || "").trim().toLowerCase();
  if (!kennung) return null;
  return createHash("sha256").update(`smejj-browser-profil:${kennung}`).digest("hex").slice(0, 32);
}

export function validateSessionRequest(kind, body = {}, profil = null) {
  if (kind === "open") {
    const parsed = parseBrowserTarget(body.url);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const viewport = body.viewport || {};
    return {
      ok: true,
      forward: {
        url: parsed.url.toString(),
        viewport: {
          width: clampInt(viewport.width, 1365, 360, 1920),
          height: clampInt(viewport.height, 900, 360, 1200)
        },
        // Nur die SERVERSEITIG abgeleitete Kennung geht mit — niemals ein
        // Wert aus dem Anfragekoerper. Sonst koennte ein Aufrufer das Profil
        // eines fremden Kontos anfordern.
        ...(profil ? { profil } : {})
      }
    };
  }
  const sessionId = sanitizeSessionId(body.sessionId);
  if (!sessionId) return { ok: false, error: "session_id_invalid" };
  if (kind === "close") return { ok: true, forward: { sessionId } };
  if (kind === "act") {
    const action = body.action;
    if (!action || typeof action !== "object" || typeof action.type !== "string") {
      return { ok: false, error: "action_missing" };
    }
    if (action.type === "navigate") {
      const parsed = parseBrowserTarget(action.url);
      if (!parsed.ok) return { ok: false, error: parsed.error };
    }
    return { ok: true, forward: { sessionId, action } };
  }
  return { ok: false, error: "session_endpoint_unknown" };
}

export async function handleBrowserSession(kind, req, res, {
  env = process.env,
  limiter = defaultLimiter,
  fetchImpl = fetch,
  activeWorkers = 0,
  body = null
} = {}) {
  if (req && !isAllowedBrowserCaller(req, env)) {
    return json(res, 403, { ok: false, error: "Origin nicht erlaubt.", remote: false });
  }
  if (req && limiter) {
    const verdict = limiter.take(clientKeyFromRequest(req));
    if (!verdict.allowed) {
      res.setHeader?.("Retry-After", String(verdict.retryAfterSec));
      return json(res, 429, { ok: false, error: "Zu viele Live-Browser-Anfragen. Bitte kurz warten.", retryAfterSec: verdict.retryAfterSec });
    }
  }

  let input = body;
  if (input === null) {
    try {
      input = await readJson(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message || "Invalid JSON"), remote: false });
    }
  }

  const request = validateSessionRequest(kind, input || {}, profilKennung(req?.authUser));
  if (!request.ok) return json(res, 400, { ok: false, error: request.error, remote: false });

  const plan = buildRemoteBrowserPlan({ env, activeWorkers });
  if (!plan.ok) {
    return json(res, 503, {
      ok: false,
      error: "Live-Browser ist noch nicht freigegeben oder nicht konfiguriert.",
      remote: false,
      plan
    });
  }

  const config = readRemoteBrowserConfig(env);
  const path = kind === "open" ? "/session" : kind === "act" ? "/session/act" : "/session/close";
  let response;
  try {
    response = await fetchImpl(`${config.workerUrl}${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(request.forward)
    });
  } catch (error) {
    return json(res, 502, { ok: false, error: `Live-Browser nicht erreichbar: ${String(error?.message || error).slice(0, 200)}`, remote: false });
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return json(res, 502, { ok: false, error: "Live-Browser lieferte keine gueltige JSON-Antwort.", remote: false });
  }

  if (kind === "close") {
    return json(res, 200, { ok: true, closed: payload.closed === true });
  }
  if (!response.ok || payload.ok !== true) {
    const status = [400, 404, 409, 410, 429].includes(response.status) ? response.status : 502;
    return json(res, status, { ok: false, error: String(payload.error || "Live-Browser-Aktion fehlgeschlagen").slice(0, 200), remote: false });
  }
  const clean = sanitizeSessionPayload(payload, kind === "open" ? request.forward.url : "");
  if (!clean) return json(res, 502, { ok: false, error: "Live-Browser-Antwort unvollstaendig.", remote: false });
  return json(res, 200, clean);
}
