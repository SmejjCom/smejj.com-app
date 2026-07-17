# Security Review Report

Date: 2026-06-16

## Geprueft

- Secrets und ENV-Dateien.
- Browser-Code.
- Worker-Code.
- Manifeste.
- Upload-Flows.
- BYOK-Flows.
- AI Router.
- IDrive-e2-Signaturfluss.
- Local Storage, IndexedDB und OPFS-Konzept.
- Service Worker.
- CSP und CORS/Origin-Regeln.

## Gefundene Risiken

- Browser-Upload-Staging hatte noch keine harte Typ-, Batch- und Groessenpruefung.
- BYOK erlaubte technisch beliebige `http(s)`-Endpoints.
- Presigned-IDrive-e2-Flow hatte keine harte Presign-Rate-Limit-Pflicht.
- Service Worker konnte fuer API-GETs theoretisch einen Shell-Fallback liefern.
- Server-/Worker-AI-Pfad war nicht zusaetzlich hinter expliziter Server-AI-Freigabe plus Hard-Limit.

## Behoben

- Upload-Typen, Dateigroesse und Batch-Anzahl werden begrenzt.
- Dateinamen werden normalisiert.
- BYOK-Endpunkte werden allowlisted und muessen HTTPS nutzen, ausser localhost.
- Presign erfordert `PRESIGN_HARD_LIMIT_ALLOWED=true` und positives `PRESIGN_REMAINING`.
- Presign prueft Objekt-Key, MIME und Groesse vor URL-Ausgabe.
- Worker proxyt keine Dateien.
- Service Worker cached keine API-Fallbacks.
- Schreibende Requests pruefen Origin und blockieren fremde Origins.
- Server-AI bleibt disabled, solange keine explizite Freigabe und kein klares Limit vorhanden sind.

## Bestandene Tests

- Falscher Provider blockiert.
- Fehlender BYOK-Key blockiert.
- Unbekannter BYOK-Endpoint blockiert.
- Falscher MIME blockiert.
- Zu grosse Datei blockiert.
- Zu viele Uploads blockiert.
- Kaputte Checksum blockiert.
- Fehlende Config blockiert.
- Rate-Limit erreicht blockiert.
- Paid-Fallback blockiert.
- Service Worker API-Cache-Fallback blockiert.

## Offen

- Persistente, global atomare Rate-Limits brauchen spaeter eine ausdruecklich Free-safe freigegebene Gatekeeper-Loesung.
- Echte Abuse-Erkennung ueber viele Nutzer/Geraete ist vorbereitet, aber nicht als zentraler Paid-Dienst eingebaut.
- Vollstaendige Auth-gebundene IDrive-e2-Upload-Rechte muessen vor Produktion weiter ausgebaut werden.
