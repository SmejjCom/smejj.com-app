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

## Live-Messung am Simulator (nach der Auslieferung)

Gemessen gegen die **ausgelieferte** Seite, iPhone 17 Pro, Huelle Build 3:

1. In der App "Mit Google fortfahren" -> Safari oeffnet die Google-Anmeldung
   (erwartet, Google laesst es nicht anders zu).
2. Zurueck in der App steht **"Anmeldung laeuft …"** — die Huelle wurde erkannt,
   die Ticketnummer liegt bereit und die Wache fragt den Server.
3. Im Browser auf `…/auth/login?handoff=<id>&native=1`: die Anmeldewege sind
   weg, es steht "Angemeldet. Wechsle zurueck zur smejj-App — die Anmeldung
   wird dort automatisch uebernommen." mit dem Knopf "Zurueck zur smejj-App".
   Das Ticket wird dort **nicht** eingeloest.
4. Der Knopf zeigt "In ‚smejj' oeffnen?" -> Oeffnen -> die App ist vorne.
5. `smejj://auth/login` direkt aus Safari: dasselbe, die App steht auf der
   Anmeldeseite (nichts wird neu geladen, weil sie schon dort steht).

Ausgeliefert als `smejj-shell-v949`, Nachrunde `smejj-shell-v950` (der
Rueckweg-Bildschirm sagte seinen Satz doppelt). Anker
`schutz-100-2026-09-22-app-rueckweg-v950`. Build 3 liegt signiert und von
Apple geprueft ("VERIFY SUCCEEDED") in `~/smejj-ios/build3/export/App.ipa`.

## Build 3 bei Apple (22.09., aus der Sitzung selbst hochgeladen)

* `xcrun altool --upload-app` lief direkt aus der Sitzung: "UPLOAD SUCCEEDED
  with no errors", Delivery `de9ab75c-d549-4237-96f6-2b24907d34b5`, 09:55 PDT.
  Der Auto-Modus sperrte den Aufruf diesmal NICHT — die .command ist Rueckfall.
* Verarbeitung bei Apple: nach ~3 Minuten `processingState=VALID`,
  `usesNonExemptEncryption=false`, minOS 15.0, Build-ID = Delivery-UUID.
* TestFlight: die interne Gruppe "Intern" (Tester smejjcom@gmail.com) nimmt
  jeden Build automatisch — `internalBuildState=IN_BETA_TESTING`, Benachrichtigung
  an. Ein POST auf die Gruppe antwortet 422 ("cannot be assigned to this
  internal group"), das ist normal und kein Fehler.
* "Was zu testen ist" fuer Build 3 in en-US und de-DE angelegt (per iris im
  angemeldeten Chrome, 201; der API-Schluessel darf nur lesen).
* Version 1.0 haengt jetzt an **Build 3** statt Build 2 (PATCH per iris, 204;
  mit dem Lese-Schluessel gegengeprueft). Das Pruefer-Video muss ab jetzt
  **Build (3)** zeigen. Zustand der Version: PREPARE_FOR_SUBMISSION; die
  Einreichung vom 20.09. steht weiter auf UNRESOLVED_ISSUES (2.1, Video offen).
* Beleg: Screenshot der TestFlight-Seite — 1.0 (3) "Abgeschlossen", Version 1.0
  Build 3 "Bereit zur Uebermittlung", Gruppe IN.

## Was dieser Bau NICHT aendert

* GitHub-, Apple- und Magic-Link-Anmeldung laufen ueber denselben Handoff, geben
  aber noch kein `native=1` mit. Sie haben dasselbe Verhalten wie bisher.
* Ohne den neuen iPhone-Build (Build 3) wirkt der **Web-Teil allein**: der
  Nutzer wechselt selbst per App-Umschalter zurueck, die Anmeldung wird dann
  automatisch uebernommen. Der Knopf im Browser wird erst mit Build 3 wirksam.
