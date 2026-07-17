# smejj free-only master policy

Status: locked

Diese Datei ist die zentrale Architekturregel fuer smejj.com.

## Unveraenderbare Kostenregel

- GitHub.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Cloudflare.com wird nicht genutzt (Cloudflare-Exit 2026-07-02, schriftlich angeordnet).
- Spaceship.com wird nur fuer die bereits bezahlte Domain smejj.com und kostenloses DNS genutzt; keine kostenpflichtigen Zusatzdienste.
- GitHub Pages (Free) ist das einzige Hosting fuer die statische Website/PWA-Shell.
- Keine GitHub Pro-, Team-, Enterprise-, Actions-Minuten-, Storage-, Packages-, LFS-, Codespaces- oder sonstigen kostenpflichtigen GitHub-Dienste.
- Keine Cloudflare-Dienste jeglicher Art (weder Free noch Paid).
- Salad.com nur pay-per-use hinter Budget-Gate und Laufzeit-Watchdog; kein Abo, kein Auto-Billing-Fallback.
- Oracle Cloud wird NICHT genutzt (schriftliche Nutzer-Entscheidung 2026-07-03: "Oracle rausnehmen, wir arbeiten mit Salad weiter"; die kurzzeitige Always-Free-Zulassung vom selben Tag ist damit revidiert und ein Konto wurde nie angelegt). Der Betriebsweg fuer Rechen- und Serverdienste ist Salad.com — pay-per-use vom vorhandenen Guthaben, hinter Budget-Gate/Watchdog, Auto-Recharge bleibt aus.
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

GitHub und GitHub Pages duerfen diese Daten nicht als Hauptspeicher ersetzen.

## Rollen

GitHub Free:

- Quellcode
- kleine Dokumentation
- Issues und Pull Requests
- manuelle Zusammenarbeit

GitHub Pages Free:

- statische PWA-Auslieferung (Deploy-from-Branch gh-pages, keine GitHub Actions)
- Custom Domain smejj.com

Spaceship (Domain/DNS):

- Domain-Registrierung smejj.com (bereits bezahlt)
- DNS auf GitHub Pages (A/AAAA + www-CNAME)
- keine kostenpflichtigen Zusatzdienste

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
