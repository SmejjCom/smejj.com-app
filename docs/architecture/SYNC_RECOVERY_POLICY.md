# Sync Recovery Policy

## Ziel

Jeder Projektstand muss aus einem bekannten Basisstand plus validen Deltas
wiederherstellbar sein.

## Regeln

- Jedes Delta hat eine SHA256-Checksum.
- Delta-Objekte sind immutable.
- Fehlende Deltas blockieren Restore sauber.
- Defekte Deltas blockieren Restore sauber.
- Aeltere Versionen koennen durch Anwendung eines Delta-Prefixes rekonstruiert werden.
- Manifeste duerfen nur auf validierte Deltas und Snapshots zeigen.

## Fail-Closed

Restore stoppt bei:

- Checksum-Mismatch
- fehlendem Delta
- unbekanntem Delta-Schema
- Konflikt waehrend Delta-Anwendung
- unklarem Kosten- oder Providerstatus

Lokale Daten bleiben erhalten. Es wird nicht automatisch auf Paid-Dienste,
GitHub-Speicher oder Cloudflare-Speicher ausgewichen.

