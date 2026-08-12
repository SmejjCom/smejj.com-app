// smejj.com — Bilder-Zeichnen-Spur der Chat-Bruecke (Stufe 1, 2026-08-12).
// Ausgelagert wie chat-bridge-vision.js/-weather.js (800-Zeilen-Regel).
//
// Befund 2026-08-12 (Livetest im Chrome): "Zeichne ein Bild ..." ergab nur
// ASCII-Kunst bzw. "ich bin ein text-basierter Assistent". Betreiber-Vorgabe:
// die EIGENE KI (smejj 1.0) zeichnet, kein fremder Bild-Anbieter. Ein
// Sprachmodell zeichnet als Code: diese Spur laesst smejj 1.0 eine
// SVG-Vektorgrafik schreiben, prueft sie hart und liefert sie als data:-URL
// im Markdown-Bildformat in den normalen Antwortstrom; die Anzeige uebernimmt
// chat-markdown.js (nur im <img>-Kontext — dort fuehren SVGs nie Skripte aus).
//
// Fail-safe wie die Vision-Spur: true nur, wenn wirklich gesendet wird; bei
// false wurde noch KEIN Byte geschrieben und der Aufrufer nimmt unveraendert
// den Text-Weg (dann antwortet das Modell wie bisher mit Text).

// Eigene Namen (BILDER_*): das Deploy-Buendel legt alle Bridge-Module in EINEN
// Gueltigkeitsbereich (bundle_chat_bridge.mjs prueft Kollisionen hart).
// Derselbe Groq-Zugang, der smejj 1.0 heute traegt — kein neuer Anbieter.
const BILDER_API_KEY = process.env.SMEJJ_LLM_GROQ_API_KEY || "";
const BILDER_BASE_URL = String(process.env.SMEJJ_LLM_GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
const BILDER_MODEL = process.env.SMEJJ_BILDER_MODEL || process.env.SMEJJ_LLM_GROQ_MODEL || "llama-3.3-70b-versatile";

// Mal-Auftrag = Mal-Verb UND Motivwort in der Frage (deutsch/englisch).
// Bewusst eng: eine normale Frage ohne beides darf NIE die Bild-Spur nehmen.
const BILDER_VERB = /\b(zeichne|zeichnen|male|malen|erstelle|erstellen|generiere|generieren|erzeuge|erzeugen|draw|paint|generate|create|make)\b/i;
const BILDER_MOTIV = /\b(bild(er|es)?|foto(s)?|grafik(en)?|illustration(en)?|zeichnung(en)?|logo(s)?|skizze(n)?|gem(ae|ä)lde|image(s)?|picture(s)?|photo(s)?|drawing(s)?|sketch(es)?)\b/i;

// SVG-Absicherung: Modellausgabe ist NICHT vertrauenswuerdig. Verboten ist
// alles, was Code ausfuehren oder nachladen koennte — auch wenn der
// <img>-Kontext das ohnehin blockt (Verteidigung in der Tiefe).
// url(#...) bleibt erlaubt — so verweisen Farbverlaeufe auf ihre Definition.
const BILDER_SVG_VERBOTEN = /<\s*(script|foreignObject|iframe|embed|object|image|use|animate)\b|\bon[a-z]+\s*=|href\s*=|url\s*\(\s*(?!#)/i;
const BILDER_SVG_MAX = 60_000;

const BILDER_SYSTEM_PROMPT = [
  "Du bist der Zeichner von smejj.com. Zeichne das gewuenschte Motiv als eine einzige SVG-Vektorgrafik.",
  "Antworte NUR mit dem vollstaendigen <svg>...</svg> — kein Markdown, kein Codezaun, keine Erklaerung davor oder danach.",
  'Pflicht: viewBox="0 0 512 512", ein gefuelltes Hintergrund-Rechteck, nur Formen/Pfade/Farbverlaeufe/Text.',
  "Verboten: script, foreignObject, image, use, href, Ereignis-Attribute, externe Verweise.",
  "Zeichne detailreich und mit stimmigen Farben (20 bis 60 Formen)."
].join(" ");

// Liefert den Bild-Prompt (= die Frage selbst) oder "" wenn kein Mal-Auftrag.
export function erkenneBildAuftrag(task) {
  const text = String(task || "").trim();
  if (!text || text.length > 600) return "";
  return BILDER_VERB.test(text) && BILDER_MOTIV.test(text) ? text : "";
}

// Zieht das SVG aus der Modellantwort und prueft es hart. "" = unbrauchbar,
// dann faellt die Spur NICHT auf den Nutzer zurueck (der Aufrufer hat zu dem
// Zeitpunkt schon gesendet) — darum wird VOR dem Senden geprueft.
export function sichereSvgAntwort(text) {
  const roh = String(text || "");
  const svg = roh.match(/<svg[\s>][\s\S]*?<\/svg>/i)?.[0] || "";
  if (!svg || svg.length > BILDER_SVG_MAX) return "";
  if (BILDER_SVG_VERBOTEN.test(svg)) return "";
  if (!/viewBox/i.test(svg)) return "";
  return svg;
}

/**
 * Laesst smejj 1.0 ein SVG zeichnen und streamt es als Markdown-Bild.
 * deps liefert die brueckenlokalen Helfer: { corsHeaders, securityHeaders, timeoutMs }.
 */
export async function streamBilderLane(res, body, task, deps) {
  if (!BILDER_API_KEY || !BILDER_BASE_URL) return false;
  const prompt = erkenneBildAuftrag(task);
  if (!prompt) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  let svg = "";
  try {
    const upstream = await fetch(`${BILDER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BILDER_API_KEY}` },
      body: JSON.stringify({
        model: BILDER_MODEL,
        messages: [
          { role: "system", content: BILDER_SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        stream: false,
        temperature: 0.8,
        max_tokens: 4096
      })
    });
    if (upstream.ok) svg = sichereSvgAntwort((await upstream.json())?.choices?.[0]?.message?.content);
  } catch {
    svg = "";
  } finally {
    clearTimeout(timer);
  }
  if (!svg) return false;
  res.writeHead(200, {
    ...deps.securityHeaders(),
    ...deps.corsHeaders("https://smejj.com"),
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "x-smejj-bridge": "chat-bilder",
    "x-smejj-profile": "bilder-svg",
    "x-smejj-model-backend": `groq:${BILDER_MODEL}`,
    "x-smejj-model-id": BILDER_MODEL,
    "x-smejj-requested-model": String(body?.model || ""),
    "x-smejj-model-fallback": "false"
  });
  // Gleiche Ereignisform wie chat-bridge-strom.js (choices[0].delta.content),
  // damit der Client nichts Neues lernen muss; in 64-KB-Stuecken, damit kein
  // einzelnes Riesen-Ereignis den SSE-Parser der App belastet.
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  const inhalt = `Hier ist dein Bild:\n\n![Erstelltes Bild](data:image/svg+xml;base64,${b64})`;
  for (let i = 0; i < inhalt.length; i += 65536) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: inhalt.slice(i, i + 65536) } }] })}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
  return true;
}
