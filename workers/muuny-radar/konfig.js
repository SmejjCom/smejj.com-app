// muuny ai radar — Themen, Quellen, Grenzen (Owner-Auftrag 21.09.2026).
//
// GRUNDSATZ DER QUELLENWAHL: nur offizielle, maschinenlesbare, kostenlose
// Schnittstellen und Feeds. Keine kostenpflichtige Such-API (keine Zugangsdaten,
// keine Kosten), kein Auslesen von Webseiten, die dafuer nicht gedacht sind, und
// kein Umgehen von Zugangssperren. Wo ein Anbieter keinen Feed hat (Anthropic,
// Mistral — beide 404, gemessen am 21.09.), dienen die offiziellen Release-Notizen
// seines SDK als Primaerquelle fuer neue Funktionen und API-Aenderungen.
//
// "primaer" heisst: die Quelle IST der Urheber der Aussage (Anbieter-Blog, Paper,
// Release). Eine Nachrichtenseite ueber einen Anbieter ist sekundaer — ihre Aussage
// gilt erst als geprueft, wenn eine zweite, unabhaengige Quelle sie bestaetigt.
//
// Suchbegriffe entstehen NUR aus diesen Themen, nie aus Nutzerfragen: nichts
// Privates verlaesst den Dienst.

export const QUELLEN_STANDARD = Object.freeze([
  // --- Primaer: Anbieter selbst ---
  { id: "openai-news", name: "OpenAI News", art: "rss", url: "https://openai.com/news/rss.xml", primaer: true, anbieter: "OpenAI" },
  { id: "deepmind-blog", name: "Google DeepMind Blog", art: "rss", url: "https://deepmind.google/blog/rss.xml", primaer: true, anbieter: "Google" },
  { id: "google-ai-blog", name: "Google AI Blog", art: "rss", url: "https://blog.google/technology/ai/rss/", primaer: true, anbieter: "Google" },
  { id: "hf-blog", name: "Hugging Face Blog", art: "rss", url: "https://huggingface.co/blog/feed.xml", primaer: true, anbieter: "Hugging Face" },
  { id: "qwen-blog", name: "Qwen Blog", art: "rss", url: "https://qwenlm.github.io/blog/index.xml", primaer: true, anbieter: "Qwen" },
  { id: "gh-anthropic-sdk", name: "Anthropic SDK Releases", art: "github-releases", url: "https://api.github.com/repos/anthropics/anthropic-sdk-python/releases?per_page=10", primaer: true, anbieter: "Anthropic" },
  { id: "gh-mistral-sdk", name: "Mistral SDK Releases", art: "github-releases", url: "https://api.github.com/repos/mistralai/client-python/releases?per_page=10", primaer: true, anbieter: "Mistral" },
  { id: "gh-openai-sdk", name: "OpenAI SDK Releases", art: "github-releases", url: "https://api.github.com/repos/openai/openai-python/releases?per_page=10", primaer: true, anbieter: "OpenAI" },
  // Werkzeuge, auf denen muuny steht — ihre Releases betreffen uns direkt.
  { id: "gh-llamacpp", name: "llama.cpp Releases", art: "github-releases", url: "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=15", primaer: true, anbieter: "llama.cpp" },
  { id: "gh-transformers", name: "transformers Releases", art: "github-releases", url: "https://api.github.com/repos/huggingface/transformers/releases?per_page=10", primaer: true, anbieter: "Hugging Face" },
  { id: "gh-vllm", name: "vLLM Releases", art: "github-releases", url: "https://api.github.com/repos/vllm-project/vllm/releases?per_page=10", primaer: true, anbieter: "vLLM" },
  { id: "hf-qwen", name: "Hugging Face: Qwen-Modelle", art: "hf-models", url: "https://huggingface.co/api/models?author=Qwen&sort=lastModified&direction=-1&limit=20", primaer: true, anbieter: "Qwen" },
  { id: "hf-meta", name: "Hugging Face: Meta-Modelle", art: "hf-models", url: "https://huggingface.co/api/models?author=meta-llama&sort=lastModified&direction=-1&limit=20", primaer: true, anbieter: "Meta" },
  { id: "hf-mistral", name: "Hugging Face: Mistral-Modelle", art: "hf-models", url: "https://huggingface.co/api/models?author=mistralai&sort=lastModified&direction=-1&limit=20", primaer: true, anbieter: "Mistral" },
  { id: "hf-deepseek", name: "Hugging Face: DeepSeek-Modelle", art: "hf-models", url: "https://huggingface.co/api/models?author=deepseek-ai&sort=lastModified&direction=-1&limit=20", primaer: true, anbieter: "DeepSeek" },
  // Forschung: das Paper selbst ist die Primaerquelle (aber ein Preprint, ungeprueft —
  // das steht als Unsicherheit an jedem Eintrag). NICHT export.arxiv.org/api: dessen
  // robots.txt sagt "Disallow: /" (gemessen 21.09.). Die offiziellen RSS-Feeds auf
  // rss.arxiv.org sind dafuer gedacht und erlauben es.
  { id: "arxiv-cl", name: "arXiv cs.CL (Sprachmodelle)", art: "rss", url: "https://rss.arxiv.org/rss/cs.CL", primaer: true, anbieter: "arXiv", vorfilter: true },
  { id: "arxiv-cr", name: "arXiv cs.CR (Sicherheit)", art: "rss", url: "https://rss.arxiv.org/rss/cs.CR", primaer: true, anbieter: "arXiv", vorfilter: true },
  // --- Sekundaer: Presse und Diskussion ---
  { id: "heise", name: "heise online", art: "rss", url: "https://www.heise.de/rss/heise-Rubrik-IT.rdf", primaer: false, anbieter: "heise" },
  { id: "hn", name: "Hacker News", art: "hn", url: "https://hn.algolia.com/api/v1/search_by_date", primaer: false, anbieter: "Hacker News", suche: true }
]);

/**
 * Themen: WAS recherchiert wird und WARUM. "begriffe" entscheiden, ob ein Fund zum
 * Thema gehoert; bei suchfaehigen Quellen (arXiv, HN) sind sie zugleich die Suche.
 */
export const THEMEN_STANDARD = Object.freeze([
  { id: "offene-modelle", name: "Neue offene Modelle", prioritaet: 1, intervallStunden: 12,
    warum: "muuny baut auf Qwen auf. Ein neues offenes Modell kann ein besseres Grundmodell sein.",
    begriffe: ["qwen", "llama", "mistral", "deepseek", "gemma", "open-weight", "open weights", "gguf", "model release"],
    quellen: ["qwen-blog", "hf-qwen", "hf-meta", "hf-mistral", "hf-deepseek", "hf-blog", "hn"] },
  { id: "konkurrenz", name: "Konkurrenz-KI: Faehigkeiten, Preise, Aenderungen", prioritaet: 1, intervallStunden: 12,
    warum: "Was OpenAI, Google, Anthropic und Mistral neu koennen oder kosten, setzt den Massstab fuer muuny.com.",
    begriffe: ["gpt", "openai", "gemini", "claude", "anthropic", "mistral", "pricing", "price", "api", "model", "release", "launch"],
    quellen: ["openai-news", "deepmind-blog", "google-ai-blog", "gh-anthropic-sdk", "gh-mistral-sdk", "gh-openai-sdk", "heise"] },
  { id: "forschung", name: "Forschung und Benchmarks", prioritaet: 2, intervallStunden: 24,
    warum: "Neue Trainings- und Bewertungsverfahren zeigen, wo muuny besser werden kann.",
    begriffe: ["benchmark", "lora", "fine-tuning", "reasoning", "retrieval-augmented", "evaluation", "hallucination"],
    quellen: ["arxiv-cl", "hf-blog"] },
  { id: "werkzeuge", name: "Inferenz- und Trainingswerkzeuge", prioritaet: 1, intervallStunden: 12,
    warum: "llama.cpp, transformers und vLLM tragen muunys Training und Laufzeit. Ihre Releases betreffen uns direkt.",
    begriffe: ["qwen3", "qwen3.5", "lora", "gguf", "quantization", "cuda", "fix", "support", "security"],
    quellen: ["gh-llamacpp", "gh-transformers", "gh-vllm"] },
  { id: "sicherheit", name: "KI-Sicherheit", prioritaet: 1, intervallStunden: 24,
    warum: "Neue Angriffe (Prompt-Injection, Jailbreaks) muessen in muunys Pruefsuite und Filter einfliessen.",
    begriffe: ["prompt injection", "jailbreak", "vulnerability", "security", "cve", "exploit", "safety"],
    quellen: ["arxiv-cr", "hn", "gh-llamacpp", "gh-transformers"] }
]);

/** Grenzen, jede fuer sich ausreichend. Kosten sind heute 0 USD (nur freie Quellen). */
export const GRENZEN_STANDARD = Object.freeze({
  anfragenProTag: 400,
  anfragenProLauf: 60,
  bytesProTag: 150 * 1024 * 1024,
  bytesProAbruf: 3 * 1024 * 1024,
  usdProTag: 0.5,
  usdProMonat: 5,
  maxAutoThemen: 5,
  maxFundeProQuelle: 15,
  // Nachrichten, die aelter sind, gelten nicht mehr als "neu".
  maxAlterTage: 45
});

export const ERLAUBTE_ARTEN = Object.freeze(["rss", "github-releases", "hf-models", "arxiv", "hn"]);

/**
 * Prueft eine (vom Admin geaenderte) Konfiguration. Fail-closed: was nicht passt,
 * wird abgelehnt, nicht stillschweigend repariert.
 */
export function pruefeKonfig({ themen, quellen, grenzen }) {
  const fehler = [];
  const ids = new Set();
  for (const q of quellen || []) {
    if (!/^[a-z0-9-]{2,40}$/.test(q?.id || "")) fehler.push(`quelle_id_ungueltig:${q?.id}`);
    if (ids.has(q.id)) fehler.push(`quelle_doppelt:${q.id}`);
    ids.add(q.id);
    if (!ERLAUBTE_ARTEN.includes(q.art)) fehler.push(`quelle_art_unbekannt:${q.id}`);
    let url;
    try { url = new URL(q.url); } catch { fehler.push(`quelle_url_ungueltig:${q.id}`); continue; }
    // Nur oeffentliches https — kein file:, kein http auf interne Adressen.
    if (url.protocol !== "https:") fehler.push(`quelle_nur_https:${q.id}`);
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(url.hostname) || url.hostname.endsWith(".internal")) {
      fehler.push(`quelle_intern_verboten:${q.id}`);
    }
    if (url.username || url.password) fehler.push(`quelle_mit_zugangsdaten_verboten:${q.id}`);
  }
  for (const t of themen || []) {
    if (!/^[a-z0-9-]{2,40}$/.test(t?.id || "")) fehler.push(`thema_id_ungueltig:${t?.id}`);
    if (!Array.isArray(t.begriffe) || !t.begriffe.length) fehler.push(`thema_ohne_begriffe:${t.id}`);
    if (!(Number(t.intervallStunden) >= 1 && Number(t.intervallStunden) <= 24 * 14)) fehler.push(`thema_intervall:${t.id}`);
    for (const qid of t.quellen || []) if (!ids.has(qid)) fehler.push(`thema_quelle_unbekannt:${t.id}:${qid}`);
  }
  if (grenzen) {
    for (const [k, v] of Object.entries(grenzen)) {
      if (!(k in GRENZEN_STANDARD)) fehler.push(`grenze_unbekannt:${k}`);
      else if (!(Number(v) >= 0)) fehler.push(`grenze_ungueltig:${k}`);
    }
  }
  return { ok: fehler.length === 0, fehler };
}
