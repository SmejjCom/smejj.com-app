# Cost Guardrails

## Grundregel

GitHub und Cloudflare bleiben dauerhaft kostenlos. Es gibt keine stillen
Upgrades, keine Trials, keine Auto-Billing-Fallbacks und keine Kernfunktion, die
nach einem Limit automatisch Geld erzeugen kann.

Kostenrisiko fuehrt immer zu fail-closed. Es gibt keinen Paid-Fallback, keine
automatische Provider-Umschaltung auf kostenpflichtige Dienste und keine
Veroeffentlichung ohne schriftliche Freigabe.

## GitHub Free

Erlaubt:

- Quellcode
- Dokumentation
- Issues und Pull Requests
- kleine manuelle Checks
- kleine Metadaten

Nicht erlaubt:

- Modellgewichte
- Nutzerdateien
- Medienarchive
- zentrale Daten
- Produktionscompute
- grosse CI/CD-Pipelines
- Codespaces
- kostenpflichtige Packages oder Storage
- Secrets
- private absolute Rechnerpfade
- grosse Medien oder Deploy-Artefakte

## Cloudflare Free

Erlaubt:

- DNS
- SSL
- CDN/static PWA
- DDoS-Grundschutz
- kleine Routing- und Policy-Logik
- presigned IDrive-e2-URL-Erzeugung
- Fail-Closed-Gatekeeper

Nicht erlaubt:

- KI-Inferenz als Kern
- Workers Paid
- R2 Paid
- Images, Stream, Queues Paid
- D1/KV/Durable Objects als Paid-Abhaengigkeit
- zentrale grosse Datenhaltung
- grosse Live-State-Systeme
- Browser- oder Repo-Auslieferung von Secrets

## IDrive e2

IDrive e2 ist der bewusste Hauptspeicher und die zentrale Speicher-Kostenstelle:

- Dateien
- Medien
- Modelle
- Backups
- Deployments
- zentrale Daten
- RAG-Dokumente
- Suchindex-Dateien
- Manifeste
- Checksums
- statische App-Assets

IDrive e2 ist kein Rechner und keine Datenbank fuer atomare Echtzeitkoordination.

Secrets fuer IDrive e2 bleiben ausserhalb des Repos und ausserhalb des Browsers.
Browser erhalten nur kurzlebige, policy-gepruefte signierte URLs.

## Fail-Closed-Regel

Wenn ein kostenloser Dienst sein sicheres Limit erreicht, unklar ist oder nicht
verfuegbar ist, wird die betroffene Funktion blockiert.

```json
{
  "ok": false,
  "mode": "disabled",
  "reason": "free_limit_reached_or_cost_risk"
}
```

## Skalierungsrealitaet

Millionen bis Milliarden Nutzer pro Tag koennen geplant werden, aber GitHub Free
und Cloudflare Free sind keine kostenlose globale Inferenz- und Datenplattform.
Die Architektur muss deshalb Last in den Browser, in IDrive-e2-Objekte und in
explizit freigegebene KI-Compute-Pfade verschieben.

## Dokumentationsregeln

- Markdown verwendet nur relative Repo-Pfade.
- Private lokale Pfade wie Nutzerordner oder Cloud-Sync-Pfade werden entfernt.
- Beispiele duerfen keine echten Secrets, Tokens, Buckets mit Privatnamen oder personenbezogene Pfade enthalten.
- Jede Aenderung bleibt ueber Git-Diff nachvollziehbar und rollback-faehig.
- Jede Entscheidung muss Geschwindigkeit, Stabilitaet, Sicherheit, Skalierbarkeit und niedrige Betriebskosten priorisieren.
