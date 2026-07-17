# CRDT Sync Implementation

## Entscheidung

Yjs ist die bevorzugte CRDT-Bibliothek fuer die spaetere produktive Text- und
Dokument-Synchronisation, weil sie browserfaehig, verbreitet, offline-tauglich
und fuer Delta-basierte Synchronisation geeignet ist.

Der erste Prototyp nutzt noch keine externe Runtime-Abhaengigkeit. Stattdessen
liegt eine kleine Adapter-Schicht unter `src/sync/`, die dieselben
Produktregeln erzwingt:

- lokale Aenderung erzeugt Delta
- Delta bekommt SHA256
- Delta wird als immutable object vorbereitet
- andere Geraete koennen Deltas laden und mergen
- Konflikte werden sichtbar
- defekte oder fehlende Deltas blockieren fail-closed

So bleibt der Prototyp leicht, lokal testbar und ohne Paid-Dienste. Die interne
Adapter-Implementierung kann spaeter auf Yjs umgestellt werden, ohne die
Manifest-/Delta-Regeln zu brechen.

## Module

- `src/sync/crdtAdapter.js`: Delta-Erzeugung, Canonical JSON, Hash-Validierung.
- `src/sync/deltaStore.js`: lokaler immutable Delta-Store fuer Tests und Layout.
- `src/sync/syncEngine.js`: lokale Aenderungen vorbereiten und entfernte Deltas anwenden.
- `src/sync/conflictDetector.js`: Konflikt-Erkennung.
- `src/sync/mergeStrategy.js`: Merge mit Schutz vor stillen Ueberschreibungen.
- `src/sync/syncStatus.js`: Sync-Statuswerte.
- `src/sync/restoreFromDeltas.js`: Restore aus Basisstand plus Delta-Kette.

## IDrive-e2-Ziellayout

```text
sync/projects/<project-id>/deltas/<delta-sha256>.json
sync/projects/<project-id>/snapshots/<snapshot-sha256>.json
manifests/projects/<project-id>.json
```

IDrive e2 ist nur Ziel-Speicher. Uploads erfolgen spaeter ausschliesslich ueber
presigned URLs. Keine IDrive-Secrets kommen in den Browser.

## Lokale Tests

```sh
npm run check:sync
npm run check:all
```

