// smejj.com Maus-Engine — Plan-Normalisierung (modellneutral, fail-closed).
// Single Responsibility: aus einer rohen Modellantwort den JSON-Block
// extrahieren, OHNE inhaltliche Reparatur. Markdown-Zaeune und umgebender
// Text werden entfernt; alles Weitere entscheidet die Schema-Validierung.
// Es gibt bewusst KEINE Reparatur-Heuristik: ein Modell, das das Schema
// nicht erfuellt, wird abgelehnt — egal welches Modell es ist.

// Extrahiert den ersten balancierten JSON-Objektblock aus Text.
export function extractJsonBlock(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: false, error: "leere_modellantwort" };

  // Markdown-Zaeune entfernen (```json ... ``` oder ``` ... ```)
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();

  const start = candidate.indexOf("{");
  if (start === -1) return { ok: false, error: "kein_json_objekt_gefunden" };

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i += 1) {
    const char = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { ok: true, json: candidate.slice(start, i + 1) };
      }
    }
  }
  return { ok: false, error: "json_objekt_unvollstaendig" };
}

// Rohantwort -> geparster Plan (ohne Validierung; die macht plan-validator).
export function normalizePlannerOutput(text) {
  const block = extractJsonBlock(text);
  if (!block.ok) return { ok: false, error: block.error };
  try {
    const plan = JSON.parse(block.json);
    if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
      return { ok: false, error: "json_ist_kein_objekt" };
    }
    return { ok: true, plan };
  } catch (error) {
    return { ok: false, error: `json_parse_fehler: ${error.message}` };
  }
}
