// smejj.com — einfacher In-Memory Rate-Limiter (Sliding Window) pro Schluessel (z. B. IP).
// Zweck: den offenen Endpunkt /api/search/web vor Missbrauch als Scraping-Proxy und vor
// Ueberlast schuetzen. Free-safe: prozess-lokal, kein persistenter Zustand, keine Kosten.
// Single Responsibility: nur Zaehlung/Entscheidung, keine HTTP- oder Netzwerklogik.

export function createRateLimiter({ windowMs = 60000, max = 20, maxKeys = 5000 } = {}) {
  const hits = new Map(); // key -> number[] (Zeitstempel der Treffer im Fenster)

  function sweep(now) {
    if (hits.size <= maxKeys) return;
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((t) => t > now - windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
      if (hits.size <= maxKeys) break;
    }
  }

  return {
    check(key) {
      const now = Date.now();
      const id = String(key || "unknown");
      const recent = (hits.get(id) || []).filter((t) => t > now - windowMs);
      if (recent.length >= max) {
        hits.set(id, recent);
        const retryAfterMs = Math.max(0, windowMs - (now - recent[0]));
        return { allowed: false, remaining: 0, retryAfterMs };
      }
      recent.push(now);
      hits.set(id, recent);
      sweep(now);
      return { allowed: true, remaining: max - recent.length, retryAfterMs: 0 };
    },
    clear() {
      hits.clear();
    },
    get size() {
      return hits.size;
    }
  };
}
