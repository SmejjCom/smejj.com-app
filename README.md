# smejj.com Code MVP

Minimaler Start fuer ein GLM-5.2-first Storage-First AI Coding OS mit OpenAI-kompatibler API.

## Kosten- und Architekturregel

- `docs/architecture/FREE_ONLY_MASTER_POLICY.md` ist verbindlich.
- GitHub.com bleibt dauerhaft Free-only.
- Cloudflare.com wird nicht genutzt; Hosting ist GitHub Pages (Free), DNS liegt bei Spaceship.
- IDrive e2 / S3-kompatibler Storage ist Hauptspeicher fuer Dateien, Medien, Modelle, Backups, Deployments und zentrale Daten.
- Keine kostenpflichtigen Zusatzdienste, keine Trials, keine Auto-Billing-Fallbacks.
- Funktionen, die mit diesen Regeln nicht sicher moeglich sind, laufen lokal, ueber IDrive-e2-Objekte oder fail-closed.

## Modell- und Speicher-Eckdaten

- Fundament: GLM-5.2 als Hauptgehirn fuer Coding, Architektur, Agentenarbeit und hochwertige Antworten.
- Primaerer Vault: `zai-org/GLM-5.2-FP8` auf IDrive e2.
- Referenzquelle: `zai-org/GLM-5.2` auf Hugging Face.
- Lizenz: `mit`.
- Kontextziel: 1M Token.
- Empfohlene Engines: SGLang zuerst, vLLM danach, KTransformers fuer CPU/GPU-heterogene Experimente.
- IDrive e2 speichert Modelle, Manifeste, Checksums und Artefakte, fuehrt aber keine Inferenz aus.
- Externe Modell-APIs sind kein Kernbestandteil dieser Free-only-Architektur.
- Kleinere Modelle duerfen nur Nebenrollen wie Embeddings, Klassifizierung, Vorfilterung oder UI-Hilfe uebernehmen.

Details:

```text
docs/architecture/GLM_5_2_STORAGE_FIRST_CODING_OS.md
docs/model-management/GLM_5_2_STORAGE.md
```

## smejj 1.0 Phase 1

Das eigene Zielmodell `smejj-1-0` verwendet die vorhandene Qwen-Familie als
geplantes Grundmodell. Es ist noch nicht fuer Training oder Produktion
freigegeben: Das konkret laufende Qwen-Artefakt muss zuerst revisions-,
checksum-, tokenizer-, lizenz- und image-digest-genau attestiert werden.

Die Phase-1-Pipeline ist fail-closed. Training Capture ist standardmaessig aus,
historische Task Capsules sind keine Trainingsdaten, und Z.ai-/GLM- sowie
Moonshot-/Kimi-API-Daten sind nach der aktuellen Rechtepruefung fuer Training
und Distillation gesperrt. Berechtigte First-Party-Kandidaten benoetigen
Sanitization, Einwilligung, Rechte, alle Qualitaets-Gates, getrennte
AES-256-GCM-/HMAC-Schluessel, immutable IDrive-e2-Schreibvorgaenge und einen
familienbasierten Split.

Verbindliche Details:

```text
docs/architecture/SMEJJ_1_0_PHASE_1_FOUNDATION.md
docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md
docs/architecture/SMEJJ_1_0_TRAINING_RIGHTS_2026-07-10.md
```

## Start

```bash
cp .env.example .env
npm run check
npm run dev
```

Dann im Browser oeffnen:

```text
http://127.0.0.1:3000
```

## Wichtige Umgebungsvariablen

- `SMEJJ_LLM_BASE_URL`: OpenAI-kompatible Base URL.
- `SMEJJ_LLM_API_KEY`: API-Key oder `local` bei lokalem Server.
- `SMEJJ_LLM_MODEL`: Modellname.
- `PROJECT_ROOT`: Projektordner, den der Agent lesen darf.

## Speicher- und Download-Plan

GitHub darf nur mit kostenlosen Diensten genutzt werden und
niemals fuer Modell-Dateien, Medienarchive oder zentrale Nutzerdaten. Der
zentrale Speicher fuer grosse Dateien ist IDrive e2.

Offizielles Modell:

```bash
npm run idrive:preflight
export CONFIRM_MODEL_DOWNLOAD=YES
npm run model:download
npm run model:verify
export CONFIRM_IDRIVE_UPLOAD=YES
npm run model:upload
```

Lokale Modelltests duerfen nur ausserhalb des Repos und ohne GitHub-Kostenrisiko stattfinden.

Der offizielle Download ist gross. Der Transfer ist nur auf einer Maschine mit
mindestens 650 GiB freiem Speicher erlaubt. `MODEL_TMP_DIR` muss ausserhalb des
Projektordners liegen, damit keine Modell-Dateien in GitHub oder das
Repo gelangen.

## MVP-Funktionen

- `/api/chat`: streamt Antworten per SSE.
- `/api/agent`: liest erlaubte Dateien und erzeugt Diff-Vorschlaege.
- `/api/files/read`: liest Dateien innerhalb der Sandbox.
- `/api/files/write`: erzeugt Schreibvorschlag oder schreibt nur mit `apply:true`.
- `/api/terminal/run`: fuehrt nur erlaubte Kommandos aus.
- `/api/git/status`: zeigt Git-Status.
- `/api/git/commit`: erstellt Commit nur mit expliziter Nachricht.

## Produktionsleitlinien

- Geschwindigkeit: Streaming, Caching, kurze Startpfade und regionale Naehe priorisieren.
- Stabilitaet: Jobs idempotent, Uploads pruefbar, Checksums verpflichtend.
- Sicherheit: Secrets nur lokal oder in erlaubten Secret-Stores, niemals im Repo.
- Skalierung: GitHub nur fuer Code, GitHub Pages nur fuer die statische Web-Schicht, IDrive e2 fuer zentrale Dateiablage.
- Kosten: Keine bezahlten GitHub-Dienste einplanen; Cloudflare wird nicht genutzt.

## Free-only No-Big-Server Strategie

IDrive e2 ist der Modell-Vault und Hauptspeicher, aber kein Inferenz-Rechner.
Kimi K2.7 kann dort sicher archiviert werden. Antworten duerfen im Kern nicht
ueber GitHub Paid, Trial-APIs oder Auto-Billing-Pfade erzeugt
werden. Basisfunktionen muessen lokal, browserseitig oder fail-closed bleiben,
bis eine neue schriftliche Free-safe Architekturfreigabe vorliegt.

Details:

```text
docs/architecture/NO_BIG_SERVER_KIMI_STRATEGY.md
docs/architecture/CENTRAL_ARCHITECTURE.md
docs/architecture/FREE_TIER_IDRIVE_GUARDRAILS.md
docs/architecture/CONNECTION_AUDIT_2026-06-16.md
docs/architecture/RELEASE_PROTECTION.md
docs/architecture/FREE_ONLY_MASTER_POLICY.md
```

Der lokale IDrive-Status ist ueber die App und per API pruefbar:

```text
GET /api/storage/status
```

Projekt- und Deployment-Artefakte werden ausserhalb von GitHub in IDrive e2
archiviert:

```bash
npm run idrive:artifact
```

Vor jedem Release ausfuehren:

```bash
npm run release:preflight
```
