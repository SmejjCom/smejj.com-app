# Server-Zielbild smejj.com — langfristig tragfaehig

Stand: 2026-08-13. Vorschlag, **noch nichts umgesetzt**.

## Kurzantwort auf die Frage

**Weder „extra Server nur fuer Autopiloten" noch „den einen Server nur groesser
machen".** Beides loest das falsche Problem:

- Die **Autopiloten sind nicht der Fresser** — sie sind fast alle wartend/IO
  (Netzaufrufe, S3, Cron). Ein eigener Server fuer sie kostet Geld und
  entlastet nichts.
- **Nur vergroessern** verschiebt das Problem: Video-Encoding und Bild-Malen
  koennen weiterhin dem Chat die Rechenzeit wegnehmen, egal wie gross die
  Kiste ist. Ein Encoder, der 100 % CPU zieht, tut das auf 2 Kernen wie auf 8.

**Richtig ist: nach Antwortzeit trennen, nicht nach Funktion.** Ein Server fuer
alles, was der Nutzer sofort spuert. Ein zweiter fuer alles, was rechnet.

## Ausgangslage (gemessen 2026-08-13)

| | |
| --- | --- |
| Server | **genau einer**: Tencent Ashburn 2C 8GB, K3s, **US$6/Monat**, laeuft ab 26.08.2026 |
| Dienste darauf | 9 (control, chat-bridge, video-worker, bild-maler, voice-piper, training-loop, brueckenwaechter, maus-engine, remote-browser) |
| Autopiloten | 31 Module, 36 live |
| Frontend | GitHub Pages — **getrennt und kostenlos**, gut so |
| Ablage | iDrive e2 (S3) — **ausserhalb des Servers**, gut so |
| Antwortzeit `/api/auth/me` | ~0,38 s TTFB (davon ~0,11 s Netz) |
| Antwortzeit unbekannter API-Pfad (404) | ~0,31 s TTFB |

## NACHGEMESSEN im Zeabur-Portal (Metrics, 12-Stunden-Fenster)

**Diese Messung widerlegt meine erste Vermutung.** Ich hatte „alle neun Dienste
zusammen ueberlasten die zwei Kerne" angenommen. Falsch. Es ist **ein einziger
Dienst**:

| Dienst | CPU-Spitze | RAM-Spitze | Bewertung |
| --- | --- | --- | --- |
| **`smejj-bild-maler`** | **203 %** | **6 646 MB** | **frisst beide Kerne und 80 % des Arbeitsspeichers** |
| `smejj-video-worker` | ~45 % | 885 MB | stossweise, unauffaellig |
| `smejj-control` | ~3–5 % | 185 MB | **sehr leicht**, kein Problem |

203 % heisst bei 2 vCPU: **beide Kerne zu 100 % belegt.** Und 6,6 GB von 8 GB
laesst fuer alles andere ~1,4 GB — video-worker allein will in der Spitze schon
885 MB davon.

**Das ist mit hoher Wahrscheinlichkeit die Ursache des seit Langem bekannten
Fehlers „Control-Server stirbt still"** (Memory `smejj-control-absturz-instanz-restart`):
Wenn der Bild-Maler den Speicher bis an die Kante zieht, raeumt der Kernel
(OOM-Killer) andere Container ab. Der Control-Server ist mit 185 MB das
leichteste Opfer und stirbt ohne Fehlermeldung — genau das beobachtete Bild.

### Kein Leck — Code gelesen, eigener Verdacht widerlegt

Der RAM-Verlauf (steigt auf 4–5 GB, faellt nie zurueck) sah nach einem Leck
aus. Ist keines. `workers/smejj-bild-maler/server.py:46` laedt SD-Turbo mit
**`torch_dtype=torch.float32`**. SD-Turbo hat rund 1,3 Mrd. Parameter — UNet
~865 M, OpenCLIP-Textcoder ~354 M, VAE ~84 M. In fp32 sind das **~5 GB reine
Gewichte, dauerhaft im Speicher**; die 6,6-GB-Spitze ist Gewichte plus
Aktivierungen waehrend der Erzeugung. Der Verlauf ist damit **genau das, was
dieser Code tun muss** — nicht defekt, sondern zu gross gewaehlt.

Der Kommentar im Code sagt das sogar selbst („fp32 mit Attention-Slicing",
„Speicher vor Tempo") — fp32 ist die sichere CPU-Wahl, weil fp16 auf CPU in
PyTorch schlecht unterstuetzt ist.

**Konsequenz fuer den taeglichen Neustart, den ich gesetzt habe:** Er hilft
weniger als gedacht. Er gibt die Allocator-Arena frei, danach laedt das Modell
wieder auf dieselben 5 GB. Schadet nicht, loest aber nichts.

### Die echten Hebel — alle kostenlos, kein Bezahlplan noetig

| Hebel | Gewinn | Preis / Risiko |
| --- | --- | --- |
| `torch_dtype=torch.bfloat16` statt float32 | **~2,5 GB weniger** | bf16 ist auf CPU nur mit AVX512-BF16/AMX schnell, sonst langsamer als fp32 — **Tempo vorher messen**, das Bruecken-Budget sind 150 s (heute ~120 s bei 3 Schritten) |
| `pipe.enable_vae_slicing()` ergaenzen | senkt die Spitze beim VAE-Dekodieren | risikolos, keine Qualitaetsaenderung |
| `OMP_NUM_THREADS=1` als Zeabur-Variable | CPU faellt von 203 % auf ~100 %, ein Kern bleibt frei | Erzeugung dauert etwa doppelt so lang → reisst vermutlich das 150-s-Budget; nur mit weniger Schritten sinnvoll |

**Der wichtige Punkt:** Umgebungsvariablen sind auf der **Gratis-Stufe
schreibbar**. `OMP_NUM_THREADS` ist damit der kostenlose Ersatz fuer die
gesperrten Resource Limits — man kauft den freien Kern mit Wartezeit statt mit
5 $.

### Zweiter Befund: Bau-Sturm bei jedem Push

`smejj-control` (vor 9 min), `brueckenwaechter` (6 min) und
`smejj-remote-browser` (5 min) zeigen **denselben Commit**. Ein einziger Push
loest also **mehrere gleichzeitige Docker-Baeuge** auf derselben 2-Kern-Kiste
aus. Ein Bau kostet weit mehr CPU als der Betrieb. Zeabur bietet pro Dienst
**„Watch Paths"** — damit baut ein Dienst nur noch, wenn seine eigenen Dateien
sich geaendert haben.

### Was daraus folgt

Ein 404 braucht ~0,2–0,3 s Serverzeit — das ist Netz und Middleware, **nicht**
CPU-Mangel. Der Server ist im Normalbetrieb **nicht ausgelastet**.

Dazu kommen drei bereits belegte Befunde:

- `smejj-bild-maler` **blockiert die Ereignisschleife** (darum feuerte die
  429-Bremse nie) — Memory `smejj-video-erzeugung-stufe3`.
- Der Control-Server **stirbt still**, nur ein Instanz-Neustart heilt —
  Memory `smejj-control-absturz-instanz-restart`.
- Ein Videolauf dauert **~135 s** mit ffmpeg auf denselben zwei Kernen, auf
  denen gleichzeitig jeder Chat beantwortet wird.

Das ist die eigentliche Begruendung, nicht die Millisekunden oben: **eine
einzige rechenintensive Aufgabe kann heute den ganzen Dienst ausbremsen.**

## Zielbild: drei Temperaturen

| Stufe | Wer wartet? | Dienste | Anspruch |
| --- | --- | --- | --- |
| **Heiss** | Nutzer, sofort | `smejj-control`, `smejj-chat-bridge` | nie langsam, nie mit Encodern geteilt |
| **Warm** | Nutzer, mit Fortschrittsbalken | `video-worker`, `bild-maler`, `voice-piper`, `maus-engine`, `remote-browser` | darf CPU fressen, darf Sekunden bis Minuten dauern |
| **Kalt** | niemand | 36 Autopiloten, `training-loop`, `brueckenwaechter`, Nachtbau | darf jederzeit warten |

**Heiss und Warm duerfen sich niemals denselben Server teilen.** Kalt darf bei
Heiss mitwohnen, solange es CPU-Grenzen hat — Autopiloten sind billig.

## Das fehlende Bauteil: eine Auftrags-Warteschlange

Heute ruft `/api/chat` den Video-Worker **direkt** auf und haelt die Verbindung
~135 s offen. Das ist der zerbrechlichste Punkt im ganzen System:

- jeder Deploy, Neustart oder Zeitueberschreitung **verliert den Auftrag**
- der Nutzer sieht „Verbindung unterbrochen" statt eines Fortschritts
- man kann **keinen zweiten Worker danebenstellen**, weil niemand verteilt

Richtig ist: Auftrag annehmen → Auftrags-Nummer zurueckgeben → Fortschritt
abfragen/streamen → Ergebnis aus S3. Damit ueberlebt ein Video jeden Neustart,
und ein zweiter Worker ist danach nur noch eine Kopie des Dienstes.

Kostenlos machbar mit **Upstash Redis** (Gratis-Stufe) oder — wenn gar keine
neue Abhaengigkeit gewuenscht ist — mit einer Auftragsliste auf iDrive e2, die
ihr ohnehin schon nutzt.

## Reihenfolge (jeder Schritt einzeln nuetzlich)

## NACHTRAG: Zeabur warnt selbst — und es ist die CPU, nicht der Speicher

Am selben Abend, nach dem Maler-Deploy, zeigt das Portal einen eigenen Alarm:

> „Tencent Ashburn 2C 8GB — CPU usage high (**94 %**), may cause services to
> slow down or malfunction. Suggested action: Upgrade specs or adjust service
> deployment."

Der Vorschlag von Zeabur ist woertlich das, was oben im Zielbild steht:
groessere Maschine **oder** die Verteilung aendern.

**Wichtige Korrektur der Rangfolge:** Auf *Server*-Ebene liegt der Speicher
stabil bei **35–45 %** von 8 GB — die 6646 MB waren die *Container*-Spitze des
Malers, also kurz und nicht dauerhaft. Der echte Dauerengpass ist die **CPU**.

Daraus folgt fuer die Reihenfolge:

1. **CPU zuerst** — `OMP_NUM_THREADS` (gratis), weniger Schritte, oder der
   zweite Server aus Schritt 1.
2. **Speicher danach** — bfloat16 ist weiter richtig, aber nicht dringend.

Nebenbefund: Der **Plattenplatz waechst** von ~20 % auf ~30 % im 24-Stunden-
Fenster. Ursache sind vermutlich die Modelldateien unter `/tmp/hf`, seit Neuem
zusaetzlich die GFPGAN-Gewichte. Nicht akut, aber beobachten.

**Server-Alerts sind nicht nutzbar:** *Monitoring → Set Up Alerts* verlangt den
**Pro-Plan (19 $/Monat)** — nicht den Dev-Plan. „Alerts: Disabled" bleibt also
stehen. Ein externer Gratis-Wachhund (UptimeRobot) leistet dasselbe von aussen
und kostet nichts.

## STAND DER UMSETZUNG (2026-08-13)

**Erledigt und bestaetigt:**
- `smejj-bild-maler` → *Settings → Scheduled Automatic Restart* auf
  **11:00 UTC = 04:00 Pazifik** gestellt. Zeabur meldete „Successfully updated
  auto restart settings". Das entschaerft das Speicherleck taeglich.
- `smejj-control` → *Settings → Health Check*: **HTTP**, Port `web (8080)`,
  Pfad **`/api/health`**. Zeabur meldete „Update health check successfully".
  Damit wird der still haengende Control-Server endlich erkannt und automatisch
  neu gestartet — die seit dem 11.08. offene Forderung.
  **Zwei Fallen dabei umgangen:** Zeabur schlaegt **TCP** vor (nutzlos, weil
  ein haengender Prozess den Port offen haelt), und der Standardpfad **`/`**
  waere ebenfalls nutzlos, weil der Control-Server auf jedem unbekannten Pfad
  die SPA mit HTTP 200 ausliefert (gemessen: `/gibtesnicht-xyz` → 200).
  Nur `/api/health` liefert echtes JSON `{"ok":true,…}`.
- `smejj-chat-bridge` → Health Check **HTTP**, Port `port-8080`, Pfad
  **`/health`**. Nach Neuladen der Seite gegengeprueft, steht.
- `brueckenwaechter` → Health Check **HTTP**, Port `web (8080)`, Pfad
  **`/health`**.
- Server-Verlaengerung: **war bereits an** („Auto-renew enabled", 6 $/Monat,
  naechste Verlaengerung 26.08.2026). Nicht angefasst.

**Bewusst OHNE Health Check gelassen — und warum das wichtig ist:**
`smejj-bild-maler` und `smejj-video-worker` haben zwar beide einen
`/health`-Pfad, aber sie sind genau die Dienste, die **minutenlang rechnen**
(Video ~135 s, Bild-Maler mit bekannter Ereignisschleifen-Blockade, deren Fix
laut Memory `smejj-video-erzeugung-stufe3` noch auf seinen Deploy wartet).
Antwortet `/health` waehrend eines echten Auftrags nicht rechtzeitig, zaehlt
Zeabur das als Fehlschlag — und *Automatic Restart After Crashes Attempts*
steht auf **5**, danach wird der Dienst **suspendiert**. Eine Sonde wuerde hier
also gesunde, lange Auftraege abwuergen. Erst nach dem Maler-Deploy und mit
gemessener `/health`-Antwortzeit waehrend eines Laufs nachruesten.

**Blockiert — Gratis-Stufe reicht nicht:**
Die Resource Limits (CPU 1400 m / Memory 3500 Mi eingetragen) liessen sich
**nicht speichern**: Zeabur antwortete *„Upgrade needed — You should upgrade to
a paid plan to perform this action."* Das Feature heisst in der Preisliste
„Customize service resource limits … so a single service can't crowd out the
others" und ist genau das, was hier gebraucht wird.

**Kosten dafuer:** Zeabur **Dev, 5 $/Monat, 14 Tage kostenlos testen**. Damit
laege die Gesamtrechnung bei 6 $ (Server) + 5 $ (Plan) = **11 $/Monat** — immer
noch weniger als ein zweiter Server, und es loest das eigentliche Problem.

**Bewusst NICHT angefasst:** `Watch Paths` steht bei bild-maler auf `*` (darum
der Bau-Sturm). Ich habe es stehen lassen, weil laut Memory
`smejj-video-erzeugung-stufe3` ein **Deploy des Maler-Fixes noch aussteht** —
ein enger gesetzter Watch-Path koennte diesen Deploy verschlucken. Erst nach
dem Deploy anfassen.

### Schritt 0 — kostet nichts, heute machbar
1. **Leichen wegraeumen:** `smejj-remote-browser` steht auf „Image Pull
   Failed", dazu der Dienst `kaputt-image-remote-br…`. Beide belegen Platz und
   verrauschen jede Uebersicht.
2. **CPU-/RAM-Grenzen pro Dienst** in Zeabur setzen. Ohne Grenzen kann ein
   Dienst heute die ganze Kiste nehmen. Das ist der billigste Einzelgewinn.
3. **Externer Wachhund** (UptimeRobot gratis, 5-Minuten-Takt) auf control und
   bridge — genau der stille Tod aus dem Befund oben wird sonst nicht bemerkt.

### Schritt 1 — zweiter Server, ~+6 bis 12 $/Monat
Einen zweiten Zeabur-Server anlegen und **alles Warme** dorthin umziehen:
`video-worker`, `bild-maler`, `voice-piper`, `maus-engine`. Danach hat der
Chat die zwei Kerne fuer sich allein.

Bei 6 $/Monat Grundpreis ist das die mit Abstand guenstigste Stabilitaets-
massnahme, die es hier gibt.

### Schritt 2 — Warteschlange einziehen
Erst danach lohnt sie sich richtig, weil dann echte Verteilung moeglich ist.
Ergebnis: Auftraege ueberleben Deploys, Fortschritt wird sichtbar, Worker sind
vermehrbar.

### Schritt 3 — wachsen, wenn noetig
Ab dann ist Skalieren langweilig: mehr Warm-Server dazu, wenn Video/Bild
langsamer werden. Autopiloten bekommen erst dann einen eigenen kleinen Server,
wenn sie den Heiss-Server messbar stoeren — nicht vorher.

## Was bewusst NICHT vorgeschlagen wird

- **Kein Cloudflare** — Betreiber-Entscheidung vom 2026-08-13.
- **Keine eigene GPU.** Bild und Video laufen ueber fremde APIs; eine GPU zu
  mieten waere ein Vielfaches der heutigen 6 $ und loest kein aktuelles Problem.
- **Kein Kubernetes-Ausbau.** Zeabur macht K3s schon; mehr Schichten heissen
  mehr Teile, die nachts kaputtgehen koennen.
- **Kein Umzug weg von Zeabur.** 6 $/Monat mit Git-Bau ist gut. Das Problem ist
  die Aufteilung, nicht der Anbieter.
