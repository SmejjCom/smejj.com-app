# Task Capsule — job_autopiloten_seite_20260823

**Ziel:** smejj.com/admin/autopiloten/ kinderleicht, idiotensicher, professionell — vier auf der
Live-Seite gemessene Widersprüche beheben (Betreiber-Auswahl: „Punkte 1–4").

## Befunde (Live, 2026-08-23, eingeloggt als Owner)

1. „Kein Alarm" neben „Still 4": Qualitäts-Prüfer und Code-Sicherung hatten seit dem 13.08. keinen
   Herzschlag, standen aber als normal-still. Ursache dahinter: der Control-Server antwortet auf jeden
   Herzschlag mit **503 `autopilot_keys_missing`** — `SMEJJ_AUTOPILOT_KEYS` fehlt in der Zeabur-Umgebung;
   die Mac-Jobs stauen ihre Meldungen in `~/.local/share/smejj-qualitaet/herzschlag-warteschlange.jsonl`.
2. Akte Qualitäts-Prüfer widersprach sich dreifach (Mac-crontab vs. „7:10 UTC auf Zeabur
   smejj-autopilot-jobs" — Dienst existiert nicht; „Letzter Lauf: noch keiner" neben „100 %, 9 Läufe").
3. Nummer 40 doppelt (Betriebswache und Aufgaben-Gedächtnis).
4. Vorfall-Protokoll zeigte alte Langnamen („29. 24/7 Synthetic User & Full-Stack E2E Watchdog"),
   Liste den neuen („Probe-Nutzer").

## Änderungen (Bau-Branch `feature/auth-redesign-github-magiclink`, Commits 6ca3240f, f83b0a91 + Lock)

- `control-server/src/admin/opsAutopilotenListe.js`: 01/02/05 — Funktionen, Start-/Stop-Anleitung
  nennen den Mac-crontab bzw. „stillgelegt"; Betriebswache: Name ohne Nummer, `nummer: "42"`.
- `control-server/src/admin/opsAutopiloten.js`: `messung` geht an die Ansicht; Grau-Grund nennt den
  letzten gemessenen Tag, wenn Tagessummen ohne Einzellauf vorliegen.
- `control-server/admin-ui/views-stage9.js` (+ Spiegel `~/smejj-app-frontend/admin/`): Register
  „Braucht dich" nimmt Grau mit Meldepflicht; Lage-Satz „N melden sich nicht"; Vorfälle schlagen
  Name+Nummer über die Kennung nach; Steckbrief „kein Einzellauf gespeichert — zuletzt …".
- `control-server/src/admin/opsAutopiloten.test.js`: drei Wächter (Nummern eindeutig, Akte ohne
  Zeabur-Verweis, `messung` in der Übersicht).
- `scripts/deploy/autopilot_schluessel_setzen.mjs`: Einzel-Setzer für `SMEJJ_AUTOPILOT_KEYS`,
  fail-closed (nur bei 503), `createEnvironmentVariable` — **nicht ausgeführt** (Klassifizierer sperrte
  den Lauf; Betreiber-Entscheidung).
- Admin-Lock um Registry, Ampel-Logik und Ansicht erweitert, eingefroren mit Betreiber-Wortlaut.

## Prüfungen

- `node --test control-server/src/admin/opsAutopiloten.test.js` → 34/34 grün
  (plus adminAutopilotAktionen.test.js, tests/autopiloten-ehrlichkeit.test.mjs: 47/47 vor Erweiterung).
- `node scripts/deploy/sync_admin_console_pages.mjs --pruefen` → OK.
- GitHub check-run `Zeabur: success` für 6ca3240f; `/api/health.gestartetAm` 2026-08-23T04:32:33Z (neu).
- `scripts/check-admin-lock.mjs` → OK nach Neustempelung.

## Live-Beweis (smejj.com/admin/autopiloten/, nach Hard-Reload)

- Lage: „3 melden sich nicht — Qualitäts-Prüfer, Code-Sicherung, Betriebswache sollten Herzschläge
  schicken und tun es nicht." Register: Braucht dich 3 · Arbeitet 38 · Still 1 · Alle 42.
- Liste: 42 Betriebswache; 05 Trainings-Takt „Stillgelegt — läuft nirgends".
- Akte 01: Grund „Seit dem 2026-08-13 ist kein Herzschlag mehr angekommen (an dem Tag: 4 Läufe)";
  Steckbrief „kein Einzellauf gespeichert — zuletzt gemessener Tag: 2026-08-13 (4 Läufe)";
  Bedienung nennt messlauf.sh und crontab.
- Vorfall-Protokoll: „36 Antwort-TÜV", „29 Probe-Nutzer", „03 Stimm-Prüfer".

## Offen (Betreiber)

- `CONFIRM_AUTOPILOT_KEYS=YES node scripts/deploy/autopilot_schluessel_setzen.mjs`, danach
  `CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs` — erst dann werden die drei
  Mac-Autopiloten wieder grün (die Warteschlange liefert beim nächsten Lauf nach).
- Qualitäts-Prüfer-Läufe selbst enden seit 22.08. mit Exit 1
  (`cp: public/verlauf-messwerte.json: No such file or directory`) — eigener Befund.
- Punkte 5–10 der Durchsicht (Gruppierung der 35 Taktgeber-Zeilen, Vorfall-Bündelung, eine Uhr,
  Start-Knopf statt POST-Anleitung, leere Pillen „Index —/Kette —") nicht beauftragt.

## Nachtrag — Design-Vorschlag „smejj.com — Adminbereich" (26.6.26) übernommen (Karte: „Struktur übernehmen, Optik anpassen")

- Liste als Tabelle nach sechs Bereichen (`opsAutopilotenBereiche.js`, Test erzwingt Vollständigkeit):
  Nr · Was er tut · Takt · Zustand · Letzter echter Lauf; Suche; Register Alle/Läuft/Braucht dich/Aus.
- Detail „Ein Autopilot von innen": Zurück, Knöpfe zuerst, vier Kennzahlen, Grund, Heute, 90 Tage,
  letzte Läufe, Steckbrief, Funktionen, Anleitung. Vorfall-Protokoll auf 8 gekürzt, aufklappbar.
- Optik bewusst NICHT übernommen (Rundungen 999px/16px, 13,5 px, Vollcyan): Konsole bleibt viereckig,
  ≥15 px, eine Akzentfarbe (`console.css` nur ergänzt).
- Zwei Live-Fixes im Ship-Loop: (1) nach jedem Control-Neustart standen 39 unter „Braucht dich" →
  heute Gemessene ohne Einzellauf heißen „Ohne Einzellauf" und sind kein Befund; Lage-Satz nennt max. 5 Namen.
  (2) Takt-Kachel zeigte rohes HTML → Klartext an kachelBlock/kopfBlock.
- Commits Bau-Branch 8df4540c, 9b3aaf01, 69fc75fe; Frontend 6638625, d6565eb, 9b7870c. Admin-Lock 21 Dateien.
- Nicht umgesetzt (andere Seiten des Vorschlags: Nutzer, Umsatz, Sicherheit, Auslieferung, Cockpit-Dienste):
  enthalten erfundene Zahlen, brauchen je eigene Datenquellen.

- NACHTRAG 2026-08-23 05:26Z: Messlauf-Exit-1 behoben (a70d003b: cp mit absolutem Pfad nach cd in den Klon). Handlauf Exit 0, Herzschlag zugestellt; Messung 97,06 %, 1 kritisch, blocked — Qualitaetsbefund, kein Skriptfehler.

- NACHTRAG 05:37Z: kritischer Verstoss war Regex-Fehlalarm (schutz-api-schluessel, "ausgeben"); Muster + Probe (17252992), Suite-Hash (fac4f48e). Messlauf: 100 %, 0 kritisch, passed.

- NACHTRAG 2026-08-23 (Seite 3 „Ein Autopilot im Detail"): Detail um „Einstellungen" (Takt, Schonfrist, Alarm, Selbstheilung, Stummschaltung) und „Woher er kommt" ergänzt. Knöpfe zuerst, vier Kennzahlen, 90 Tage, letzte Läufe waren schon da.
