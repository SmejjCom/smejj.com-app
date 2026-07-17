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
training/quarantine/
training/sanitized/candidates/
training/consents/v1/
workers/salad/watchdogs/
datasets/smejj-1-0/
evaluations/smejj-1-0/
training-runs/smejj-1-0/
checkpoints/smejj-1-0/
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
- Operative Task Capsules sind keine Trainingsfreigabe.
- Trainingskandidaten sind vor Persistenz bereinigt und AES-256-GCM-verschluesselt.
- Trainingsobjekte sind append-only und verlangen serverseitig erzwungenes
  `If-None-Match: *`; ein Statusobjekt wird immer zuletzt angelegt.
- Consent-Ereignisse und Salad-Watchdog-Leases sind append-only. Training und
  Watchdog verwenden jeweils eigene Least-Privilege-Principals ohne Fallback
  auf allgemeine IDrive-e2-Zugangsdaten.

## Upload

Der Browser fragt den freigegebenen Control Server nach einer kurzlebigen,
policy-geprueften presigned URL. Grosse Daten laufen direkt zwischen Browser
und IDrive e2. Der Control Server speichert keine grossen Daten und fuehrt keine
KI aus.

Trainingskandidaten verwenden keinen Browser-Upload. Sie werden nur durch einen
serverseitigen Least-Privilege-Writer angelegt, der die bedingte Neuanlage
nachweisbar durchsetzt. Solange dieser Nachweis fehlt, bleibt Persistenz
fail-closed gesperrt.

Der Nachweis besteht aus erstem bedingtem PUT, zweitem PUT mit HTTP `412` und
anschließendem GET-Readback mit exakter Größe und SHA-256. Ein bloß gesendeter
`If-None-Match`-Header ist kein ausreichender Beweis.
