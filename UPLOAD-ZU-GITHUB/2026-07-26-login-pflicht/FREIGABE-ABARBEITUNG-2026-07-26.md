# Abarbeitung der Betreiber-Freigabe vom 2026-07-26

Freigabe erteilt von Wof Kadavanich (Betreiber), Punkte 1-5.

## Punkt 4 — Frontend-Deploy + Live-Tests: ERLEDIGT

- `assets/auth/auth-page.js` live: irrefuehrende Meldung
  "Google-Anmeldung konnte nicht abgeschlossen werden" ersetzt durch die
  neutralen, bereits uebersetzten Texte "Anmeldung läuft …" /
  "Anmeldung fehlgeschlagen." (Handoff traegt Google, GitHub UND Magic-Link).
  Live verifiziert: alte Meldung 0x im ausgelieferten Skript.
- Live-Test Anmeldung: Magic-Link funktioniert Ende-zu-Ende. Konto
  smejjcom@gmail.com angemeldet (`/api/auth/me` → authenticated,
  method magiclink), App laedt mit Verlauf.
- Gesundheitscheck Control-Server: `ok:true`, `ai:true`.
- Live-Seiten 200: `/`, `/auth/login/`, `/auth/register/`, `/en/`,
  `/datenschutz.html`.

## Punkt 5 — Merge nach main: BEWUSST NICHT AUSGEFUEHRT

`main` und `feature/auth-redesign-github-magiclink` haben **getrennte
Wurzeln** (unrelated histories):

- main-Root `335ac7a8…`, 855 Dateien, letzter Commit `3d42346` (17. Juli)
- Branch-Root `d46cfda6…`, 1104 Dateien, aktueller Arbeitsstand

`git merge` bricht mit "refusing to merge unrelated histories" ab. Ein
erzwungener Merge (`--allow-unrelated-histories`) haette hunderte Konflikte
und ein unbrauchbares Mischergebnis erzeugt. Das verletzt die Vorgabe
"nichts darf kaputtgehen" — deshalb gestoppt und dokumentiert.

**Empfehlung als eigener, geplanter Vorgang:** entweder main als Archiv
belassen und den Branch offiziell zur Hauptlinie erklaeren (Default-Branch
in GitHub umstellen — risikoarm, reversibel), oder main gezielt auf den
Branch-Stand setzen. Beides braucht eine bewusste Entscheidung, keine
Nebenwirkung eines Deploys.

## Punkte 1-3 — Control-Server-Deploy: BLOCKIERT (Zugangsdaten)

- Paket liegt bereit: `SERVER-PAKET-ZUM-HOCHLADEN/smejj-control-context.tar.gz`,
  SHA-256 `2445eed255245add52ae98d6cde394a04c644abfb3371c86ce7883c6431e5f0c`.
- Browser-Upload nach IDrive e2 ist nicht moeglich: der Datei-Upload des
  Agenten ist auf Sitzungsdateien beschraenkt (Fehler: "only files the user
  has shared with this session can be uploaded").
- Der offizielle Weg (`scripts/deploy/upload_control_release_to_idrive.mjs`)
  braucht die IDrive-Zugangsdaten in einer lokalen `.env` — diese Datei
  existiert nicht.
- Punkt 3 (`SMEJJ_GITHUB_LOGIN_CLIENT_ID`) wurde bewusst NICHT einzeln
  gesetzt: ohne das zugehoerige Secret bleibt der GitHub-Login fail-closed,
  und ein separater Deploy waere ein Container-Neustart ohne Nutzen. Alle
  Salad-Aenderungen gehoeren in EINEN Deploy.

**Fehlt konkret:** entweder eine lokale `.env` mit IDRIVE_E2_* (dann
uebernimmt Claude Upload + Portal-Schritte), oder die drei Handgriffe aus
`SERVER-PAKET-ZUM-HOCHLADEN/ANLEITUNG.md`.

## Schutz-Status nach dieser Runde

- start-lock OK (31 Dateien byte-identisch)
- favicon-lock OK (6 Dateien, 19 HTML-Seiten unveraendert)
- check:guidelines OK (780 Dateien)
- 12 Auth-Tests gruen (auth-gate + magic-link)
- Nichts geloescht, nichts ueberschrieben; Rollback dokumentiert
