# Cloudflare Free Gatekeeper

## Entscheidung

Cloudflare Free ist fuer smejj.com nur der Tuersteher. Cloudflare Free ist nicht
Motor, nicht Hauptspeicher, nicht KI-Compute und nicht zentrale Datenplattform.
Cloudflare Paid ist verboten.

Bei Unsicherheit wird blockiert.

## Rolle

Erlaubt im dauerhaft kostenlosen Rahmen:

- Policy-Pruefung.
- Auth-Pruefung.
- kleine Limit-/Quota-Entscheidungen, wenn sie sicher free-safe und fail-closed sind.
- Erzeugung kurzlebiger signierter IDrive-e2-URLs.
- Weiterleitung zur statischen PWA.

Nicht erlaubt:

- Cloudflare Workers Paid.
- Cloudflare R2.
- Cloudflare Workers AI.
- Cloudflare Images, Stream, Queues.
- D1/KV als Paid-Abhaengigkeit.
- grosse Datei-Proxies.
- KI-Inferenz.
- zentrale Nutzer-, Medien-, Modell- oder Backup-Speicherung.
- Auto-Fallback auf bezahlte Anbieter.

## Policy

```json
{
  "githubPaidAllowed": false,
  "cloudflarePaidAllowed": false,
  "autoPaidFallbackAllowed": false,
  "trialServicesAllowed": false,
  "cloudflareR2Allowed": false,
  "workersAIAllowed": false,
  "paidQueuesAllowed": false,
  "paidD1Allowed": false,
  "paidKVAllowed": false,
  "failClosed": true
}
```

## Presigned-IDrive-e2-Design

```text
Browser
  -> Cloudflare Free Gatekeeper
  -> Policy/Auth/Limit Check
  -> Presigned IDrive e2 URL
  -> Browser direkt zu IDrive e2
```

Der Worker speichert keine grossen Dateien und verarbeitet keine KI. IDrive-e2
Secrets bleiben serverseitig. Der Browser erhaelt nur kurzlebige signierte URLs.

## Fail-Closed-Faelle

- fehlende ENV-Konfiguration: blockieren
- unbekannter Provider: blockieren
- Paid-Provider oder Trial-Risiko: blockieren
- Free-Limit unklar: blockieren
- fehlende schriftliche Freigabe: nicht live schalten

## Lokales Skelett

Das lokale Design liegt in `cloudflare-worker/`:

- `index.js`
- `policy.js`
- `presignIdrive.js`
- `quota.js`
- `README.md`

Dieses Skelett wird nicht deployed. Es dient als lokal testbare Vorlage fuer
spaetere Integration, sobald Auth, Quotas und Presign-URLs fertig freigegeben
sind.

## Lokale Tests

Lokale Pruefung ohne Deployment, ohne GitHub Actions und ohne Cloudflare Paid:

```sh
npm run check:gatekeeper
npm run check:all
npm run release:guard
```

Zuletzt lokal geprueft am 2026-06-16:

- Gatekeeper-Tests: bestanden
- Gesamtcheck: bestanden
- Free-Tier-Release-Guard: bestanden
- Live-Deployment: nicht ausgefuehrt
