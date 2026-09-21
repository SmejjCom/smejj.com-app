// smejj ai radar — WAS beobachtet wird (Betreiber-Auftrag 21.09.2026, Punkt 1).
//
// Rein und ohne I/O: Die Themenliste ist eine Setzung, kein Messwert. Sie steht
// hier als Standard und kann im Adminbereich ueberschrieben werden — deshalb
// nimmt `themenListe()` eine gespeicherte Konfiguration entgegen und mischt sie
// mit dem Standard, statt sie zu ersetzen: ein leeres oder kaputtes
// Konfigurations-Objekt darf den Radar nie blind machen.
//
// JEDES Thema traegt ein Intervall. Das ist der "intelligente Zeitplan" aus dem
// Auftrag in seiner ehrlichen Form: Presse aendert sich taeglich, Preise
// woechentlich, Gesetze seltener. Wer alles gleich oft abfragt, verbrennt
// Kontingent an Themen, die sich nicht bewegen — und verpasst die schnellen.

/** Standard-Themen. `bereich` gruppiert sie im Bericht, `intervallStunden` steuert die Faelligkeit. */
export const STANDARD_THEMEN = Object.freeze([
  Object.freeze({
    id: "presse-ki",
    titel: "Presse und offizielle Ankuendigungen zu KI",
    bereich: "presse",
    anfragen: ["AI announcement official blog this week", "KI Ankuendigung Pressemitteilung diese Woche"],
    intervallStunden: 12,
    prioritaet: 1
  }),
  Object.freeze({
    id: "neue-modelle",
    titel: "Neue KI-Modelle, Forschung und Benchmarks",
    bereich: "modelle",
    anfragen: ["new AI model release benchmark results", "open weights model release benchmark"],
    intervallStunden: 12,
    prioritaet: 1
  }),
  Object.freeze({
    id: "konkurrenz-funktionen",
    titel: "Konkurrenz-KI: neue Faehigkeiten",
    bereich: "konkurrenz",
    anfragen: [
      "ChatGPT Gemini Claude Perplexity new feature release notes",
      "AI assistant new capability announcement"
    ],
    intervallStunden: 12,
    prioritaet: 1
  }),
  Object.freeze({
    id: "konkurrenz-preise",
    titel: "Konkurrenz-KI: Preise und Tarifaenderungen",
    bereich: "konkurrenz",
    anfragen: ["AI assistant pricing change subscription price", "LLM API price per million tokens change"],
    intervallStunden: 24,
    prioritaet: 2
  }),
  Object.freeze({
    id: "konkurrenz-tempo",
    titel: "Konkurrenz-KI: Qualitaet und Geschwindigkeit",
    bereich: "konkurrenz",
    anfragen: ["LLM latency tokens per second comparison benchmark", "AI assistant quality comparison evaluation"],
    intervallStunden: 48,
    prioritaet: 3
  }),
  Object.freeze({
    id: "sicherheit",
    titel: "Sicherheit: Luecken, Angriffe, Schutzmassnahmen",
    bereich: "sicherheit",
    anfragen: ["AI application security vulnerability prompt injection advisory", "Node.js security advisory"],
    intervallStunden: 24,
    prioritaet: 1
  }),
  Object.freeze({
    id: "chat-coding",
    titel: "KI-Chat und autonomes Programmieren",
    bereich: "funktionen",
    anfragen: ["autonomous coding agent release", "AI coding assistant agent benchmark SWE-bench"],
    intervallStunden: 24,
    prioritaet: 2
  }),
  Object.freeze({
    id: "browser-suche",
    titel: "Browsersteuerung und Websuche durch KI",
    bereich: "funktionen",
    anfragen: ["AI browser control computer use agent", "AI web search grounding feature"],
    intervallStunden: 24,
    prioritaet: 2
  }),
  Object.freeze({
    id: "bild-video",
    titel: "Bild- und Videoerstellung",
    bereich: "funktionen",
    anfragen: ["AI image generation model release", "AI video generation model release"],
    intervallStunden: 48,
    prioritaet: 3
  }),
  Object.freeze({
    id: "sprache-bildschirm",
    titel: "KI-Sprachinteraktion und Bildschirmfreigabe",
    bereich: "funktionen",
    anfragen: ["AI realtime voice conversation release", "AI screen sharing assistant feature"],
    intervallStunden: 48,
    prioritaet: 3
  }),
  Object.freeze({
    id: "regeln",
    titel: "Regeln und Richtlinien (Gesetze, App-Stores)",
    bereich: "regeln",
    anfragen: ["EU AI Act obligations update", "Google Play Apple App Store AI policy update"],
    intervallStunden: 72,
    prioritaet: 2
  })
]);

/** Bereiche des Tagesberichts, in dieser Reihenfolge. */
export const BEREICHE = Object.freeze(["presse", "modelle", "konkurrenz", "sicherheit", "funktionen", "regeln", "luecken"]);

const istThema = (t) => t && typeof t.id === "string" && t.id.length >= 3
  && Array.isArray(t.anfragen) && t.anfragen.some((a) => typeof a === "string" && a.trim().length >= 5);

/**
 * Die gueltige Themenliste: Standard plus eigene Themen aus der Konfiguration.
 * Eigene Themen mit bekannter id ueberschreiben den Standard (so lassen sich
 * Intervalle aendern); unbrauchbare Eintraege werden still uebergangen, damit
 * ein Tippfehler in der Konfiguration nicht den ganzen Radar abschaltet.
 */
export function themenListe(konfig = null) {
  const eigene = Array.isArray(konfig?.themen) ? konfig.themen.filter(istThema) : [];
  const zusammen = new Map();
  for (const t of STANDARD_THEMEN) zusammen.set(t.id, t);
  for (const t of eigene) {
    const vorhanden = zusammen.get(t.id) || {};
    zusammen.set(t.id, {
      ...vorhanden,
      ...t,
      bereich: BEREICHE.includes(t.bereich) ? t.bereich : (vorhanden.bereich || "funktionen"),
      intervallStunden: zahlOderStandard(t.intervallStunden, vorhanden.intervallStunden ?? 24, 1, 24 * 30),
      prioritaet: zahlOderStandard(t.prioritaet, vorhanden.prioritaet ?? 3, 1, 9)
    });
  }
  const aus = new Set((konfig?.themenAus || []).map(String));
  return [...zusammen.values()].filter((t) => !aus.has(t.id));
}

function zahlOderStandard(wert, standard, min, max) {
  const zahl = Number(wert);
  if (!Number.isFinite(zahl)) return standard;
  return Math.min(max, Math.max(min, Math.round(zahl)));
}

/**
 * Welche Themen sind faellig? Reihenfolge: laengste Ueberfaelligkeit zuerst,
 * bei Gleichstand die hoehere Prioritaet (kleinere Zahl).
 *
 * `letzteLaeufe` ist {themaId: ISO-Zeit}. Ein Thema ohne Lauf ist sofort
 * faellig — der erste Durchgang holt damit alles einmal.
 */
export function faelligeThemen(themen, letzteLaeufe = {}, jetztMs = Date.now()) {
  return themen
    .map((t) => {
      const zuletzt = Date.parse(letzteLaeufe?.[t.id] || "");
      const faelligAbMs = Number.isFinite(zuletzt) ? zuletzt + t.intervallStunden * 3_600_000 : 0;
      return { thema: t, faelligAbMs, ueberfaelligMs: jetztMs - faelligAbMs };
    })
    .filter((e) => e.ueberfaelligMs >= 0)
    .sort((a, b) => (b.ueberfaelligMs - a.ueberfaelligMs) || (a.thema.prioritaet - b.thema.prioritaet))
    .map((e) => e.thema);
}

/** Wann ist der naechste Lauf faellig? null, wenn gerade etwas offen ist. */
export function naechsteFaelligkeit(themen, letzteLaeufe = {}, jetztMs = Date.now()) {
  let naechste = null;
  for (const t of themen) {
    const zuletzt = Date.parse(letzteLaeufe?.[t.id] || "");
    const faelligAbMs = Number.isFinite(zuletzt) ? zuletzt + t.intervallStunden * 3_600_000 : 0;
    if (faelligAbMs <= jetztMs) return null;
    if (naechste === null || faelligAbMs < naechste) naechste = faelligAbMs;
  }
  return naechste === null ? null : new Date(naechste).toISOString();
}
