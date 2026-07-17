# Checksum and Restore Test

## Ziel

Jede Datei wird content-addressed ueber SHA256 behandelt. Upload, Download und Restore gelten erst als erfolgreich, wenn die Checksumme stimmt.

## Ablauf

1. Inhalt wird lokal gehasht.
2. Objekt-Key entsteht aus `objects/sha256/<prefix>/<sha256>`.
3. Upload erfolgt direkt zu IDrive e2 ueber signierte URL.
4. Download erfolgt direkt von IDrive e2 ueber signierte URL.
5. Download-Inhalt wird erneut gehasht.
6. Bei Checksum-Mismatch wird blockiert.
7. Bei korrekter Checksum wird das Manifest aktualisiert.
8. Restore schreibt nur gepruefte Objekte zurueck.

## Testabdeckung

- Kleine Datei Upload.
- Kleine Datei Download.
- Checksum korrekt.
- Checksum falsch blockiert.
- Fehlendes Manifest sauber meldbar.
- Ungueltige signierte URL blockiert.
- Abgelaufene signierte URL blockiert.
- Fehlende Config blockiert.
- Kostenrisiko blockiert.

## Sicherheitsstatus

Der Test druckt keine Secrets. Exporte und Manifeste duerfen nur Metadaten, Checksums und Objekt-Keys enthalten.
