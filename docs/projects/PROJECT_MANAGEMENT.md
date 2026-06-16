# Project Management

## Ziel

Projekte muessen lokal erstellt, geoeffnet, gespeichert, exportiert, importiert und nur nach Bestaetigung geloescht werden koennen. Keine Aktion darf Daten still ueberschreiben oder versteckte Kosten ausloesen.

## Funktionen

- Projektliste aus lokalem Workspace.
- Projekt erstellen mit `owner` oder `local-only` Rolle.
- Projekt oeffnen mit Rechtepruefung.
- Projekt speichern als neue content-addressed Objekte.
- Projekt exportieren als JSON-Bundle ohne Secrets.
- Projekt importieren als neues Projekt, nicht als stilles Ueberschreiben.
- Projekt loeschen nur mit ausdruecklicher Bestaetigung.

## Rechte

- `owner`: oeffnen, speichern, exportieren, loeschen, Rechte verwalten.
- `editor`: oeffnen, speichern, exportieren.
- `viewer`: oeffnen, exportieren.
- `local-only`: lokale Offline-Arbeit ohne Serverrechte.

## Speicher

IDrive e2 bleibt Hauptspeicher fuer zentrale Daten, Dateien, Manifeste, Checksums, RAG und Deployments. Der Browser nutzt IndexedDB und OPFS als lokalen Cache und Arbeitsbereich.

## Schutz

- Keine stillen Datenverluste.
- Keine Modellgewichte oder grossen Medien im Repo.
- Keine privaten lokalen Pfade.
- Jede Aenderung bleibt rollback-faehig ueber Manifest, Snapshot oder Export.
- GitHub und Cloudflare bleiben dauerhaft Free-only.
