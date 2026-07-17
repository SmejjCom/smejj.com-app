# Rollback Plan

## Ziel

Jede Version muss rollback-faehig sein, bevor sie in Produktion darf.

## Rollback-Punkte

- Git Commit der letzten funktionierenden Version.
- IDrive-e2-Deployment-Artefakt oder Backup.
- Deployment Manifest unter `idrive-layout/manifests/deployments/`.
- Release-Notiz unter `docs/release/`.
- Checksums fuer Artefakte.

## Lokale Simulation

```bash
npm run check:rollback
```

Diese Simulation prueft Metadaten, Release-Freeze, Rollback-Punkt, IDrive-e2-Speicherrolle und Free-Tier-Flags. Sie deployt nichts und veraendert Produktion nicht.

## Manueller Rollback-Ablauf

1. Incident stoppen und keine weiteren Deploys starten.
2. Letzte freigegebene Release-Notiz oeffnen.
3. Rollback-Commit und IDrive-e2-Artefakt pruefen.
4. Free-Tier-Guard ausfuehren.
5. Rollback nur nach schriftlicher Freigabe starten.
6. Vorherige Version manuell wiederherstellen.
7. Live-Health und PWA testen.
8. Rollback-Bericht schreiben.

## Nicht erlaubt

- Automatischer Rollback auf paid Dienste.
- Nutzung von GitHub/Cloudflare Paid fuer Notfall-Storage.
- Loeschen von IDrive-e2-Artefakten ohne separates Maintenance-Verfahren.
- Produktion veraendern ohne Freigabe.
