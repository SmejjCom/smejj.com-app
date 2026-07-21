# smejj.com — Frontend Integration (PROPOSAL, no locked-file edit)

How the App voice mode (`public/composer-tools.js`) would switch to the
server-side voice worker WITHOUT breaking the existing browser fallback or the
existing barge-in / voiceMode functions. This is a description only. The
design-locked files are NOT modified here:

- `public/composer-tools.js` (App voice mode — Web Speech + speechSynthesis)
- `public/voice-speech-queue.js` (`splitCompleteSentences`, `createSpeechQueue`)
- `public/voice-landing.js` (14 language landing pages)

## What exists today (must be preserved)

`composer-tools.js` is an ES module that runs voice mode fully in the browser:

- capture: `window.SpeechRecognition || webkitSpeechRecognition`, single
  language via `recognition.lang = SPEECH_LANG`;
- output: `speechSynthesis` + `createSpeechQueue(...)` (sentence-wise, streams
  while the answer arrives);
- barge-in: a second recognizer with an echo-text filter interrupts playback;
- state flags: `state.voiceModeActive`, `state.voiceMuted`,
  `state.voiceFallback`, `state.bargeConfirmed`;
- functions: `voiceModeSend(task)`, `voiceModeListen()`, `closeVoiceMode()`,
  `setVoiceModeStatus(mode, text)`, `setVoiceModeTranscript(text)`;
- overlay DOM: `#voiceModeOverlay`, `#voiceModeMic`, `#voiceModeStatus`,
  `#voiceModeTranscript`, `#voiceModeInput`, `.voice-mode-hint`;
- existing seam: on open it sets `window.smejjVoiceModePreferences = { voiceMode: true }`,
  on close it sets it back to `null`.

All of the above stays as the DEFAULT and as the FAILURE fallback.

## Design: additive client module + one capability flag

### 1) New file (additive): `public/voice-worker-client.js`

A standalone ES module (loaded by one additive `<script type="module">` line in
`index.html`). It is CAPABILITY-GATED and inert unless a deploy explicitly turns
it on, so by default nothing changes:

- Activates only when `window.smejjVoiceWorker?.enabled === true` (a flag the
  deploy sets) AND the browser has `mediaDevices.getUserMedia` and WebSocket.
- Reuses the EXISTING overlay DOM (`#voiceModeStatus`, `#voiceModeTranscript`,
  `#voiceModeMic`) — it does not create its own UI.
- On voice-mode open (observed via `window.smejjVoiceModePreferences` flipping
  to a truthy value): calls `POST /api/voice/session` (the additive
  control-server route), receives the authenticated Salad `wss` gateway URL,
  and connects a Pipecat browser client (`@pipecat-ai/client-js`, WebSocket
  transport) that streams microphone audio up and plays TTS audio down.
- Sets `window.smejjVoiceWorker.active = true` while a server session is live,
  and back to `false` on stop/close/error.

Because the server does STT auto-detect + TTS, the client stops pinning a single
language (no `recognition.lang = SPEECH_LANG`). That is the concrete upgrade:
ANY spoken language is detected and answered in the same language.

### 2) The single minimal hook in `composer-tools.js` (locked — needs approval)

To actually HAND OVER control (so the browser recognizer and the browser
speechSynthesis do not run at the same time as the server session), exactly one
additive guard is needed at the top of the two entry functions. This is a
change to a design-locked file and therefore requires written approval; it is
shown here so the diff is known and minimal:

```js
// composer-tools.js — top of voiceModeSend(task) and voiceModeListen():
if (window.smejjVoiceWorker?.active) return;  // server voice worker owns this turn
```

- When the server worker is active, these early-returns let the server session
  own capture, playback and barge-in.
- When `window.smejjVoiceWorker` is unset or `active === false` (flag off,
  capability missing, or the session failed), the guard is falsy and the
  EXISTING browser path runs unchanged — full fallback preserved.
- No existing function is renamed or removed; `closeVoiceMode()`,
  `setVoiceModeStatus`, `setVoiceModeTranscript`, `createSpeechQueue`, the
  barge-in recognizer and all `state.*` flags stay exactly as they are.

Until that guard is approved, `voice-worker-client.js` stays inert (it never
sets `active` without the guard present), so there is zero behavioural change.

## Barge-in mapping

- Server active: barge-in is native — Silero VAD on the worker + Pipecat
  `allow_interruptions=True` cut the TTS the instant the user speaks. The
  browser barge-in recognizer is idle (guarded out).
- Server off / failed: the existing browser barge-in (second recognizer + echo
  filter + `createSpeechQueue` cancel) runs exactly as today.

## Language mapping

- Today: `recognition.lang = SPEECH_LANG` (one language at a time).
- Server: faster-whisper `language=None` detects every spoken language; the LLM
  replies in that language (system prompt); XTTS-v2 speaks it. The client shows
  partial transcripts in `#voiceModeTranscript` regardless of language.
- The landing pages (`voice-landing.js`) can keep their existing text-agent call
  and `preferences: { uiLanguage, voiceMode: true }` payload; the realtime voice
  worker is an orthogonal audio channel and does not change that path.

## Failure + rollback behaviour

- If `/api/voice/session` is denied (budget gate closed), unreachable, or the
  `wss` connection drops, `voice-worker-client.js` sets
  `window.smejjVoiceWorker.active = false` and calls the existing
  `setVoiceModeStatus("...", "...")` to inform the user; the guard then lets the
  browser fallback take over automatically.
- Rollback = remove the additive `<script>` include (and, if applied, the
  one-line guard). No existing browser voice behaviour is lost.

## Summary of touch points

| Change | File | Type | Lock status |
| --- | --- | --- | --- |
| New server voice client | `public/voice-worker-client.js` | new file | additive |
| Load the client | `index.html` (one `<script>` line) | additive line | needs approval |
| Hand-over guard | `composer-tools.js` (one line x2) | additive guard | LOCKED — written approval |
| Session route | control-server (see CONTROL_SERVER_INTEGRATION.md) | additive | needs approval |

Everything is capability-gated and reversible; the browser fallback and the
existing barge-in/voiceMode functions remain the default path.
