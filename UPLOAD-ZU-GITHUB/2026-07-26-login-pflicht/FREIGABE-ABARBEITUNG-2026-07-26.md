# Abarbeitung der Betreiber-Freigabe vom 2026-07-26

Freigabe erteilt von Wof Kadavanich (Betreiber), Punkte 1-5.
Zweite schriftliche Freigabe am 2026-07-26 fuer Upload, Deploy und Live-Test.

## Punkt 1 — IDrive-Upload: ERLEDIGT

- Objekt live:
  `s3://smejj-model-files/deployments/control/smejj-control-magiclink-fix-2026-07-25-rc1/smejj-control-context.tar.gz`
- 1.302.172 Bytes, SHA-256
  `2445eed255245add52ae98d6cde394a04c644abfb3371c86ce7883c6431e5f0c`
- `created:true`, `immutable:true` (2. PUT → 412), `contentVerified:true`
  (Roundtrip-GET, SHA == Soll).
- Weg: `scripts/deploy/upload_control_release_to_idrive.mjs`
  (`CONFIRM_CONTROL_RELEASE_UPLOAD=YES`). Zugangsdaten kommen aus
  `loadSecureLocalEnv()` — nie ausgelesen, nie eingetippt.

**Korrektur gegenueber dem Auftragstext:** Der Auftrag nannte Bucket
`smejj-app`. Der Bootstrap liest den Artefakt-Bucket jedoch aus
`IDRIVE_E2_DEPLOY_BUCKET` = `smejj-model-files` (verifiziert im live
gepinnten Bootstrap, Commit `5db5c86`, und im Paket selbst). Ein Upload nach
`smejj-app` haette den Container-Start fail-closed scheitern lassen. Der
leere Ordner in `smejj-app` wurde nicht geloescht.

## Punkt 2 — Salad-Umstellung: ERLEDIGT

- `SMEJJ_CONTROL_ARTIFACT_KEY` =
  `deployments/control/smejj-control-magiclink-fix-2026-07-25-rc1/smejj-control-context.tar.gz`
- `SMEJJ_CONTROL_ARTIFACT_SHA256` =
  `2445eed255245add52ae98d6cde394a04c644abfb3371c86ce7883c6431e5f0c`
- Vor dem Speichern byte-genau gegengelesen; `SMEJJ_CONTROL_BOOTSTRAP_URL`
  unveraendert (Commit `5db5c86`), SMTP-Variablen unveraendert, alle
  66 Variablen erhalten.

**Rollback-Punkt (alte Werte, weiterhin gueltig):**

- `SMEJJ_CONTROL_ARTIFACT_KEY` =
  `deployments/control/smejj-control-auth-extra-2026-07-21-rc1/smejj-control-auth-extra-2026-07-21-rc1.tar.gz`
- `SMEJJ_CONTROL_ARTIFACT_SHA256` =
  `bdda981cbdb26d8718c69f5fc2fa9cfbceb44c34614f7affc80f4de3596d8c34`

## Punkt 3 — Deploy und Gesundheit: ERLEDIGT

- smejj-control Version 82 → **83**, Replica RUNNING + Ready (4/4 Haken).
- `/api/health` → `ok:true`, `ai:true`, `zhipu:glm-5.2`.
- `/api/auth/config` → `email:true`, `passkey:true`, `google:true`,
  `magicLink:true`, `github:false` (Secret fehlt, siehe unten).

## Punkt 4 — Live-Test des Fehlerfalls: BESTANDEN

Kern des Tests: Der Handoff lebte nur 2 Minuten, der Link 15 — wer die
E-Mail spaeter oeffnete, verlor die Anmeldung.

- Sauberer Ausgangszustand: Server-Logout (`/api/auth/logout` → 200),
  veralteter `smejj.auth.accessToken.v1` aus dem Browser-Speicher entfernt,
  `/api/auth/me` → `authenticated:false`.
- 09:22:32 UTC Anmeldelink angefordert (UI-Meldung: "15 Minuten gueltig").
- **200 Sekunden gewartet** (3 Min 20 Sek — deutlich ueber der alten
  2-Minuten-Grenze), Link um 09:25:52+ UTC geoeffnet.
- Ergebnis: Anmeldung erfolgreich, App laedt angemeldet unter `/profile`,
  `/api/auth/me` → `authenticated:true`, `method:magiclink`.

Codebeleg im ausgelieferten Paket
(`control-server/src/routes/magicLinkRoutes.js`): Ist der Handoff verfallen,
wird ein frischer erzeugt und abgeschlossen; der Link bleibt durch
jti-Single-Use geschuetzt.

Zusatzpruefungen live:

- `/`, `/auth/login/`, `/auth/register/`, `/en/`, `/datenschutz.html` → 200
- Login-Pflicht aktiv: `assets/auth-gate.js` ausgeliefert, leitet auf
  `/auth/login`
- Meldung "Google-Anmeldung konnte nicht abgeschlossen werden": 0 Treffer
  im ausgelieferten `auth-page.js`

## Punkt 5 — Merge nach main: BEWUSST NICHT AUSGEFUEHRT

`main` und `feature/auth-redesign-github-magiclink` haben **getrennte
Wurzeln** (unrelated histories):

- main-Root `335ac7a8…`, 855 Dateien, letzter Commit `3d42346` (17. Juli)
- Branch-Root `d46cfda6…`, 1104 Dateien, aktueller Arbeitsstand

`git merge` bricht mit "refusing to merge unrelated histories" ab. Ein
erzwungener Merge haette hunderte Konflikte und ein unbrauchbares
Mischergebnis erzeugt — das verletzt "nichts darf kaputtgehen".

**Empfehlung als eigener, geplanter Vorgang:** main als Archiv belassen und
den Branch offiziell zur Hauptlinie erklaeren (Default-Branch in GitHub
umstellen — risikoarm, reversibel).

## Offen: GitHub-Login

`github:false` ist korrekt fail-closed. Die OAuth-App ist vorhanden und
richtig konfiguriert (Client ID `Ov23liSqth5JlAHAtaZV`, Homepage
`https://smejj.com`, Callback-URL gesetzt), aber es existiert **kein
Client Secret** — GitHub zeigt "You need a client secret".

Der Betreiber erzeugt das Secret selbst (GitHub → Settings → Developer
settings → OAuth Apps → smejj.com Login → *Generate a new client secret*)
und traegt in Salad ein:

- `SMEJJ_GITHUB_LOGIN_CLIENT_ID` = `Ov23liSqth5JlAHAtaZV`
- `SMEJJ_GITHUB_LOGIN_CLIENT_SECRET` = (vom Betreiber erzeugt)

Secrets werden von Claude weder erzeugt noch ausgelesen noch eingetippt.

## Schutz-Status nach dieser Runde

- start-lock OK (31 Startseiten-Dateien byte-identisch)
- favicon-lock OK (6 Dateien, 19 HTML-Seiten, Manifest unveraendert)
- check:guidelines OK (781 Dateien)
- Nichts geloescht, nichts ueberschrieben, kein anderer Dienst veraendert
- Artefakt immutable auf IDrive e2, Rollback-Werte oben dokumentiert
