# Task Capsule — Control-Videospur an den Video-Worker anschliessen (job_videospur_anschluss_20260818)

## Auftrag
Peer-Auftrag im Namen des Betreibers (2026-08-13/18, Befund
`docs/video/BEFUND_CONTROL_SPUR_RUFT_WORKER_NICHT.md`, Commit 14509c0):
Die Videospur der Control-Reserve `/api/chat` ruft den fertigen
`smejj-video-worker` nie — der freigegebene Weg-C-Stack (fal.ai LTX) liegt
brach, und ein Auftrag hing ueber 2,5 Minuten ohne jede Antwort.
Zusaetzlich aus derselben Sitzung: Personen-Schutzfilter live pruefen und
den Rohtext-Wackler im Chat untersuchen.

## Kontext (gelesen vor der Aenderung)
- `AI_Guidelines.md`, `Memory_Bank.md`, `Project_Goals.md`
- Memories: `smejj-video-dienst-live`, `smejj-bilder-zeichnen-svg`,
  `smejj-artefakt-ersetzt-nie-die-quelle`, `smejj-release-artefakt-aus-head`
- Referenz-Implementierung: `public/chat-bridge-bilder.js`
  (`versucheVideo`, `erzeugeVideoMitGeduld`, `videoHinweis`)

## Erste Annahme — geprueft und VERWORFEN
Der Befund vermutete ein "Arbeitskopie-Release", das parallax selbst rendert.
Gemessen: Der Dienst `smejj-control` baut inzwischen **direkt aus GitHub**
(`SmejjCom/smejj.com-app`, feature-Branch, `Dockerfile.smejj-control`) — jeder
Push deployt. Das Arbeitskopie-Release existiert nicht mehr. Der wahre Zustand
war schlimmer: `handleChat` hatte **gar keine** Videospur; Video-Auftraege
wurden als normaler Text beantwortet.

## Umsetzung
| Datei | Was |
|---|---|
| `control-server/src/routes/videoChatRoutes.js` (neu, 244 Zeilen) | Video-Spur: Erkennung, Worker-Aufruf, 429-Geduld, Personenschutz, SSE-Ausgabe |
| `src/server.js` (+8 Zeilen) | Einbau in `handleChat` — uebernimmt komplett oder gar nicht |
| `tests/control-video-chat-spur.test.mjs` (neu) | 7 Verhaltenstests |
| `docs/video/BEFUND_...md` | Nachtrag mit Messkette und offenem Punkt |
| Frontend `assets/ai/chat-stream.js` + `assets/app.js` (sw v583) | Abriss-Politur (siehe unten) |

Vertragstreue zum Worker: `POST /erzeuge {prompt, erzaehltext}` →
`{ok, format:"mp4", b64, engine, ton}`; 429 = besetzt → warten; Timeout 180 s;
**kein eigener Rueckfall** (der Worker faellt intern selbst auf parallax zurueck).
Fail-safe: liefert `false`, solange kein Byte gesendet wurde — dann laeuft
`/api/chat` unveraendert als Text weiter. Fail-closed: ohne Uebersetzung
entsteht kein Video (sonst fiele der Personenschutz mit aus).

## Zwei Fallen, die Zeit gekostet haben
1. **Denkphase frisst die Frist.** Der erste Live-Lauf trug bereits den
   richtigen Kopf (`video-worker:weg-c`), endete aber in "nicht verfuegbar":
   der Modell-Router streamte minutenlang `reasoning_content`, sichtbarer Text
   kam nie. Fix: `thinking: {type:"disabled"}` + `reasoningEffort: "low"`.
2. **Interner Dienstname war tot.** `smejj-video-worker.zeabur.internal`
   (ClusterIP 10.43.250.25) lief vom Control aus in den Timeout, waehrend die
   Pod-IP (10.42.0.216) sofort antwortete und der Worker lokal kerngesund war
   (uvicorn korrekt auf 0.0.0.0, `bereit:true`). Der Bild-Maler war ueber
   denselben Weg erreichbar — also kein Netzausfall, sondern ein veralteter
   Endpunkt. Erst der naechste Redeploy registrierte ihn neu.
   **Merkregel:** bei "Worker nicht erreichbar" zuerst Pod-direkt gegen
   DNS-Weg messen, bevor man den Code verdaechtigt.

## Live-Test (Produktionsdomain, echter Klickpfad)
| Pruefung | Ergebnis |
|---|---|
| `POST /api/chat` "Leuchtturm am Meer" | Kopf `x-smejj-model-backend: video-worker:weg-c`, Ticks alle 10 s, nach **135 s** `data:video/mp4` mit Erzaehlstimme |
| Personen-Schutz Foto ("Paris Hilton") | hoefliche Absage, kein Bild |
| Personen-Schutz Video ("Angela Merkel") | Absage in Sekunden, kein Worker-Aufruf |
| Gegenprobe Foto ("alter Seemann mit Pfeife") | malt normal |
| Gegenprobe Video ("Segelboot im Sturm") | Video erzeugt, Player im Chat |
| Abriss-Politur | live: 4 Treffer in `assets/ai/chat-stream.js`, sw v583 |

## Abriss-Politur — und ein Rueckfall
Untersuchung des Rohtext-Wacklers: eine Antwort stand mit **exakt 131.072
Zeichen** (2 x 64 KB) im DOM — ein `![...](data:...`-Markdown **ohne
schliessende Klammer**. Der Renderer kann so etwas nicht treffen, also blieb
roher base64-Text stehen. Ursache: der Strom riss mitten in der Bild-Ausgabe.
Gebaut: `entferneAbgerisseneMedien()` schneidet das Fragment ab und erklaert
den Abriss; `app.js` uebersetzt Chromes nacktes "network error".

**Rueckfall (wichtig):** Der erste Deploy (b446f75, sw v342) wurde von einem
spaeteren fremden Commit **ueberschrieben** — live gemessen fehlte die
Funktion, waehrend der `app.js`-Teil ueberlebt hatte. Erneut verankert
(0551b80, sw v583), jetzt an **drei** Stellen: Netzabbruch (`catch`),
Stille-Wache und Normalende.

## Offene Befunde (nicht Teil dieser Aufgabe)
1. **`engine` war `parallax:*`, nicht `extern:ltx-video`.** Der Kamerafahrt-Satz
   steht daher noch da. Liegt im Worker (dessen `/health` meldet
   `engine:"parallax"`), nicht am Anschluss — der reicht `engine` durch und
   laesst den Satz weg, sobald `extern` kommt (unit-getestet).
2. **Quelle driftet vom Ausgelieferten.** `public/ai/chat-stream.js` im
   Arbeitsrepo hat 580 Zeilen, die ausgelieferte `assets/ai/chat-stream.js`
   750 — rund 170 Zeilen Live-Funktionen (Stopp-Knopf, Stille-Wache, lokales
   Modell) existieren NUR im Deploy-Repo. Siehe
   Memory `smejj-artefakt-ersetzt-nie-die-quelle`.
3. **Startseiten-Gewicht 556 KB** (Budget 300). Vorbenchmark 505 KB — die
   Zunahme stammt aus rund 45 fremden Deploys zwischen sw v537 und v583, nicht
   aus dieser Arbeit.
4. **Altlast-rote Pruefer:** `check:guidelines` (vier fremde Dateien ueber 800
   Zeilen), `check:security` (zwei Actions-Dateien, ein Testwert),
   `check:branding` (Paket `@resvg/resvg-js` fehlt in der Umgebung).

## Rollback
Alle Aenderungen sind additive Commits auf `feature/auth-redesign-github-magiclink`
(25d76b4, 03701d4, f375bb7) bzw. `main` im Frontend-Repo (0551b80).
Rueckbau = `git revert` des jeweiligen Commits; der Video-Weg faellt dann auf
den Text-Weg zurueck, nichts anderes haengt daran.

## Benchmark
`docs/benchmarks/webvitals_v583_videospur_2026-08-18.json`

## Qualitaetsbewertung
Ziel erreicht und live belegt. Tests 22/22 gruen (7 neue + 15 bestehende
Video-e2e — keine Regression). Abzug: der Anschluss brauchte zwei Live-Runden
(Denkphase, toter Endpunkt), und die Abriss-Politur musste nach einer
Ueberschreibung durch eine Parallelsitzung ein zweites Mal ausgeliefert werden.
