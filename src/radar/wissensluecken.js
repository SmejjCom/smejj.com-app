// smejj ai radar — Wissensluecken aus der eigenen Nutzung (Auftrag Punkt 1,
// letzter Spiegelstrich): "Wissensluecken, die bei der Nutzung unseres Systems
// erkennbar werden, ohne private Nutzerinhalte an externe Quellen weiterzugeben."
//
// DIE GEFAHR steht im Auftrag selbst: Wer aus einer schlecht bewerteten Antwort
// eine Suchanfrage baut, schickt die Frage eines Menschen ins Netz. Deshalb
// wird hier NIE Nutzertext weitergereicht. Was den Prozess verlaesst, sind
// ausschliesslich Begriffe aus einer festen Liste — Produkt- und Fachnamen, die
// ohnehin oeffentlich sind und nichts ueber die Person verraten.
//
// Ergebnis ist ein VORSCHLAG fuer ein Thema, kein Suchtext. Er greift erst,
// wenn derselbe Begriff mehrfach auftaucht — ein einzelner Daumen runter ist
// ein Zufall, drei sind ein Muster.

/**
 * Begriffe, die den Prozess verlassen duerfen. Alles andere wird verworfen —
 * auch dann, wenn es haeufig vorkommt. Erweitern ist Absicht und Handarbeit.
 */
export const ERLAUBTE_BEGRIFFE = Object.freeze([
  "chatgpt", "openai", "gemini", "claude", "anthropic", "perplexity", "grok", "deepseek", "qwen", "mistral",
  "llama", "kimi", "copilot", "cursor", "groq", "whisper", "realtime", "browser", "websuche", "deep research",
  "bildgenerierung", "videogenerierung", "sprachmodus", "bildschirmfreigabe", "app store", "google play",
  "ai act", "datenschutz", "dsgvo", "android", "ios", "pwa", "rag", "embedding", "finetuning", "lora",
  "benchmark", "preise", "abo", "api", "token", "kontext", "halluzination", "sicherheit", "prompt injection"
]);

const MINDEST_TREFFER = 3;

/**
 * Zaehlt erlaubte Begriffe in Signalen. `signale` sind bereits PII-bereinigte
 * Texte aus der eigenen Ablage (z. B. Daumen-runter-Ereignisse) — sie bleiben
 * im Haus; nach draussen geht nur der gefundene Begriff.
 */
export function zaehleBegriffe(signale = [], erlaubt = ERLAUBTE_BEGRIFFE) {
  const zaehler = new Map();
  for (const text of signale) {
    const klein = String(text || "").toLowerCase();
    for (const begriff of erlaubt) {
      if (!klein.includes(begriff)) continue;
      zaehler.set(begriff, (zaehler.get(begriff) || 0) + 1);
    }
  }
  return [...zaehler.entries()].map(([begriff, treffer]) => ({ begriff, treffer })).sort((a, b) => b.treffer - a.treffer);
}

/**
 * Macht aus wiederkehrenden Begriffen Themenvorschlaege — mit fester Suchanfrage
 * aus dem Begriff PLUS neutralem Zusatz. Bereits vorhandene Themen werden
 * uebersprungen.
 */
export function themenAusLuecken(signale = [], { vorhandeneIds = [], max = 2, mindestTreffer = MINDEST_TREFFER } = {}) {
  const vorhanden = new Set(vorhandeneIds.map(String));
  return zaehleBegriffe(signale)
    .filter((e) => e.treffer >= mindestTreffer)
    .map((e) => ({
      id: `luecke-${e.begriff.replace(/[^a-z0-9]+/g, "-")}`,
      titel: `Wissensluecke: ${e.begriff}`,
      bereich: "luecken",
      anfragen: [`${e.begriff} news update documentation`],
      intervallStunden: 24,
      prioritaet: 2,
      herkunft: `aus ${e.treffer} Nutzungssignalen abgeleitet (nur der Begriff, kein Nutzertext)`,
      eigen: true
    }))
    .filter((t) => !vorhanden.has(t.id))
    .slice(0, max);
}
