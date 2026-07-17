// smejj.com Maus-Engine — lokale Retry-Logik (ohne Modell).
// Single Responsibility: eine Aktion deterministisch bis zu N-mal
// wiederholen. Kein Modell-Aufruf, kein Zufall, feste Wartezeit.

const DEFAULT_RETRY_DELAY_MS = 500;

// fn(attempt) wird mit 0-basiertem Versuchszaehler aufgerufen, damit der
// Aufrufer pro Versuch z. B. Selektor-Fallbacks waehlen kann.
// attempts = 1 + retries. delayFn ist injizierbar (Tests ohne Wartezeit).
export async function withRetries(fn, { retries = 0, delayMs = DEFAULT_RETRY_DELAY_MS, delayFn } = {}) {
  const attempts = Math.max(1, 1 + Number(retries || 0));
  const wait = delayFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return { ok: true, value: await fn(attempt), attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await wait(delayMs);
    }
  }
  return { ok: false, error: lastError, attempts };
}

// Zeitlimit pro Aktion (fail-closed): lehnt nach timeoutMs ab, auch wenn die
// zugrunde liegende Operation haengt. Timer wird immer aufgeraeumt.
export async function withTimeout(promise, timeoutMs, label = "aktion") {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout_${label}_${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
