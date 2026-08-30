# Task Capsule — Freigabe-Umsetzung OG/Login/First-Token (2026-08-30, job_parallel_firsttoken_20260830)

## Auftrag

Betreiber-Freigabe (Wortlaut): „Ich finde deinen Vorschlag gut. Kannst Du
umsetzen" + „Ich gebe dir alle Rechte von A bis Z. Mach hundert Prozent
fertig. Lass nicht offen." — bezogen auf die drei Empfehlungen:
(1) OG-Tags + Canonical Startseite, (2) Login-Entschachtelung,
(3) First-Token-Dauermessung.

## Befund bei Umsetzungsbeginn: Eine Parallel-Session war schneller

Der Deploy-Abgleich (`npm run check:deploy-abgleich`) meldete STOPP:
**15 Dateien live NEUER als lokal** — eine zweite Session hatte am selben
Tag deployt. Live-Gegenprobe bewies:

- **(1) OG-Tags: BEREITS LIVE.** public/index.html (die echte Startseite /)
  trägt vollständige og:-Tags (type, site_name, title, description, url,
  locale de) inkl. og:image 1200×630 mit type/width/height/alt und
  canonical https://smejj.com/; og-image.png erreichbar (HTTP 200,
  image/png, 16,2 KB). Der Morgen-Review („keine OG-Tags") ist überholt.
- **(2) Login: BEREITS LIVE DEUTSCH.** Titel „Anmelden · smejj.com", h1
  „Anmelden oder registrieren", Buttons „Mit Google/GitHub/E-Mail
  fortfahren", „Link per E-Mail schicken", „Passkey" — kein Sprachmix,
  kein „fingerprint" mehr.
- html lang=de auf der (deutschen) Startseite korrekt.

Konsequenz: KEIN Frontend-Deploy aus dieser Session — die Kollision des
23.08. (zwei Sessions, ein Repo, 10 Minuten falscher Styles) sollte sich
nicht wiederholen. Die Parallel-Session liegt zudem mit uncommitteten
Lock-Dateien im Arbeitsbaum (start-styles.css, sw.js u. a. — der Start-Lock
meldet sie korrekt als VERÄNDERT; der Schutz hat exakt funktioniert).
Diese Dateien wurden NICHT angefasst, NICHT committet, NICHT gestempelt.

## Umgesetzt: (3) First-Token-Dauermessung wird anmeldbar

Problem: Die Bridge misst anonym nur die 401-Schwelle (fail-closed,
gewollt) — das <1-s-Budget war nicht dauerhaft messbar.

Lösung (Commit e360faab, Arbeitszweig):

- `src/evaluation/firstTokenProbe.js`: optionales `authToken`; wird NUR als
  `Authorization: Bearer`-Header gesendet.
- `scripts/testing/measure_first_token.mjs`: lädt die sichere lokale Env
  (`~/.config/smejj.com/env.local`) und liest `SMEJJ_FIRSTTOKEN_TOKEN`;
  Bericht vermerkt nur `bearer-aus-sicherer-env` bzw.
  `anonym-fail-closed` — der Token erscheint nie in Ausgabe oder Bericht.
- `tests/firsttoken-auth.test.mjs`: netzfrei (injizierter fetch), 2/2 grün —
  Token nur im Header; ohne Token kein Authorization-Kopf.
- Live-Fail-closed-Beweis: anonyme Messung Kennzeichnung
  „anonym-fail-closed", Fehler http_401 — Verhalten unverändert.
- Aufruf- und Env-Doku im `--help` des Skripts.

Betroffene Suiten grün: check:llm-router 21/21, check:guidelines
(2005 Dateien), Neuer Test 2/2. Gesamt-check:all lief im Arbeitsbaum an
den FREMDEN uncommitteten Lock-Dateien der Parallel-Session in den
Start-Lock-STOPP (erwartungsgemäß, nicht durch meine Änderung; meine
Änderung ist rein additives Diagnose-Werkzeug ohne Live-Deploy).

## Was der Betreiber einmalig tut, damit die Dauermessung scharf ist

Eine Zeile in `~/.config/smejj.com/env.local` ergänzen:

    SMEJJ_FIRSTTOKEN_TOKEN=<Session-Token>

Danach misst `node scripts/testing/measure_first_token.mjs --runs 5`
den ECHTEN angemeldeten First-Token-Weg; der Wert kann in den
Wächter-Takt (Web-Vitals-Wache Nr. 63) eingebunden werden. Kein Server-
Deploy nötig; kein Credential lagert im Repo.

## Schutzregel (Abschluss)

Nichts gelöscht, nichts überschrieben, keine Locks umgangen: Start-Lock
und Security-Lock bleiben aktiv und haben die Fremdänderungen korrekt
erkannt; Favicons unberührt; kein Merge nach main; fremde uncommittete
Arbeit bleibt unangetastet im Arbeitsbaum liegen.
