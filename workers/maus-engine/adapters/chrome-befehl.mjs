// smejj.com Maus-Engine — Befehlssprache des Chrome-Adapters (rein, testbar).
// Single Responsibility: aus einer Interpreter-Aktion einen Befehl fuer die
// Chrome-Erweiterung bauen und ihn fail-closed pruefen. Kein Netz, kein DOM,
// kein Playwright — damit genau diese Uebersetzung ohne Browser pruefbar ist.
//
// Bewusst KLEIN gehalten: der Chrome-Adapter beherrscht nur die fuenf
// Aktionen, die der Auftrag nennt (navigate, click, type, assert, screenshot).
// Alles andere wird abgelehnt, statt halb zu funktionieren. Der eigene Browser
// im Serverraum bleibt der vollstaendige Weg; der echte Chrome des Betreibers
// ist die Ausnahme fuer Seiten, die nur dort angemeldet sind.

export const CHROME_AKTIONEN = Object.freeze([
  "navigate", "click", "type", "assert", "screenshot"
]);

// Selektor-Strategien, die eine Erweiterung im Seiteninhalt sicher aufloesen
// kann. xpath fehlt absichtlich: es laedt zu Selektoren ein, die quer durch
// fremde Dokumente greifen.
export const CHROME_SELEKTOREN = Object.freeze(["css", "text", "role", "testId", "label"]);

const MAX_TEXT = 2_000;
const MAX_URL = 2_000;

function fehler(grund) {
  return { ok: false, error: grund };
}

/**
 * Uebersetzt einen Plan-Schritt in einen Erweiterungs-Befehl.
 * @param {object} schritt Plan-Schritt (bereits vom Interpreter validiert)
 * @returns {{ok:true, befehl:object}|{ok:false, error:string}}
 */
export function baueBefehl(schritt) {
  if (!schritt || typeof schritt !== "object") return fehler("schritt_fehlt");
  const aktion = String(schritt.action || "");
  if (!CHROME_AKTIONEN.includes(aktion)) {
    return fehler(`chrome_adapter_kann_aktion_nicht: ${aktion.slice(0, 40)} (erlaubt: ${CHROME_AKTIONEN.join(", ")})`);
  }
  switch (aktion) {
    case "navigate": {
      const url = String(schritt.url || "");
      if (!/^https:\/\//i.test(url) || url.length > MAX_URL) {
        // Nur https: im Chrome des Betreibers laufen echte Anmeldungen mit.
        // Ein http-Sprung dort waere ein Klartext-Leck, kein Komfortverlust.
        return fehler("chrome_adapter_nur_https");
      }
      return { ok: true, befehl: { typ: "navigate", url } };
    }
    case "click": {
      const ziel = normalisiereZiel(schritt.target);
      if (!ziel.ok) return ziel;
      return { ok: true, befehl: { typ: "click", ziel: ziel.ziel } };
    }
    case "type": {
      const ziel = normalisiereZiel(schritt.target);
      if (!ziel.ok) return ziel;
      // secretRef wird NICHT aufgeloest: Geheimnisse verlassen den Vault der
      // Engine nicht in Richtung Browser-Erweiterung. Wer ein Passwort in
      // fremdem Chrome braucht, tippt es selbst.
      if (schritt.secretRef) return fehler("chrome_adapter_keine_secrets");
      const text = String(schritt.text ?? "");
      if (!text || text.length > MAX_TEXT) return fehler("chrome_adapter_text_ungueltig");
      return { ok: true, befehl: { typ: "type", ziel: ziel.ziel, text } };
    }
    case "assert": {
      const bedingung = String(schritt.condition || "");
      if (!["urlMatches", "titleContains", "selectorExists"].includes(bedingung)) {
        return fehler(`chrome_adapter_bedingung_nicht_unterstuetzt: ${bedingung.slice(0, 40)}`);
      }
      const befehl = { typ: "assert", bedingung };
      if (bedingung === "urlMatches") befehl.muster = String(schritt.urlPattern || "");
      if (bedingung === "titleContains") befehl.text = String(schritt.text || "");
      if (bedingung === "selectorExists") {
        const ziel = normalisiereZiel(schritt.target);
        if (!ziel.ok) return ziel;
        befehl.ziel = ziel.ziel;
      }
      return { ok: true, befehl };
    }
    case "screenshot":
      return { ok: true, befehl: { typ: "screenshot", name: String(schritt.name || "bild").slice(0, 80) } };
    default:
      return fehler("unerreichbar");
  }
}

function normalisiereZiel(target) {
  const selector = target?.selector || target;
  const strategie = String(selector?.strategy || "");
  const wert = String(selector?.value ?? selector?.[strategie] ?? "");
  if (!CHROME_SELEKTOREN.includes(strategie)) {
    return fehler(`chrome_adapter_selektor_nicht_erlaubt: ${strategie.slice(0, 30)}`);
  }
  if (!wert || wert.length > 300) return fehler("chrome_adapter_selektor_leer_oder_zu_lang");
  const ziel = { strategie, wert };
  if (selector?.name) ziel.name = String(selector.name).slice(0, 200);
  return { ok: true, ziel };
}

/**
 * Antwort der Erweiterung fail-closed deuten. Alles, was nicht ausdruecklich
 * als Erfolg gemeldet wird, gilt als Fehlschlag — eine Erweiterung laeuft in
 * einer fremden Umgebung, ihre Antwort ist nie vertrauenswuerdig.
 */
export function deuteAntwort(antwort) {
  if (!antwort || typeof antwort !== "object") return fehler("chrome_antwort_ungueltig");
  if (antwort.ok !== true) {
    return fehler(String(antwort.error || "chrome_befehl_fehlgeschlagen").slice(0, 200));
  }
  return { ok: true, ergebnis: antwort.ergebnis ?? {} };
}

/**
 * Der Betreiber muss je Herkunft ausdruecklich zustimmen. Diese Pruefung ist
 * die ZWEITE Schranke — die erste ist die Allowlist des Interpreters. Beide
 * muessen zustimmen; eine allein reicht nie.
 * @param {string} url Ziel
 * @param {string[]} freigegebeneHerkuenfte vom Betreiber sichtbar bestaetigt
 */
export function herkunftFreigegeben(url, freigegebeneHerkuenfte) {
  let herkunft;
  try {
    herkunft = new URL(String(url)).origin;
  } catch {
    return false;
  }
  return Array.isArray(freigegebeneHerkuenfte) && freigegebeneHerkuenfte.includes(herkunft);
}
