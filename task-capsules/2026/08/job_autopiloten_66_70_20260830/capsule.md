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

## Live-Befunde der ersten Durchgänge
- Erste Rot-Phase der Nr. 68 war ein ECHTER Befund: ein aktiviertes Modell
  ohne Bestandsverzeichnis-Eintrag. Falls ox-alpha (aktiv seit 2026-08-30)
  im Control-Server aktiviert ist, muss der Betreiber es ins
  Bestandsverzeichnis (aiTransparency.js) eintragen — die Wache meldet das
  dann rot, bis die Einordnung steht (rechtliche Einordnung = Betreiber).
- Nr. 66 wird beim ersten Live-Lauf sagen, ob SMTP im Control-Server
  konfiguriert ist (fail-closed: unkonfiguriert = rot).

## Offene Punkte
- Keine aus diesem Auftrag. Beobachtung (kein Handeln nötig): die
  Vorfall-Historie der Nr. 29 sollte nach dem Polster deutlich ruhiger werden;
  wiederholt sich das Muster trotz Polster, ist der Container-Netzweg selbst
  krank (dann Zeabur-Diagnose, nicht die App).
