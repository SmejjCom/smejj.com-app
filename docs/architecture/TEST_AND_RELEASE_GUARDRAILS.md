# Test and Release Guardrails

## Ziel

Tests und Releases schuetzen Kosten, Sicherheit und Rollback-Faehigkeit.
Nichts wird live veroeffentlicht ohne schriftliche Freigabe.

## Mindestpruefungen

- JSON-Dateien validieren.
- Free-Tier-Regeln pruefen.
- Keine privaten absoluten Rechnerpfade in Markdown oder Manifesten.
- Keine Secrets im Repo.
- Keine Modellgewichte oder grossen Medien im Repo.
- Keine GitHub- oder Cloudflare-Paid-Abhaengigkeit.
- Rollback- und Backup-Pfad dokumentieren.

## Release-Stopper

Ein Release stoppt bei:

- Kostenrisiko.
- fehlender Freigabe.
- fehlendem Rollback-Pfad.
- fehlender IDrive-e2-Verfuegbarkeit fuer notwendige Artefakte.
- unklarer Secret-Lage.
- nicht validem JSON.

## Prioritaeten

Jede Aenderung wird nach Geschwindigkeit, Stabilitaet, Sicherheit,
Skalierbarkeit und niedrigen Betriebskosten bewertet.

