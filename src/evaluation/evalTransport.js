// smejj.com — Transportwege des Eval-Harness zu einem Modell.
//
// Zwei Wege, bewusst getrennt:
//   "control"  -> die LIVE-Kette von smejj.com (Chat-Bruecke -> Control Server ->
//                 Modell-Router). Misst das, was Nutzer wirklich erleben, und
//                 braucht lokal KEINE API-Schluessel. Standardweg.
//   "provider" -> direkt gegen den Modell-Router mit lokalem BYOK-Schluessel.
//                 Nur fuer die Bewertung eines Modells, das noch nicht live
//                 geschaltet ist. Fail-closed ohne Konfiguration.
//
// Beide liefern dasselbe Ergebnisobjekt:
//   {ok, text, latencyMs, firstTokenMs, backend, modelId, error}
// Historischer Standard-Messweg: die Schnellspur. Bewusst als Standard belassen,
// damit eine Umstellung eine ausdrueckliche Entscheidung ist und nicht als
// Nebenwirkung eines Deploys passiert — ein gewechselter Messweg verschiebt den
// Massstab und macht Berichte untereinander unvergleichbar.
// Befund 2026-08-04: Hier stand die ZEABUR-Bruecke — also die RESERVE, nicht
// die Kette, die Nutzer wirklich bekommen. `public/config.js` fuehrt seit dem
// 2026-08-03 die Salad-Bruecke als primaer und Zeabur nur als Rueckfall.
// Gemessen wurde damit monatelang der falsche Weg; am 2026-08-04 fiel es auf,
// weil die Reserve mit HTTP 401 antwortete und der ganze Lauf 0 % ergab.
//
// MERKREGEL: Ein Messweg, der nicht der Nutzerweg ist, misst etwas anderes als
// das Produkt. Wechselt der primaere Endpunkt, muss diese Zeile mitwandern —
// `tests/model-eval.test.mjs` haelt sie deshalb gegen public/config.js.
export const DEFAULT_CHAT_ENDPOINT = "https://starfruit-thyme-cblgn6u06ca2z9d5.salad.cloud/api/chat";
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Messweg aus der Umgebung. Umstellen ist damit ein Zahlenwechsel, kein Release:
 *   SMEJJ_EVAL_CHAT_ENDPOINT=https://smejj-control.zeabur.app/api/chat
 * Ohne Angabe bleibt es beim historischen Standard.
 */
export function chatEndpointFromEnv(env = process.env) {
  const wert = String(env?.SMEJJ_EVAL_CHAT_ENDPOINT || "").trim();
  return wert || DEFAULT_CHAT_ENDPOINT;
}

export const TRANSPORTS = Object.freeze(["control", "provider"]);

/**
 * Ab dieser Ausgabe-Obergrenze darf ein denkendes Modell weiterdenken.
 *
 * Gemessen am 2026-07-29 gegen glm-4.7-flash mit dem Fall code-esm-failclosed:
 *   Denken AN,  max_tokens  600 -> 600 Token verbraucht, content LEER
 *   Denken AN,  max_tokens 2500 -> 1565 Token, content 525 Zeichen, alle Zusicherungen bestanden
 *   Denken AUS, max_tokens  600 ->  199 Token, content 827 Zeichen, alle Zusicherungen bestanden
 *
 * Die Denk-Abschnitte zaehlen also gegen dasselbe Budget wie die Antwort. Ist das
 * Budget knapp, frisst das Denken die Antwort vollstaendig auf — der Harness
 * bekommt leeren Text und wertet ein gutes Modell als Totalausfall. Genau so
 * entstehen falsche Modellentscheidungen aus richtiger Messmechanik.
 *
 * Darum wird das Denken NUR bei knappem Budget abgeschaltet, nicht generell: wo
 * Platz ist, bleibt die Antwortguete unangetastet.
 */
export const THINKING_MIN_TOKEN_BUDGET = 2000;

/**
 * Unterscheidet Infrastrukturrauschen von einem echten Modellversagen.
 * Ohne diese Unterscheidung wird ein einzelner 503 der Bruecke faelschlich als
 * "Modell hat versagt" gezaehlt und verfaelscht jede Modellentscheidung.
 */
export function isTransientError(error) {
  const reason = String(error || "");
  if (reason === "timeout" || reason === "network_error" || reason === "empty_response") return true;
  // Der Notfall-Assistent ist ein KONFIGURATIONSZUSTAND, kein Modellversagen.
  // Wuerde er als Modellfehler gezaehlt, saehe eine falsch eingestellte Spur wie
  // ein schlechtes Modell aus — genau die Verwechslung, die dieses Modul verhindert.
  if (reason === "notfall_assistent") return true;
  const http = reason.match(/^http_(\d{3})$/);
  if (!http) return false;
  const status = Number(http[1]);
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Ruft die Live-Kette von smejj.com auf und liest den SSE-Stream mit.
 * @returns {Promise<{ok: boolean, text: string, latencyMs: number, firstTokenMs: number|null, backend: string, modelId: string, error: string|null}>}
 */
export async function callViaControl(evalCase, {
  endpoint = chatEndpointFromEnv(),
  modelId = "",
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => Date.now(),
  // Zusatzkoepfe fuer Endpunkte hinter einem Gateway mit Zugangsschutz —
  // der Salad-Gateway des LoRA-Trainers verlangt Salad-Api-Key (auth:true).
  headers: zusatzKoepfe = {}
} = {}) {
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Origin: "https://smejj.com",
        ...zusatzKoepfe
      },
      body: JSON.stringify({ messages: buildMessages(evalCase), ...(modelId ? { model: modelId } : {}) })
    });
    if (!response.ok) {
      return failure(`http_${response.status}`, now() - started, {
        backend: "control",
        modelId: response.headers?.get?.("x-smejj-model-id") || modelId
      });
    }
    // Waechter gegen die schlimmste Fehlmessung: antwortet der Notfall-Assistent
    // (localAssistantStream, greift wenn SMEJJ_SERVER_AI_ENABLED nicht "true" ist),
    // kommen fluessige Konservensaetze zurueck, die Zusicherungen reissen — und das
    // saehe aus wie ein schlechtes Modell statt wie eine unfertige Spur.
    // Erkennungsmerkmal: streamLLM setzt x-smejj-model-backend, der
    // Notfall-Assistent antwortet VOR diesem Kopf und hat ihn daher nie.
    const backendKopf = response.headers?.get?.("x-smejj-model-backend") || "";
    if (!backendKopf) {
      return failure("notfall_assistent", now() - started, { backend: "notfall-assistent", modelId });
    }
    const stream = await readSseStream(response, { started, now });
    return {
      ok: stream.text.trim().length > 0,
      text: stream.text,
      latencyMs: now() - started,
      firstTokenMs: stream.firstTokenMs,
      backend: response.headers?.get?.("x-smejj-model-backend") || "control",
      modelId: response.headers?.get?.("x-smejj-model-id") || modelId,
      error: stream.text.trim().length > 0 ? null : "empty_response"
    };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timeout" : String(error?.message || error).slice(0, 120);
    return failure(reason, now() - started, { backend: "control", modelId });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ruft den Modell-Router direkt auf (BYOK, kein Streaming noetig).
 * @param {object} deps.resolveModelRequest  aus control-server/src/llm/modelRouter.js
 * @param {object} deps.executeWithFallback  aus control-server/src/llm/modelRouter.js
 */
export async function callViaProvider(evalCase, {
  modelId = "",
  env = process.env,
  resolveModelRequest,
  executeWithFallback,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => Date.now()
} = {}) {
  if (typeof resolveModelRequest !== "function" || typeof executeWithFallback !== "function") {
    return failure("router_unavailable", 0, { backend: "provider", modelId });
  }
  const { chain } = resolveModelRequest(evalCase?.profile || "default", modelId, env);
  if (!Array.isArray(chain) || chain.length === 0) {
    // Fail-closed: ohne konfigurierten Zugang wird nichts geraten und nichts gestartet.
    return failure("model_not_configured", 0, { backend: "provider", modelId });
  }
  const started = now();
  const budget = Number(evalCase?.maxTokens);
  const knappesBudget = Number.isFinite(budget) && budget < THINKING_MIN_TOKEN_BUDGET;
  const outcome = await executeWithFallback(chain, buildMessages(evalCase), {
    fetchImpl,
    stream: false,
    maxTokens: evalCase?.maxTokens,
    // Siehe THINKING_MIN_TOKEN_BUDGET: bei knappem Budget wuerde das Denken die
    // Antwort auffressen und leeren Text hinterlassen. executeWithFallback gibt
    // das Feld ohnehin nur an GLM/Z.ai-Backends weiter, andere sehen es nie.
    ...(knappesBudget ? { thinking: { type: "disabled" } } : {}),
    timeoutMs
  });
  if (!outcome?.ok) {
    const reason = outcome?.attempts?.[outcome.attempts.length - 1]?.error || "all_backends_failed";
    return failure(String(reason).slice(0, 120), now() - started, { backend: "provider", modelId });
  }
  let payload;
  try {
    payload = await outcome.response.json();
  } catch {
    return failure("invalid_json_response", now() - started, { backend: outcome.backend, modelId });
  }
  const text = String(payload?.choices?.[0]?.message?.content || "");
  const latencyMs = now() - started;
  return {
    ok: text.trim().length > 0,
    text,
    latencyMs,
    // Ohne Streaming gibt es keinen echten Erst-Token-Wert; null ist ehrlicher als eine Schaetzung.
    firstTokenMs: null,
    backend: outcome.backend || "provider",
    modelId: outcome.logicalModelId || modelId,
    error: text.trim().length > 0 ? null : "empty_response"
  };
}

/** Nachrichtenliste eines Falls im OpenAI-kompatiblen Format. */
export function buildMessages(evalCase) {
  const messages = [];
  if (typeof evalCase?.system === "string" && evalCase.system.trim()) {
    messages.push({ role: "system", content: evalCase.system.trim() });
  }
  messages.push({ role: "user", content: String(evalCase?.prompt || "") });
  return messages;
}

/**
 * Liest einen OpenAI-kompatiblen SSE-Stream und setzt den sichtbaren Text zusammen.
 * Exportiert, damit der Parser ohne Netz getestet werden kann.
 */
export async function readSseStream(response, { started = 0, now = () => Date.now() } = {}) {
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let firstTokenMs = null;

  const appendFrame = (frame) => {
    const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!data || data === "[DONE]") return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const delta = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content ?? "";
    if (!delta) return;
    if (firstTokenMs === null) firstTokenMs = now() - started;
    text += delta;
  };

  for await (const chunk of iterateBody(response.body)) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let splitAt = buffer.indexOf("\n\n");
    while (splitAt !== -1) {
      appendFrame(buffer.slice(0, splitAt));
      buffer = buffer.slice(splitAt + 2);
      splitAt = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) appendFrame(buffer);
  return { text, firstTokenMs };
}

/** Body sowohl als Web-ReadableStream als auch als Node-Iterable lesbar machen. */
async function* iterateBody(body) {
  if (!body) return;
  if (typeof body[Symbol.asyncIterator] === "function") {
    yield* body;
    return;
  }
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

function failure(error, latencyMs, { backend, modelId }) {
  return {
    ok: false,
    text: "",
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
    firstTokenMs: null,
    backend: backend || "unknown",
    modelId: modelId || "",
    error
  };
}
