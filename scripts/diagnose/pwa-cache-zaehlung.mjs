// smejj.com — Zaehlweise des PWA-Offline-Messwerkzeugs, ohne Browser pruefbar.
//
// BEFUND F10 (2026-09-14): pwa-offline.mjs meldete "dateien: 12", der Shell-
// Cache smejj-shell-v871 hatte live 235 Eintraege. Die Zahl 12 ist die Laenge
// von WILLKOMMEN_SHELL in public/sw.js: der erste Aufruf des Werkzeugs landet
// unangemeldet auf der Werbeseite, die /sw.js?eingang=willkommen registriert
// und smejj-willkommen-v871 mit genau 12 Dateien fuellt. Das Werkzeug summierte
// ALLE Speicher und brach seine Warteschleife beim ersten Eintrag ab — also
// beim schmalen Speicher, noch bevor der volle Precache stand.
//
// Hier liegt die Zaehlweise als reine Funktionen: gezaehlt wird NUR der aktive
// Shell-Cache (smejj-shell-v<N>), und geprueft wird, ob die Kern-Dateien und
// jeder Eintrag der Precache-Liste aus sw.js darin liegen.
// tests/pwa-offline-zaehlung.test.mjs haelt das fest.

export const SHELL_CACHE_MUSTER = /^smejj-shell-v(\d+)$/;

// index.html wird als "/" abgelegt (siehe SHELL in public/sw.js: es gibt keinen
// Eintrag "/index.html", die Huelle heisst "/").
export const KERN_PFADE = ["/", "/assets/app.js", "/assets/start-styles.css"];

/** CACHE_NAME aus dem Quelltext von sw.js — null, wenn er fehlt. */
export function cacheNameAusSw(quelle) {
  const treffer = String(quelle).match(/const CACHE_NAME = "([^"]+)"/);
  return treffer ? treffer[1] : null;
}

/**
 * Die SHELL-Liste (Precache des vollen Service Workers) aus dem Quelltext von
 * sw.js — zeilenweise, damit Anfuehrungszeichen in Kommentaren (Zeile 214:
 * "API") nicht als Eintrag durchgehen. Genau so entstand die falsche "236":
 * ein Kommentar zaehlte mit, der Speicher war mit 235 vollstaendig.
 */
export function shellListeAusSw(quelle) {
  const treffer = String(quelle).match(/const SHELL = \[([\s\S]*?)\n\];/);
  if (!treffer) return [];
  const liste = [];
  for (const zeile of treffer[1].split("\n")) {
    const eintrag = zeile.match(/^\s*"([^"]+)"\s*,?\s*(?:\/\/.*)?$/);
    if (eintrag) liste.push(eintrag[1]);
  }
  return liste;
}

/** Pfad ohne Herkunft und ohne ?v-Marke — so wie PRECACHE_PATHS in sw.js vergleicht. */
export function pfadVon(eintrag) {
  return new URL(String(eintrag), "https://smejj.com").pathname;
}

/**
 * Der aktive Shell-Cache aus einer Liste von Cache-Namen: das hoechste
 * smejj-shell-v<N>. Der schmale smejj-willkommen-v<N> zaehlt nie.
 */
export function aktiverShellCache(namen) {
  let bester = null;
  let besteNummer = -1;
  for (const name of namen || []) {
    const treffer = SHELL_CACHE_MUSTER.exec(name);
    if (!treffer) continue;
    const nummer = Number(treffer[1]);
    if (nummer > besteNummer) { besteNummer = nummer; bester = name; }
  }
  return bester;
}

/**
 * Zaehlt den aktiven Shell-Cache und prueft ihn gegen die Precache-Liste.
 *
 * @param {Record<string, string[]>} speicher  Cache-Name -> Request-URLs (caches.open(n).keys())
 * @param {string[]} precacheListe  SHELL aus sw.js (relative Eintraege)
 */
export function zaehleShellCache(speicher, precacheListe) {
  const namen = Object.keys(speicher || {});
  const aktiverCache = aktiverShellCache(namen);
  const urls = aktiverCache ? speicher[aktiverCache] || [] : [];
  const pfade = new Set(urls.map(pfadVon));
  const erwartet = (precacheListe || []).map(pfadVon);
  const fehlend = erwartet.filter((pfad) => !pfade.has(pfad));
  const kernFehlt = KERN_PFADE.filter((pfad) => !pfade.has(pfad));
  return {
    speicher: namen,
    aktiverCache,
    dateien: urls.length,
    erwartet: (precacheListe || []).length,
    fehlend,
    kernFehlt,
    vollstaendig: aktiverCache !== null && fehlend.length === 0 && kernFehlt.length === 0,
  };
}
