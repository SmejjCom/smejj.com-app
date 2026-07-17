# Offline and Cache Policy

## Grundregel

Die PWA muss lokal nutzbar bleiben, auch wenn Netzwerk, KI oder IDrive-e2-Sync
nicht verfuegbar sind.

## Cache

Der Service Worker cached die App-Shell und die lokalen Storage-Module. Der
Cache enthaelt keine Secrets, keine Modellgewichte, keine grossen Medien und
keine privaten Nutzerdaten.

## Lokale Daten

- IndexedDB speichert Metadaten, Projektstatus und kleine Manifeste.
- OPFS speichert lokale Dateien und groessere Arbeitsdaten.
- Jede Datei bekommt eine SHA256-Checksum.
- Grosse durable Daten gehoeren spaeter nach IDrive e2, nicht nach GitHub.

## Offline-Verhalten

Wenn das Netzwerk fehlt:

- lokale Projekte bleiben oeffenbar
- lokale Dateioperationen bleiben moeglich
- Sync-Status zeigt offline/lokal
- KI bleibt disabled oder nutzt nur explizit lokale Modi
- IDrive-e2-Sync wird nicht versucht

## Fail-Closed

Wenn Manifest, Checksum, Sync-Limit, Provider oder Kostenstatus unklar ist, wird
online synchronisieren blockiert. Lokale Arbeit bleibt erhalten.

