# Sync and Manifest Design

## Kernentscheidung

smejj.com speichert grosse Inhalte als immutable SHA256-Objekte in IDrive e2.
Veraenderbarer Zustand wird durch kleine Manifeste beschrieben. Sync wird ueber
CRDT-Deltas und Snapshots aufgebaut, damit mehrere Geraete ohne Datenverlust
arbeiten koennen.

Der Sync-Kern darf keine GitHub- oder Cloudflare-Paid-Abhaengigkeit nutzen.
GitHub bleibt Code-Werkbank, Cloudflare bleibt Free-Gatekeeper, IDrive e2 bleibt
Hauptspeicher. Bei Kostenrisiko, fehlender Auth, fehlender Signatur oder
unklarem Limit wird fail-closed synchronisiert: lokale Arbeit bleibt erhalten,
Online-Sync stoppt sichtbar.

## Objektlayout

```text
objects/sha256/<first-two-hex>/<full-sha256>
manifests/projects/<project-id>.json
manifests/users/<user-id>.json
checksums/<scope>.sha256
indexes/<project-id>/
rag/<project-id>/
```

Alle Pfade in Manifesten sind relative Objekt- oder Repo-Pfade. Private lokale
Rechnerpfade, absolute Nutzerverzeichnisse und Secrets sind in Manifesten
verboten.

## Project Manifest

Ein Projektmanifest ist klein, versioniert und verweist auf Objekte.

```json
{
  "id": "project_123",
  "name": "smejj.com App",
  "version": 1,
  "updatedAt": "2026-06-16T00:00:00Z",
  "files": [
    {
      "path": "src/server.js",
      "sha256": "abc123",
      "size": 12345,
      "contentType": "text/javascript"
    }
  ],
  "indexes": {
    "search": "indexes/project_123/search-index.json",
    "chunks": "indexes/project_123/chunks.jsonl"
  }
}
```

## Sync-Ablauf

1. Browser schreibt Aenderung lokal in IndexedDB/OPFS.
2. CRDT erzeugt Delta.
3. Delta wird als SHA256-Objekt in IDrive e2 gespeichert.
4. Manifest verweist auf neuen Head/Snapshot.
5. Andere Geraete laden fehlende Deltas.
6. CRDT merged lokal.
7. Konflikte werden sichtbar, wenn automatischer Merge nicht reicht.

## Konfliktregel

Kein Geraet darf die Arbeit eines anderen Geraets still ueberschreiben.

Bei Konflikten:

- beide Versionen bleiben als Objekte erhalten
- Manifest markiert Konfliktstatus
- UI zeigt betroffene Dateien
- Nutzer kann mergen, behalten oder duplizieren

## Rollback-Regel

Jedes Manifest-Update muss nachvollziehbar sein:

- vorherige Manifestversion bleibt als Objekt oder Audit-Snapshot erhalten
- neue Objekte werden vor Manifestwechsel hochgeladen und per Checksum geprueft
- fehlgeschlagene Uploads veraendern keinen Head
- Restore aus altem Manifest muss getestet werden, bevor Sync als fertig gilt

## Minimaler Prototyp

Der erste Prototyp braucht nur:

- eine Beispiel-Projektdatei
- ein Project Manifest
- lokale IndexedDB/OPFS Persistenz
- Yjs oder Automerge fuer Text-Deltas
- IDrive-e2-Upload ueber presigned URLs
- Restore aus Manifest

Nicht Teil des Prototyps sind bezahlte GitHub Actions, Cloudflare Paid-Dienste,
R2, zentrale Medienarchive im Repo oder Modellgewichte im Repo.
