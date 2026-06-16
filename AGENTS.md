# smejj.com App Agent Rules

## Hohe Prioritaet

- `docs/architecture/FREE_ONLY_MASTER_POLICY.md` ist verbindlich.
- GitHub.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Cloudflare.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Keine GitHub Pro-, Team-, Enterprise-, Actions-Minuten-, Storage-, Packages-, LFS-, Codespaces- oder sonstigen kostenpflichtigen GitHub-Dienste.
- Keine Cloudflare Pro-, Business-, Enterprise-, Workers-Paid-, R2-Paid-, Images-, Stream-, Queues-, D1-Paid-, KV-Paid-, Workers-AI-Paid- oder sonstigen kostenpflichtigen Cloudflare-Dienste.
- Keine Trials, keine Auto-Billing-Fallbacks, keine spaeter automatisch kostenpflichtigen Dienste.
- IDrive e2 / S3-kompatibler Storage ist Hauptspeicher fuer Dateien, Medien, Modelle, Backups, Deployments und zentrale Daten.

## Design-Lock

- `docs/frontend/START_DESIGN_LOCK.md` ist verbindlich.
- Startseite und unteres Eingabefeld duerfen nicht ohne schriftliche Bestaetigung des Nutzers veraendert werden.

## Pflichtpruefungen

- Nach Architektur-/Kosten-Aenderungen: `npm run check:architecture`.
- Nach Frontend-Aenderungen: `npm run check:frontend`.
- Vor Release: `npm run release:preflight`.
