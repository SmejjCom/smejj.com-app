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

## Adressleisten-Bereinigung (2026-07-26, Freigabe "mach das")
- Neu: cleanLoginMarkers() in account-privacy.js entfernt ?login=ok und
  ?session-handoff-complete=1 nach dem Laden per history.replaceState.
- Befund beim Live-Test: app.js-Router (Start-Lock, Zeile ~330) haengt
  location.search beim Ansichtswechsel wieder an — Wettlauf. Loesung:
  Bereinigung laeuft zusaetzlich bei 800 ms und 2500 ms (idempotent, fail-safe).
- Zweiter Befund: GitHub-Pages-CDN hielt die exakte URL ?v=2 noch auf der
  Vorversion (Testabrufe mit anderen Query-Strings sahen frueher die neue) —
  nach TTL-Ablauf geprueft.
- Live verifiziert: smejj.com/profile?login=ok → Adresse nach dem Laden
  https://smejj.com/profile. Blob-Hash 6f43dc4e… remote == lokal.

## Einstellungen im Glas-Design + Modelle-Verweis (2026-07-26, Freigabe "komplett fertig")
- settings-surface.css: komplettes Redesign auf viereckiges Glas (gleiche
  Formensprache wie Konto), Hell-Modus mitgezogen; settings-surface.js nur
  Versionsmarke ?v=glas-20260726. Alle Hooks/IDs unveraendert.
- account-privacy.js: neue Zeile "KI-Modelle & API-Keys" oben in Verbundene
  Apps mit Knopf zu /settings (Betreiber-Frage "Wo sind die Modelle?").
- Verifikation: check:frontend 130/0, start-lock OK; lokal geprueft
  (Chip-Nav mobil, Hell-Modus-Panel rgba(255,255,255,0.65), Modelle-Zeile).
- Live deployt (3 Dateien, Blob-Hashes aecbef54/5f968245/c1592290 identisch),
  live geprueft: /settings im Glas-Design inkl. Modelle-Bereich (GLM-5.2,
  API-Keys intakt), Konto zeigt Modelle-Verweis, Klick fuehrt zu /settings.
- Rollback: backups/konto-glas-rollback/2026-07-26/ (settings-Dateien ergaenzt).

## Schritt 1: Eigene Anweisungen wirken im Chat (2026-07-26, Freigabe "Ja")
- settings-runtime.js: readAccountInstructions() liest smejj.personalization.v1
  (fail-safe, Kappung 1000 Zeichen); buildPreferenceBlock() haengt die Zeile
  "Eigene Anweisungen des Nutzers (Konto): …" an — chatClient.js traegt den
  Block bereits in jeden System-Prompt (kein weiterer Eingriff noetig).
- account-privacy.js: Hinweistexte aktualisiert ("gilt ab der naechsten Antwort").
- Tests: tests/settings-runtime.test.mjs neu (5 Tests: Anbindung, leer,
  fail-safe, Kappung, chatClient-Vertrag) — 5/0; check:frontend 130/0.
- Live: Blob-Hashes c9db81a0/fcfbb3bd identisch; auf smejj.com verifiziert,
  dass promptBlock() die Konto-Anweisungen enthaelt (Test-Session im
  Claude-Browser, danach entfernt). Betreiber-Chrome "Browser 1" war auf
  smejj.com nicht angemeldet — GitHub-Commits liefen dort.
- Rollback: backups/konto-glas-rollback/2026-07-26/settings-runtime.js.vor-anbindung.

## Schritt 2: Echte Nutzungszaehler (2026-07-26, Freigabe "mach Nr. 2")
- Neu: public/usage-meter.js — lokaler Monatszaehler (smejj.usage.v1) fuer
  Nachrichten, Sprachsekunden, Coding-Laeufe; Monatswechsel-Reset; fail-safe.
- Start-Lock RESPEKTIERT: erste Fassung hatte chatClient.js/autonomous-coding.js
  angefasst (Lock-Check schlug an) — zurueckgenommen. Stattdessen Beobachter:
  #startLog (neue .entry.user) + Coding-Statuszeile ("Job wird eingeplant."),
  eingehaengt ueber profile-dock.js (Muster auth-gate.js). Geste-Scharfschaltung
  verhindert Mitzaehlen der Verlaufs-Wiederherstellung.
- Konto → Nutzung & Limits zeigt echte Werte (usageRow + hydrateUsage,
  Refresh bei Tab-Klick); Zaehlerstand im Datenexport enthalten.
- Tests: tests/usage-meter.test.mjs (6) — Zaehlen, Monats-Reset, fail-safe,
  Kappung/Minuten, Vertragstests (Lock-Dateien ohne recordUsage). 130+ gruen.
- Parallel-Sitzung: Commit-Konflikt im Web-Editor erkannt (deren Cache-Buster d
  + Speichern-Knopf-Fix) — Staende zusammengefuehrt, Versionsmarke auf e,
  nichts ueberschrieben. sw.js-Lock-Meldung stammt aus deren Voice-Arbeit.
- Live verifiziert (smejj.com): Senden zaehlt (messages 1), Wiederherstellung
  zaehlt nicht, Konto zeigt 1/0/0. Alle 4 Blob-Hashes byte-identisch
  (9cf43a5b/cb38ba0d/a82d24ff/59fef9a5). Testdaten danach entfernt.

## Schritt 3a: Stripe-Testmodus live (2026-07-26, Freigabe "Ich bin eingeloggt. Weitermachen")
- Stripe-Sandbox (Konto acct_1TxXHLQddyxzPlSc, iMild LLC), vom Betreiber angelegt.
- Produkte (EUR, monatlich, wiederkehrend):
  - smejj Plus  9 €  — prod_UxSGVIRDGNdHaI
  - smejj Pro  19 €  — prod_UxSItpgmwcvKRg
  - smejj Max  39 €  — prod_UxSJBDqMn7QUTM
- Zahlungslinks (Testmodus, kein Schluessel im Frontend):
  - Plus: https://buy.stripe.com/test_5kQaEZ2Cic9C5egbiIfIs00
  - Pro:  https://buy.stripe.com/test_28E6oJ2Ci4HabCE72sfIs01
  - Max:  https://buy.stripe.com/test_14AdRb7WC5Le6ik2McfIs02
- Frontend: Abo & Zahlungen — "Bald verfuegbar" → "Abonnieren (Test)"-Knoepfe
  (window.open, noopener), TESTMODUS-Hinweis mit Testkarte 4242….
- Verifiziert: Checkout-Seite laedt (9,00 €/Monat, Sandbox-Badge); live auf
  smejj.com oeffnen die Knoepfe die korrekten Links; Blob-Hash ec291fce…
  byte-identisch. KEINE Zahlung ausgefuehrt, keine Kartendaten beruehrt.
- Offen fuer echte Zahlungen (Betreiber): Stripe-Konto aktivieren
  (Unternehmens-/Bankdaten) → danach Live-Links + Webhook/Abo-Status
  (Control-Server, Schritt 3b).

## Schritt 3a-Nachtrag: Stripe-Willkommens-Fragebogen abgeschlossen (2026-07-26, Freigabe "mach endlich fertig")
- /test/welcome-Fragebogen im Betreiber-Chrome komplett durchlaufen:
  Unternehmensname iMild LLC + Standort USA (vorbefuellt), Website
  https://smejj.com, Beschreibung "KI-Assistent … Abo-Plaene (Plus, Pro, Max)".
- Vertriebs-Weiche: "Waehlen Sie aus, was Sie benoetigen" (Standard-Stripe,
  nutzungsabhaengig) gewaehlt — NICHT Managed Payments (3,5 % Aufschlag);
  passt zur bestehenden Architektur (eigene Zahlungslinks + Control-Server).
  Laut Stripe spaeter aenderbar.
- Stripe-Empfehlung uebernommen (Wiederkehrende Zahlungen, Rechnungsstellung,
  Steuereinzug); Einrichtung "Im Dashboard"; Abschluss "Weiter zur Sandbox".
- ACHTUNG Konto-Kontexte: Der Fragebogen legte eine NEUE, leere Sandbox
  acct_1TxXHUQYIFkMHSic an ("iMild LLC Sandbox", 0 Produkte). Die Produkte
  und Zahlungslinks aus Schritt 3a liegen weiterhin im Test-Modus des
  Original-Kontos acct_1TxXHLQddyxzPlSc — dort verifiziert: 3 aktive
  Produkte (Plus 9/Pro 19/Max 39 €), Plus-Zahlungslink laedt (Sandbox-Badge).
  Die leere Sandbox ignorieren, nichts dorthin migrieren.
- Keine Zahlung ausgefuehrt, keine Bank-/Steuer-/Ausweisdaten eingegeben.
- Weiter offen (nur Betreiber): "Jetzt Ihr Live-Konto erhalten" /
  Verifizierung mit Unternehmens-/Bankdaten. Danach Schritt 3b
  (Webhook + Abo-Status am Control-Server, Live-Links im Frontend).

## Schritt 5: Willkommens-Onboarding nach dem ersten Login (2026-07-26, Freigabe "mach es bitte komplett fertig")
- Neue lock-freie Module: assets/onboarding-welcome.js (Overlay, erscheint genau
  einmal; smejj.onboarding.v1) + assets/onboarding-welcome.css (Glas-Design,
  eckig, tuerkiser Akzent, wie Mockup 1). Verdrahtet in account-privacy.js:
  initOnboardingWelcome(STRIPE_PLAN_LINKS) VOR cleanLoginMarkers().
- Ausloeser: Login-Marker ?login=ok bzw. ?session-handoff-complete; Free-Plan
  als "Aktiv" markiert, Plus/Pro/Max mit "Abonnieren (Test)" (Stripe-Testlinks),
  "Los geht's" schliesst dauerhaft (done=true). Fail-safe: Fehler geschluckt.
- Live-Fehler gefunden + behoben: Beim direkten Aufruf von /profile?login=ok
  bootet GitHub Pages ueber den 404-Fallback zuerst unter "/" — der Marker
  steht erst nach der Routen-Wiederherstellung in der Adresse. Fix:
  initOnboardingWelcome prueft sofort + 300 ms + 600 ms (vor der
  800-ms-Marker-Bereinigung). Commits App-Repo: 088bf20 + Fix-Commit.
- Deploy Frontend (Web-Editor, Browser 1): onboarding-welcome.js (neu, dann
  Fix), onboarding-welcome.css (neu), account-privacy.js (Transformation,
  Soll-Laenge 24991). Stolperfalle erneut: New-File-Editor haengt eine
  Leerzeile ans Dateiende an — per cmd+Down+BackSpace entfernt. Blob-Hashes
  byte-identisch: account-privacy e30ec044, css 84a85ed5, js fe854756.
- Live verifiziert auf smejj.com (Test-Session, danach entfernt): Overlay
  erscheint mit "Schoen, dass du da bist, Alan!", alle 4 Knoepfe da,
  "Los geht's" schliesst + merkt sich das, Zweitbesuch mit ?login=ok zeigt
  NICHTS mehr, Adresse wird bereinigt. Testdaten lokal + live entfernt.
- Tests: tests/onboarding-welcome.test.mjs 4/4 gruen; check:frontend gruen;
  Start-Lock: eigene Dateien unveraendert (sw.js-Meldung stammt von der
  Parallel-Session, nicht von diesem Job).
