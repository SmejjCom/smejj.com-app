// smejj.com control-server — Token-Messung (Single Responsibility: zaehlen, was
// eine Anfrage WIRKLICH kostet).
//
// WARUM: Die Kostenrechnung vom 2026-08-17 ergab, dass bei Coding-Anfragen rund
// 90 % der Rechnung EINGABE-Tokens sind — Dateien, Verlauf, Werkzeug-Schemata.
// Der Server wusste davon bisher nichts. Jeder OpenAI-kompatible Anbieter
// schickt am Stream-Ende einen `usage`-Block; unser Stream reichte ihn durch
// und verwarf ihn. Ohne diese Zahl ist jede Optimierung geraten statt gemessen.
//
// ZWEI QUELLEN, STRENG GETRENNT:
//   "gemessen"   = usage-Block des Anbieters (Wahrheit)
//   "geschaetzt" = Zeichen/4 (Notnagel, wenn der Anbieter nichts schickt)
// Sie werden NIE in eine Zahl gemischt. Ein Bericht, der beides zusammenwirft,
// waere genau die Art Messfalle, die hier schon mehrfach Tage gekostet hat
// (vgl. "Graue Ampel heisst nicht laeuft nicht", "Guthaben-Anzeige luegt").
//
// KEIN Personenbezug: `nutzer` ist bereits die pseudonyme user_-Kennung aus
// jobAccess.authenticatedUserId(), niemals eine Mailadresse.

// USD je 1 Million Tokens. Stand 2026-08-17, recherchiert an den oeffentlichen
// Preisblaettern. `cache` ist der Lesepreis fuer einen Cache-Treffer.
//
// Die Liste ist bewusst UNVOLLSTAENDIG: was hier fehlt, bekommt kosten=null
// statt einer geratenen Zahl. Ein falscher Preis ist schlimmer als kein Preis.
export const PREISLISTE = Object.freeze({
  "claude-opus-5":      { ein: 5.00,  aus: 25.00, cache: 0.50 },
  "claude-sonnet-5":    { ein: 3.00,  aus: 15.00, cache: 0.30 },
  "claude-haiku-4-5":   { ein: 0.80,  aus: 4.00,  cache: 0.08 },
  "gpt-5.6-sol":        { ein: 5.00,  aus: 30.00, cache: 0.50 },
  "gpt-5.6-terra":      { ein: 2.00,  aus: 12.00, cache: 0.20 },
  "gpt-5.6-luna":       { ein: 0.20,  aus: 1.20,  cache: 0.02 },
  "kimi-k3":            { ein: 3.00,  aus: 15.00, cache: 0.30 },
  "kimi-k2.7-code":     { ein: 1.00,  aus: 3.00,  cache: 0.10 },
  "glm-5.3":            { ein: 1.40,  aus: 4.40,  cache: 0.14 },
  "glm-5.2":            { ein: 1.40,  aus: 4.40,  cache: 0.14 },
  "deepseek-v4-flash":  { ein: 0.44,  aus: 1.32,  cache: 0.0028 },
  "deepseek-v4-pro":    { ein: 1.32,  aus: 3.96,  cache: 0.0036 },
  "gemini-3.7-flash":   { ein: 0.75,  aus: 3.75,  cache: 0.075 },
  "gemini-3.6-flash":   { ein: 1.50,  aus: 7.50,  cache: 0.15 }
});

// Das Abo (ClinePass) hat KEINE Tokenkosten — es ist ein Festpreis. Diese
// Modelle bekommen kosten=0 und werden im Bericht getrennt ausgewiesen, damit
// niemand "0,00 USD" mit "nicht gemessen" verwechselt.
export const ABO_MODELLE = Object.freeze(["minimax-m3", "mimo-v2.5", "qwen3.8-max", "qwen3.7-plus"]);

const RING_MAX = 500;
const NUTZER_MAX = 5_000;
const TAGE_MAX = 14;

const ring = [];
const tage = new Map();
const nutzer = new Map();

/** Preis fuer eine Modellkennung. Laengster passender Eintrag gewinnt. */
export function preisFuer(modell) {
  const id = String(modell || "").toLowerCase();
  if (!id) return null;
  if (ABO_MODELLE.some((name) => id.includes(name))) return { ein: 0, aus: 0, cache: 0, abo: true };
  let treffer = null;
  let laenge = 0;
  for (const [name, preis] of Object.entries(PREISLISTE)) {
    if (id.includes(name) && name.length > laenge) {
      treffer = preis;
      laenge = name.length;
    }
  }
  return treffer ? { ...treffer, abo: false } : null;
}

/** Notnagel-Schaetzung. Vier Zeichen je Token ist die uebliche Faustregel. */
export function schaetzeTokens(zeichen) {
  const zahl = Number(zeichen);
  return Number.isFinite(zahl) && zahl > 0 ? Math.ceil(zahl / 4) : 0;
}

/**
 * Liest den usage-Block eines Anbieters. Die Feldnamen weichen ab: OpenAI und
 * Anthropic nutzen prompt_tokens/completion_tokens, DeepSeek meldet den
 * Cache-Treffer als prompt_cache_hit_tokens statt in prompt_tokens_details.
 */
export function leseUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const ein = zahl(usage.prompt_tokens ?? usage.input_tokens);
  const aus = zahl(usage.completion_tokens ?? usage.output_tokens);
  if (ein === 0 && aus === 0) return null;
  return {
    ein,
    aus,
    cache: zahl(usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? usage.cache_read_input_tokens),
    denk: zahl(usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens)
  };
}

/**
 * Kosten in USD. Gecachte Eingabe-Tokens stecken bereits in `ein` — sie werden
 * herausgerechnet und zum Cache-Preis berechnet, sonst zahlt die Rechnung sie
 * doppelt und der Cache sieht wirkungslos aus.
 */
export function kostenUsd(modell, { ein = 0, aus = 0, cache = 0 } = {}) {
  const preis = preisFuer(modell);
  if (!preis) return null;
  const frisch = Math.max(0, ein - cache);
  return round6((frisch * preis.ein + cache * preis.cache + aus * preis.aus) / 1_000_000);
}

/**
 * Eine laufende Messung. Wird beim Start eines Streams angelegt, mit jedem
 * SSE-Ereignis gefuettert und am Ende abgeschlossen.
 *
 * Werkzeugrunden: bei jeder Runde kommt ein EIGENER usage-Block. Sie werden
 * addiert — sonst zaehlt eine Anfrage mit drei Websuchen wie eine ohne.
 */
export function neueMessung({ spur = "chat", backend = "", modell = "", nutzer: wer = "", jetzt = Date.now() } = {}) {
  const start = jetzt;
  const summe = { ein: 0, aus: 0, cache: 0, denk: 0 };
  let gemessen = false;
  let runden = 0;
  let einZeichen = 0;
  let ausZeichen = 0;
  let modellName = String(modell || "");

  return {
    get modell() { return modellName; },
    /** Modellwechsel durch den Fallback: die Kosten gehoeren dem Modell, das geantwortet hat. */
    wechsleModell(name) {
      if (name) modellName = String(name);
    },
    /** Ein geparstes SSE-Ereignis. Alles ausser `usage` wird ignoriert. */
    lies(parsed) {
      const werte = leseUsage(parsed?.usage);
      if (!werte) return;
      summe.ein += werte.ein;
      summe.aus += werte.aus;
      summe.cache += werte.cache;
      summe.denk += werte.denk;
      gemessen = true;
      runden += 1;
    },
    /** Notnagel-Grundlage: Zeichenzahl der abgeschickten Nachrichten. */
    zaehleEingabe(messages) {
      einZeichen += zeichenIn(messages);
    },
    /** Notnagel-Grundlage: sichtbarer Antworttext. */
    zaehleAusgabe(text) {
      if (typeof text === "string") ausZeichen += text.length;
    },
    /** Schliesst die Messung ab und liefert den Datensatz. Schreibt nichts. */
    fertig({ jetzt: ende = Date.now() } = {}) {
      const quelle = gemessen ? "gemessen" : "geschaetzt";
      const tokens = gemessen
        ? { ...summe }
        : { ein: schaetzeTokens(einZeichen), aus: schaetzeTokens(ausZeichen), cache: 0, denk: 0 };
      const zeitpunkt = new Date(ende).toISOString();
      return {
        zeitpunkt,
        tag: zeitpunkt.slice(0, 10),
        spur,
        backend: String(backend || ""),
        modell: modellName,
        nutzer: String(wer || "unbekannt"),
        quelle,
        runden,
        einTokens: tokens.ein,
        ausTokens: tokens.aus,
        cacheTokens: tokens.cache,
        denkTokens: tokens.denk,
        dauerMs: Math.max(0, ende - start),
        kostenUsd: kostenUsd(modellName, tokens),
        preisBekannt: preisFuer(modellName) !== null
      };
    }
  };
}

/**
 * Nimmt einen Datensatz in die Statistik auf und schreibt EINE Zeile nach
 * stdout. Der Arbeitsspeicher ist nach jedem Control-Neustart leer (belegt:
 * "Graue Ampel heisst nicht laeuft nicht") — die Logzeile ueberlebt ihn und
 * kostet nichts. Sie ist der eigentliche Messschrieb, der Speicher nur die
 * schnelle Ansicht.
 */
export function notiere(datensatz, { env = process.env, schreibe = console.log } = {}) {
  if (!datensatz?.tag) return datensatz;

  ring.push(datensatz);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);

  const tag = holeTag(datensatz.tag);
  addiere(tag, datensatz);
  addiere(holeModell(tag, datensatz.modell || "unbekannt"), datensatz);

  if (nutzer.size < NUTZER_MAX || nutzer.has(datensatz.nutzer)) {
    const eintrag = nutzer.get(datensatz.nutzer) || leererZaehler();
    addiere(eintrag, datensatz);
    nutzer.set(datensatz.nutzer, eintrag);
  }

  if (String(env.SMEJJ_VERBRAUCH_LOG || "an") !== "aus") {
    schreibe(`[verbrauch] ${JSON.stringify(datensatz)}`);
  }
  return datensatz;
}

/** Fertiger Bericht fuer den Adminbereich. Reine Daten, kein Text. */
export function bericht({ tag = "" } = {}) {
  const tagListe = [...tage.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([name, werte]) => ({
      tag: name,
      ...ohneModelle(werte),
      modelle: [...werte.modelle.entries()]
        .map(([modell, zahlen]) => ({ modell, ...zahlen }))
        .sort((a, b) => b.anfragen - a.anfragen)
    }));
  const gewaehlt = tag ? tagListe.filter((eintrag) => eintrag.tag === tag) : tagListe;
  return {
    erstelltAm: new Date().toISOString(),
    tage: gewaehlt,
    topNutzer: [...nutzer.entries()]
      .map(([kennung, zahlen]) => ({ nutzer: kennung, ...zahlen }))
      .sort((a, b) => (b.kostenUsd ?? 0) - (a.kostenUsd ?? 0) || b.anfragen - a.anfragen)
      .slice(0, 20),
    letzte: ring.slice(-25).reverse(),
    hinweis: "kostenUsd ist null, wo kein Preis hinterlegt ist. 'geschaetzt' nie mit 'gemessen' verrechnen."
  };
}

export function setzeVerbrauchZurueck() {
  ring.length = 0;
  tage.clear();
  nutzer.clear();
}

function holeTag(name) {
  if (!tage.has(name)) {
    tage.set(name, { ...leererZaehler(), modelle: new Map() });
    if (tage.size > TAGE_MAX) {
      const aeltester = [...tage.keys()].sort()[0];
      tage.delete(aeltester);
    }
  }
  return tage.get(name);
}

function holeModell(tag, modell) {
  if (!tag.modelle.has(modell)) tag.modelle.set(modell, leererZaehler());
  return tag.modelle.get(modell);
}

function leererZaehler() {
  return {
    anfragen: 0,
    gemessen: 0,
    geschaetzt: 0,
    einTokens: 0,
    ausTokens: 0,
    cacheTokens: 0,
    denkTokens: 0,
    kostenUsd: 0,
    ohnePreis: 0,
    dauerMsSumme: 0
  };
}

function addiere(zaehler, datensatz) {
  zaehler.anfragen += 1;
  zaehler[datensatz.quelle === "gemessen" ? "gemessen" : "geschaetzt"] += 1;
  zaehler.einTokens += datensatz.einTokens;
  zaehler.ausTokens += datensatz.ausTokens;
  zaehler.cacheTokens += datensatz.cacheTokens;
  zaehler.denkTokens += datensatz.denkTokens;
  zaehler.dauerMsSumme += datensatz.dauerMs;
  if (datensatz.kostenUsd === null) zaehler.ohnePreis += 1;
  else zaehler.kostenUsd = round6(zaehler.kostenUsd + datensatz.kostenUsd);
}

function ohneModelle(werte) {
  const { modelle, ...rest } = werte;
  void modelle;
  return rest;
}

function zeichenIn(messages) {
  if (!Array.isArray(messages)) return 0;
  let summe = 0;
  for (const nachricht of messages) {
    if (typeof nachricht?.content === "string") summe += nachricht.content.length;
    else if (Array.isArray(nachricht?.content)) {
      for (const teil of nachricht.content) {
        if (typeof teil?.text === "string") summe += teil.text.length;
      }
    }
  }
  return summe;
}

function zahl(wert) {
  const nummer = Number(wert);
  return Number.isFinite(nummer) && nummer > 0 ? Math.floor(nummer) : 0;
}

function round6(wert) {
  return Math.round(wert * 1e6) / 1e6;
}
