// smejj.com — Semantischer Cache: gleiche Frage, gespeicherte Antwort, kein Modell.
//
// Der sechste Hebel aus der Kostenrechnung. Er ist auch der GEFAEHRLICHSTE:
// die anderen fuenf machen eine Anfrage billiger, dieser hier beantwortet sie
// gar nicht mehr. Trifft er daneben, bekommt der Nutzer eine FALSCHE Antwort —
// und das ist teurer als jeder gesparte Token.
//
// DREI ENTSCHEIDUNGEN, DIE DARAUS FOLGEN:
//
// 1. STANDARD IST SCHATTEN-MODUS. Der Cache misst zunaechst nur, was er
//    getroffen HAETTE, und veraendert keine einzige Antwort. Erst wenn die
//    Trefferpaare an echtem Verkehr geprueft sind, schaltet der Betreiber ihn
//    scharf (SMEJJ_SEM_CACHE=an). Ein Cache, der ungeprueft antwortet, ist
//    dasselbe Muster wie "Schutz gebaut, aber nicht angeschlossen" — nur
//    andersherum und mit Schaden statt Wirkungslosigkeit.
//
// 2. KEIN NEUER DIENST. Die Gratis-Politik (docs/architecture/
//    FREE_ONLY_MASTER_POLICY.md) verlangt fuer jede Zeabur-Erweiterung eine
//    schriftliche Freigabe mit Dienst und Betrag. Redis waere genau das.
//    Deshalb: Arbeitsspeicher des Control-Servers, und als Aehnlichkeitsmass
//    der Tokenizer, den das Projekt fuer RAG ohnehin hat (Umlaute gefaltet,
//    Stoppwoerter raus). Keine Einbettungen, keine Anbieter-Anfrage, 0 EUR.
//
// 3. NUR NAHEZU IDENTISCHE FRAGEN. Nicht "aehnlich" — das waere geraten.
//    Jaccard ueber die Wortmengen ab 0,9: "Was kostet smejj?" und "Was kostet
//    smejj.com?" treffen, "Was kostet smejj?" und "Was kann smejj?" nicht.
//
// WAS NIE IN DEN CACHE DARF (jede Regel hat einen Grund, keinen Verdacht):
//   - Anschlussfragen (Verlauf vorhanden): "und dann?" heisst je nach Gespraech
//     etwas anderes. Die Frage allein ist nicht der Schluessel.
//   - Angehaengte Dateien: dieselbe Frage zu anderem Code ist eine andere Frage.
//   - Live-Inhalte (Websuche, Wetter, Kurse): eine Stunde alte Antwort ist falsch.
//   - Coding-Aufgaben: die Antwort haengt am Projektstand, nicht nur am Wortlaut.
//   - Sehr kurze Fragen (unter 3 tragenden Woertern): zu wenig Signal.
//
// UND: der Cache ist PRO NUTZER. Eine Antwort kann Angaben aus der Frage des
// Nutzers wiederholen; sie an einen anderen auszuliefern waere eine
// Datenweitergabe, die niemand beauftragt hat. Nutzeruebergreifend traegt mehr,
// braucht aber eine bewusste Entscheidung — SMEJJ_SEM_CACHE_UEBER_NUTZER=ja.

import { tokenize } from "../rag/bm25Index.js";

export const CACHE_AUS = "aus";
export const CACHE_SCHATTEN = "schatten";
export const CACHE_AN = "an";

/** Ab dieser Uebereinstimmung gelten zwei Fragen als dieselbe. */
export const AEHNLICHKEIT_SCHWELLE = 0.9;
/** Aelter als das darf keine Antwort ausgeliefert werden. */
export const HALTBARKEIT_MS = 24 * 60 * 60 * 1000;
/** Mehr Eintraege haelt der Arbeitsspeicher nicht — aelteste fallen zuerst. */
export const MAX_EINTRAEGE = 500;
/** Weniger tragende Woerter sind zu wenig Signal fuer einen Treffer. */
export const MIN_WOERTER = 3;

const eintraege = [];
let statistik = { treffer: 0, fehlschlaege: 0, ausgeliefert: 0, gespart: 0 };

/** Betriebsart: aus | schatten (Standard) | an. */
export function cacheModus(env = process.env) {
  const wert = String(env?.SMEJJ_SEM_CACHE || "").trim().toLowerCase();
  return [CACHE_AUS, CACHE_SCHATTEN, CACHE_AN].includes(wert) ? wert : CACHE_SCHATTEN;
}

function ueberNutzerErlaubt(env = process.env) {
  return String(env?.SMEJJ_SEM_CACHE_UEBER_NUTZER || "").trim().toLowerCase() === "ja";
}

/**
 * Jaccard-Aehnlichkeit zweier Fragen ueber ihre Wortmengen.
 *
 * Bewusst die schlichteste Formel, die sich in einem Satz erklaeren laesst:
 * gemeinsame Woerter geteilt durch alle vorkommenden. Wer spaeter Einbettungen
 * will, ersetzt genau diese Funktion — der Rest bleibt.
 *
 * @returns {number} 0 bis 1; 1 = dieselben tragenden Woerter.
 */
export function aehnlichkeit(frageA, frageB) {
  const a = new Set(tokenize(frageA));
  const b = new Set(tokenize(frageB));
  if (a.size === 0 || b.size === 0) return 0;
  let gemeinsam = 0;
  for (const wort of a) if (b.has(wort)) gemeinsam += 1;
  return gemeinsam / (a.size + b.size - gemeinsam);
}

/**
 * Darf diese Anfrage ueberhaupt in den Cache?
 * @returns {{ok: boolean, grund: string}} grund ist immer gefuellt — auch bei ok.
 */
export function darfCachen(lage = {}) {
  if (Array.isArray(lage.verlauf) && lage.verlauf.length > 0) return { ok: false, grund: "anschlussfrage" };
  if (Number(lage.dateien || 0) > 0) return { ok: false, grund: "dateien" };
  if (lage.liveInhalt) return { ok: false, grund: "live-inhalt" };
  if (lage.coding) return { ok: false, grund: "coding" };
  if (tokenize(lage.frage).length < MIN_WOERTER) return { ok: false, grund: "zu-kurz" };
  return { ok: true, grund: "geeignet" };
}

/** Verwirft abgelaufene Eintraege — laeuft bei jedem Zugriff, kostet nichts. */
function entruempeln(jetzt) {
  for (let index = eintraege.length - 1; index >= 0; index -= 1) {
    if (jetzt - eintraege[index].zeit > HALTBARKEIT_MS) eintraege.splice(index, 1);
  }
}

/**
 * Sucht eine gespeicherte Antwort auf dieselbe Frage.
 *
 * @returns {{treffer: boolean, antwort?: string, aehnlich?: number, frage?: string, grund: string}}
 *   `grund` sagt IMMER, warum es kein Treffer war — sonst laesst sich eine
 *   Trefferquote von 0 % nicht von einem abgeschalteten Cache unterscheiden.
 */
export function frageCache(lage = {}, { env = process.env, jetzt = Date.now() } = {}) {
  if (cacheModus(env) === CACHE_AUS) return { treffer: false, grund: "abgeschaltet" };
  const erlaubt = darfCachen(lage);
  if (!erlaubt.ok) return { treffer: false, grund: erlaubt.grund };
  entruempeln(jetzt);
  const nutzer = String(lage.nutzer || "unbekannt");
  let bester = null;
  for (const eintrag of eintraege) {
    if (!ueberNutzerErlaubt(env) && eintrag.nutzer !== nutzer) continue;
    const wert = aehnlichkeit(lage.frage, eintrag.frage);
    if (wert >= AEHNLICHKEIT_SCHWELLE && (!bester || wert > bester.wert)) {
      bester = { wert, eintrag };
    }
  }
  if (!bester) {
    statistik.fehlschlaege += 1;
    return { treffer: false, grund: "nichts-aehnliches" };
  }
  statistik.treffer += 1;
  statistik.gespart += Number(bester.eintrag.einTokens || 0);
  if (cacheModus(env) === CACHE_AN) statistik.ausgeliefert += 1;
  return {
    treffer: true,
    antwort: bester.eintrag.antwort,
    aehnlich: Number(bester.wert.toFixed(3)),
    frage: bester.eintrag.frage,
    grund: cacheModus(env) === CACHE_AN ? "ausgeliefert" : "schatten-treffer"
  };
}

/** Legt eine Antwort ab — nur wenn die Anfrage geeignet war und Text da ist. */
export function merkeAntwort(lage = {}, antwort = "", { env = process.env, jetzt = Date.now() } = {}) {
  if (cacheModus(env) === CACHE_AUS) return false;
  if (!darfCachen(lage).ok) return false;
  const text = String(antwort || "").trim();
  if (text.length < 40) return false; // Fehlermeldungen und Einwortantworten nicht.
  entruempeln(jetzt);
  eintraege.push({
    frage: String(lage.frage || ""),
    antwort: text,
    nutzer: String(lage.nutzer || "unbekannt"),
    einTokens: Number(lage.einTokens || 0),
    zeit: jetzt
  });
  while (eintraege.length > MAX_EINTRAEGE) eintraege.shift();
  return true;
}

/** Stand fuer die Messung — dieselbe Trennung wie beim Verbrauchsbericht. */
export function cacheBericht(env = process.env) {
  const gesamt = statistik.treffer + statistik.fehlschlaege;
  return {
    modus: cacheModus(env),
    ueberNutzer: ueberNutzerErlaubt(env),
    eintraege: eintraege.length,
    treffer: statistik.treffer,
    fehlschlaege: statistik.fehlschlaege,
    ausgeliefert: statistik.ausgeliefert,
    trefferquote: gesamt > 0 ? Number((statistik.treffer / gesamt).toFixed(3)) : 0,
    gesparteEingabeTokens: statistik.gespart
  };
}

export function setzeCacheZurueck() {
  eintraege.length = 0;
  statistik = { treffer: 0, fehlschlaege: 0, ausgeliefert: 0, gespart: 0 };
}
