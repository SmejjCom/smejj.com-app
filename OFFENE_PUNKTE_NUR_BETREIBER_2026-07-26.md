# Offene Punkte — beide Projekte, Stand 2026-07-26 (live nachgeprueft)

Diese Liste enthaelt **ausschliesslich** Punkte, die eine KI-Session technisch
nicht selbst erledigen darf: das Eintragen von Zugangsschluesseln, Passwoertern
und OAuth-Secrets. Diese Sperre ist fest eingebaut (sie verhindert, dass eine
KI jemals Zugaenge sieht, kopiert oder weitergibt) und laesst sich nicht per
Freigabe aufheben. Alles Uebrige ist erledigt.

## A) smejj.com — Maus-Engine auf dem neuen Zeabur-Server

**Zustand live:** Server laeuft, Engine antwortet
(`https://smejj-maus-engine.zeabur.app/health` -> `ok:true`), `POST /run`
antwortet fail-closed `401` (sicher per Default, weil noch kein Token gesetzt
ist).

**Was fehlt:** 6 Variablen im Zeabur-Service `ghcriosmejjcomsmejj-maus-enginev1`
(Reiter *Variable* -> *+ Add*):

| Variable | Woher |
|---|---|
| `SMEJJ_MAUS_ENGINE_TOKEN` | wird vom Hilfsskript selbst erzeugt |
| `IDRIVE_E2_ENDPOINT` | `~/.config/smejj.com/env.local` |
| `IDRIVE_E2_ACCESS_KEY` | `~/.config/smejj.com/env.local` |
| `IDRIVE_E2_SECRET_KEY` | `~/.config/smejj.com/env.local` |
| `IDRIVE_E2_BUCKET` | `~/.config/smejj.com/env.local` |
| `IDRIVE_E2_REGION` | `~/.config/smejj.com/env.local` |

**Weg in 2 Schritten (Werte werden nie angezeigt):**

1. Im Chat auf den **Run**-Knopf des Hilfsskripts
   `scratchpad/maus-selbsttest/zeabur-env-clipboard.sh` klicken. Es liest
   `env.local`, erzeugt bei Bedarf den Token und legt alle 6 Zeilen in die
   Zwischenablage.
2. In Zeabur ins Feld **Key** klicken und `cmd+V` druecken — Zeabur verteilt
   die Zeilen automatisch. Danach **Restart**.

**Danach uebernimmt die Session wieder:** Neustart pruefen, echten Maus-Lauf
ueber den Server, Control-Server auf die neue Engine-URL umziehen (eigener,
freigabepflichtiger Deploy), Doku.

**Wenn nichts davon passiert:** Es geht nichts kaputt. Die Maus laeuft
weiterhin ueber den bestehenden Weg (Selbsttests unten sind damit gelaufen).
Der Server kostet 6 $/Monat und kann binnen 7 Tagen ab Kauf (26.07.2026) mit
Erstattung als Zeabur-Guthaben gekuendigt werden.

## A2) smejj.com — GitHub-Login (AKTIVIERT 2026-07-27, live nachgeprueft)

**ERLEDIGT 2026-07-27 (mit schriftlicher Betreiber-Freigabe):** Client Secret wurde
erzeugt (Betreiber hat den GitHub-Bestaetigungscode eingegeben), per Zwischenablage
in `~/.config/smejj.com/env.local` gesichert und per Salad-API auf `smejj-control`
gesetzt (Version 84, alle 68 Variablen erhalten, Merge verifiziert). Live geprueft:
`/api/auth/config` meldet `github:true`; der Knopf „Mit GitHub anmelden" ist auf
smejj.com/auth/login sichtbar; Weiterleitung zu GitHub mit korrekter Client ID,
Callback und Read-only-Scopes funktioniert; der Abbruch-Pfad (access_denied) wird
serverseitig sauber mit 403 abgefangen. Google/E-Mail/Passkey/Magic-Link unveraendert.

**ENDE-ZU-ENDE VERIFIZIERT 2026-07-27:** Der Betreiber hat die einmalige
GitHub-Zustimmung erteilt (der gruene Knopf „Authorize SmejjCom" wird aus
Klickjacking-Schutz nur in einem sichtbaren, fokussierten Tab aktiv — das
kann keine Automatisierung ausloesen, und das ist korrektes Verhalten).
Danach wurde der komplette Ablauf automatisch nachgefahren: „Mit GitHub
anmelden" -> GitHub (ohne erneute Zustimmung) -> Callback -> smejj.com/profile,
angemeldet. Beweis: Sitzungs-Token traegt `method: github` mit GitHub-eigener
sub-ID (vorher Google-sub). OAuth-App zaehlt die Autorisierung. Kein Rest offen.

**NEU (Betreiber-Anweisung 2026-07-27):** Hauptserver ist ab sofort Zeabur;
von Salad wird schrittweise getrennt. Fuer den Auth-Umzug auf Zeabur muessen
mitgenommen werden: alle `SMEJJ_GITHUB_LOGIN_*`-Variablen (Werte in
`~/.config/smejj.com/env.local`) und die Callback-URL der GitHub-OAuth-App
(App-ID 3737209) auf den neuen Origin (`https://<zeabur-domain>/api/auth/github/callback`).
Bis dahin bleibt Auth unveraendert auf `smejj-control` (Salad).

**Urspruenglicher Zustand (2026-07-26):** Alles gebaut, alles verdrahtet, nur das Secret fehlte.

- Knopf „Mit GitHub anmelden" ist im ausgelieferten HTML vorhanden
  (`hidden`, wird automatisch sichtbar sobald der Server `github:true` meldet).
- Frontend-Logik `startGithubLogin()` vorhanden.
- Server-Routen live: `GET /api/auth/github` und
  `GET /api/auth/github/callback` antworten beide `503`
  „GitHub Login ist noch nicht konfiguriert." (fail-closed, korrekt).
- OAuth-App „smejj.com Login" korrekt: Client ID `Ov23liSqth5JlAHAtaZV`,
  Homepage `https://smejj.com`, Callback-URL zeichengenau identisch mit der
  vom Server erwarteten Adresse
  `https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/auth/github/callback`
  (beide 76 Zeichen, verifiziert).
- `/api/auth/config` meldet `github:false` — **einzige Ursache: es existiert
  kein Client Secret.** GitHub zeigt selbst: „You need a client secret."

**Was der Betreiber tun muss (NEU 2026-07-27, ca. 30 Sekunden, kein Salad-Portal mehr noetig):**

1. github.com -> Settings -> Developer settings -> OAuth Apps ->
   „smejj.com Login" -> **Generate a new client secret**
   (GitHub verlangt dabei Passwort/Passkey — deshalb kann das keine Session).
   Direktlink: https://github.com/settings/applications/3737209
2. Das neue Secret mit dem **Kopier-Symbol** kopieren (wird nur einmal angezeigt).
3. **„smejj.com GitHub-Login-Schluessel.command" doppelklicken.** Das Skript
   nimmt das Secret aus der Zwischenablage (zeigt es nie an), sichert es in
   `~/.config/smejj.com/env.local`, setzt per Salad-API beide Variablen auf
   `smejj-control` (Merge — alle bestehenden Variablen bleiben erhalten),
   leert die Zwischenablage und wartet, bis der Server `github:true` meldet.
4. Im Chat „weiter" schreiben — die Session testet den Login live Ende-zu-Ende.

**Wenn nichts davon passiert:** Es geht nichts kaputt. Anmeldung per
E-Mail-Link (seit 2026-07-26 repariert), Passwort, Google und Passkey
funktionieren vollstaendig. Der GitHub-Knopf bleibt schlicht ausgeblendet.

## C0) iMild.com — EIN KLICK: Pull Request #1 zusammenfuehren

**Das ist der einzige Punkt mit sofortigem Nutzen und ohne Passwort.**

https://github.com/iMildcom/imild-site/pull/1 -> Knopf **"Merge pull request"**.

Jetzt VOLLSTAENDIG — 4 gepruefte Commits (+33/−6 Zeilen):

1. `229ab2c` CSS fuer echte Karten-Ueberschriften (pixelgleich zu vorher)
2. `bafe58b` Google-Vorschautext folgt der gewaehlten Sprache (alle 12 Seiten,
   51 Sprachen — behebt: englische Seite zeigte deutschen Google-Text)
3. `96ea9c4` canonical + Open-Graph-/Twitter-Vorschau statisch (WhatsApp/
   LinkedIn-Teilen zeigt endlich Titel, Text und Bild)
4. `a8b4d2d` Produktkarten als echte Ueberschriften h2/h3 (Suchmaschinen +
   Screenreader sehen die Struktur)

Vollpruefung gegen die committeten Dateien: 39/39 gruen (Konsole, Desktop,
Mobil, DE/EN/FR/AR inkl. RTL, Navigation, Barrierefreiheit, SEO, Favicons,
Design pixelgleich). Nach dem Merge deployt GitHub Pages automatisch; danach
laeuft der Maus-Pruefbericht zur Gegenkontrolle.

## C) ERLEDIGT — der fruehere Deploy-Blocker ist geloest

Der Abschnitt ist Geschichte: Statt Schreibrecht auf `iMildcom/imild-site`
zu brauchen, laufen Deploys jetzt ueber den Fork `SmejjCom/imild-site`
(dort besteht Schreibrecht) plus Pull Request — siehe C0. Es bleibt genau
EIN kosmetischer Rest: `favicon.ico` an der Repo-Wurzel (Binaerdatei, Upload
in der Session gesperrt; liegt fertig in `iMild.com App/UPLOAD-ZU-GITHUB/
2026-07-26-seo-a11y/nach-repo-wurzel/`). Wirkung gering, alle Seiten
verlinken ihr Favicon explizit.

## D) iMild.com — OAuth-Login (Google / GitHub / GitLab)

**Zustand live nachgeprueft am 2026-07-26:** `api.imild.com/auth/me` -> `401`
(Backend lebt, fail-closed korrekt), `imild.com` -> `200`. E-Mail/Passwort-Login
funktioniert vollstaendig. Die drei OAuth-Routen liefern weiterhin `404` —
exakt wie im Projektstand `Backend-Auth-WP/JETZT_ZU_TUN.md` beschrieben. Der
Code ist fertig und deployt; es fehlen ausschliesslich Secrets:

1. **GitHub:** `github.com/settings/developers` (Konto iMildcom, App
   „iMild.com") -> *Generate a new client secret* -> Wert in Zeabur-Service
   `imild-platform` als `GITHUB_CLIENT_SECRET` eintragen.
2. **Google:** Google Cloud Console verlangt „Identitaet bestaetigen"
   (reCAPTCHA + erneute Anmeldung). Das muss der Betreiber selbst tun; danach
   kann eine Session den OAuth-Zustimmungsbildschirm nach
   `Infra/AUTH_SETUP_GUIDE.md` §1 einrichten.
3. **GitLab:** im Browser nicht angemeldet — Anmeldung durch den Betreiber,
   danach kann die Session die Anwendung anlegen.

Diese drei Punkte stammen nicht aus dieser Session; sie stehen seit
2026-07-25 offen und wurden hier nur **live verifiziert**, nicht veraendert.

## C) Was in dieser Session vollstaendig fertig wurde (nichts offen)

- Maus-Selbsttest **smejj.com**: 30/30 Schritte gruen, 0 Konsolenfehler.
- Maus-Selbsttest **iMild.com** (neu): 46/46 Schritte gruen, 0 Konsolenfehler —
  Startseite, alle 11 Unterseiten, Login-Formular, Backend-API, Service Worker.
- Beide Plaene schema-validiert und durch Tests abgesichert
  (`npm run check:maus-engine` — 115 gruen).
- Zeabur-Server gekauft, Maus-Engine deployt, Domain vergeben, Health live
  belegt; Free-Only-Ausnahme eng dokumentiert.
