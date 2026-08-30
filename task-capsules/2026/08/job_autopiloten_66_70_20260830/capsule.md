# Task Capsule — job_autopiloten_66_70_20260830

## Ziel
Die A-bis-Z-Deckungsprüfung vom 2026-08-30 (Live-Blick auf
smejj.com/admin/autopiloten/) zeigte 64 laufende Autopiloten — aber fünf
App-Flächen ohne jeden Wächter: E-Mail-Zustellung, DSGVO-Fristen, EU-AI-Act,
Abos & Umsatz, Feature-Flags. Dazu zwei offene Befunde: Nr. 65
(Trainings-Reife-Wache) war gebaut aber nicht deployt, und der Probe-Nutzer
(Nr. 29) rotierte mit 50 Vorfall-Phasen aus Verbindungsfehlern.
Freigabe des Betreibers 2026-08-30: „Ich finde deinen Vorschlag gut. Kannst Du
umsetzen. Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig.
Lass nicht offen."

## Ergebnis
- Registry führt **70 Autopiloten** (Nr. 66–70 neu); alle fünf messen echte
  Ablagen im 30-Minuten-Takt des Taktgebers, jeder mit Selbsttest aus kaputter
  UND gesunder Probe.
- **Nr. 65 deployt** (Merge aus feature/trainings-reife-wache).
- Probe-Nutzer bekommt das **Netz-Polster**: genau EIN Wiederholungsversuch
  bei Verbindungsfehlern („fetch failed"), nie bei HTTP-Antworten, nie bei
  Zeitlimits — das Hausrezept vom Mailer-Befund 2026-08-13.

## Die fünf neuen Wächter
| Nr. | Kennung | Misst (echt) | Rot bei |
| --- | --- | --- | --- |
| 66 | email-zustell | Zustellprotokoll mail/zustellung 7 Tage | SMTP unkonfiguriert; 3 Fehlversuche in Serie; Quote ≥ 20 % ab 5 Mails |
| 67 | dsgvo-fristen | Vorgangs-Ablage admin/gdpr, Restfrist frisch gerechnet | ≥ 1 Vorgang über der Frist; kritisch (≤ 5 T.) = Karte in der Tagesmappe |
| 68 | ai-act-wache | Bestandsverzeichnis gegen AKTIVE Registry-Modelle | Pflichtsystem ohne Protokoll; aktives Modell ohne Eintrag (Drift); high/prohibited im Bestand |
| 69 | abo-umsatz-wache | Abo-Spiegel billing/customers + Trend-Karte | past_due/unpaid; Zahlende stürzen > 20 % (ab 5); Listing abgeschnitten |
| 70 | flaggen-wache | Flag-Ablage admin/flags, updatedAt-Alter | ungültige Zustände; vergessen (on/partial > 30 T.) = Karte in der Tagesmappe |

Grenzen (bewusst): Nr. 66 verschickt keine Probe-Mails; Nr. 68 stuft nichts
selbst ein; Nr. 69 schreibt nichts nach Stripe; Nr. 70 bestraft Absicht nicht.

## Änderungen
- 5 Module `control-server/src/autopilots/{emailZustell,dsgvoFristen,aiAct,aboUmsatz,flaggen}Autopilot.js`
  + Sammel-Läufe `deckungsLaeufe.js` (800-Zeilen-Regel: Läufer 799 Zeilen).
- Registry-Teil 5 `opsAutopilotenListeDeckung.js`; Bereichs-Zuordnung
  (67+68 → Sicherheit & Wachdienst, 66/69/70 → Betrieb & Auslieferung);
  Läufer-Einbindung (IM_LAEUFER_BETRIEBEN + laufeAlle).
- Tagesmappe: Karten-Sektionen 8 (DSGVO) + 9 (Flags), Selbsttest 10/10.
- `nutzerreiseWaechter.js`: holeMitPolster() für alle vier Fetch-Stellen.
- admin-lock neu eingefroren (49 Dateien, Freigabe-Wortlaut im Manifest,
  Backup backups/admin-lock/2026-08-30T09-50-22-853Z/).
- Rollback-Punkt: Tag `rollback-punkt-20260830-ap` + Branch
  `rollback/autopilot-ausbau-20260830` auf 40d3b616 (Vorher-Stand des
  Deploy-Branches).

## Tests / Verifikation
- Neu: `tests/deckungs-waechter.test.mjs` (9 Tests: jede Prüfung kaputt +
  gesund, drei Anschluss-Beweise Registry/Taktgeber/Bereiche).
- Angepasst: Läufer-Zählung 53→58 / 54→59 / 56→61; MIT_ECHTER_MESSUNG +5;
  Wachstum-Tagesmappe-Gesundwelt um die zwei neuen Ablagen erweitert;
  4 Polster-Tests im Watchdog-TÜV (10/10).
- `npm run check:all` EXIT 0 + `npm run check:guidelines` OK (2009 Dateien,
  Läufer nach Auslagerung 799 Zeilen).

## Live-Befunde des ersten Durchgangs (30.08., nach dem Deploy)
Kopfzeile der Seite: **Alle 70 · Läuft 68 · Braucht dich 2 · Aus 0** — alle
sechs neuen/deployten Wächter maßen beim ersten Lauf ECHTE Werte:
- Nr. 66 E-Mail: GRÜN — „84 von 84 Mails zugestellt" (7-Tage-Fenster); SMTP
  konfiguriert, Magic-Link-Kette gesund.
- Nr. 67 DSGVO: ROT — ECHTER Befund: 1 Vorgang über der Frist
  (dsgvo_5EuyuQark7kl, Auskunft Art. 15, fällig 19.08., −11 Tage). Es ist der
  TESTeintrag der Modul-Abnahme (pruefung@example.de / pruefer@example.de vom
  28.07.). Empfehlung an den Betreiber: als Testeintrag abschließen —
  BEWUSST als Ein-Klick-Entscheidung liegengeblieben (Betreiber-Wunsch:
  wichtige Entscheidungen per einem Klick selbst zustimmen).
- Nr. 68 AI-Act: ROT (echt) — „aktives Modell ohne Bestandsverzeichnis-Eintrag:
  ox-alpha". GESCHLOSSEN im Folgebau 5ce94deb: ox-alpha in aiTransparency.js
  + Bestandsverzeichnis-Doku eingetragen (begrenztes Risiko Art. 50, wie die
  Schwester-Chat-Modelle); Historie mit Drift-Befund als Grund.
- Nr. 69 Abos: GRÜN — „1 zahlendes Abo von 1; Trend: vorher 1; Trend-Karte
  abgelegt".
- Nr. 70 Flags: GRÜN — „1 Flag länger als 30 Tage unverändert (probe-flag):
  Entscheidung in der Tagesmappe" (Karte liegt).
- Nr. 65 Trainings-Reife: GRÜN — „Reife Stufe 1/3 (1 von 5000); Capture aus
  (fail-closed, gewollt — Policy)".
- Non-Regression: smejj.com, api, chat-bridge, maus-engine, control je HTTP
  200; training-loop antwortet (404 auf /health = Route nicht belegt, Server lebt).

## Nachtrag Autonomie-Runde 30.08. (Betreiber: "eigenständig weiterarbeiten")

**DSGVO-Abschluss versucht:** POST auf /api/admin/gdpr/…/status wurde mit
HTTP 403 `admin_step_up_required` abgewiesen — der Vier-Augen-Schutz verlangt
einen Code aus dem Betreiber-Postfach. Bewusst NICHT umgangen (admin-lock).
Der Klick bleibt beim Betreiber: Tagesmappe → Vorgang abschließen, ODER
Step-up-Code an die Session geben.

**Bündel-Drift v713/v712 (Nr. 29) — gestoppt nach Ship-Loop-Regel 10:**
Vier Pipeline-Runden zeigten: smejj.com läuft v713 (Mobil-Iconfix, Frontend-
Repo main c7db2a2), der Control-Server-Zweig braucht dafür den VOLLSTÄNDIGEN
Bündel-Abgleich (Kaskade: 18 CSS-Quellen → Bündel → Bundel-Skript mit
entschlacke → Test → Ratchet-Baselines in check-guidelines.mjs → Benchmark-
Manifest mit gepinnten Digests → package.json-Script-Pins); insgesamt 574
Nicht-Docs-Dateien divergieren BEIDSEITIG. Die v713-Session hat genau das in
d23a97b4 als "15 divergierte Dateien als eigene Schritte" dokumentiert — der
Abgleich gehört in jene Freigabe, nicht in diesen Autopiloten-Auftrag.
Spiegelversuch vollständig zurückgerollt (Arbeitsbaum = 55367626, 26/26
Tests, start-lock + guidelines grün, kein Deploy nötig — Live lief schon).
Nr. 29 bleibt ROT und LÜGT NICHT: der Drift ist real, bis der Abgleich
durchgeführt ist. Empfehlung: Bündel-Abgleich als eigener Auftrag mit
Betreiber-Freigabe (oder die v713-Session führt ihre geplanten Schritte aus).

**Messpflicht erfüllt (Spot-Check 30.08.):** smejj.com TTFB 0,20–0,37 s
(3 Messungen, HTTP 200), Startseite 74 KB unkompimiert (Budget 300 KB
komprimiert), api/health HTTP 200. Tagesgenaue Budget-Messung macht Nr. 63.

## Offene Punkte
- EIN Betreiber-Klick: DSGVO-Testvorgang abschließen (Step-up-Schutz griff;
  Karte liegt in der Tagesmappe) — danach ist Nr. 67 dauerhaft grün.
- Bündel-Abgleich v713 → Control-Server-Zweig: eigener Auftrag (siehe oben),
  bis dahin bleibt Nr. 29 korrekt rot.
- Beobachtung (kein Handeln): die Vorfall-Historie der Nr. 29 sollte nach dem
  Polster deutlich ruhiger werden; wiederholt sich das Muster trotz Polster,
  ist der Container-Netzweg selbst krank (dann Zeabur-Diagnose, nicht die App).

## Nachcheck-Runde 30.08. 11:04 (Betreiber: "checke noch mal")
- Oberfläche zeigte 69 grün / 1 rot — aber das Nr. 29-Grün war eine
  MASKIERUNG: Der schmale 3-Schritt-Kernlauf (30-Min-Takt, laufSyntheticWatchdog)
  ueberschrieb rot gemeldete Nutzerreise-Befunde wieder grün ( gemeinsame
  Kennung, unterschiedlicher Blick). Befund per Zeitstempel bewiesen
  (10:40:54 "Echter Nutzer-Durchlauf 3/3" statt "Nutzerreise 7/7").
- **Gefixt und live (6bd8bce2, Control-Neubau 11:01:43)**: Der 30-Min-Eintrag
  misst jetzt dieselbe SIEBEN-Schritt-Nutzerreise; Laeufer-Konvention {ok,
  meldung} (ein status-Feld ohne ok wurde zu grüner Ampel trotz roter
  Meldung — im Test bewiesen und korrigiert). Suiten 35/35, check:all EXIT 0.
- Live bewiesen 11:04:45: Nr. 29 ROT "buendel_gleichheit: smejj.com traegt
  v714, api.smejj.com v712" — bleibt rot (kein Maskieren mehr). Die Parallel-
  Session liefert unterdessen v714; der Bündel-Abgleich bleibt der eigene
  Auftrag. Endstand dieser Runde: 70 Autopiloten, 68 grün, 2 rot (Nr. 29
  echter Drift, Nr. 67 Betreiber-Klick).

## Autonomie-Runde 3 (Betreiber: "Vorschläge umsetzen, alle Rechte") — Bündel-Abgleich gestoppt, Rest diszipliniert abgeschlossen

**Bündel-Abgleich v714 (eigener Auftrag, bewiesen begonnen):** Beweis
design-v11 HEAD 29fd706d sw.js == live smejj.com sw.js (SHA-256 2da4f2eb…).
Vollspiegel public/** + Kette durchgeführt — die Pipeline deckte in 8 Runden
die GESAMTE Abhängigkeitskette auf: public (253) → scripts (51, inkl.
build:assets, check-memory-bank) → evals/schemas → Memory_Bank-Verweise (19)
→ favicon-manifest (12 neue Seiten, KEINE geschützten Einträge geändert —
Kartenerweiterung) → tests (~100+, bis auf meine 6 Autopilot-/Polster-Tests)
→ control-server/src/routes — und DORT bricht der Abtrag ab: design-v11
LÖSCHT fehlerRoutes.js (Endpunkt POST /api/fehler des Fehler-Fängers Nr. 50,
live verifiziert) sowie bildExtern/videoChat-Routes und benennt
mausPlannerClient um. Ohne Beweis eines funktionsgleichen Ersatzes wäre die
Übernahme ein Change-Lock-Bruch. Nach Ship-Loop-Regel 10 gestoppt, auf
981647b6 zurückgerollt, voll zertifiziert (check:all EXIT 0, alle Locks grün,
63/63 betroffene Suiten). **Der Abgleich ist eine Rebase-Klasse-Eigenaufgabe
mit Sicherung des Fehler-Fänger-Endpunkts — diese Karte ist die Baustelle.**

**Tagesmappe-Ein-Klick-Tieflinks:** 3-Zeilen-Patch fertig (views-stage13.js
ENTSCHEIDUNGS_ZIEL ergänzen um trainings-reife→/admin/modelle/,
dsgvo-frist→/admin/dsgvo/, flaggen→/admin/flags/) — zurückgenommen, weil das
Ausliefern über den Frontend-Pages-Spiegel läuft (sync_admin_console_pages
verlangt den Frontend-Klon; gefundener Ordner ist nur die Sicherung vom
10.08.). PATCH LIEGT FERTIG HIER — im nächsten Frontend-Zyklus 3 Zeilen in
ENTSCHEIDUNGS_ZIEL ergänzen, dann Admin-Konsole spiegeln + deployen.

**DSGVO:** Step-up-Code um 11:47 angefordert (HTTP 200, 'Code an die
Admin-Adresse geschickt', 600 s gültig) — Abschluss bereit, sobald der
Betreiber den Code durchgibt oder in der Tagesmappe selbst klickt.

**Zwischenfall ohne Folgen:** Ein transienter Google-Drive-cd-Fehler lenkte
zwei Aufrufe; alle Schreibzugriffe blieben nachweislich im Worktree
(Hauptbaum unverändert, versehentliche Freeze-Artefakte zurückgenommen).
Lehre: bei cd-Fehler NICHT blind weiterlaufen lassen.
