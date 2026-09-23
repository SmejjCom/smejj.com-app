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

export const MINDEST_TREFFER = 3;

// Nutzer schreiben selten den Listenbegriff selbst ("Generate an image of ...",
// "mach ein Bild"). Diese festen Umschreibungen zaehlen fuer den Listenbegriff —
// nach draussen geht weiterhin NUR der Listenbegriff (23.09.2026).
export const UMSCHREIBUNGEN = Object.freeze({
  bildgenerierung: ["bild", "bilder", "image", "images", "picture", "foto", "zeichne", "draw"],
  videogenerierung: ["video", "videos", "clip"],
  sprachmodus: ["stimme", "voice", "vorlesen", "diktieren"],
  websuche: ["web search", "internet", "google"],
  preise: ["preis", "kosten", "price", "pricing"]
});

const WORTZEICHEN = "a-z0-9äöüß";
/** Ganzes Wort statt Teilwort: "rag" steckt in "Frage", "api" in "Kapitel" (Befund 23.09.2026). */
function enthaeltWort(klein, wort) {
  const muster = wort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(^|[^${WORTZEICHEN}])${muster}($|[^${WORTZEICHEN}])`, "u").test(klein);
}

/**
 * Zaehlt erlaubte Begriffe in Signalen. `signale` sind bereits PII-bereinigte
 * Texte aus der eigenen Ablage (z. B. Daumen-runter-Ereignisse) — sie bleiben
 * im Haus; nach draussen geht nur der gefundene Begriff.
 *
 * Gezaehlt werden VERSCHIEDENE Signale: dieselbe Frage 13-mal verworfen (gemessen
 * 19.09.2026, ein Mensch klickte mehrfach) ist EIN Hinweis, kein Muster.
 */
export function zaehleBegriffe(signale = [], erlaubt = ERLAUBTE_BEGRIFFE) {
  const zaehler = new Map();
  const verschieden = [...new Set(signale.map((t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean))];
  for (const klein of verschieden) {
    for (const begriff of erlaubt) {
      const woerter = [begriff, ...(UMSCHREIBUNGEN[begriff] || [])];
      if (!woerter.some((w) => enthaeltWort(klein, w))) continue;
      zaehler.set(begriff, (zaehler.get(begriff) || 0) + 1);
    }
  }
  return [...zaehler.entries()].map(([begriff, treffer]) => ({ begriff, treffer })).sort((a, b) => b.treffer - a.treffer);
}

/**
 * Die Messung hinter der Entscheidung — fuer Protokoll und Adminbereich, damit
 * "nichts ergaenzt" nachpruefbar wird (wie viele Signale, wie viele verschieden,
 * welcher Begriff wie nah an der Schwelle). Enthaelt KEINEN Nutzertext.
 */
export function lueckenAnalyse(signale = [], { vorhandeneIds = [], mindestTreffer = MINDEST_TREFFER } = {}) {
  const verschieden = new Set(signale.map((t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean)).size;
  const begriffe = zaehleBegriffe(signale).slice(0, 8);
  return {
    signale: signale.length,
    verschieden,
    schwelle: mindestTreffer,
    begriffe,
    vorschlaege: themenAusLuecken(signale, { vorhandeneIds, mindestTreffer }).map((t) => t.id)
  };
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
