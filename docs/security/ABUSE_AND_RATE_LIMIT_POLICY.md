# Abuse and Rate Limit Policy

## Grundsatz

Bei unklaren Limits blockiert smejj.com fail-closed. Browser-only Counter reichen nicht als Kostenschutz.

## Geschuetzte Aktionen

- AI-Anfragen.
- Free-Demo-Anfragen.
- IDrive-e2-Presign-URLs.
- Upload-Staging.
- Datei-/Projektaktionen.

## Regeln

- Unbekannte Provider werden blockiert.
- Paid-, Trial- und Auto-Billing-Marker werden blockiert.
- Presign-URLs brauchen ein klares Hard-Limit.
- AI-Servermodus braucht explizite Freigabe plus positives Restlimit.
- Zu viele Uploads werden blockiert.
- Zu grosse Uploads werden blockiert.
- Fehlende Auth oder falscher Origin blockiert schreibende Requests.

## Aktueller Stand

Das lokale Skelett prueft Limits als harte ENV-/Policy-Werte und blockiert bei Unsicherheit. Es baut keinen paid-risk zentralen Counter ein.

## Spaeter

Wenn ein globales Quota-System noetig wird, muss es vorab als dauerhaft Free-safe geprueft werden. Keine Cloudflare-Paid- oder GitHub-Paid-Abhaengigkeit darf als Kernbestandteil entstehen.
