# smejj.com Storage-First Local-First AI OS

## Zielbild

smejj.com wird als local-first, storage-first und provider-neutrales KI- und
Code-Assistent-Betriebssystem gebaut. Die App ist keine klassische
Chatbot-Webseite und kein zentraler KI-Anbieter.

Die feste Rollenverteilung lautet:

- Browser/PWA: erste Arbeitsumgebung, lokaler Cache, lokale Werkzeuge, Offline-Faehigkeit.
- IDrive e2: dauerhafter Hauptspeicher fuer Dateien, Medien, Modelle, Backups, Deployments, RAG-Daten, Indizes und Manifeste.
- Cloudflare Free: DNS, SSL, statische Auslieferung und kleiner Fail-Closed-Gatekeeper.
- GitHub Free: Quellcode, Dokumentation, Issues und Pull Requests.
- KI-Compute: austauschbar ueber local-browser, BYOK, hard-limit Demo, disabled oder spaeter explizit freigegebene Partner-/Eigen-Compute.

## Nicht verhandelbare Kostenregel

GitHub.com und Cloudflare.com duerfen fuer dieses Projekt nur dauerhaft
kostenlos genutzt werden.

Nicht als Kern erlaubt:

- GitHub Pro, Team, Enterprise, Codespaces, kostenpflichtige Actions-Minuten, Packages, LFS-Storage oder grosse Build-Pipelines.
- Cloudflare Pro, Business, Enterprise, Workers Paid, R2 Paid, Images, Stream, Queues, D1 Paid, KV Paid, Workers AI Paid oder Add-ons.
- Trials, Testpakete, Auto-Billing und Dienste, die nach einem Limit automatisch Kosten erzeugen.
- Paid-Fallbacks von kostenlosen Modi auf kostenpflichtige Anbieter.
- Secrets, Modellgewichte, grosse Medienarchive oder private absolute Rechnerpfade im Repo.

Wenn eine Funktion mit GitHub Free oder Cloudflare Free nicht sicher dauerhaft
kostenlos moeglich ist, wird sie nicht Kernbestandteil. Sie wird deaktiviert,
lokal im Browser umgesetzt, per BYOK geloest oder spaeter separat freigegeben.

Markdown-Dokumente verwenden nur relative Repo-Pfade. Private lokale Pfade,
Secrets, Maschinenpfade und personenbezogene Speicherorte werden nicht
dokumentiert. Keine Aenderung wird live veroeffentlicht, deployed oder
produktaktiviert, bevor eine schriftliche Freigabe vorliegt.

## Systemfluss

```text
User
  |
Browser / PWA / Mobile App
  |
IndexedDB / OPFS / PGlite / DuckDB-WASM / CRDT / optional Browser-KI
  |
Cloudflare Free Gatekeeper
  |
IDrive e2 Hauptspeicher
  |
AI Router
  |
local-browser | byok | free-demo-hardlimit | disabled | later-partner-compute
```

Cloudflare verarbeitet keine grossen Dateien und fuehrt keine schwere KI aus.
Der Worker prueft Policy, Auth, Limits und erzeugt signierte IDrive-e2-URLs.
Der Browser uebertraegt grosse Daten direkt zu IDrive e2.
IDrive-e2-Secrets bleiben serverseitig und duerfen nie im Browser, im Repo, in
Logs oder in Markdown-Beispielen stehen.

## Speicherprinzip

Grosse Dateien sind immutable objects und werden per SHA256 adressiert.
Kleine Manifest-Dateien beschreiben den aktuellen Zustand.

```text
objects/
  sha256/
    ab/
      abc123...

manifests/
  app/
    capabilities.json
  models/
    registry.json
  providers/
    providers.json
  projects/
    project-id.json
  users/
    user-id.json

checksums/
indexes/
rag/
```

Jede Aenderung erzeugt neue Objekte plus ein neues Manifest. Dadurch bleiben
Daten pruefbar, versionierbar, cachebar und wiederherstellbar.
Jede Architektur- und Codeaenderung muss rollback-faehig bleiben: vorheriger
Manifeststand, vorheriger Git-Stand und vorheriges Deployment-Artefakt muessen
rekonstruierbar sein.

## Sync-Strategie

Sync ist das hoechste technische Risiko und kommt vor grossen KI-Funktionen.

Erster Zielzustand:

1. Lokaler Workspace in IndexedDB/OPFS.
2. Projektdateien als SHA256-Objekte.
3. Projektmanifest als kleine mutable Steuerdatei.
4. CRDT-Deltas mit Yjs oder Automerge.
5. Delta-Objekte und Snapshots in IDrive e2.
6. Sichtbare Konfliktzustaende statt stiller Datenverluste.

Sync-Ablauf:

```text
lokale Aenderung
  -> CRDT Delta
  -> sha256 object in IDrive e2
  -> Manifest-Update
  -> anderes Geraet laedt Delta
  -> lokaler Merge
```

## KI-Modi

Der AI Router muss immer fail-closed arbeiten.

| Modus | Rolle | Kostenstatus |
| --- | --- | --- |
| `local-browser` | kleine Modelle und lokale Werkzeuge im Browser | null zentrales Kostenrisiko |
| `byok` | Nutzer bringt eigenen OpenAI-kompatiblen API-Key mit | Nutzer besitzt Kostenbeziehung |
| `free-demo-hardlimit` | kleine Demo mit serverseitigem hartem Limit | stoppt bei Limit |
| `disabled` | keine sichere KI verfuegbar | sicherer Standard |
| `later-partner-compute` | spaeter separat freigegebene Compute | nicht automatisch aktiv |

Nicht als Standard erlaubt sind bezahlte Kimi/OpenAI APIs, Cloudflare Workers AI
Paid, GitHub/Cloudflare Paid-Dienste, Trial-APIs oder Auto-Billing.
Ein unsicherer oder unbekannter Provider-Zustand fuehrt immer zu `disabled`,
niemals zu einem Paid-Fallback.

## Kimi K2.7 Rolle

Kimi K2.7 ist Premium-Referenz, Modell-Vault und spaeteres BYOK-/Partner- oder
Self-host-Ziel. Es ist kein kostenloser Standardmotor.

IDrive e2 speichert nur Artefakte:

- Gewichte und quantisierte Varianten, sobald Transfer-Hardware vorhanden ist.
- Tokenizer, Configs, Lizenz, Notices, Inventar und Checksums.
- Registry-Metadaten.

IDrive e2 fuehrt keine Inferenz aus. Cloudflare Free und GitHub Free fuehren
keine Kimi-K2.7-Inferenz aus.

## RAG ohne klassischen Server

IDrive e2 speichert Dokumente, Chunks, Embeddings, BM25-/Suchindizes und
Manifeste. Der Browser laedt kleine relevante Shards, rankt lokal und baut den
Kontext zusammen. Nur der notwendige Kontext geht an local-browser, BYOK,
hard-limit Demo oder disabled.

Das reduziert Serverlast, haelt Daten naeher beim Nutzer und verhindert, dass
Cloudflare zum versteckten Daten- oder Compute-Kern wird.

## Hard-Limits und Fail-Closed

Limits duerfen nicht nur im Browser liegen, weil Browser-Zustand manipulierbar
ist.

Erlaubt zu pruefen:

- Cloudflare Worker Free als kleiner Gatekeeper.
- D1 Free oder Durable Objects Free nur, wenn dauerhaft kostenlos, ohne Paid-Risiko und fail-closed nutzbar.
- KV Free nur fuer Cache/Konfiguration, nicht als alleiniger atomarer Counter.

Fail-Closed-Antwort:

```json
{
  "ok": false,
  "mode": "disabled",
  "reason": "free_limit_reached_or_cost_risk"
}
```

## UI-Pflichtanzeigen

Die App muss jederzeit sichtbar machen:

- aktueller Speicher: IDrive e2
- aktueller KI-Modus
- Kostenstatus: 0-EUR-Risiko, Nutzer-Key oder blockiert
- Cloudflare Paid: aus
- GitHub Paid: aus
- lokale KI verfuegbar: ja/nein
- Sync-Status: lokal, synchronisiert oder Konflikt
- Free-Limit-Status: verfuegbar oder erreicht

## Entscheidungsprioritaeten

Jede Architekturentscheidung priorisiert in dieser Reihenfolge:

1. Geschwindigkeit.
2. Stabilitaet.
3. Sicherheit.
4. Skalierbarkeit.
5. Niedrige Betriebskosten.

Wenn ein Vorschlag diese Prioritaeten nicht erfuellt oder ein Kostenrisiko fuer
GitHub/Cloudflare erzeugt, wird er nicht als Kernbestandteil aufgenommen.

## Priorisierte Umsetzung

1. IDrive content-addressed layout.
2. Project manifest.
3. Provider manifest.
4. Local workspace cache.
5. CRDT delta sync prototype.
6. Cloudflare Free gatekeeper design.
7. Presigned IDrive e2 URLs.
8. AI mode UI.
9. WebLLM/WebGPU Test.

WebLLM kommt erst nach Manifest und Sync. Wenn Sync und Manifeste stabil sind,
steht das Betriebssystem; KI kann danach austauschbar wachsen.
