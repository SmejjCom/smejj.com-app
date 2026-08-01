# [2026-07-29] Live-Bild der Maus: Kern gebaut, Deploy blockiert (job_maus_livebild_20260729)

Wortgleich aus Memory_Bank.md ausgelagert am 2026-08-01, um Platz unter der
800-Zeilen-Grenze zu schaffen. Kein Inhalt geaendert.

- Weg A gewaehlt: Chrome filmt sich per CDP selbst (`Page.startScreencast`) statt
  wiederholtem `page.screenshot()` — letzteres blockiert den Renderer und wuerde
  den Lauf ausbremsen. Neu `workers/maus-engine/screencast.mjs` (ohne
  Playwright-Bezug, CDP-Sitzung wird hineingereicht -> ohne Browser testbar).
- **Wichtigste Erkenntnis, per Test abgesichert:** JEDES Einzelbild muss mit
  `Page.screencastFrameAck` bestaetigt werden, auch ein gedrosselt verworfenes.
  Ohne Ack stellt Chrome den Strom nach wenigen Bildern ein — das ist die
  klassische Ursache fuer "Live-Bild bleibt nach zwei Sekunden stehen".
- Uebertragung bewusst OHNE WebSocket und ohne neuen Dienst: EIN Objekt
  `live/frame.jpg`, laufend ueberschrieben; die Anzeige signiert die Adresse
  einmal (300 s) und pollt danach direkt gegen IDrive e2. Ergebnis: konstanter
  Speicher statt ein Objekt je Bild, und der Control Server sieht einen Aufruf
  alle paar Minuten statt einen je Bild.
- Fail-closed: ohne `SMEJJ_MAUS_LIVE_FPS` ist alles AUS; Obergrenze hart 10/s.
  Fail-safe: Veroeffentlichungsfehler beruehren den Lauf nie.
- 20 Tests gruen; check:guidelines/start-lock/architecture/frontend gruen.
- **NICHT live.** Engine-Deploy braucht ein neues ghcr.io-Abbild; gemessen:
  Docker-Daemon aus, und `~/.docker/config.json` kennt nur Docker Hub, kein
  ghcr.io. Verbleibende Verdrahtung (`onPageReady` im Interpreter) bewusst NICHT
  blind eingebaut — sie liesse sich ohne lauffaehige Engine kein einziges Mal
  ausfuehren. Details: task-capsules/2026/07/job_maus_livebild_20260729/.
