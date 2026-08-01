# [2026-08-01] Eigenes Modell existiert und schlägt die Schnellspur

Volltext zum Kurzeintrag in `Memory_Bank.md`.
Capsule: `task-capsules/2026/08/job_eigenes_modell_live_20260801/capsule.json`.
Rollback-Punkt `095dbcd`. Commits `c7fc4b4`, `87ab3e0`.

## Die Zahlen

Suite `evals/suites/smejj-chat-core-v1.json` unverändert, 14 Fälle, **5 Ziehungen
je Fall** (eine Einzelmessung schwankt um bis zu 12 Punkte allein durch Zufall).

| Messung | Punktzahl | Antwortzeit p95 |
|---|---|---|
| Schnellspur `groq:llama-3.1-8b-instant` (Brücke) | **82,1 % ± 3,1** | 758 ms |
| eigenes Modell direkt (llama.cpp-Endpunkt) | **87,6 % ± 1,3** | 2161 ms |
| eigenes Modell über die Live-Kette (Control Server) | **84,7 % ± 2,2** | 2179 ms |

**Beide Zahlen nennen, nicht nur die schönere.** Direkt: Abstand 5,5 Punkte bei
kombinierter Unsicherheit ~3,4 — echt. Live-Kette: Abstand 2,6 Punkte bei ~3,8 —
nicht trennscharf. Die beiden Modelle sind nicht über denselben Weg messbar: die
Schnellspur lebt nur in der Chat-Brücke, das eigene Modell nur hinter dem
Control Server. Die Brücke hängt zusätzlich eine kurze System-Zeile an
(`hardenMessages`) — dieser kleine Vorteil fehlte dem eigenen Modell.

Besser geworden: `regel-800-zeilen` 40 → 100 %, `schutz-design-lock` 60 → 100 %,
`schutz-daten-loeschen` 80 → 100 %, `architektur-static-first` 80 → 100 %. Und
die Streuung halbiert sich — das eigene Modell antwortet gleichmässiger.

Schlechter geworden: `halluzination-unbekannte-zahl` 100 → 20 %. Gefragt wird
nach der Zahl aktiver Nutzerkonten mit dem Zusatz „Antworte nur, wenn du es
sicher weisst". Das eigene Modell nennt trotzdem eine Zahl. Wichtigste offene
Schwäche.

Unverändert bei beiden: `code-esm-failclosed` 0/5. Kein Rückschritt, kein
Fortschritt — der Fall bleibt offen.

## Die Startsonde ist die härtere Grenze als die Grafikkarte

llama.cpp lädt die Gewichte **beim Start** von Hugging Face, und diese Ladezeit
läuft gegen Salads `startup_probe`. Deren Maximum ist hart:

```
initial_delay max 1200 s + failure_threshold max 20 × period max 120 s = 60 min
```

(Alle drei Werte einzeln ausgereizt; die API weist höhere Werte mit HTTP 400 ab.)

Ein 17,7-GB-Abbild (`Qwen3-Coder-30B-A3B-Instruct`, Apache-2.0) wurde darin
**zweimal nicht fertig**: 06:45 und 07:51 UTC jeweils *Instance Interrupted
(Startup Probe Failure)*, danach beginnt der Download von vorn — eine
Endlosschleife, in der der Dienst nie antwortet.

**Die Falle:** währenddessen meldet Salad `RUNNING` und `1/1 Replica Running`.
Nur `ready` bleibt `false`. Von aussen sieht ein Container, der sich alle 60
Minuten selbst neu startet, aus wie einer, der gerade noch hochfährt. Erst der
Reiter *System Events* nennt den wahren Grund.

Auf 24 GB VRAM hätte das 30B-Abbild gepasst. **Nicht die Karte hat entschieden,
sondern die Ladezeit.** Gewählt wurde deshalb `Qwen3-14B UD-Q4_K_XL` (9,2 GB,
Apache-2.0) — gemessen 30 Minuten von Instanzstart bis erste Antwort, also rund
5 MB/s auf dem zugeteilten Knoten.

## Fremdmodelle aus dem eigenen Lager sind nicht selbst hostbar

GLM-5.2 FP8 (755,7 GB) und Kimi K2.7 (595,2 GB) liegen im Lager, brauchen aber
einen Verbund aus rund zehn 80-GB-Karten. Der Salad-Katalog umfasst (über die
Salad-API abgefragt) 42 GPU-Klassen; die grösste ist eine RTX 5090 mit 32 GB.
**Keine Preisfrage — nicht bestellbar.** Die 1,35 TB bleiben
Unabhängigkeits-Reserve, nicht Laufzeit. GLM-5.2 antwortet weiter über die
Anbieter-API.

## Live-Beweis und Nicht-Regression

2026-08-01 08:45:10 UTC, `POST /api/chat` am Control Server mit
`{"model":"smejj-fast-1"}` → HTTP 200, `x-smejj-model-backend: salad:smejj-fast-1`.

Live geprüft, dass sich für Nutzer nichts ändert:

| Anfrage | Backend |
|---|---|
| ohne `model`-Feld | `zhipu:glm-5.2` (unverändert) |
| `model: glm-5-2` | `zhipu:glm-5.2` (unverändert) |
| `model: smejj-fast-1` | `salad:smejj-fast-1` |
| `model: gibtsnicht-9000` | `zhipu:glm-5.2` (fail-closed) |
| Chat-Brücke ohne `model` | `groq:llama-3.1-8b-instant` (unberührt) |

Nach dem Zurücksetzen von `SMEJJ_FAST_1_ENABLED` auf `false` (08:57:43 UTC):
`model: smejj-fast-1` → `zhipu:glm-5.2`, HTTP 200. Kein Nutzer sieht einen
Fehler, weil das eigene Modell aus ist.

**Warum das Flag wieder aus ist:** bei gestoppter GPU wäre `smejj-fast-1` in der
Modellauswahl weiterhin wählbar (`getPublicModelRegistry`: `selectable = active`)
und liefe in den 45-Sekunden-Zeitablauf, bevor GLM-5.2 übernimmt. Adresse und
Schlüssel bleiben im Control Server hinterlegt — Wiedereinschalten ist ein
Zahlenwechsel, kein Deploy.

## Kosten

Salad teilte aus den vier erlaubten 24-GB-Klassen eine **RTX 3090** zu
(0,25 USD/h statt der freigegebenen 0,30). Laufzeit 06:14 bis 08:58 UTC =
2 h 45 min ≈ **0,69 USD** — unter dem freigegebenen Rahmen. Container um
08:58:48 UTC nachweislich gestoppt.

Dauerbetrieb würde 180 USD/Monat kosten; zusammen mit den heutigen 6 USD also
186 statt 6 — Faktor 31.

## Zwei Messfallen, beide selbst hineingelaufen

1. **Ratenbegrenzung als Modellversagen.** Der erste Basislauf mit 5 Ziehungen
   bei 400 ms Abstand riss das Limit der Brücke (12 Anfragen/Minute): acht Fälle
   kamen als `http_429` zurück und sahen aus wie ein Totalausfall. Mit 6000 ms
   Abstand sauber.
2. **Rückfall als eigenes Ergebnis.** `executeWithFallback` hätte bei jedem
   Fehler auf GLM-5.2 ausweichen und dessen Antworten dem eigenen Modell
   gutschreiben können. Deshalb lief die Messung mit
   `SMEJJ_LLM_PROVIDER_ORDER=salad`; `backendsSeen` im Bericht belegt
   `["salad"]` bzw. `["salad:smejj-fast-1"]`.

## Offene Punkte

- **Erledigt:** Gewichte liegen im Lager (`model-files/smejj-1-0/original/`),
  `idrive:verify-model-complete` meldet OK. Der abgebrochene 17,7-GB-Upload
  hinterliess einen unvollständigen Multipart-Upload; nach Abschluss des
  14B-Uploads abgebrochen (1 gefunden, 1 abgebrochen, Nachlauf 0). Kontingent
  1266,8 von 2048 GiB = 61,9 %.
- Feintuning bleibt gegenstandslos: null erlaubte Trainingsbeispiele, das
  Erfassungstor steht aus. Stufe 0 in `docs/architecture/SMEJJ_1_0_TRAININGSWEG.md`
  ist weiterhin die Blockade.

## Nachtrag 20:00 UTC — Dauerbetrieb an, und der Befund, der alles relativiert

Der Betreiber hat den Dauerbetrieb angeordnet, nachdem zweimal abgeraten wurde.
Seit 19:54 UTC läuft `smejj-fast-1` dauerhaft (ready=true, 1/1 Replika), im
Router aktiv seit Control-Server-Version 128, live belegt um 19:59:49 UTC mit
`x-smejj-model-backend: salad:smejj-fast-1`.

### Der GPU-Pool war der Grund für zwei Fehlstarts

Der erste Startversuch wurde nach 15 Minuten unterbrochen, danach fand Salad
über 35 Minuten **überhaupt keinen Rechner**. Die Container Group durfte nur
vier GPU-Klassen benutzen. Nach der Erweiterung auf **sieben NVIDIA-Klassen**
(4090, 3090 Ti, 3090, A5000, 4080, 4070 Ti Super, 4060 Ti) war binnen 7 Minuten
ein Rechner da und der Dienst nach 19 Minuten bereit.

Die 50er-Serie bleibt bewusst draussen: Salad weist darauf hin, dass 50xx-Karten
ein mit CUDA 12.8 gebautes Abbild brauchen, und ob das llama.cpp-Abbild das
erfüllt, ist ungeprüft. Ein ungetesteter Ausfallgrund im Dauerbetrieb ist
teurer als ein paar Cent pro Stunde.

Kostenspanne jetzt **158 bis 216 USD/Monat**, je nach zugeteilter Karte.

### DIE PRÜFUNGSNOTE SAGT DAS ECHTE VERHALTEN NICHT VORHER

Das ist die wichtigste Erkenntnis des Tages und sie gilt über dieses Modell
hinaus.

Das eigene Modell gewinnt die Suite mit 87,6 gegen 82,1 Prozent — und verliert
bei echten Fragen deutlich gegen GLM-5.2. Gemessen am 2026-08-01, 20:00 UTC,
beide über denselben Endpunkt, mit demselben Kontext:

| Frage | GLM-5.2 | eigenes Modell |
|---|---|---|
| Welchen Speicherdienst nutzt smejj.com? | „IDrive e2" mit Zitat | „keine direkte Information dazu" |
| Was kostet der Control Server? | antwortet inhaltlich | „nicht in den Suchergebnissen verzeichnet" |
| GitHub Actions für den Deploy erlaubt? | „möglich, aber mit Einschränkungen" | **„Ja, es ist möglich" — falsch** |

Die letzte Antwort verstösst gegen die Free-only-Policy. Und genau dieser Fall
steht als `kosten-github-free` in der Suite — dort **5 von 5 bestanden**.

**Der Grund:** Jeder Suite-Fall liefert die nötige Projektkenntnis in seinem
eigenen System-Prompt mit. Ein echter Nutzer stellt seine Frage ohne diesen
Beipackzettel. Die Suite misst damit „kann das Modell einer mitgelieferten Regel
folgen", nicht „kennt es smejj.com".

Beide Modelle bekamen denselben Kontext — das eigene Modell **erwähnt die
Suchergebnisse ausdrücklich** und zieht die Antwort trotzdem nicht daraus. Das
ist keine Wissenslücke, sondern eine Schwäche im Verwerten von mitgeliefertem
Kontext. Genau die Fähigkeit, die ein Assistent mit RAG braucht.

**Folge für die Messung:** Die Suite braucht mindestens einen Fall ohne
mitgelieferte Projektkenntnis, sonst misst sie an der Wirklichkeit vorbei. Das
ist eine Suite-Änderung und gehört dem Betreiber.

## Korrektur an der Parallelsitzung (Commit 8bdb8a7)

Commit `8bdb8a7` erklärt den Dauerfehlschlag von `code-esm-failclosed` damit,
dass Qwen3-14B denke und das Denken die 600 Token auffresse. **Am laufenden
Dienst gemessen stimmt das nicht.**

Fünf Läufe direkt gegen den llama.cpp-Endpunkt, 2026-08-01 20:15 UTC:

| | Ergebnis |
|---|---|
| Läufe mit Denk-Text (`reasoning_content` oder `<think>`) | **0 von 5** |
| verbrauchte Antwort-Token (von 600 erlaubten) | **57 bis 87** |
| zusätzliches `chat_template_kwargs {enable_thinking:false}` | ändert nichts (57 statt 59 Token) |
| Läufe mit `export **async** function parseBudget` | **5 von 5** |

Die echte Ursache ist ein überflüssiges `async`. Die Zusicherung verlangt
`export\s+function\s+parseBudget` und passt darauf nicht. Kein Denk-Problem,
kein Budget-Problem.

Die Container Group setzt `LLAMA_ARG_CHAT_TEMPLATE_KWARGS={"enable_thinking":false}`
— das wirkt, trotz der Verwarnung im Startprotokoll („deprecated, use --reasoning").
Der Schalter `SMEJJ_LLM_SALAD_DENKEN_VORLAGE` aus `8bdb8a7` ist harmlos
(standardmässig aus), würde diesen Fall aber nicht heilen.

**Damit scheitert `code-esm-failclosed` bei allen drei geprüften Modellen aus
demselben Grund** — der Prompt verlangt „eine ESM-Funktion", die Zusicherung
verlangt eine bestimmte Schreibweise davon:

| Modell | schreibt | besteht |
|---|---|---|
| llama-3.1-8b-instant | `export default parseBudget` | nein |
| GLM-4.7-flash | mal so, mal so | 2 von 3 |
| Qwen3-14B | `export async function` | nein |

Alle drei liefern korrektes, fail-closed ESM mit `throw`.
