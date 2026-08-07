// smejj.com — Service Worker (Shell-Precache + Fetch-Strategie).
//
// VERSIONSVERLAUF: docs/frontend/SW_VERSIONSVERLAUF.md
// Der Verlauf stand bis 2026-08-05 hier als Kommentar und machte 586 der 800
// Zeilen aus — die Datei riss damit die 800-Zeilen-Regel bei jedem Eintrag
// erneut. Neue Eintraege gehoeren in die Doku, NICHT hierher.
//
// DREI REGELN, die beim Bearbeiten dieser Datei gelten:
//
// 1) Precache-Datei geaendert = CACHE_NAME unten hochzaehlen.
//    Seit v160 ist der Precache cache-first, und caches.match laeuft mit
//    ignoreSearch — ein ?v=-Sprung am Import allein wirkt NICHT. Ohne
//    Versionssprung erreicht die Aenderung Bestandsnutzer nie.
//
// 2) Neu importiertes Modul = Eintrag in SHELL. Fehlt es, findet der Import
//    offline nichts, der Fetch-Handler liefert als Rueckfall "/" (HTML), der
//    Browser bekommt HTML statt JavaScript und bricht das Modul komplett ab.
//    npm run check:precache-imports verfolgt den Importgraph fail-closed.
//
// 3) Jeder SHELL-Eintrag muss VOR dem Deploy aufloesbar sein. Ein einziger
//    404 laesst cache.addAll scheitern und zerlegt den Cache ALLER Besucher.
//
// ACHTUNG: check:precache-imports liest das SHELL-Array per Regex direkt aus
// dieser Datei. Wird das Array ausgelagert, findet die Regex nichts, die
// Menge ist leer und der Pruefer meldet gruen, waehrend er nichts mehr prueft.
const CACHE_NAME = "smejj-shell-v230";
const SHELL = [
  "/",
  "/assets/start-styles.css",
  "/assets/composer-paste-attach.js",
  "/assets/static-pages.css",
  "/assets/deferred-start.js",
  "/assets/field-vitals.js",
  "/assets/google-login.js",
  "/assets/free-coding-fallback.js",
  "/assets/uploads-surface.js",
  "/assets/projects-surface.js",
  "/assets/panel-layout.js",
  "/assets/local-workspace-surface.js",
  "/assets/maus-panel.js",
  "/assets/view-routes.js",
  "/assets/ai/providers-catalog.js",
  "/assets/account-sessions.js",
  "/assets/api-keys-surface.js",
  "/assets/api-keys-surface.css",
  "/assets/auth-gate.js",
  "/assets/chat-history-context.js",
  "/assets/system-status-text.js",
  "/assets/i18n/ui.js",
  "/assets/language-options.js",
  "/assets/onboarding-welcome.js",
  "/assets/usage-meter.js",
  "/assets/app-surfaces.css",
  "/assets/settings-surface.css",
  "/assets/account-privacy.css",
  "/assets/panel-backdrop.css",
  "/assets/browser-pane.js",
  "/assets/browser-pane-backdrop.js",
  "/assets/browser-pane-render.js",
  "/assets/browser-pane-session.js",
  "/assets/auth/passkey.js",
  "/assets/auth/passkey-ui.js",
  "/assets/config.js",
  "/assets/components.js",
  "/assets/chat-markdown.js",
  "/assets/frame-guard.js",
  "/assets/app.js",
  "/assets/view-title.js",
  "/assets/left-menu-state.js",
  "/assets/panel-backdrop.js",
  "/assets/premium-surfaces.js",
  "/assets/settings-surface.js",
  "/assets/settings-runtime.js",
  "/assets/provider-settings.js",
  "/assets/cline-model-menu.js",
  "/assets/provider-settings.css",
  "/assets/account-privacy.js",
  "/assets/profile-dock.js",
  "/assets/profile-dock-menu.js",
  "/assets/account-auth-state.js",
  "/assets/profile-picture-store.js",
  "/assets/profile-picture-control.js",
  "/assets/autonomous-coding.js",
  "/assets/autonomous-coding.css",
  "/assets/autonomous-intent.js",
  "/assets/autonomous-thread-run.js",
  "/assets/browser-context.js",
  "/assets/search.js",
  "/assets/view-chrome.js",
  "/assets/composer-tools.js",
  "/assets/composer-plus-menu.js",
  "/assets/voice-typed-send.js",
  "/assets/voice-overlay-ui.js",
  "/assets/voice-browser-tts.js",
  "/assets/voice-clarify.js",
  "/assets/voice-conversation.js",
  "/assets/voice-ear.js",
  "/assets/voice-speech-queue.js",
  "/assets/voice-echo-filter.js",
  "/assets/voice-vad.js",
  "/assets/voice-endpoint.js",
  "/assets/voice-thinking-cue.js",
  "/assets/voice-premium-tts.js",
  "/assets/voice-warmup.js",
  "/assets/ai/chat-stream.js",
  "/assets/ai/fetch-retry.js",
  "/assets/composer-dictation.js",
  "/assets/chat-store.js",
  "/assets/chat-history-view.js",
  "/assets/chat-messages.js",
  "/assets/chat-actions.js",
  "/assets/chat-actions-menu.js",
  "/assets/chat-code-copy.js",
  "/assets/workspace-bridge.js",
  "/assets/storage/index.js",
  "/assets/storage/localWorkspace.js",
  "/assets/storage/indexedDbStore.js",
  "/assets/storage/opfsStore.js",
  "/assets/storage/contentAddressed.js",
  "/assets/storage/manifestLoader.js",
  "/assets/storage/checksum.js",
  "/assets/storage/fileSnapshot.js",
  "/assets/storage/restoreProject.js",
  "/assets/ai/index.js",
  "/assets/ai/router.js",
  "/assets/ai/providers.js",
  "/assets/ai/byok.js",
  "/assets/ai/localBrowser.js",
  "/assets/ai/disabledMode.js",
  "/assets/ai/freeDemoHardlimit.js",
  "/assets/ai/costGuard.js",
  "/assets/ai/promptContextBuilder.js",
  "/assets/ai/chatClient.js",
  "/assets/shared/securityPolicy.js",
  "/assets/shared/http-json.js",
  "/manifest.webmanifest",
  "/favicon.ico?v=112",
  "/apple-touch-icon.png",
  "/og-image.png",
  "/icons/smejj_icon.svg",
  "/icons/smejj_favicon.svg?v=112",
  "/icons/smejj_full_logo.svg",
  "/icons/smejj_full_logo_on_dark.svg",
  "/icons/favicon-16x16.png?v=112",
  "/icons/favicon-32x32.png?v=112",
  "/icons/favicon-48x48.png",
  "/icons/pwa-192x192.png",
  "/icons/pwa-512x512.png",
  "/icons/maskable-192x192.png",
  "/icons/maskable-512x512.png",
  "/robots.txt",
  "/llms.txt",
  "/status.html",
  "/hilfe.html",
  "/assets/status.js",
  "/verlauf.html",
  "/assets/verlauf.js",
  "/verlauf-messwerte.json",
  "/impressum.html",
  "/datenschutz.html",
  "/en/legal-notice.html",
  "/en/privacy.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Precache-Pfade ohne Query — fuer den cache-first-Abgleich (F-24).
const PRECACHE_PATHS = new Set(SHELL.map((entry) => new URL(entry, "https://smejj.com").pathname));

// Dateien, die sich ohne Deploy aendern: netz-zuerst, Cache nur als Rueckfall.
// Sie bleiben im Precache (damit sie offline ueberhaupt da sind), werden online
// aber immer frisch geholt. Wer hier etwas eintraegt, muss sich sicher sein,
// dass die Datei klein ist und ihr Inhalt wirklich veraltet.
const LIVE_DATEN_PFADE = new Set(["/verlauf-messwerte.json"]);

// HTML bleibt network-first: Navigationen und .html-Seiten sollen Aenderungen
// sofort sehen; nur fuer sie ist der Netz-Rundweg den Preis wert.
function isHtmlRequest(request, url) {
  if (request.mode === "navigate" || request.destination === "document") return true;
  return url.pathname === "/" || url.pathname.endsWith(".html") || url.pathname.endsWith("/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.replace(/\/$/, "") === "/home") {
    event.respondWith(Response.redirect(new URL("/", url.origin).href, 302));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }
  // MESSDATEN SIND KEINE ASSETS: netz-zuerst, Cache nur als Rueckfall.
  //
  // Befund 2026-08-04: /verlauf-messwerte.json lag cache-first im Precache. Die
  // Datei aendert sich aber bei JEDER Messung — cache-first haette bedeutet,
  // dass ein automatischer Messlauf die Nutzer nie erreicht, solange nicht
  // jemand von Hand CACHE_NAME hochzaehlt. Genau daran waere die Automatik
  // gescheitert, ohne dass es jemand gemerkt haette.
  //
  // Netz-zuerst mit Cache-Rueckfall ist hier das Richtige: online immer der
  // frische Stand, offline der letzte bekannte. Die Seite selbst bleibt im
  // Precache und damit offline lesbar; nur ihre Zahlen kommen live.
  if (url.origin === self.location.origin && LIVE_DATEN_PFADE.has(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((antwort) => {
          if (antwort && antwort.ok) {
            const kopie = antwort.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, kopie)).catch(() => {});
          }
          return antwort;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }))
    );
    return;
  }
  // Cache-first NUR fuer vorab gespeicherte Nicht-HTML-Dateien gleicher Herkunft.
  // Der Cache-Inhalt haengt am CACHE_NAME: jeder Deploy einer Precache-Datei
  // MUSS die Version oben hochzaehlen, sonst sehen Bestandsnutzer den alten Stand.
  if (url.origin === self.location.origin && !isHtmlRequest(request, url) && PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request))
    );
    return;
  }
  event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))));
});
