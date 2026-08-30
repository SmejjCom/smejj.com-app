# Backup smejj.com — Einstieg

Hauptspeicher aller Backups: **IDrive e2** (S3-kompatibel), Eimer
`smejj-sicherung` (serverseitige Replikation) sowie `sicherung/`-Präfix im
Eimer `smejj-model-files` (tägliche Betriebs-Schnappschüsse). Kein Dienst-
Schlüssel kommt an `smejj-sicherung` heran (gewollte Isolation) — Kontrolle
nur über die IDrive-Konsole.

| Dokument | Inhalt |
| --- | --- |
| `../architecture/ROLLBACK_AND_BACKUP_POLICY.md` | Verbindliche Backup- und Rollback-Regeln |
| `../storage/CHECKSUM_AND_RESTORE_TEST.md` | Nachweis: Checksummen + Wiederherstellungs-Test |
| `../architecture/IDRIVE_E2_OBJECT_LAYOUT.md` | Objekt-Layout der drei Eimer (app/model-files/sicherung) |
| `../deployment/ROLLBACK_PLAN.md` | Schritt-für-Schritt-Rollback im Deploy-Fall |
| `../deployment/ROLLBACK_BASIS_2026-07-17.md` | Konkreter gesicherter Rollback-Punkt |

Git-seitig: GitHub (primär) + Codeberg (Spiegel, fünf private Repos,
Auffrischung per `scripts/deploy/codeberg_spiegel_sync.sh`).

Regeln: Nichts löschen oder überschreiben ohne schriftliche Freigabe;
vor jeder Änderung Rollback-Punkt sichern (AGENTS.md Change-Lock).

## Live-Beweis der Backup-Kette (2026-08-30, IDrive-Konsole + S3-API)

| Kettenglied | Beweis |
| --- | --- |
| Konsole | eingeloggt; 7 Eimer, 759,32 GB, 7.210 Objekte, Regionen Frankfurt-2 + Los Angeles |
| Replikations-Job 2430_1 („Chats Sicherung smejj app in zweiten Eimer") | Status **Running**, 1.631 Objekte / 11,81 MB nach `smejj-sicherung`, zuletzt aktualisiert 27.08. |
| Tägliche Schnappschüsse | `sicherung/taeglich/sicherung_2026-08-30.json` (heute) + Vortag in `smejj-model-files` per S3-API gelistet |
| Eimer-Isolation | `smejj-app` und `smejj-sicherung` mit Laptop-Schlüssel HTTP 403 (gewollt; Details in `../storage/IDRIVE_E2_CONNECTION_TEST.md`) |

Eimer-Bestand (Konsole): `smejj-app`, `smejj-model-files`, `smejj-sicherung`
(Kern) sowie `imild-media`, `smyst-memories` und zwei Staging-Eimer vom
11.07. (`smejj-rc9-*`).
