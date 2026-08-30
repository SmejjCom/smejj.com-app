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
