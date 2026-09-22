# Google-Login kehrt in die App zurueck (22.09.2026)

**Befund Betreiber (TestFlight, echtes iPhone):** "Google Login, ich bleibe immer
im Browser, dann geht er nicht wieder zurueck zum App."

## Was gemessen wurde

Simulator iPhone 17 Pro, Build aus `~/smejj-ios` (Capacitor-Huelle um
`https://smejj.com`). Anmelden -> "Mit Google fortfahren":

* Die Ansicht wechselt in den **externen Safari** (Statusleiste zeigt
  "◀ smejj"), nicht in ein Fenster der App.
* Grund: `startGoogleLogin` schickt die Ansicht auf `api.smejj.com`, von dort
  geht es weiter auf `accounts.google.com`. Beides sind fremde Adressen, die
  die Huelle nach draussen gibt — und Google verweigert die Anmeldung in einer
  eingebetteten Ansicht ohnehin ("disallowed_useragent").
* Der Rueckweg von Google endete auf `https://smejj.com/auth/login?handoff=…`
  **im Safari**. Dort loeste die Anmeldeseite das Ticket ein: im Browser
  angemeldet, die App blieb abgemeldet.
* Die App hatte **keine eigene Adresse**: kein `CFBundleURLTypes`, kein
  Associated-Domains-Eintrag (`public/.well-known/apple-app-site-association`
  liegt seit dem Passkey-Umbau, ohne die Berechtigung in der App ist sie wirkungslos).
  Aus dem Browser fuehrte darum technisch nichts zurueck.

## Was gebaut wurde

**1. Server — `src/auth/googleAuthRoutes.js`**
Die Huelle meldet ihren Start mit `native=1`. Nur dieser eine Wert wird als
`1`/`0` in das signierte Ticket uebernommen (keine Adresse aus der Anfrage, also
kein offener Redirect). Traegt das Ticket die Markierung, haengt der Rueckweg
`&native=1` an: `…/auth/login?handoff=<id>&native=1`.

**2. Anmeldeseite — `public/auth/auth-page.js`**
* `istAppHuelle()` erkennt die Huelle an mehreren Signalen (Capacitor-Bruecke,
  WKWebView-Kennung ohne "Safari/", Android-WebView, installierte PWA). Beide
  Fehlrichtungen sind harmlos: falsch "nein" = altes Verhalten, falsch "ja" =
  die Seite loest das Ticket wie bisher selbst ein.
* Vor dem Absprung merkt sich die App die Ticketnummer (`smejj.auth.handoff.v1`).
* **Im Browser** (`native=1`, aber keine Huelle): das Ticket wird **nicht**
  eingeloest — es ist einmalig und gehoert der App. Stattdessen Knopf
  "Zurueck zur smejj-App" (`smejj://auth/login`) plus der Satz, dass die
  Anmeldung in der App automatisch uebernommen wird.
* **In der App:** Die Ansicht steht waehrenddessen unveraendert auf der
  Anmeldeseite. Sobald sie wieder sichtbar ist, fragt sie
  `/api/auth/session-handoff/<id>` alle 1,5 s ab, bis der Token da ist — das
  Ticket gilt 10 Minuten. Ein noch nicht fertiges Ticket ("pending") wird still
  behandelt und nicht als Fehlschlag angezeigt.

**3. iPhone-Huelle — `~/smejj-ios` (Build 3)**
* `ios/App/App/Info.plist`: `CFBundleURLTypes` mit dem Schema `smejj`.
* `ios/App/App/SceneDelegate.swift`: `openURLContexts` faengt `smejj://` ab und
  holt die App nach vorne. **Bewusst ohne Ticket in der Adresse** — die
  Anmeldeseite hat ihre Ticketnummer gemerkt. So kann ein fremder Link niemanden
  mit einem untergeschobenen Ticket anmelden. Steht die Ansicht noch auf
  `/auth…`, wird nichts neu geladen; sonst wird `/auth/login` geholt.
* `CURRENT_PROJECT_VERSION` 2 -> 3.

## Nachweis

* `node --test tests/google-auth-routes.test.mjs` — 12/12 gruen, davon zwei neu:
  `native=1` wandert in den Ticketinhalt und zurueck in den Rueckweg; ohne
  Huelle bleibt der Rueckweg unveraendert.
* `npm run check:frontend` — 742/742 gruen.
* Simulator: `smejj://auth/login` aus Safari -> Dialog "In ‚smejj' oeffnen?" ->
  App kommt nach vorne und steht auf der Anmeldeseite (Screenshot-Beleg in der
  Sitzung).

## Was dieser Bau NICHT aendert

* GitHub-, Apple- und Magic-Link-Anmeldung laufen ueber denselben Handoff, geben
  aber noch kein `native=1` mit. Sie haben dasselbe Verhalten wie bisher.
* Ohne den neuen iPhone-Build (Build 3) wirkt der **Web-Teil allein**: der
  Nutzer wechselt selbst per App-Umschalter zurueck, die Anmeldung wird dann
  automatisch uebernommen. Der Knopf im Browser wird erst mit Build 3 wirksam.
