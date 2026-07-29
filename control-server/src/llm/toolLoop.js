// smejj.com — echtes Tool-Calling: das Modell waehlt selbst, wann es eine Seite liest.
//
// Bisher entschied ein Regex-Vorfilter im Frontend, ob eine Webseite geholt wird
// (Befund 2026-07-27). Das ist die falsche Stelle: nur das Modell kennt die
// Absicht. Hier bekommt es Werkzeuge angeboten und ruft sie selbst auf — wie bei
// Claude und Codex.
//
// Ablauf je Runde:
//   1. Modell mit `tools` aufrufen (Streaming).
//   2. Sichtbaren Text sofort durchreichen; Werkzeugaufrufe einsammeln.
//   3. Kam ein Aufruf: ausfuehren, Ergebnis an die Nachrichten haengen, naechste
//      Runde. Kam keiner: fertig.
//   4. Nach MAX_ROUNDS ein letzter Aufruf OHNE Werkzeuge, damit immer eine
//      Antwort entsteht und keine Endlosschleife moeglich ist.
//
// Fail-closed in beide Richtungen:
//   - Ohne SMEJJ_AGENT_TOOLS_ENABLED=YES werden keine Werkzeuge angeboten; der
//     bisherige Pfad laeuft unveraendert weiter (Non-Regression).
//   - Ein fehlgeschlagenes Werkzeug liefert eine Fehlermeldung als Werkzeug-
//     Ergebnis zurueck, nie einen Abbruch: das Modell kann darauf antworten.
//
// Lastregel: Werkzeuge laufen nur auf ausdruecklichen Modellwunsch, nie beim
// normalen Seitenaufruf. Der Control Server bleibt aus dem Ladepfad heraus.

import { filterSseEvent } from "./streamFilter.js";
import { parseBrowserTarget, extractTitle } from "../routes/browserProxyRoutes.js";
import { searchWeb, cleanSnippet } from "../../../src/search/webSearch.js";

const MAX_ROUNDS = 3;
const MAX_PAGE_CHARS = 6000;
const PAGE_TIMEOUT_MS = 8000;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_SUCHTREFFER = 6;

/** Werkzeuge im OpenAI-Format. Weitere Werkzeuge sind ein zusaetzlicher Eintrag. */
export const AGENT_TOOLS = Object.freeze([
  Object.freeze({
    type: "function",
    function: {
      name: "seite_lesen",
      description: "Liest eine oeffentliche Webseite und liefert Titel, HTTP-Status und Textinhalt. "
        + "Nutze das, wenn die Aufgabe eine Adresse nennt oder du den echten Inhalt einer Seite brauchst. "
        + "Rate nie ueber Seiteninhalte — lies sie.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Vollstaendige https-Adresse, zum Beispiel https://imild.com/" }
        },
        required: ["url"]
      }
    }
  }),
  // Zweite Sicherung gegen "Ich habe keine Informationen" (Befund 2026-07-29):
  // Die Vorpruefung shouldSearchWeb() kann eine Aktualitaetsfrage uebersehen.
  // Dann muss das Modell selbst nachsuchen koennen, statt aufzugeben — genau so
  // arbeiten fuehrende Assistenten. Die Beschreibung ist bewusst als Verbot
  // formuliert, weil Modelle "du darfst" schwaecher gewichten als "nie ohne".
  Object.freeze({
    type: "function",
    function: {
      name: "web_suche",
      description: "Sucht live im Internet und liefert die besten Treffer mit Titel, Adresse und Kurztext. "
        + "Nutze das IMMER, wenn dir Fakten fehlen oder unsicher sind: Nachrichten, Schlagzeilen, Ereignisse, "
        + "Preise, Kurse, Wetter, Oeffnungszeiten, Termine, Sportergebnisse, Software-Versionen. "
        + "Antworte NIEMALS mit 'ich habe keine Informationen', 'ich bin nicht auf dem neuesten Stand' oder "
        + "'ich kann dir dabei nicht helfen', ohne vorher web_suche aufgerufen zu haben.",
      parameters: {
        type: "object",
        properties: {
          anfrage: {
            type: "string",
            description: "Kurze Suchanfrage in der Sprache des Nutzers, zum Beispiel 'Schlagzeilen Berlin heute'."
          }
        },
        required: ["anfrage"]
      }
    }
  })
]);

/** Ist Tool-Calling eingeschaltet? Default NEIN (fail-closed, Non-Regression). */
export function agentToolsEnabled(env = process.env) {
  return String(env.SMEJJ_AGENT_TOOLS_ENABLED || "").trim().toUpperCase() === "YES";
}

/** Haengt die Werkzeuge an die Modell-Optionen — nur wenn eingeschaltet. */
export function withAgentTools(options, env = process.env) {
  return agentToolsEnabled(env) ? { ...options, tools: AGENT_TOOLS } : options;
}

/**
 * Streamt die Antwort und fuehrt dabei Werkzeugaufrufe des Modells aus.
 * @param {object} args
 * @param {object} args.result Erste Antwort aus executeWithFallback.
 * @param {Array} args.chain Modell-Kette fuer Folgerunden.
 * @param {Array} args.messages Nachrichtenverlauf (wird kopiert, nicht veraendert).
 * @param {object} args.res HTTP-Antwort, Header sind bereits geschrieben.
 * @param {object} args.options Modell-Optionen der ersten Runde.
 * @param {Function} args.executeWithFallback Modellaufruf.
 * @param {Function} [args.runTool] Werkzeug-Ausfuehrung (testbar injizierbar).
 * @param {object} [args.env]
 */
export async function streamWithTools({ result, chain, messages, res, options, executeWithFallback, runTool = runAgentTool, env = process.env }) {
  let current = result;
  const verlauf = [...messages];

  for (let runde = 0; runde < MAX_ROUNDS; runde += 1) {
    const { toolCalls, sawContent } = await pumpRound(current.response.body, res, env);
    if (!toolCalls.length) return finishStream(res);

    // Das Modell will ein Werkzeug. Sein bisheriger Text bleibt sichtbar.
    verlauf.push({ role: "assistant", content: sawContent || null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const ergebnis = await runTool(call, { env }).catch((error) => `Werkzeugfehler: ${String(error?.message || error).slice(0, 200)}`);
      verlauf.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: String(ergebnis).slice(0, MAX_PAGE_CHARS + 500) });
    }

    // Letzte Runde ohne Werkzeuge: erzwingt eine Antwort statt einer Schleife.
    const letzte = runde === MAX_ROUNDS - 1;
    const naechste = await executeWithFallback(chain, verlauf, letzte ? { ...options, tools: undefined } : options);
    if (!naechste?.ok || !naechste.response?.body) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "\n\nDas Werkzeugergebnis konnte nicht ausgewertet werden." } }] })}\n\n`);
      return finishStream(res);
    }
    current = naechste;
  }
  return finishStream(res);
}

// Liest einen Modell-Stream: sichtbarer Text geht sofort raus, Werkzeugaufrufe
// werden gesammelt und NICHT durchgereicht (sie sind kein Antworttext).
async function pumpRound(body, res, env) {
  const decoder = new TextDecoder();
  const state = { buffer: "", content: "", insideThink: false };
  const calls = new Map();
  let sawContent = "";
  let fertig = false;

  for await (const chunk of body) {
    state.buffer += decoder.decode(chunk, { stream: true });
    let splitAt = state.buffer.indexOf("\n\n");
    while (splitAt !== -1) {
      const event = state.buffer.slice(0, splitAt);
      state.buffer = state.buffer.slice(splitAt + 2);
      const text = handleEvent(event, state, res, calls, env);
      if (text === null) fertig = true;
      else sawContent += text;
      splitAt = state.buffer.indexOf("\n\n");
    }
  }
  state.buffer += decoder.decode();
  if (state.buffer.trim()) {
    const text = handleEvent(state.buffer, state, res, calls, env);
    if (text !== null) sawContent += text;
  }
  void fertig;
  return { toolCalls: [...calls.values()].filter((call) => call.function.name), sawContent };
}

// Liefert den sichtbaren Text des Ereignisses, oder null bei [DONE].
function handleEvent(event, state, res, calls, env) {
  const payload = leseNutzlast(event);
  if (payload === "[DONE]") return null; // Erst am Ende der Schleife senden.
  const parsed = payload ? sicherParsen(payload) : null;
  const delta = parsed?.choices?.[0]?.delta;

  if (Array.isArray(delta?.tool_calls)) {
    for (const teil of delta.tool_calls) sammleWerkzeugaufruf(calls, teil);
    return ""; // Werkzeugaufrufe nie an den Nutzer durchreichen.
  }
  if (agentToolsEnabled(env) && parsed?.choices?.[0]?.finish_reason === "tool_calls") return "";

  const gefiltert = filterSseEvent(event, state);
  if (gefiltert) res.write(`${gefiltert}\n\n`);
  return typeof delta?.content === "string" ? delta.content : "";
}

// OpenAI liefert Werkzeugaufrufe in Bruchstuecken: Name und Argumente wachsen
// ueber mehrere Ereignisse, zusammengehalten vom Index.
function sammleWerkzeugaufruf(calls, teil) {
  const index = Number(teil?.index ?? 0);
  const vorhanden = calls.get(index) || { id: "", type: "function", function: { name: "", arguments: "" } };
  if (teil?.id) vorhanden.id = String(teil.id);
  if (teil?.function?.name) vorhanden.function.name = String(teil.function.name);
  if (typeof teil?.function?.arguments === "string") vorhanden.function.arguments += teil.function.arguments;
  if (!vorhanden.id) vorhanden.id = `call_${index}`;
  calls.set(index, vorhanden);
}

function leseNutzlast(event) {
  const zeile = event.split("\n").find((line) => line.startsWith("data: "));
  return zeile ? zeile.slice(6) : "";
}

function sicherParsen(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function finishStream(res) {
  res.write("data: [DONE]\n\n");
}

/** Fuehrt ein Werkzeug aus. Unbekannte Werkzeuge werden abgelehnt (fail-closed). */
export async function runAgentTool(call, { fetchImpl = fetch, sucheImpl = searchWeb } = {}) {
  const name = call?.function?.name || "";
  if (name !== "seite_lesen" && name !== "web_suche") return `Unbekanntes Werkzeug: ${name}`;
  let args;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return "Die Werkzeug-Argumente waren kein gueltiges JSON.";
  }
  if (name === "web_suche") return sucheImWeb(String(args?.anfrage || ""), sucheImpl);
  return leseSeite(String(args?.url || ""), fetchImpl);
}

// Liefert die Treffer als nummerierte Liste mit Abrufzeit. Der Zeitstempel ist
// Pflicht: ohne ihn kann das Modell die Aktualitaet nicht belegen und schreibt
// "Stand unbekannt". Fail-safe: ein Fehler ergibt einen erklaerenden Text als
// Werkzeugergebnis, nie einen Abbruch — das Modell kann darauf reagieren.
async function sucheImWeb(anfrage, sucheImpl) {
  const bereinigt = anfrage.trim();
  if (!bereinigt) return "Leere Suchanfrage — bitte mit einem konkreten Suchbegriff erneut aufrufen.";
  let treffer;
  try {
    treffer = await sucheImpl(bereinigt, { limit: MAX_SUCHTREFFER });
  } catch (error) {
    return `Die Suche ist fehlgeschlagen: ${String(error?.message || error).slice(0, 160)}`;
  }
  if (!Array.isArray(treffer) || treffer.length === 0) {
    return `Keine Treffer fuer "${bereinigt}". Formuliere die Anfrage kuerzer oder mit anderen Stichworten.`;
  }
  const zeilen = treffer.map((eintrag, index) => {
    const kurz = cleanSnippet(eintrag?.snippet || "");
    const kopf = `${index + 1}. ${eintrag?.title || "(ohne Titel)"}\n   ${eintrag?.url || ""}`;
    return kurz ? `${kopf}\n   ${kurz}` : kopf;
  });
  return [`Suchergebnisse fuer "${bereinigt}" (abgerufen ${new Date().toISOString()}):`, ...zeilen].join("\n");
}

// Nutzt bewusst parseBrowserTarget aus dem Browser-Proxy: dieselbe gepruefte
// Regel gegen interne Adressen (SSRF), kein zweiter Sicherheitsstand.
async function leseSeite(rawUrl, fetchImpl) {
  const ziel = parseBrowserTarget(rawUrl);
  if (!ziel?.ok) return `Adresse abgelehnt: ${ziel?.error || "ungueltig"}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const antwort = await fetchImpl(ziel.url, { redirect: "follow", signal: controller.signal });
    const typ = String(antwort.headers.get("content-type") || "");
    if (!/text\/html|text\/plain|application\/xhtml/i.test(typ)) {
      return `HTTP ${antwort.status}, Inhaltstyp ${typ || "unbekannt"} — kein lesbarer Text.`;
    }
    const html = (await antwort.text()).slice(0, MAX_PAGE_BYTES);
    const titel = extractTitle(html) || "";
    const text = zuText(html).slice(0, MAX_PAGE_CHARS);
    return [
      `URL: ${ziel.url}`,
      `HTTP-Status: ${antwort.status}`,
      titel ? `Titel: ${titel}` : "",
      "",
      text || "(kein Textinhalt gefunden)"
    ].filter(Boolean).join("\n");
  } catch (error) {
    return `Seite nicht ladbar: ${error?.name === "AbortError" ? "Zeitueberschreitung" : String(error?.message || error).slice(0, 160)}`;
  } finally {
    clearTimeout(timer);
  }
}

export function zuText(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
