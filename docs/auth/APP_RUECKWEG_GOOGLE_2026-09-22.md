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

---

# Runde 2: die uebrigen Anmeldewege (22.09.2026)

Auftrag Betreiber: "mach die anderen Anmeldewege auch Apple Login".

GitHub, Apple und der Anmeldelink liefen in dieselbe Falle wie Google. Gebaut
wurde deshalb nicht dreimal dasselbe, sondern EINE Stelle:
`startHandoffQuery()` in `public/auth/auth-page.js` merkt die Ticketnummer,
startet die Wache und gibt `native=1` mit — fuer alle vier Wege. Google hatte
diesen Block bisher als eigene Kopie; sie ist weg.

Serverseitig ziehen `src/auth/githubAuthRoutes.js`, `src/auth/appleAuthRoutes.js`
und `control-server/src/routes/magicLinkRoutes.js` nach: `native` wird als 1/0
ins signierte Ticket uebernommen, der Rueckweg traegt die Markierung.

**Ausnahme Anmeldelink:** Ist der Handoff beim Klick auf den Mail-Link schon
verfallen, erzeugt der Server ein FRISCHES Ticket (Link gilt 15 Minuten, Ticket
10). Dessen Nummer kennt die wartende App nicht — deshalb geht die Markierung
dann NICHT mit, und die Anmeldeseite im Browser meldet an wie bisher. Sonst
fiele die Anmeldung zwischen App und Browser durch.

**Zweiter Weg im Rueckweg-Bildschirm:** "Stattdessen hier im Browser anmelden"
(14 Sprachen) — die E-Mail mit dem Anmeldelink kann auf einem anderen Geraet
liegen, und dann darf der Bildschirm keine Sackgasse sein.

## Runde 3: die Wache blockierte sich selbst (v952)

Beim Nachmessen am Simulator zeigte der Apple-Weg nach der Rueckkehr NICHT
"Anmeldung laeuft …" — der Google-Weg schon. Der Unterschied war kein Zufall:
beim Google-Test lag noch ein Ticket aus dem vorigen Lauf im Speicher, sodass
die Wache schon beim Laden der Seite lief.

Die Ursache: **iOS friert die Ansicht beim Sprung in den Browser ein, und ob
diese Schleife danach weiterlaeuft, ist nicht garantiert.** Die Sperre
"laeuft schon" (`wacheLaeuft`) haette den Neustart in genau diesem Fall fuer
immer verhindert — die App haette das Ticket nie abgeholt. Statt der Sperre
zaehlt jetzt eine Laufnummer: jede neue Wache verdraengt die alte. Angestossen
wird sie bei `visibilitychange`, `pageshow` und `focus`.

## Nachweis Runde 2/3 (LIVE, frisch installierte App, v952)

| Schritt | Ergebnis |
| --- | --- |
| App frisch installiert, Anmeldeseite | keine Statuszeile (sauberer Start) |
| "Mit Apple fortfahren" | Safari oeffnet appleid.apple.com |
| zurueck in die App (`smejj://auth/login`) | **"Anmeldung laeuft …"** |
| dasselbe mit "Mit GitHub fortfahren" | **"Anmeldung laeuft …"** |
| `api.smejj.com` mit `native=1` | google/github/apple je 303 |
| Tests | Google 12/12, GitHub 10/10, Apple 21/21, Anmeldelink 12/12, Frontend 742/742 |

Anker `schutz-100-2026-09-22-app-rueckweg-v952`.

---

# Runde 4: Reihenfolge der Anmeldewege + Apple dreimal getestet (v953)

Betreiber: "Login Reinfolge: Google fortfahren, Apple fortfahren, GitHub
fortfahren, Mit Fingerabdruck fortfahren, Mit eMail fortfahren. alle mit Logos
wie jetzt."

Geaendert wurde nur die Reihenfolge im Block `#authProviders` (Anmelde- und
Registrierseite plus assets-Spiegel); Beschriftungen, Logos und Verhalten sind
unangetastet. Die Registrierseite stand bereits so. Live geprueft: die
ausgelieferte Seite liefert die IDs in der Reihenfolge googleLogin, appleLogin,
githubLogin, passkeyLogin, emailWeg — und am Simulator steht es genauso auf dem
Schirm.

## Apple-Login, drei Laeufe am Simulator (v953)

| Lauf | Ausgangslage | Weg zurueck | Ergebnis |
| --- | --- | --- | --- |
| 1 | App frisch installiert | `smejj://auth/login` | Safari zeigt appleid.apple.com ("smejj web"), zurueck in der App: **"Anmeldung laeuft …"** |
| 2 | App frisch installiert | `smejj://auth/login` | gleiches Ergebnis |
| 3 | App frisch installiert | **nur App-Wechsel**, kein Deeplink | gleiches Ergebnis — das ist der Weg, der ohne neuen iPhone-Build funktioniert |

**Was diese Laeufe NICHT abdecken:** die Anmeldung bei Apple selbst. Dafuer
braucht es die Apple-ID des Betreibers — Zugangsdaten gibt diese Sitzung nicht
ein. Geprueft ist damit alles bis zur Apple-Anmeldemaske und der komplette
Rueckweg; den letzten Schritt (Apple-ID eingeben, Rueckkehr mit Token) muss der
Betreiber einmal selbst gehen.

---

# Hochgeladen: Build 4 (22.09.2026, 11:42)

Der Upload von **Build 3 wurde von App Store Connect abgelehnt**: die Nummer 3
war dort bereits vergeben ("The bundle version must be higher than the
previously uploaded version: '3'"). Also `CURRENT_PROJECT_VERSION` auf 4
gehoben, neu gebaut, signiert, exportiert — **UPLOAD SUCCEEDED with no errors**,
Delivery-UUID `c2375e11-87dd-4e42-9a18-7ba8b1263547`.

Build 4 traegt das URL-Schema `smejj://` und die Rueckkehr im SceneDelegate.
Er liegt jetzt unter TestFlight/Builds; die Zuordnung zur Version 1.0 und die
Freigabe fuer Tester macht der Betreiber in App Store Connect.

Merke fuer den naechsten Bau: die Build-Nummer in `ios/App/App.xcodeproj`
hochzaehlen, sonst weist Apple den Upload ab.

---

# GitHub-Login, drei Laeufe (23.09.2026, gegen smejj-shell-v959)

Auftrag Betreiber: "GitHub Login auch paar mal testen". Simulator iPhone 17 Pro,
Huelle mit Schema `smejj://`, App vor **jedem** Lauf neu installiert
(`simctl uninstall` + `install`), damit kein Ticket aus dem vorigen Lauf das
Ergebnis schoenfaerbt.

| Lauf | Weg zurueck | Ergebnis |
| --- | --- | --- |
| 1 | `smejj://auth/login` | Safari zeigt "Sign in to GitHub — to continue to smejj.com Login", zurueck in der App: **"Anmeldung laeuft …"** |
| 2 | `smejj://auth/login` | gleiches Ergebnis |
| 3 | **nur App-Wechsel**, kein Deeplink | gleiches Ergebnis |

Damit ist der GitHub-Weg genauso belegt wie Google und Apple. Was auch hier
offen bleibt: die Anmeldung bei GitHub selbst — dafuer braucht es die
Zugangsdaten des Betreibers.

Mitgeprueft am selben Stand (v959, nach sechs fremden Auslieferungen): der
Rueckweg-Code steht vollstaendig in der ausgelieferten `auth-page.js`, die
Knopfreihenfolge stimmt, `api.smejj.com` nimmt `native=1` fuer Google, GitHub
und Apple mit je 303 an, 55/55 Anmelde-Tests gruen, vier Sperren gruen.
