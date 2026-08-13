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
