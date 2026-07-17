# User Data Policy

## Grundsatz

Nutzerdaten gehoeren lokal in den Browser-Workspace und dauerhaft in IDrive e2, sobald Sync ueber signierte URLs freigegeben ist. GitHub ist nur Code-Werkbank. Cloudflare Free ist nur Gatekeeper.

## Secrets

- IDrive Secrets duerfen nie in den Browser.
- BYOK wird getrennt behandelt und nicht dauerhaft unverschluesselt gespeichert.
- API-Keys, Tokens, Passwoerter und private Pfade duerfen nicht ins Repo.
- Exporte muessen `secretsIncluded: false` ausweisen.

## Kosten- und Provider-Schutz

- GitHub Free only.
- Cloudflare Free only.
- Keine GitHub Pro, Team, Enterprise, Codespaces oder bezahlten Actions.
- Keine Cloudflare Pro, Business, Enterprise, Workers Paid, R2 Paid, Images, Stream, Queues, D1 Paid oder KV Paid.
- Keine Trials.
- Kein Auto-Billing.
- Kein Paid-Fallback.

## Loeschen und Export

Projektloeschung verlangt eine ausdrueckliche Bestaetigung. Immutable Objekte werden durch lokale Projektloeschung nicht still entfernt. Projektimporte erzeugen ein neues Projekt, damit bestehende Daten nicht ueberschrieben werden.

## Offline

Offline-Projekte bleiben lokal nutzbar. Online-Sync, IDrive-e2-Upload und Provider-Nutzung bleiben blockiert, bis Auth, Policy und signierte URLs sicher geprueft sind.
