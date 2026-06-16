# Local-First Workspace

## Zweck

Der Browser ist die erste Arbeitsumgebung. Die App muss auch ohne aktive KI und
bei temporaer fehlender Verbindung nutzbar bleiben.

## Lokale Schicht

Erlaubte lokale Bausteine:

- IndexedDB fuer Metadaten und Cache.
- OPFS fuer lokale Dateien.
- PGlite fuer kleine relationale Daten.
- DuckDB-WASM fuer lokale Analyse.
- CRDT mit Yjs oder Automerge fuer Sync-Deltas.
- Service Worker fuer PWA/Offline-Faehigkeit.

## Datenfluss

Lokale Aenderungen werden zuerst lokal gespeichert. Danach werden neue Objekte
content-addressed nach IDrive e2 synchronisiert. Manifeste zeigen auf den
aktuellen Zustand.

## Grenzen

- Keine Secrets im Browser.
- Keine zentralen Nutzerdaten in GitHub oder Cloudflare.
- Keine Modellgewichte oder grossen Medien im Repo.
- Keine Online-Funktion darf lokale Arbeit blockieren, wenn sie nicht zwingend gebraucht wird.

## Konflikte

Konflikte werden sichtbar gemacht. Daten werden nicht still ueberschrieben.

