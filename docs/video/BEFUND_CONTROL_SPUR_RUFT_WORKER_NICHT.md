# BEFUND: Die Control-Videospur ruft den Video-Worker nicht — Weg C liegt brach

Gemessen 2026-08-13 abends, im angemeldeten Browser. Für die Sitzung, die den
Control-Server umbaut — ihr habt die App heute zu Recht auf "100% Zeabur
Control Server" geschwenkt, aber eure Videospur laesst dabei den kompletten
Video-Worker-Stack links liegen.

## Die Messkette (jede Stufe belegt)

1. `/api/chat` geht an **smejj-control** (performance-Eintraege; kein
   localStorage/sessionStorage-Pin — regulaeres Routing).
2. Antworten tragen den parallax-Hinweistext ("Raeumliche Kamerafahrt …") —
   eure Spur ist eine Kopie der Bruecken-Spur nach 51aa40d.
3. Der Worker `smejj-video-worker` bekommt **GET /health** (euer
   Bereit-Check!), aber **NIE POST /erzeuge** — ueber vier Testauftraege.
4. Der Control-Code im Repo hat KEINE Videospur → der Dienst faehrt ein
   Arbeitskopie-Release. Bitte einchecken — sonst kann niemand mithelfen
   ([[smejj-release-artefakt-aus-head]] laesst gruessen).

## Warum das gerade JETZT zaehlt

Der Betreiber hat heute **Weg C freigegeben und aktiviert**: echte
Motivbewegung via fal.ai (LTX image-to-video, 0,02 USD/Video). Der komplette
Stack liegt FERTIG im Worker (`workers/smejj-video-worker/server.py`,
Deploy-Branch `deploy/smejj-video-worker`, laeuft):

- `SMEJJ_VIDEO_EXTERN_KEY` ist am Worker-Dienst GESETZT (Betreiber, heute)
- fail-closed, Tagesdeckel, SSRF-Schutz, Piper-Stimme, parallax-Rueckfall
- 7 Verhaltenstests: `scripts/testing/pruefe_video_extern.py`

Eure Spur erzeugt stattdessen weiter eigene parallax-Videos — der Betreiber
zahlt fuer einen Schluessel, der nie benutzt wird, und wartet auf Qualitaet,
die fertig herumliegt.

## Der Anschluss (eine Stelle)

Euer Bereit-Check trifft den Worker ja schon. Es fehlt nur, dass die
Erzeugung DENSELBEN Worker ruft statt lokal zu rendern:

```
POST http://smejj-video-worker.zeabur.internal:8080/erzeuge
Body: { "prompt": "<englischer Mal-Prompt>", "erzaehltext": "<deutsch, optional>" }
Antwort: { ok, format: "mp4", b64, engine: "extern:ltx-video"|"parallax:…", ton }
```

- `engine` steuert den Hinweistext (extern → KEIN Kamerafahrt-Satz)
- 429 = besetzt → warten wie in der Bruecken-Spur (`erzeugeVideoMitGeduld`)
- Timeout-Empfehlung 180 s; der Worker faellt intern selbst auf parallax
  zurueck, ihr braucht KEINEN eigenen Rueckfall mehr

Referenz-Implementierung: `public/chat-bridge-bilder.js` (`versucheVideo`,
`erzeugeVideoMitGeduld`, `videoHinweis`).

## Nebenbefund

Ein Auftrag ueber eure Spur ("Windmuehle im Kornfeld") hing **>2,5 Minuten
ohne jede Antwort** — die Kopie hat zusaetzlich ein Haenger-Problem, das der
Worker-Anschluss gleich mit erledigen wuerde.

---

## NACHTRAG: Anschluss GEBAUT + LIVE BEWIESEN (2026-08-13 spät, andere Sitzung)

Der Dienst smejj-control baut inzwischen DIREKT aus GitHub (feature-Branch,
jeder Push deployt) — das Arbeitskopie-Release ist Geschichte. Im Git-Stand
hatte handleChat GAR KEINE Videospur mehr; Video-Aufträge wurden als Text
beantwortet. Neu (Commits 25d76b4, 03701d4):

- `control-server/src/routes/videoChatRoutes.js` + Einbau in `src/server.js`
  (+ 7 Verhaltenstests `tests/control-video-chat-spur.test.mjs`): gleicher
  Worker-Vertrag wie die Brücke (POST /erzeuge, 429-Geduld, 180 s), `engine`
  steuert den Hinweistext (extern:* → KEIN Kamerafahrt-Satz), Übersetzung +
  PERSON_GESPERRT über den eigenen Modell-Router, fail-safe/fail-closed.
- Falle: `thinking {type:"disabled"}` + `reasoningEffort "low"` sind Pflicht,
  sonst frisst die kimi-Denkphase die Frist und die Übersetzung bleibt leer.
- Livemessung: POST /api/chat "Leuchtturm…" → Header
  `x-smejj-model-backend: video-worker:weg-c`, Ticks alle 10 s, nach ~135 s
  `data:video/mp4` MIT Erzählstimme. Der 2,5-min-Hänger ist damit erledigt.

**OFFEN (liegt im WORKER, nicht am Anschluss):** engine war `parallax:*` —
der extern-Pfad (LTX) war zur Messzeit im Worker nicht aktiv; sobald er
scharf ist, verschwindet der Kamerafahrt-Satz von selbst.

**NETZ-BEFUND, der die ursprüngliche Messkette miterklärt:** Der interne
Service-Endpoint des video-workers war heute Abend TOT —
`smejj-video-worker.zeabur.internal` (ClusterIP 10.43.250.25) timeoutete vom
Control aus, während die Pod-IP (10.42.0.216) direkt antwortete und der
Worker lokal gesund war (uvicorn korrekt auf 0.0.0.0). Erst der nächste
Redeploy registrierte den Endpoint neu. Merkregel: bei "Worker nicht
erreichbar" erst Pod-direkt gegen DNS-Weg messen, bevor man den Code
verdächtigt.
