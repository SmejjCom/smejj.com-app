# smejj.com — Voice-Worker-Steuerung (Control-Server)

Stand 2026-07-20. Schriftliche Freigaben: ChatGPT-Sprachweg (2026-07-19),
Budget "nur bei Nutzung, max. 10 $/Monat, Auto-Abschaltung", Coqui-Lizenz
("Lizenz ist ok"). Architektur-Pivot: fertige oeffentliche Images statt
Eigenbau (kein Docker auf dem Mac verfuegbar).

## Architektur

```
Browser (Sprachmodus, composer-tools.js bleibt Fallback)
   |  X-smejj-voice-token
   v
control-server (dieses Modul)
   |-- POST /api/voice/session/start   -> Budget-Gate -> beide Salad-Gruppen starten
   |-- POST /api/voice/heartbeat       -> Aktivitaet melden (haelt Worker wach)
   |-- POST /api/voice/transcribe      -> Audio-Proxy zu smejj-voice-stt (Whisper, language=auto)
   |-- POST /api/voice/speak           -> Text-Proxy zu smejj-voice-tts (XTTS, Streaming)
   |-- POST /api/voice/session/stop    -> beide Gruppen stoppen
   |-- GET  /api/voice/status          -> Gruppen- und Lifecycle-Status
   Supervisor: Idle 120 s ODER Laufzeit-Deckel -> automatischer Stop (Kostenbremse)
```

Der Salad-API-Key bleibt ausschliesslich serverseitig (Proxy-Modell). Die
Worker-Gateways verlangen Authentifizierung; der Browser erhaelt nie Schluessel.

## Neue Dateien (additiv, 21/21 Tests gruen, check:guidelines OK)

- `control-server/src/voice/voiceWorkerControl.js` — Konfig (fail-closed),
  Start/Stop/Status beider Gruppen, Lifecycle-Logik, Supervisor.
- `control-server/src/routes/voiceWorkerRoutes.js` — HTTP-Kante: Token-Gate
  (timing-safe), Budget-Gate, Audio-/TTS-Proxy (8-MB-Deckel, Streaming).
- Tests: `voiceWorkerControl.test.js` (11), `voiceWorkerRoutes.test.js` (10).

## Registrierung in src/server.js (NICHT ausgefuehrt — Datei steckt im
## Auth-Umbau; Einbau erst am sauberen Punkt, 3 Zeilen + Dispatch-Block)

```js
import {
  ensureVoiceSupervisor, handleVoiceHeartbeat, handleVoiceSessionStart,
  handleVoiceSessionStop, handleVoiceSpeak, handleVoiceStatus, handleVoiceTranscribe
} from "../control-server/src/routes/voiceWorkerRoutes.js";

// im Request-Dispatcher:
if (url.pathname === "/api/voice/session/start" && req.method === "POST") return await handleVoiceSessionStart(req, res);
if (url.pathname === "/api/voice/heartbeat" && req.method === "POST") return await handleVoiceHeartbeat(req, res);
if (url.pathname === "/api/voice/transcribe" && req.method === "POST") return await handleVoiceTranscribe(req, res);
if (url.pathname === "/api/voice/speak" && req.method === "POST") return await handleVoiceSpeak(req, res);
if (url.pathname === "/api/voice/session/stop" && req.method === "POST") return await handleVoiceSessionStop(req, res);
if (url.pathname === "/api/voice/status" && req.method === "GET") return await handleVoiceStatus(req, res);

// einmal beim Serverstart:
ensureVoiceSupervisor();
```

## Benoetigte ENV (Salad-Portal / Control-Deploy; fail-closed ohne diese)

```
SALAD_ORGANIZATION_NAME=smejjcom
SALAD_PROJECT_NAME=default
SALAD_API_KEY=<Salad-Key, nur serverseitig>
SMEJJ_VOICE_WORKERS_ENABLED=YES
SMEJJ_VOICE_STT_URL=https://mango-panzanella-3fmt7u4f23mftx7l.salad.cloud
SMEJJ_VOICE_TTS_URL=https://jackfruit-bean-j14k5d0pv4toub19.salad.cloud
SMEJJ_VOICE_SESSION_TOKEN=<min. 16 Zeichen, teilt der Server dem Frontend nach Login mit>
SMEJJ_VOICE_IDLE_SHUTDOWN_SECONDS=120
SMEJJ_VOICE_LIFECYCLE_POLL_SECONDS=15
# Budget-Gate (identische Keys wie alle Worker):
SMEJJ_BUDGET_MAX_USD_PER_JOB=0.05
SMEJJ_BUDGET_MAX_RUNTIME_MINUTES=20
SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS=1
SMEJJ_WORKER_BUDGET_USD=0.03
SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES=15
# VERIFY im Live-Test (Pfade der fertigen Images):
SMEJJ_VOICE_STT_PATH=/v1/audio/transcriptions
SMEJJ_VOICE_TTS_PATH=/tts_stream
```

## Offene Punkte vor Livegang (ehrlich)

1. Registrierung in `src/server.js` erst nach Abschluss/Absprache Auth-Umbau.
2. Produktions-Deploy des Control-Servers laeuft ueber das IDrive-e2-Artefakt
   (KEY/SHA in Salad) — lokale Aenderungen wirken NICHT automatisch live.
3. IPv6-Faehigkeit beider fertigen Images erst beim ersten Start pruefbar.
4. XTTS-Server ist laut Coqui ein Demo-Server (keine parallelen Anfragen);
   fuer Einzelnutzer ok, Gateway-Limit "single active request" ist gesetzt.
5. Erster bezahlter Start NUR nach ausdruecklicher Start-Freigabe des
   Betreibers mit konkretem Betrag.
