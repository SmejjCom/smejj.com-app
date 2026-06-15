# smejj.com Code MVP

Minimaler Start fuer ein eigenes Programmier-KI-Tool mit OpenAI-kompatibler API.

## Empfehlung

- Schnellster Start: offizielle Moonshot/Kimi API.
- Produktion mit eigener Infrastruktur: `moonshotai/Kimi-K2.7-Code` ueber vLLM, SGLang oder KTransformers auf GPU-Servern.
- Lokaler Mac-Test: GGUF ueber llama.cpp/Ollama, nur als Prototyp.
- 100 gleichzeitige User: API-Start oder dedizierter GPU-Cluster, nicht ein einzelner lokaler Rechner.

## Recherchierte Eckdaten

- Quelle: `moonshotai/Kimi-K2.7-Code` auf Hugging Face.
- Lizenz: `modified-mit`.
- Architektur: MoE, 1T Parameter gesamt, 32B aktive Parameter.
- Kontext: 256K.
- Download: offizielles HF-Repo ca. 595 GB.
- Empfohlene Engines: vLLM, SGLang, KTransformers.
- API: Moonshot stellt OpenAI-/Anthropic-kompatible API bereit.
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

GGUF-Test:

```bash
ollama run hf.co/unsloth/Kimi-K2.7-Code-GGUF:UD-Q4_K_XL
```

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
