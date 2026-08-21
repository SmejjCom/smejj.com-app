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
  constructor(anzahl, selectorDef) {
    super(`selector_mehrdeutig: ${anzahl} Treffer fuer ${beschreibe(selectorDef)} — Selektor enger fassen (Rolle+Name aus dem Bedienbaum) oder nth ausdruecklich setzen`);
    this.name = "MehrdeutigError";
    this.anzahl = anzahl;
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
  if (anzahl > 1) throw new MehrdeutigError(anzahl, selectorDef);
  return locator;
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
