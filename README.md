# smejj.com Code MVP

Minimaler Start fuer ein eigenes Programmier-KI-Tool mit OpenAI-kompatibler API.

## Kosten- und Architekturregel

- `docs/architecture/FREE_ONLY_MASTER_POLICY.md` ist verbindlich.
- GitHub.com bleibt dauerhaft Free-only.
- Cloudflare.com bleibt dauerhaft Free-only.
- IDrive e2 / S3-kompatibler Storage ist Hauptspeicher fuer Dateien, Medien, Modelle, Backups, Deployments und zentrale Daten.
- Keine kostenpflichtigen Zusatzdienste, keine Trials, keine Auto-Billing-Fallbacks.
- Funktionen, die mit diesen Regeln nicht sicher moeglich sind, laufen lokal, ueber IDrive-e2-Objekte oder fail-closed.

## Modell- und Speicher-Eckdaten

- Quelle: `moonshotai/Kimi-K2.7-Code` auf Hugging Face.
- Lizenz: `modified-mit`.
- Architektur: MoE, 1T Parameter gesamt, 32B aktive Parameter.
- Kontext: 256K.
- Download: offizielles HF-Repo ca. 595 GB.
- Empfohlene Engines: vLLM, SGLang, KTransformers.
- Externe Modell-APIs sind kein Kernbestandteil dieser Free-only-Architektur.
- Kimi K2.7 Code nutzt Thinking Mode; empfohlene/fixe Werte: `temperature=1.0`, `top_p=0.95`.
- Lokaler Test: `ollama run hf.co/unsloth/Kimi-K2.7-Code-GGUF:UD-Q4_K_XL` oder `llama-server -hf unsloth/Kimi-K2.7-Code-GGUF:UD-Q4_K_XL`.

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

GitHub und Cloudflare duerfen nur mit kostenlosen Diensten genutzt werden und
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

Lokale Modelltests duerfen nur ausserhalb des Repos und ohne GitHub-/Cloudflare-Kostenrisiko stattfinden.

Der offizielle Download ist gross. Der Transfer ist nur auf einer Maschine mit
mindestens 650 GiB freiem Speicher erlaubt. `MODEL_TMP_DIR` muss ausserhalb des
Projektordners liegen, damit keine Modell-Dateien in GitHub, Cloudflare oder das
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
- Skalierung: GitHub nur fuer Code, Cloudflare Free nur fuer Edge/Web-Schicht, IDrive e2 fuer zentrale Dateiablage.
- Kosten: Keine bezahlten GitHub- oder Cloudflare-Dienste einplanen.

## Free-only No-Big-Server Strategie

IDrive e2 ist der Modell-Vault und Hauptspeicher, aber kein Inferenz-Rechner.
Kimi K2.7 kann dort sicher archiviert werden. Antworten duerfen im Kern nicht
ueber GitHub Paid, Cloudflare Paid, Trial-APIs oder Auto-Billing-Pfade erzeugt
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

Projekt- und Deployment-Artefakte werden kostenfrei ausserhalb von GitHub und
Cloudflare in IDrive e2 archiviert:

```bash
npm run idrive:artifact
```

Vor jedem Release ausfuehren:

```bash
npm run release:preflight
```
