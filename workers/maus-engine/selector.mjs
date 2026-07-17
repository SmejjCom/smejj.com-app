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
