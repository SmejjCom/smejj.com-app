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

## A2) smejj.com — GitHub-Login (Stand 2026-07-26, live nachgeprueft)

**Zustand live:** Alles gebaut, alles verdrahtet, nur das Secret fehlt.

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

**Was der Betreiber tun muss (ca. 30 Sekunden):**

1. github.com -> Settings -> Developer settings -> OAuth Apps ->
   „smejj.com Login" -> **Generate a new client secret**
   (GitHub verlangt dabei Passwort/Passkey — deshalb kann das keine Session).
2. Den Code **sofort kopieren** (wird nur einmal angezeigt).
3. Der Session Bescheid geben.

**Danach uebernimmt die Session:** In Salad (Container-Gruppe `smejj-control`,
Edit -> Environment Variables) beide Variablen anlegen —
`SMEJJ_GITHUB_LOGIN_CLIENT_ID` = `Ov23liSqth5JlAHAtaZV` traegt die Session
selbst ein, beim Feld `SMEJJ_GITHUB_LOGIN_CLIENT_SECRET` fuegt der Betreiber
mit cmd+V ein. Dann speichern, deployen, `github:true` pruefen, GitHub-Login
Ende-zu-Ende testen, dokumentieren, committen, pushen.

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
