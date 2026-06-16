# Local Workspace Implementation

## Ziel

Der Browser ist eine aktive Arbeitsmaschine. Er kann lokale Projekte erstellen,
Dateien speichern, Checksums berechnen, Manifeste erzeugen, Snapshots bilden,
offline weiterarbeiten und spaeter ueber signierte IDrive-e2-URLs synchronisieren.

## Module

- `src/storage/localWorkspace.js`: zentrale Workspace-API.
- `src/storage/indexedDbStore.js`: IndexedDB fuer Metadaten, Manifeste und Status; Memory-Fallback fuer Tests.
- `src/storage/opfsStore.js`: OPFS fuer lokale Dateien; Memory-Fallback fuer Tests.
- `src/storage/contentAddressed.js`: SHA256-basierte immutable object keys.
- `src/storage/manifestLoader.js`: Project Manifest erstellen, laden und validieren.
- `src/storage/checksum.js`: SHA256-Helfer.
- `src/storage/fileSnapshot.js`: Snapshot und Change Detection.
- `src/storage/restoreProject.js`: Restore aus Manifest mit Checksum-Pruefung.

## Status

Umgesetzt:

- lokales Projekt erstellen
- Datei lokal speichern
- SHA256 berechnen
- immutable object metadata erzeugen
- Project Manifest aktualisieren
- geaenderte Dateien erkennen
- Snapshot erzeugen
- Restore aus Manifest
- Offline-/Sync-/Kosten-/AI-Status anzeigen

Noch nicht umgesetzt:

- echter IDrive-e2-Sync
- CRDT-Deltas
- Presigned-URL-Integration in der UI
- Konflikt-Merge-UI

## Sicherheitsregeln

- Keine IDrive-e2-Secrets im Browser.
- Keine API-Keys im Code.
- Keine privaten lokalen Pfade.
- Keine GitHub- oder Cloudflare-Paid-Abhaengigkeit.
- Bei fehlender oder unsicherer Sync-Konfiguration bleibt der Status lokal/fail-closed.

## Lokale Tests

```sh
npm run check:workspace
npm run check:all
```

