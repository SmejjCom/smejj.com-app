# Rollback and Backup Policy

## Ziel

Jede Aenderung muss nachvollziehbar, pruefbar und rollback-faehig sein. Keine
Veroeffentlichung erfolgt ohne schriftliche Freigabe.

## Rollback-Bausteine

- Git-Stand fuer Quellcode und Dokumentation.
- IDrive-e2-Deployment-Artefakt fuer veroeffentlichte Builds.
- Manifestversion fuer Daten- und Projektzustand.
- Checksums fuer Objekte, Indizes und Backups.
- Cloudflare-Deployment-Version nur im dauerhaft kostenlosen Free-Rahmen.

## Release-Regel

Vor jedem Release:

1. JSON validieren.
2. Free-Tier-Guard ausfuehren.
3. IDrive-e2-Status pruefen.
4. Deployment-Artefakt in IDrive e2 vorbereiten.
5. Schriftliche Freigabe einholen.

Ohne Freigabe wird nichts live veroeffentlicht.

## Backup-Regel

Backups liegen in IDrive e2 oder einem explizit freigegebenen S3-kompatiblen
Speicher. GitHub und Cloudflare werden nicht als Backup-Hauptspeicher genutzt.

## Fail-Closed

Wenn Backup, Checksum, Manifest oder Kostenstatus unklar ist, wird nicht
veroeffentlicht.

