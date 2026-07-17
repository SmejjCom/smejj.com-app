# IDrive e2 Connection Test

## Ziel

Der Test prueft IDrive e2 als echten Hauptspeicher ueber kurzlebige signierte S3-kompatible URLs. Der Browser bekommt keine IDrive Secrets. Der Gatekeeper signiert nur und proxyt keine Dateien.

## Ablauf

1. Browser oder lokaler Test fordert Upload-Erlaubnis beim Gatekeeper an.
2. Gatekeeper prueft Free-Policy, Kostenrisiko, Quota und IDrive-e2-Konfiguration.
3. Gatekeeper erzeugt eine kurzlebige signierte URL.
4. Client laedt die kleine Testdatei direkt zu IDrive e2 hoch.
5. Client fordert eine Download-URL an.
6. Client laedt direkt von IDrive e2 herunter.
7. SHA256 wird gegen das content-addressed Objekt geprueft.
8. Projektmanifest wird lokal aktualisiert.
9. Restore aus Manifest wird lokal getestet.

## Lokaler Befehl

```bash
npm run idrive:connection-test
```

Ohne lokale IDrive-e2-ENV-Werte endet der Befehl bewusst mit `missing_idrive_e2_env_fail_closed`.

Ein echter Test darf nur lokal mit gesetzten ENV-Werten und ausdruecklicher Bestaetigung laufen:

```bash
CONFIRM_IDRIVE_CONNECTION_TEST=YES npm run idrive:connection-test
```

## Ergebnis dieser Pruefung

Am 2026-06-16 wurde der echte kleine Presigned-URL-Test mit lokaler `.env.local`
und `CONFIRM_IDRIVE_CONNECTION_TEST=YES` ausgefuehrt:

- Upload: bestanden.
- Download: bestanden.
- Checksum: bestanden.
- Restore: bestanden.
- Worker-Proxy: nein.
- Secrets im Browser: nein.
- Secret-Werte ausgegeben: nein.

Zusaetzlich wurde der fehlende-ENV-Pfad geprueft und blockiert fail-closed.

## Verbote

- Keine IDrive Secrets im Browser.
- Keine Secrets im Repo.
- Keine grossen Dateien durch Worker proxyen.
- Keine Cloudflare-Paid-Funktion.
- Keine GitHub-Paid-Funktion.
- Kein Live-Deploy.
- IDrive e2 ist Speicher, kein KI-Rechner.
