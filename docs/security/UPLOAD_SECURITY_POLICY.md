# Upload Security Policy

## Grundsatz

Uploads werden lokal nur gestaged. Dauerhafte Speicherung gehoert ueber signierte URLs nach IDrive e2. Der Worker signiert nur und proxyt keine Dateien.

## Grenzen

- Maximal 8 Dateien pro Batch.
- Maximal 1 MB pro gestagter Datei.
- Dateinamen werden normalisiert.
- Unsichere Pfade, absolute Pfade und `..` sind verboten.

## Erlaubte MIME-Typen

- `application/json`
- `image/svg+xml`
- `text/css`
- `text/html`
- `text/javascript`
- `text/markdown`
- `text/plain`

## IDrive-e2-Presign

Vor einer signierten Upload-URL werden geprueft:

- IDrive-e2-Konfiguration vorhanden.
- Presign-Hard-Limit aktiv und positiv.
- Objekt-Key ist erlaubt.
- MIME-Typ ist erlaubt.
- Groesse liegt im Limit.
- Keine Cloudflare- oder GitHub-Paid-Abhaengigkeit.

## Checksums

Content-addressed Objekte werden per SHA256 adressiert. Restore blockiert bei Checksum-Mismatch.
