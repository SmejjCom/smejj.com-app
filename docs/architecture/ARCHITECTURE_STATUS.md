# Architecture Status

## Vorhanden

- `docs/architecture/STORAGE_FIRST_AI_OS.md`
- `docs/architecture/SYNC_AND_MANIFEST_DESIGN.md`
- `docs/architecture/COST_GUARDRAILS.md`
- `idrive-layout/README.md`
- `idrive-layout/manifests/providers/providers.json`
- `idrive-layout/manifests/models/registry.json`
- `idrive-layout/manifests/app/capabilities.json`
- `idrive-layout/manifests/projects/example-project.json`
- Platzhalter fuer `objects`, `checksums`, `indexes` und `rag`

## Ergaenzt

- Explizite Fail-Closed-Regeln bei Kostenrisiko.
- Verbot von Paid-Fallbacks.
- Verbot von Secrets im Browser und im Repo.
- Verbot von Modellgewichten und grossen Medien im Repo.
- Verbot privater absoluter Rechnerpfade in Dokumenten und Manifesten.
- Pflicht zu relativen Repo- und Objektpfaden in Markdown/Manifesten.
- Keine Veroeffentlichung ohne schriftliche Freigabe.
- Rollback- und Backup-Pflicht.
- Entscheidungsprioritaeten: Geschwindigkeit, Stabilitaet, Sicherheit, Skalierbarkeit und niedrige Betriebskosten.
- Neue Policy-Dokumente fuer Security, Rollback, Local-First, AI Router/BYOK, IDrive-e2-Layout und Test/Release.
- Versioniertes IDrive-e2-Layout mit Deployment-Manifest und README-Dateien fuer `objects`, `checksums`, `indexes` und `rag`.
- JSON-Schemas fuer Capabilities, Providers, Models Registry, Project Manifest und Deployment Manifest.
- Lokale Validierungsskripte fuer JSON, Manifeste, Kostenregeln, private Pfade, Paid-Risiken, Secrets, grosse Dateien und Modellgewichte.
- `package.json` Scripts `check:json`, `check:manifests`, `check:cost`, `check:paths`, `check:security` und `check:all`.

## Offen

- CRDT-Prototyp mit Yjs oder Automerge.
- Echte IDrive-e2-Presigned-URL-Implementierung.
- Server-/Worker-seitiger Free-Limit-Counter ohne Paid-Risiko.
- UI-Anzeige fuer Storage-, KI-, Kosten- und Sync-Status.
- Restore-Test aus einem alten Projektmanifest.

## Verbleibende Risiken

- Cloudflare-Free-Limits koennen fuer hohe Last nicht als unbegrenzter Backend-Kern gelten.
- GitHub Free und Cloudflare Free liefern keine kostenlose globale KI-Inferenz fuer Millionen oder Milliarden Nutzer.
- IDrive e2 speichert Daten, fuehrt aber keine KI aus und ersetzt keine transaktionale Echtzeitdatenbank.
- Sync-Konflikte bleiben ein Kernrisiko, bis CRDT-Deltas, Snapshots und Restore getestet sind.
- BYOK verschiebt Kostenkontrolle zum Nutzer und braucht klare UI-Hinweise.

## Paid-Risiko

In den geprueften Architekturdateien wurde kein geplanter GitHub- oder
Cloudflare-Paid-Kern gefunden. Die Unterlagen verbieten GitHub Pro/Team/
Enterprise, kostenpflichtige Actions, Codespaces, kostenpflichtigen GitHub
Storage, Cloudflare Pro/Business/Enterprise, Workers Paid, R2 Paid, Images,
Stream, Queues, D1/KV Paid, Trials und Auto-Billing.

## Private Pfade

In den geprueften Dateien wurden keine privaten lokalen Rechnerpfade gefunden.
Die Dokumente wurden um ein ausdrueckliches Verbot privater absoluter Pfade und
die Pflicht zu relativen Repo- und Objektpfaden ergaenzt.
