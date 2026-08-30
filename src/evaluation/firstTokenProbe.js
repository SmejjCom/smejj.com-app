// smejj.com — Zerlegung der Wartezeit bis zum ersten sichtbaren Zeichen.
//
// Warum eigenes Modul: "22 Sekunden bis zum ersten Token" ist keine Diagnose,
// sondern eine Beobachtung. Erst die Zerlegung sagt, WO die Zeit vergeht:
//
//   ttfbMs         Antwortkopf da — Netz, Warteschlange, Verbindungsaufbau
//   firstFrameMs   erstes SSE-Ereignis gleich welcher Art — Modell hat begonnen
//   firstVisibleMs erstes Zeichen, das der Nutzer sieht — nach allen Filtern
//   totalMs        Ende des Streams
//
// Die Luecke zwischen firstFrameMs und firstVisibleMs ist der Anteil, den der
// Nutzer wartet, OBWOHL das Modell laengst liefert: verworfene Denk-Abschnitte,
// Werkzeugrunden, Puffer. Genau dieser Anteil ist behebbar, ohne das Modell zu
// wechseln.
//
// Reines Messmodul: kein Schreiben, keine Seiteneffekte, fetch injizierbar.

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Misst einen einzelnen Aufruf gegen einen SSE-Chat-Endpunkt.
 * @returns {Promise<{ok: boolean, ttfbMs: number|null, firstFrameMs: number|null,
 *   firstVisibleMs: number|null, totalMs: number, frames: number, chars: number,
 *   backend: string, error: string|null}>}
 */
export async function probeFirstToken({
  endpoint,
  messages,
  model = "",
  bodyMode = "chat",
  authToken = "",
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => Date.now()
} = {}) {
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Anmeldepflicht der Bridge: ohne Token messen wir ehrlich die 401-Schwelle
    // (fail-closed), mit Token den echten angemeldeten First-Token-Weg.
    // Der Token wird NUR als Header gesendet, nie in Berichte geschrieben.
    const headers = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Origin: "https://smejj.com"
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(buildProbeBody({ messages, model, bodyMode }))
    });
    const ttfbMs = now() - started;
    if (!response.ok) {
      return failure(`http_${response.status}`, { ttfbMs, totalMs: now() - started });
    }
    const stream = await readTimedStream(response.body, { started, now });
    return {
      ok: stream.chars > 0,
      ttfbMs,
      firstFrameMs: stream.firstFrameMs,
      firstVisibleMs: stream.firstVisibleMs,
      totalMs: now() - started,
      frames: stream.frames,
      chars: stream.chars,
      backend: response.headers?.get?.("x-smejj-model-backend") || "unbekannt",
      error: stream.chars > 0 ? null : "empty_response"
    };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timeout" : String(error?.message || error).slice(0, 120);
    return failure(reason, { totalMs: now() - started });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Baut den Anfragekoerper fuer den jeweiligen Endpunkt.
 *
 * /api/chat erwartet `messages`, /api/agent erwartet `task`. Beide muessen messbar
 * sein, denn sie unterscheiden sich in genau einem Punkt: /api/agent schaltet das
 * unsichtbare Reasoning fuer Nicht-Coding-Aufgaben ab, /api/chat bisher nicht.
 * Erst dieser Vergleich beweist, was die Abschaltung wirklich bringt.
 */
export function buildProbeBody({ messages, model = "", bodyMode = "chat" }) {
  if (bodyMode === "agent") {
    const task = (Array.isArray(messages) ? messages : [])
      .filter((message) => message?.role === "user")
      .map((message) => String(message.content || ""))
      .pop() || "";
    return { task, ...(model ? { model } : {}) };
  }
  return { messages, ...(model ? { model } : {}) };
}

/** Liest den Stream und stempelt jedes Ereignis. Exportiert, damit ohne Netz pruefbar. */
export async function readTimedStream(body, { started = 0, now = () => Date.now() } = {}) {
  const decoder = new TextDecoder();
  let buffer = "";
  let firstFrameMs = null;
  let firstVisibleMs = null;
  let frames = 0;
  let chars = 0;

  const handle = (frame) => {
    const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (data === undefined) return;
    frames += 1;
    if (firstFrameMs === null) firstFrameMs = now() - started;
    if (data === "[DONE]") return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const choice = parsed?.choices?.[0];
    const visible = choice?.delta?.content ?? choice?.message?.content ?? "";
    if (!visible) return;
    if (firstVisibleMs === null) firstVisibleMs = now() - started;
    chars += String(visible).length;
  };

  for await (const chunk of iterate(body)) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let splitAt = buffer.indexOf("\n\n");
    while (splitAt !== -1) {
      handle(buffer.slice(0, splitAt));
      buffer = buffer.slice(splitAt + 2);
      splitAt = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) handle(buffer);
  return { firstFrameMs, firstVisibleMs, frames, chars };
}

/**
 * Fasst mehrere Messungen zusammen. Der Median ist aussagekraeftiger als der
 * Mittelwert: ein einzelner Ausreisser darf das Bild nicht bestimmen.
 */
export function summarizeProbes(probes) {
  const ok = (Array.isArray(probes) ? probes : []).filter((probe) => probe?.ok);
  const value = (key) => ok.map((probe) => probe[key]).filter((entry) => Number.isFinite(entry));
  return {
    runs: Array.isArray(probes) ? probes.length : 0,
    ok: ok.length,
    failed: (Array.isArray(probes) ? probes.length : 0) - ok.length,
    ttfbMsMedian: median(value("ttfbMs")),
    firstFrameMsMedian: median(value("firstFrameMs")),
    firstVisibleMsMedian: median(value("firstVisibleMs")),
    firstVisibleMsP95: quantile(value("firstVisibleMs"), 95),
    totalMsMedian: median(value("totalMs")),
    // Der behebbare Anteil: Zeit, die verstreicht, obwohl das Modell schon liefert.
    unsichtbarWartezeitMsMedian: median(ok
      .filter((probe) => Number.isFinite(probe.firstFrameMs) && Number.isFinite(probe.firstVisibleMs))
      .map((probe) => probe.firstVisibleMs - probe.firstFrameMs)),
    charsMedian: median(value("chars"))
  };
}

export function median(values) {
  return quantile(values, 50);
}

export function quantile(values, rank) {
  const usable = (Array.isArray(values) ? values : [])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (usable.length === 0) return null;
  const index = Math.min(usable.length - 1, Math.ceil((rank / 100) * usable.length) - 1);
  return Math.round(usable[Math.max(0, index)]);
}

async function* iterate(body) {
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

function failure(error, { ttfbMs = null, totalMs = 0 } = {}) {
  return {
    ok: false,
    ttfbMs,
    firstFrameMs: null,
    firstVisibleMs: null,
    totalMs,
    frames: 0,
    chars: 0,
    backend: "unbekannt",
    error
  };
}
