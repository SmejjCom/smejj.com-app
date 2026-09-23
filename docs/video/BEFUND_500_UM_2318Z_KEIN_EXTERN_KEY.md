# Befund: der 500er um 23:18Z war KEIN extern-Fehlschlag — der Schluessel fehlt im Portal

Stand: 2026-08-13, gemessen an den Zeabur-Runtime-Logs (Dashboard, Chrome).
Anlass: POST /erzeuge antwortete nach ~155 s mit 500; Verdacht laut Vorbefund:
extern (fal.ai) schlug fehl und der parallax-Rueckfall stuerzte ab.

## Was die Logs wirklich zeigen

1. **Weg C lief NIE.** Im Log des betroffenen Deployments steht um 16:18:15
   (lokal; 23:18Z) nur die 500-Zeile — die seit dem extern-Diagnose-Fix
   garantierte Zeile "extern fehlgeschlagen, parallax uebernimmt: …" fehlt.
   Der Folge-Deploy (Start-Diagnose, 16:25) druckt beim Start die Wahrheit:
   **"extern: OHNE SCHLUESSEL — Weg C inaktiv"**.
2. **Der Schluessel steht NICHT im Portal.** Variable-Tab des Dienstes
   smejj-video-worker: nur PASSWORD und PORT (plus 9 Auto-Host-Variablen).
   Kein SMEJJ_VIDEO_EXTERN_KEY — auch nicht an der Chat-Bridge. Die Annahme
   "EXTERN_KEY ist live gesetzt" war falsch. Nur der Betreiber kann ihn
   anlegen (Dienst smejj-video-worker → Variable → Add), danach Restart.
3. **Der 500er war ein Bild-Timeout in der Warteschlange.** Der Bild-Maler
   bekam den Auftrag und antwortete 200 — aber erst um 16:18:51, also 36 s
   NACH dem 150-s-Timeout des Workers (SMEJJ_VIDEO_BILD_TIMEOUT_S). Der Maler
   arbeitete 16:13–16:23 Auftrag um Auftrag (Fertigmeldungen 16:13:55,
   16:16:57, 16:18:51, 16:21:00, 16:23:15). 16:21:38 gab es wieder einen
   200er am Worker — die Engine selbst ist gesund.

## Warum der Maler ueberhaupt staut, statt 429 zu sagen

`workers/smejj-bild-maler/server.py` malt in `async def erzeuge` BLOCKIEREND
in der Event-Loop. Waehrend eines Jobs beantwortet der Prozess NICHTS: neue
Anfragen (auch /health) stauen sich am Socket, bis der Job fertig ist. Das
"sofortige 429" aus dem Code feuert praktisch nie — die Sperre ist immer
schon wieder frei, wenn die naechste Anfrage endlich verarbeitet wird. So
wurde aus dem geplanten "besetzt → Bruecke wartet" ein stiller 150-s-Haenger.
(Fix gehoert in die Bilder-Spur: Arbeit in den Threadpool, wie jetzt im
Video-Worker — nicht blind mitdeployen, die Bruecke faellt bei ehrlichem
Maler-429 im BILD-Weg auf SVG zurueck; das will abgestimmt sein.)

## Was jetzt im Video-Worker gefixt ist (dieser Commit)

- **Bild einmal malen, zweimal nutzen:** der Handler holt das Basisbild VOR
  dem extern-Versuch; schlaegt fal fehl, rendert parallax DASSELBE Bild.
  Vorher haette der Rueckfall den Maler ein zweites Mal gerufen (~110 s) —
  das sprengte das 180-s-Budget der Bruecke in jedem Fall.
- **extern-Warten 110 s → 60 s Voreinstellung** (SMEJJ_VIDEO_EXTERN_TIMEOUT_S
  bleibt ueberstimmbar): Bild ~110 s + fal-Warten muessen unter 180 s bleiben.
- **Threadpool statt Event-Loop:** die Minutenarbeit laeuft in
  `erzeuge_blockierend` im Threadpool; /health und das 429 antworten auch
  waehrend eines Renderns (die Maler-Krankheit nicht wiederholen).
- **Fehlweg loggt den Ausnahme-Typ** (`erzeuge fehlgeschlagen: …`, flush) —
  der 500er von 23:18Z war im Log typlos, das passiert nicht nochmal.

Tests: `python3 scripts/testing/pruefe_video_extern.py` (Signatur folgt dem
neuen Schnitt: Bild kommt vom Aufrufer) und `node --test
tests/video-worker.test.mjs` — 14/14 gruen.

## Offene Punkte (nicht dieser Commit)

1. **Betreiber:** SMEJJ_VIDEO_EXTERN_KEY am Dienst smejj-video-worker
   anlegen (Vorlage docs/approvals/2026-08-13-video-extern-fal-freigabe-
   VORLAGE.md) — ohne ihn bleibt Weg C fail-closed aus.
2. **Bilder-Spur:** Maler-Event-Loop-Blockade (siehe oben) mit den
   Bilder-Eigentuemern abstimmen.
3. **Optional:** Bruecken-Budget VIDEO_TIMEOUT_MS (180 s) ist mit Maler-Stau
   weiterhin knapp; erst nach 1.+2. neu messen.
4. Zeabur-Log-SUCHE ist Pro-Paywall — Logs lesen geht frei (Deployment-
   Dropdown zeigt auch entfernte Deployments).
