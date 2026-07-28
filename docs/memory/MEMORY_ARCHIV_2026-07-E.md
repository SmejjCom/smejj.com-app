# Memory-Archiv 2026-07 Teil E

> 1:1 aus `Memory_Bank.md` ausgelagert am 2026-07-28 (800-Zeilen-Regel).
> Nichts geloescht, nichts geaendert — nur verschoben. Eintraege vom 2026-07-26.

## 2026-07-26 — Konto-Neuaufbau im Glas-Design (Mockup-Umsetzung)
- /profile hat jetzt 9 Bereiche wie ChatGPT/Claude/Gemini: Profil, Personalisierung,
  Sprache & Stimme, Verbundene Apps, Benachrichtigungen, Anmeldung & Sicherheit,
  Abo & Zahlungen, Nutzung & Limits, Daten & Datenschutz (Datenschutz+Berechtigungen+
  Daten zusammengelegt, alle IDs/Bindings unveraendert).
- Design: viereckiges Glas (border-radius 0, backdrop-filter, Haarlinien,
  helle Oberkante) — nur #profile-scoped, App-Huelle und Start-Lock unberuehrt.
- Neue lokale Schluessel: smejj.personalization.v1 (eigene Anweisungen),
  smejj.notifications.v1 (Geraete-Benachrichtigungen); beide im Datenexport.
- Bereiche ohne Server sagen ehrlich "Bald verfuegbar" (Plaene 9/19/39 €, Stripe
  spaeter, Aufbauphase = alles frei/unbegrenzt).
- i18n: 2 verwaiste Google-Login-Schluessel aus allen 15 Sprachdateien entfernt
  (Altlast Auth-Umbau) — tests/i18n-ui gruen, check:frontend 130/0.
- Rollback: backups/konto-glas-rollback/2026-07-26/ (JS+CSS Stand davor).
- Deploy-Paket: UPLOAD-ZU-GITHUB/2026-07-26-konto-glas/ (2 Dateien nach assets/).

## 2026-07-26 — Einstellungen im Glas-Design, Konto-Feinschliff (job_konto_glas_20260726)
- /settings traegt jetzt dieselbe Glas-Formensprache wie /profile (eckig,
  Haarlinien, Akzent #2dd4bf fest); Hell-Modus-Hooks unveraendert.
- Konto → Verbundene Apps beginnt mit "KI-Modelle & API-Keys" → /settings.
- Login-Marker (?login=ok, ?session-handoff-complete) werden auf /profile
  nach dem Laden entfernt — mehrfach zeitversetzt, weil der app.js-Router
  (Start-Lock) location.search beim Ansichtswechsel wieder anhaengt.
- Deploy-Lehre: GitHub-Pages-CDN cached pro exakter URL inkl. Query — Pruef-
  Abrufe brauchen die ECHTE Asset-URL, sonst prueft man am Cache vorbei.

## 2026-07-26 — Eigene Anweisungen wirken im Chat (job_konto_glas_20260726)
- Konto → Personalisierung speist jetzt jeden Chat-System-Prompt:
  settings-runtime.buildPreferenceBlock() + chatClient (Nutzerpraeferenzen).
- Muster: Konto-Schluessel in der Chat-Laufzeit bewusst dupliziert (fail-safe,
  1000-Zeichen-Kappung) statt Modul-Kopplung.

## 2026-07-26 — Konto/Einstellungen im hellen Systemschema lesbar (job_konto_hell_20260726)
- Befund (iPhone-PWA): Systemschema "hell" setzt --premium-text dunkel, die
  Konto-Flaechen ueberschrieben aber per ID-Spezifitaet den hellen Hintergrund
  → dunkler Text auf dunklem Glas, unlesbar. Der helle ::before-Unterbau der
  Premium-Views traegt nie: er liegt mit z-index -1 UNTER dem body-Hintergrund
  (Malreihenfolge), nur der View-eigene background wirkt.
- Fix: account-privacy.css fuehrt --konto-*-Variablen (dunkle Werte = exakt
  vorher, Dark-Mode regressionsfrei) + Light-Block mit deckend hellem Grund
  (fail-safe: Text nie auf gleichfarbigem Grund). Avatar-Platzhalter und
  Primaer-Knoepfe #saveProfile/#saveSettings (von app-surfaces.css/Lock
  dunkelmodus-weiss gefaerbt) per hoeherer Spezifitaet hell nachgezogen.
- Offen: gleiche Primaer-Knopf-Regel trifft auch #projects/#search/#files —
  Fix braucht app-surfaces.css (Start-Lock, Freigabe noetig).
- Live verifiziert (Chrome, echtes Konto, hell+dunkel, Computed Styles):
  sw v139, account-privacy.css?v=...e, settings-surface.css?v=glas-hell-...b.
- Deploy-Paket: UPLOAD-ZU-GITHUB/2026-07-26-konto-hell/ (Blob-Hashes geprueft).

## 2026-07-26 — Echte Nutzungszaehler lokal-first (job_konto_glas_20260726, Schritt 2)
- usage-meter.js zaehlt Nachrichten/Coding-Laeufe pro Monat (smejj.usage.v1),
  Konto → Nutzung & Limits zeigt echte Werte; Export enthaelt den Stand.
- Muster: Start-Lock-Dateien NIE anfassen — Beobachter auf #startLog und
  Coding-Statuszeile, eingehaengt ueber profile-dock.js; Geste-Scharfschaltung
  gegen Mitzaehlen der Verlaufs-Wiederherstellung.
- Parallel-Sessions: Web-Editor meldet Commit-Konflikte ("has committed since
  you started editing") — dann Live-Stand neu holen, eigene Aenderungen als
  Transformation daraufsetzen, Versionsmarken absprechen (d-Kollision → e).

## 2026-07-26 — Stripe-Testmodus live (job_konto_glas_20260726, Schritt 3a)
- Abo & Zahlungen verkauft im Stripe-TESTMODUS ueber Zahlungslinks (kein
  Schluessel im Frontend). IDs/Links in der Capsule. Live-Schaltung erst
  nach Stripe-Konto-Aktivierung durch den Betreiber; dann Schritt 3b:
  Webhook + Abo-Status am Control-Server.
- Nachtrag: Stripe-Willkommens-Fragebogen (/test/welcome) abgeschlossen —
  Standard-Stripe gewaehlt (kein Managed Payments, kein 3,5 %-Aufschlag).
  Der Fragebogen legte eine NEUE leere Sandbox acct_1TxXHUQYIFkMHSic an;
  Produkte + Zahlungslinks liegen weiter im Test-Modus von
  acct_1TxXHLQddyxzPlSc (verifiziert). Leere Sandbox ignorieren.
  Live-Konto-Aktivierung (Bank-/Unternehmensdaten) bleibt Betreiber-Sache.

## 2026-07-26 — Willkommens-Onboarding live (job_konto_glas_20260726, Schritt 5)
- Nach dem ersten Login erscheint auf /profile genau EINMAL ein Willkommens-
  Overlay (onboarding-welcome.js/.css, lock-frei ueber account-privacy.js):
  Begruessung mit Namen, Free "Aktiv", Plus/Pro/Max mit Stripe-Testlinks,
  "Los geht's" schliesst dauerhaft (smejj.onboarding.v1).
- WICHTIGE ERKENNTNIS fuer alle URL-Marker-Features: Direktaufrufe von
  App-Routen (z. B. /profile?login=ok) laufen auf GitHub Pages ueber den
  404-Fallback — die App bootet zuerst unter "/", die Query steht erst nach
  applyPendingRestoreRoute() wieder in der Adresse. Wer beim Boot
  location.search liest, muss kurz danach erneut pruefen (hier: 300/600 ms,
  vor der 800-ms-Marker-Bereinigung).
- New-File-Editor auf GitHub haengt beim Anlegen eine Leerzeile ans Datei-
  ende (Hash weicht ab) — nach jedem Anlegen cmd+Down+BackSpace + erneuter
  Commit; Blob-Hash-Pruefung ist Pflicht. Live byte-identisch verifiziert,
  Live-Test mit Test-Session bestanden, Testdaten entfernt.
