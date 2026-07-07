// smejj.com — kleiner TTL+LRU-Cache fuer Websuche-Ergebnisse.
// Zweck: identische Suchanfragen kurzzeitig aus dem Speicher beantworten, damit
// DuckDuckGo/Bing nicht bei jeder Anfrage neu getroffen werden (Schutz vor Blocking,
// schnellere Antworten). Free-safe: rein prozess-lokal (in-memory), kein persistenter
// Zustand auf Workern (stateless-Prinzip bleibt gewahrt), keine Kosten.
// Single Responsibility: nur Caching, keine Netzwerklogik.

export function createTtlCache({ ttlMs = 600000, maxEntries = 500 } = {}) {
  const store = new Map(); // key -> { value, expires }

  function dropExpired(now) {
    for (const [key, entry] of store) {
      if (entry.expires <= now) store.delete(key);
    }
  }

  function enforceCapacity() {
    // Map bewahrt Einfuegereihenfolge -> aeltester Eintrag steht vorne (LRU-Ersatz).
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      // Zugriff = frisch: ans Ende schieben (einfache LRU-Ordnung).
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      const now = Date.now();
      dropExpired(now);
      store.set(key, { value, expires: now + ttlMs });
      enforceCapacity();
    },
    delete(key) {
      return store.delete(key);
    },
    clear() {
      store.clear();
    },
    get size() {
      return store.size;
    }
  };
}
