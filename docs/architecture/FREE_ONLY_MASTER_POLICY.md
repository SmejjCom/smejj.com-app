# smejj free-only master policy

Status: locked

Diese Datei ist die zentrale Architekturregel fuer smejj.com.

## Unveraenderbare Kostenregel

- GitHub.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Cloudflare.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Keine GitHub Pro-, Team-, Enterprise-, Actions-Minuten-, Storage-, Packages-, LFS-, Codespaces- oder sonstigen kostenpflichtigen GitHub-Dienste.
- Keine Cloudflare Pro-, Business-, Enterprise-, Workers-Paid-, R2-Paid-, Images-, Stream-, Queues-, D1-Paid-, KV-Paid-, Workers-AI-Paid- oder sonstigen kostenpflichtigen Cloudflare-Dienste.
- Keine Trial-Angebote.
- Keine Auto-Billing-Fallbacks.
- Keine Funktion, die nach einem kostenlosen Limit automatisch Geld kosten kann.
- Keine kostenpflichtigen Zusatzdienste als Kernbestandteil der Architektur.

## Speicherregel

IDrive e2 / S3-kompatibler Storage ist der Hauptspeicher fuer:

- Dateien
- Medien
- Modelle
- Backups
- Deployments
- zentrale Daten
- Manifeste
- Checksums
- Such- und RAG-Artefakte

GitHub und Cloudflare duerfen diese Daten nicht als Hauptspeicher ersetzen.

## Rollen

GitHub Free:

- Quellcode
- kleine Dokumentation
- Issues und Pull Requests
- manuelle Zusammenarbeit

Cloudflare Free:

- DNS
- statische PWA-Auslieferung
- leichte Free-safe Edge-Regeln
- fail-closed Gatekeeper ohne grosse Daten- oder Compute-Last

IDrive e2:

- dauerhafter Hauptspeicher
- Artefakt- und Modell-Vault
- Backups und zentrale Objektablage

Browser/Geraet des Nutzers:

- lokale Arbeitsdaten
- lokale UI
- lokale Cache- und Offline-Funktionen
- optional kleine lokale Modelle, wenn sie ohne versteckte Kosten funktionieren

## Skalierungsregel

smejj.com wird fuer Millionen bis Milliarden Nutzer pro Tag entworfen. Trotzdem duerfen GitHub Free und Cloudflare Free nicht als Haupt-Compute, Haupt-Datenbank, Modell-Host oder Inferenz-Kern geplant werden.

Wenn eine Funktion mit dauerhaft kostenlosen GitHub-/Cloudflare-Rollen nicht sicher moeglich ist, wird sie so angepasst, dass sie:

- lokal im Browser laeuft,
- ueber IDrive-e2-Objekte arbeitet,
- fail-closed blockiert,
- oder erst nach neuer schriftlicher Architekturfreigabe separat geplant wird.

Es gibt keinen stillen Wechsel auf kostenpflichtige Dienste.

## Produktziel

smejj.com ist eine KI- und Code-Assistent-Plattform der naechsten Generation fuer Web, PWA, iPhone, Android und zukuenftige Plattformen.

Jede technische Entscheidung priorisiert:

- Geschwindigkeit
- Stabilitaet
- Sicherheit
- Skalierbarkeit
- niedrige Betriebskosten
- keine versteckten Kosten

## Pflichtpruefung

Vor relevanten Aenderungen muss mindestens laufen:

```bash
npm run check:architecture
```

Vor Release muss laufen:

```bash
npm run release:preflight
```
