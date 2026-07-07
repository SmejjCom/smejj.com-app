# Free-Tier Deployment Guardrails

## GitHub

GitHub.com bleibt dauerhaft Free-only und ist nur Code-Werkbank.

Erlaubt:

- Source Code.
- Kleine Dokumentation.
- Issues und Pull Requests.
- Manuelle lokale Checks.

Nicht erlaubt:

- Pro, Team, Enterprise.
- Kostenpflichtige Actions-Minuten.
- Codespaces.
- Packages als Pflichtpfad.
- LFS, grosse Medien, Modellgewichte oder Nutzerdateien.

## Cloudflare

Cloudflare.com wird nicht genutzt.

Nicht erlaubt:

- DNS/SSL.
- Statische PWA.
- Gatekeeper.
- Worker.
- Workers Paid.
- R2 Paid.
- D1 Paid.
- KV Paid.
- Queues, Images, Stream, Workers AI, Vectorize, Hyperdrive, Workflows oder paid-risk Add-ons.
- Free- oder Paid-Cloudflare als Kernbestandteil.
- Trial-basierte Architektur.
- Auto-Billing.

Erlaubter Ersatz:

- GitHub Pages Free fuer die statische PWA.
- Spaceship DNS fuer smejj.com.
- Node-Control-Server fuer `/api/*`, wenn separat free-safe betrieben.
- IDrive e2 als dauerhaftes Object Brain.

## IDrive e2

IDrive e2 ist Hauptspeicher fuer:

- Assets.
- Artefakte.
- Backups.
- Modelle.
- Medien.
- Manifeste.
- Checksums.
- RAG- und Index-Dateien.

## Pflichtchecks

```bash
npm run check:all
npm run release:guard
npm run check:rollback
```

## Ergebnisregel

Wenn ein Schritt Paid-Risiko, fehlende Freigabe, Secret-Risiko oder unklaren Free-Tier-Status findet, endet der Prozess fail-closed.
