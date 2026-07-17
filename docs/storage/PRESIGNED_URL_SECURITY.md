# Presigned URL Security

## Grundregeln

Presigned URLs sind kurzlebige Erlaubnisscheine fuer einzelne Objekte. Sie ersetzen keine Auth-Policy und duerfen keine Secrets offenlegen.

## Gatekeeper

- Prueft Policy fail-closed.
- Prueft Kostenrisiko.
- Prueft IDrive-e2-Konfiguration.
- Signiert nur `PUT` fuer Upload und `GET` fuer Download.
- Gibt `proxiedByWorker: false` zurueck.
- Speichert keine Dateien.
- Fuehrt keine KI-Inferenz aus.

## Client

- Erhaelt nie `IDRIVE_E2_ACCESS_KEY` oder `IDRIVE_E2_SECRET_KEY`.
- Nutzt die URL nur fuer das erlaubte Objekt.
- Prueft Methode, Ablaufzeit und Signaturparameter.
- Bricht bei ungueltiger oder abgelaufener URL ab.

## Blockierte Faelle

- Fehlende Config.
- Ungueltiger Objekt-Key.
- Unsichere lokale/private Pfade.
- Ungueltige signierte URL.
- Abgelaufene signierte URL.
- Kostenrisiko, Trial, Paid- oder Auto-Billing-Hinweis.
- Worker-Proxy fuer grosse Dateien.
