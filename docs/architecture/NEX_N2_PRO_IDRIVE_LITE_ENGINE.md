# Nex N2 Pro IDrive Lite Engine

## Ziel

Nex N2 Pro ist das Zielmodell fuer die guenstige smejj Coding-App.
IDrive e2 uebernimmt Speicher, Gedaechtnis, Job-Ablage und Modell-Vault.
Der Contabo VPS mit 8 GB RAM bleibt ein kleiner Controller und rechnet nur
kurze, gezielte Aufgaben.

## Rollen

```text
Cloudflare Free
  -> Auth, Policy, Presigned URLs, Fail-Closed
Contabo 8 GB RAM / 60 GB SSD
  -> Job-Controller, kleiner Cache, llama.cpp, kurze CPU-Inferenz
IDrive e2
  -> Modelle, Projekte, Index, RAG, Memory, Jobs, Logs, Ergebnisse, Backups
```

## Nex N2 Pro Regel

- Nex N2 Pro wird zuerst nach IDrive e2 importiert, nicht in GitHub und nicht
  dauerhaft auf Contabo.
- Contabo darf nur eine gepruefte kleine GGUF-Quantisierung kurz lokal cachen.
- Vor jedem Start muessen Manifest, Groesse und Checksum passen.
- Wenn keine 8-GB-taugliche Quantisierung verfuegbar ist, bleibt Inferenz
  `disabled` und der Job wird sauber in IDrive e2 abgelegt.
- Cloudflare Free und GitHub Free fuehren keine Modell-Inferenz aus.

## IDrive e2 uebernimmt

```text
model-files/nex-n2-pro/
  inventory/
  checksums/
  gguf/
  tokenizer/
  config/
  license/
  notices/

manifests/jobs/
  open.json
  running.json
  done.json
  failed.json

manifests/memory/
  code-patterns.json
  known-fixes.json
  qa-history.json

indexes/
  <project-id>/search-index.json
  <project-id>/chunks.jsonl
  <project-id>/symbols.json

rag/
  <project-id>/summaries/
  <project-id>/embeddings/

logs/
  app/
  model/
  jobs/

results/
  <job-id>/
```

## Minimaler Ablauf

1. Browser laedt grosse Dateien direkt per presigned URL nach IDrive e2.
2. Contabo erzeugt nur Job-ID und Statusdatei.
3. Contabo liest Projektmanifest, Code-Index und alte Loesungen aus IDrive e2.
4. Contabo holt nur relevante Code-Ausschnitte.
5. Contabo startet llama.cpp nur bei kleinem, geprueftem Modell-Cache.
6. Ergebnis, Logs und Patch-Artefakte gehen zurueck nach IDrive e2.
7. Lokaler Cache wird nach TTL oder Job-Ende geloescht.

## Fail-Closed

Ein Job darf nicht starten, wenn:

- Modell-Groesse nicht zum 8-GB-Server passt.
- Checksum fehlt oder nicht stimmt.
- Modell nur ueber Paid-/Trial-/Auto-Billing-Weg verfuegbar ist.
- Cloudflare oder GitHub Paid-Funktionen noetig waeren.
- IDrive e2 Manifest oder Ergebnis-Pfad fehlt.

Dann wird der Job als `failed` oder `blocked` in IDrive e2 gespeichert.

## Kleinster naechster Umsetzungsschritt

1. `nex-n2-pro` in `manifests/models/registry.json` fuehren.
2. Job-Manifeste fuer `open`, `running`, `done`, `failed` anlegen.
3. Model-Import-Skript auf Nex-N2-Pro GGUF erweitern.
4. Danach erst llama.cpp Startscript fuer einen einzelnen Testjob bauen.
