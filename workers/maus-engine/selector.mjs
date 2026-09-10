// smejj.com Maus-Engine — deterministische Selektor-Aufloesung.
// Single Responsibility: einen Selektor aus dem Aktionsplan in einen
// Playwright-Locator uebersetzen. Prioritaet liegt auf modellfrei stabilen
// Strategien (role/testId/label); css/xpath bleiben moeglich. Duck-typed:
// funktioniert mit echtem Playwright-Page und mit Test-Mocks.

function scopeFor(page, selectorDef) {
  if (selectorDef.frame) return page.frameLocator(selectorDef.frame);
  return page;
}

// Einen einzelnen Selektor (ohne Fallbacks) aufloesen.
export function resolveLocator(page, selectorDef) {
  const scope = scopeFor(page, selectorDef);
  let locator;
  switch (selectorDef.strategy) {
    case "role":
      locator = selectorDef.name !== undefined
        ? scope.getByRole(selectorDef.value, { name: selectorDef.name })
        : scope.getByRole(selectorDef.value);
      break;
    case "testId":
      locator = scope.getByTestId(selectorDef.value);
      break;
    case "label":
      locator = scope.getByLabel(selectorDef.value);
      break;
    case "text":
      locator = scope.getByText(selectorDef.value);
      break;
    case "css":
      locator = scope.locator(selectorDef.value);
      break;
    case "xpath":
      locator = scope.locator(`xpath=${selectorDef.value}`);
      break;
    default:
      throw new Error(`selector_strategy_unbekannt: ${selectorDef.strategy}`);
  }
  if (selectorDef.nth !== undefined) locator = locator.nth(selectorDef.nth);
  return locator;
}

// ── Eindeutigkeit (Betreiber-Freigabe 2026-08-21, ZCode-Regel) ─────────────
// Bis hierher nahm der Fern-Browser bei mehreren Treffern einfach `.first()`.
// Auf einer Seite mit zwei "Anmelden"-Knoepfen klickte die Maus damit
// STILLSCHWEIGEND den falschen — kein Fehler, kein Log, nur ein Ergebnis, das
// niemand erklaeren kann. ZCode verbietet das ausdruecklich: "tighten the
// scope instead of using a positional shortcut ... never use first()/last()/
// nth() to hide ambiguity."
//
// `nth` bleibt erlaubt, WENN der Plan es ausdruecklich sagt: dann ist die
// Mehrdeutigkeit gewollt und benannt, nicht verschwiegen. Genau das ist der
// Unterschied zwischen einer Auswahl und einem Zufall.
export class MehrdeutigError extends Error {
  constructor(anzahl, selectorDef, kandidaten = []) {
    // Der Rat steht VORN: das Panel kuerzt Fehlertexte, und bis 09.09. fiel
    // genau der Teil mit "nth" weg — das Modell las nur "enger fassen" und
    // scheiterte am selben Paar Links ein zweites Mal.
    // DIE TREFFER BEIM NAMEN NENNEN (live 10.09.): "3 Treffer" allein half dem
    // Modell nicht — es riet einen anderen, ebenfalls mehrdeutigen Selektor,
    // und verbrannte je Runde eine halbe Minute Denkzeit. Wer die Treffer
    // sieht, kann waehlen: entweder das passende "nth" oder ein Merkmal, das
    // nur einer von ihnen traegt.
    const liste = (kandidaten || []).slice(0, 4).map((k, i) => `nth ${i}: ${k}`).join(" | ");
    super(`selector_mehrdeutig: ${anzahl} Treffer fuer ${beschreibe(selectorDef)} — "nth":0 waehlt ausdruecklich den ersten (0-basiert) oder Selektor enger fassen (Rolle+Name aus dem Bedienbaum)`
      + (liste ? `. Die Treffer: ${liste}` : ""));
    this.name = "MehrdeutigError";
    this.anzahl = anzahl;
    this.kandidaten = kandidaten || [];
    // Warten hilft hier NIE: zwei Treffer werden nicht durch Geduld zu einem.
    // withRetries bricht auf diese Marke hin sofort ab.
    this.nichtWiederholen = true;
  }
}

export class NichtGefundenError extends Error {
  constructor(selectorDef) {
    super(`selector_ohne_treffer: ${beschreibe(selectorDef)} — frischen Bedienbaum holen und Selektor daraus neu bauen, NICHT denselben wiederholen`);
    this.name = "NichtGefundenError";
  }
}

function beschreibe(selectorDef) {
  const name = selectorDef?.name ? ` name="${selectorDef.name}"` : "";
  return `${selectorDef?.strategy}="${selectorDef?.value}"${name}`;
}

// Loest auf UND besteht auf Eindeutigkeit. Wirft statt zu raten.
// `zaehle` ist injizierbar, damit Tests ohne Browser laufen.
export async function resolveEindeutig(page, selectorDef, { erlaubeMehrere = false } = {}) {
  const locator = resolveLocator(page, selectorDef);
  // Ausdrueckliches nth ist eine benannte Auswahl — dann ist der Locator per
  // Definition schon auf ein Element eingeengt.
  if (selectorDef.nth !== undefined || erlaubeMehrere) return locator;
  if (typeof locator.count !== "function") return locator; // Mock ohne count: nicht schlechter als vorher
  const anzahl = await locator.count();
  if (anzahl === 0) throw new NichtGefundenError(selectorDef);
  if (anzahl > 1) throw new MehrdeutigError(anzahl, selectorDef, await beschreibeTreffer(locator, anzahl));
  return locator;
}

// Kurzbeschreibung der ersten Treffer — fail-open: geht es nicht, bleibt die
// Meldung die alte. Ein Fehler beim ERKLAEREN eines Fehlers darf nichts kosten.
export async function beschreibeTreffer(locator, anzahl, grenze = 4) {
  if (typeof locator?.nth !== "function") return [];
  const aus = [];
  for (let i = 0; i < Math.min(anzahl, grenze); i += 1) {
    try {
      const eins = locator.nth(i);
      const text = String((await eins.innerText?.({ timeout: 1000 })) || "").replace(/\s+/g, " ").trim().slice(0, 40);
      const href = String((await eins.getAttribute?.("href", { timeout: 1000 })) || "").slice(0, 60);
      aus.push([text ? `"${text}"` : "", href ? `(${href})` : ""].filter(Boolean).join(" ") || "ohne Text");
    } catch { aus.push("nicht lesbar"); }
  }
  return aus;
}

// Selektor-Kandidaten in deterministischer Reihenfolge: Hauptselektor,
// danach die im Plan definierten Fallbacks (lokale Retries ohne Modell).
export function selectorCandidates(selectorDef) {
  const fallbacks = Array.isArray(selectorDef.fallbacks) ? selectorDef.fallbacks : [];
  const main = { ...selectorDef };
  delete main.fallbacks;
  return [main, ...fallbacks];
}

// Kandidat fuer Versuch n (0-basiert): bei mehr Versuchen als Kandidaten
// bleibt der letzte Kandidat aktiv (deterministisch, kein Zufall).
export function candidateForAttempt(selectorDef, attempt) {
  const candidates = selectorCandidates(selectorDef);
  return candidates[Math.min(attempt, candidates.length - 1)];
}
