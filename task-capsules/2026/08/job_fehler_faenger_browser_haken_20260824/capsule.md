# Task Capsule — job_fehler_faenger_browser_haken_20260824

## Ziel
Den fehlenden Browser-Haken des Fehler-Fängers (Autopilot Nr. 50) ausliefern:
`public/fehler-faenger.js` meldet `window`-Fehler (`error`) und abgestürzte
Promises (`unhandledrejection`) angemeldeter Nutzer an `POST /api/fehler`
und sendet beim Seitenstart einmal `{art:"start"}` — damit die Ampel
"keine Fehler" von "niemand kann melden" unterscheiden kann.
Betreiber-Auftrag 2026-08-24 (inkl. Freigabe: Start-Lock neu stempeln,
Frontend-Deploy über den bekannten Push-Weg, Ampel-Wortlaut anpassen).

## Ergebnis (live belegt)
- **Frontend live** (Repo `smejj-app-frontend`, Commit `219272e`):
  `assets/fehler-faenger.js` per SHA-256 byte-identisch zur Quelle bewiesen;
  Script-Tag in der Live-index.html (markenlos, KEIN `?v=` — Updates kommen
  über den sw-Precache); `sw.js` CACHE_NAME v687→v688 + Precache-Eintrag.
  Alles auf LIVE-Basis eingefügt (live war v687, lokale Quelle stand auf v297).
- **Server live** (Bauzweig `feature/auth-redesign-github-magiclink`,
  Commits `4462eec2`+`07a52c8d`, Bau per `control-neu-bauen.mjs`):
  Ampel-Wortlaut sagt nicht mehr "noch nicht ausgeliefert", Tagesmappe-
  OFFENE_PUNKTE ohne den Fehler-Fänger-Eintrag (live gemessen: 1 Eintrag).
- **Klickpfad-Beweis in der angemeldeten Betreiber-Sitzung (Chrome, smejj.com):**
  Start-Lebenszeichen `POST https://api.smejj.com/api/fehler` → 200;
  absichtlich geworfener Testfehler ("Testprobe … Entwarnung") wurde gefangen
  und mit korrekter Payload (nachricht/quelle/zeile/stapel/seite) gesendet → 200.
  Eine Einzelprobe macht bewusst nicht rot (Schwelle: 3 gleiche Vorkommen).
- **Ampel Nr. 50 nach dem Deploy: GRÜN** — Lauf 2026-08-24T08:28:04Z:
  "Selbsttest 3/3; 0 Browserfehler in 24 h, 0 Befund(e), kein wiederkehrendes
  Muster (0 angenommen / 0 abgewiesen seit Start)" — der Lauf sah bereits das
  Start-Lebenszeichen des Betreiber-Browsers (clientVerdrahtet-Zweig).

## Änderungen
- NEU `public/fehler-faenger.js` (+ Zwilling `public/assets/fehler-faenger.js`):
  Anmelde-Signal wie auth-gate.js (localStorage-Token, fail-closed),
  Versand `credentials:"include"` + `keepalive`, max. 8 Meldungen je
  Seitenlauf (Server-Bremse: 10/min), Dedupe je Seitenlauf mit derselben
  Zahlen-raus-Signatur wie die Server-Gruppierung, Ressourcen-Fehler
  (leere message) werden übersprungen, alles try/catch-gesichert.
- `public/index.html`: Script-Tag als erstes Modul; `public/sw.js`:
  Precache + CACHE_NAME v298 (lokale Zählung).
- `control-server/src/autopilots/fehlerFaengerAutopilot.js` (Wortlaut),
  `tagesmappeAutopilot.js` (OFFENE_PUNKTE gekürzt),
  `admin/opsAutopilotenListeSchutz.js` (Beschreibung/Neuigkeiten).
- Start-Lock mit Betreiber-Freigabe neu gestempelt — als EIGENER Commit
  (`d4897ace`/cherry-picked `07a52c8d`), nie nebenbei im Code-Commit;
  Backup lokal `backups/start-design-lock/2026-08-24T08-11-33-152Z/`.

## Tests / Verifikation
- `tests/schutz-autopiloten.test.mjs` + `wachstum` + `ehrlichkeit`: 27/27 grün
  (auf Arbeits- UND Bauzweig-Stand); Test-Wächter `check:unit-server`:
  64 bzw. 65 Testdateien grün; `check:start-lock` grün nach Stempel.
- Vorbestehend rot (NICHT dieser Job, Chip gespawnt): 2 Tests in
  `tests/remote-browser-session.test.mjs` (fehlende
  `public/browser-pane-nachrichten.js` aus Parallelsitzung).

## Rollback
- Frontend: `git revert 219272e` in `smejj-app-frontend` (+ CACHE_NAME v689).
- Server: Bau des Bauzweig-Stands `5fe073b4` (vor den zwei Commits).
- Start-Lock: Backup-Manifest im Backup-Ordner oben.

## Lehren
- Zeabur-Auto-Deploy ist weiter AUS (Push → check-runs total_count 0);
  bauen geht nur über `CONFIRM_CONTROL_BAU=JA scripts/deploy/control-neu-bauen.mjs`.
- `gestartetAm`-Wechsel allein beweist den eigenen Bau NICHT (es gab
  Neustarts VOR dem eigenen Bau) — immer inhaltlich nachmessen
  (hier: `offenePunkte`-Länge der Tagesmappe).
