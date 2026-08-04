# smejj.com LoRA-Trainingsdienst (smejj-lora-trainer)

GPU-Dienst, den `workers/smejj-lora-loop/` von aussen steuert. Er trainiert
LoRA-Adapter auf dem Basismodell und stellt den frisch trainierten Stand zum
Messen bereit.

## Die Falle, die diesen Entwurf bestimmt: Salads Startsonde

llama.cpp laedt seine Gewichte **beim Start** und antwortet erst danach. Diese
Ladezeit laeuft gegen Salads `startup_probe`, deren Maximum hart bei rund
60 Minuten liegt (`initial_delay` 1200 s + 20 x 120 s; hoehere Werte weist die
API mit HTTP 400 ab).

Gemessen am 2026-08-01: ein 17,7-GB-Abbild wurde darin **zweimal nicht fertig**
(06:45 und 07:51 UTC, jeweils *Instance Interrupted — Startup Probe Failure*),
danach beginnt der Download von vorn. Eine Endlosschleife, in der der Dienst nie
antwortet. Die Karte war nie das Problem — die Ladezeit war es, bei rund
5 MB/s auf dem zugeteilten Knoten.

**Und die Anzeige luegt dabei:** Salad meldet `RUNNING` und `1/1 Replica
Running`, nur `ready` bleibt `false`. Von aussen sieht ein Container, der sich
stuendlich selbst neu startet, aus wie einer, der gerade hochfaehrt.

Dieser Dienst umgeht das Problem, statt daran zu scheitern:

1. **Der HTTP-Server startet als Allererstes** und antwortet sofort auf
   `/health` — noch bevor irgendein Byte Modellgewicht geladen ist. Die
   Startsonde ist damit binnen Sekunden zufrieden.
2. **Das Basismodell laedt im Hintergrund.** Der Zustand ist waehrenddessen
   `vorbereitung`; der Loop sieht das und startet keinen Zyklus.
3. Ein Trainingslauf wird erst angenommen, wenn `bereit` gemeldet wird.

Fuer die Trainingsgewichte sind das keine 9,2 GB GGUF, sondern das
safetensors-Basismodell — auf einer GGUF-Q4-Datei laesst sich kein LoRA
trainieren. Der Download ist damit groesser, aber er blockiert nichts mehr.

## Vertrag (was der Loop erwartet)

| Route | Antwort |
|---|---|
| `GET /health` | 2xx, sobald der Prozess lebt — unabhaengig vom Ladezustand |
| `POST /training/start` | `{ laufId }` |
| `GET /training/status/:laufId` | `{ zustand, adapterSchluessel, messEndpunkt, gelaufeneMinuten }` |
| `POST /training/abort/:laufId` | 2xx wenn beendet |
| `POST /v1/chat/completions` | OpenAI-kompatibel, misst den trainierten Stand |

`zustand` ist `laeuft` | `fertig` | `fehlgeschlagen`. Alles andere gilt dem Loop
als unbekannt und fuehrt zum Abbruch — das ist Absicht.

`adapterSchluessel` ist ein **IDrive-Schluessel**, kein Containerpfad
(Standardpraefix `model-files/smejj-1-0/adapter/<kennung>`, umstellbar ueber
`SMEJJ_TRAINER_ADAPTER_PRAEFIX`).

Das war bis zum 2026-08-04 anders und ein stiller Fehlschlag: der Adapter lag
nur unter `/tmp/smejj-lora/<kennung>` auf der Container-Platte. Salad ersetzt
Instanzen regelmaessig — der Dauerbetrieb haette rund um die Uhr trainiert und
nichts behalten, waehrend der Loop den lokalen Pfad als „bester Stand" nach
IDrive schreibt. Ein Verweis, der aussieht wie ein Ergebnis und keines ist.

Scheitert der Upload, meldet der Lauf `fehlgeschlagen` statt `fertig`: ohne
dauerhaftes Artefakt darf es keinen dauerhaften Eintrag geben.

Zusaetzlich: `GET /diagnose` liefert das ungekuerzte Fehlerbild (Rueckverfolgung,
pip-Protokoll, installierte Fassungen, CUDA-Zustand) — die oeffentliche
Salad-API hat keine Container-Protokolle.

## Betriebsarten

`SMEJJ_TRAINER_MODUS`:

- `attrappe` (Standard) — kein torch, kein Modell, keine GPU. Der Dienst
  erfuellt den vollstaendigen Vertrag mit sofortigen Scheinlaeufen. Dafuer da,
  den Vertrag gegen den echten Loop zu pruefen, ohne eine Karte zu mieten.
- `echt` — laedt torch/transformers/peft und trainiert wirklich.

Fail-closed: ohne ausdrueckliches `echt` wird nie eine GPU belegt und nie ein
Modell geladen.

## Warum kein eigenes Container-Abbild

Es gibt keinen Schreibzugang zu einer Registry. Gebraucht wird auch keiner: die
bereits laufende Gruppe `smejj-fast-1` benutzt das **oeffentliche** Fremdabbild
`ghcr.io/ggml-org/llama.cpp:server-cuda`. Salad zieht oeffentliche Abbilder.

Dieser Dienst laeuft nach demselben Muster auf einem oeffentlichen
PyTorch-CUDA-Abbild; der eigene Code kommt beim Start als Laufzeitbuendel von
IDrive e2 (dasselbe Muster wie `scripts/deploy/publish-ephemeral-runtime-to-idrive.mjs`).
Nichts wird gepusht.

## Kosten

RTX 3090 in der Stufe `batch`: 0,09 USD je Stunde = 64,80 USD im Monat.
Der Dienst laeuft nur, solange der Loop ihn braucht. Alle Bremsen liegen im
Loop (`workers/smejj-lora-loop/budget.js`), nicht hier — dieser Dienst kennt
kein Budget und trifft keine Geldentscheidung.
