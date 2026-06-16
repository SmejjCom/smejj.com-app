# IDrive e2 Object Layout

## Rolle

IDrive e2 ist Hauptspeicher fuer Dateien, Medien, Modelle, Backups,
Deployments, Manifeste, Checksums, RAG-Daten, Indexdateien und statische
App-Assets.

## Layout

```text
objects/sha256/<first-two-hex>/<full-sha256>
manifests/app/capabilities.json
manifests/models/registry.json
manifests/providers/providers.json
manifests/projects/<project-id>.json
manifests/users/<user-id>.json
checksums/
indexes/
rag/
deployments/
backups/
model-files/
static-assets/
```

## Regeln

- Grosse Inhalte sind immutable Objekte.
- Manifeste sind kleine mutable Steuerdateien.
- Jede Objektdatei bekommt eine Checksum.
- Pfade sind relative Objektpfade.
- Private lokale Rechnerpfade sind verboten.
- Secrets sind verboten.
- GitHub enthaelt nur kleine Beispiele, keine echten Produktionsdaten.

## Upload

Der Browser fragt den Cloudflare-Free-Gatekeeper nach einer presigned URL.
Grosse Daten laufen direkt zwischen Browser und IDrive e2. Der Gatekeeper
speichert keine grossen Daten und fuehrt keine KI aus.

