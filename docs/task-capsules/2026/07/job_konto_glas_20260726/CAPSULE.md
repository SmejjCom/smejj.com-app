# Task Capsule: Konto-Neuaufbau im Glas-Design (job_konto_glas_20260726)

## Ziel
Mockup-Umsetzung (Abnahme Betreiber 2026-07-26): /profile mit 9 Bereichen wie
ChatGPT/Claude/Gemini im viereckigen Glas-Design. App-Huelle, Startseite,
linkes/rechtes Menue unveraendert (Start-Lock respektiert).

## Aenderungen
- public/account-privacy.js: Nav 5 → 9 Bereiche (Profil, Personalisierung,
  Sprache & Stimme, Verbundene Apps, Benachrichtigungen, Anmeldung & Sicherheit,
  Abo & Zahlungen, Nutzung & Limits, Daten & Datenschutz). Neue lokale Keys:
  smejj.personalization.v1, smejj.notifications.v1 (beide im Export).
  Alle app.js-Bindings/IDs unveraendert. STYLE_VERSION konto-glas-20260726.
- public/account-privacy.css: komplettes Redesign (border-radius 0,
  backdrop-filter, Haarlinien, Status-Chips, viereckige Schalter).
- public/i18n/*.js: 2 verwaiste Google-Login-Schluessel entfernt (Altlast).

## Verifikation
- node --test: 130 pass / 0 fail (check:frontend)
- check:guidelines OK, check:start-lock OK (31 Dateien byte-identisch),
  check:favicon-lock OK
- Lokal (Browser): 9 Panels rendern, Schalter speichern in localStorage,
  serverSessionsBlock injiziert, keine Konsolenfehler
- Live: assets/account-privacy.js + .css auf SmejjCom/smejj-app-frontend main
  per GitHub-Web-Editor deployt; Git-Blob-Hashes remote == lokal
  (630751ce…, ecf5a11a…). smejj.com/profile geprueft: 9 Bereiche, Profil
  laedt echte Nutzerdaten, Abo & Zahlungen zeigt Free-Plan + 3 Plaene.

## Rollback
backups/konto-glas-rollback/2026-07-26/ (JS+CSS Stand vor Umbau).
Wiederherstellen: beide Dateien zurueckkopieren und erneut nach assets/ deployen.

## Hinweise
- Lokaler Deploy-Key hat nur Lesezugriff aufs Frontend-Repo; Live-Deploy lief
  ueber den GitHub-Web-Editor (Betreiber-Session) mit insertText + Hash-Pruefung.
- Plaene/Stripe/Zaehler sind bewusst "Bald verfuegbar" (UI-only, fail-closed).

## Nachtest + Fix (2026-07-26, zweiter Durchgang)
- Live-Volltest aller 9 Bereiche im Betreiber-Chrome: alle Panels rendern,
  Schalter speichern (Statuszeile bestätigt), Sicherheits-Panel zeigt korrekte
  Google-Session mit einem Ausloggen-Knopf, keine Konsolenfehler.
- Befund 1: Schalter-Zeilen (label.account-row) erschienen uppercase (globaler
  Premium-Label-Stil). Befund 2: Akzent var(--premium-accent) ist im Theme
  nicht tuerkis — Schalter/Aktiv-Balken wirkten weiss.
- Fix v=konto-glas-20260726b: label.account-row text-transform none;
  Akzent fest #2dd4bf. Live deployt (Blob-Hashes 38baca6c/b26dbf56 verifiziert),
  Nachtest: Benachrichtigungen 1:1 wie Mockup.
- /settings unveraendert geprueft: Modelle-Bereich intakt (GLM-5.2, API-Keys,
  Cline API).
