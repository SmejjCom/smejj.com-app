# [2026-08-02] A-bis-Z-Pruefung von smejj.com — der 502 ist weg, drei Befunde bleiben

Vollstaendiger Live-Test im angemeldeten Browser plus Messung gegen den Endpunkt,
den die Startseite wirklich aufruft.

## Was einwandfrei laeuft

| Bereich | Ergebnis |
| --- | --- |
| 16 oeffentliche Seiten | alle HTTP 200, 0,13–0,21 s |
| 13 geladene Dateien | alle vorhanden, kein toter Verweis |
| Konsolenfehler | keine |
| Verlauf, Menue, Navigation | funktionieren |
| Barrierefreiheit | alle 35 Bedienelemente benannt |

Web-Vitals (5 Laeufe, headless): TTFB 28 ms, LCP 124 ms, CLS 0, INP 56 ms,
Seitengewicht 289 KB. Alle Budgets eingehalten; das Gewicht liegt mit 289 von
300 KB knapp darunter und verdient Beobachtung.

## Behoben: der Coding-Totalausfall

Der 502 vom Vortag ist weg. `SMEJJ_MODEL_DEFAULT` steht jetzt auf `kimi-k2-7`,
und GLM-5.2 meldet zusaetzlich wieder `ready`. Im Browser liefert eine
Coding-Aufgabe jetzt Plan plus sauberen unified diff mit korrektem
`export function parseBudget` — inhaltlich auf dem erwarteten Niveau.

## Befund 1 — Der Messweg ist nicht der Nutzerweg (Kernproblem)

```
/api/chat   x-smejj-bridge: chat-fast-lane      groq:llama-3.1-8b-instant
/api/agent  x-smejj-bridge: multi-model-router  zhipu:glm-4.7-flash
```

Der Eval-Harness misst `/api/chat`, die Startseite ruft `/api/agent`. Zwei
verschiedene Modelle, zwei verschiedene Qualitaeten — jede Note aus dem Harness
sagt darum wenig ueber das, was ein Nutzer erlebt.

Gemessen ueber `/api/chat` (14 Faelle je 3 Ziehungen, Endpunkt der Salad-Bridge):
**81,7 % ± 3,0**, erster Token p95 1219 ms, 3 kritische Verstoesse.
Alle 42 Aufrufe wurden von `groq:llama-3.1-8b-instant` beantwortet — auch die
Coding-Faelle.

## Befund 2 — Die Schnellspur beantwortet Coding auf /api/chat

`streamFastLane()` lehnt Coding ab, sobald eine tiefe Spur existiert
(`public/chat-bridge.js` Zeile 271), und `isCodingTask()` erkennt den Fall
nachweislich korrekt (lokal geprueft). Live passiert es trotzdem: der
Antwortkopf sagt `chat-fast-lane` bei einer Coding-Frage. Der ausgelieferte
Stand der Salad-Bridge weicht also vom Repository ab — die Weiche greift dort
nicht.

Folge: `code-esm-failclosed` faellt 0 von 3 durch, weil ein 8B-Modell die
geforderte Form nicht liefert.

## Befund 3 — Kimi K2.7 wird auf keinem Weg benutzt

`SMEJJ_LLM_ZHIPU_MODEL_CODING=glm-4.7-flash` schickt das Coding-Profil an ein
kleines GLM. Gleichzeitig ist `kimi-k2.7-code` vollstaendig eingerichtet, aktiv
und gesund (HTTP 200 im Direkttest) — das agentische Coding-Modell liegt
ungenutzt daneben. Auf `/api/agent` antwortete `zhipu:glm-4.7-flash` und riss
dieselbe Zusicherung.

`regel-800-zeilen` faellt aus einem anderen Grund 0 von 3 durch: reines
Projektwissen. Genau dafuer liegt die RAG-Schicht fertig bereit
([RAG_PROJEKTWISSEN.md](../architecture/RAG_PROJEKTWISSEN.md), gemessen
88,2 % -> 96,1 %), sie ist auf der Salad-Bridge nur nicht ausgeliefert.

## Merkregel

**Ein Antwortkopf schlaegt jede Annahme ueber das Routing.**
`x-smejj-model-backend` und `x-smejj-bridge` haben hier drei Irrtuemer in
Minuten aufgeloest, die aus dem Quelltext allein nicht sichtbar waren: welche
Bridge laeuft, welche Spur greift, welches Modell wirklich antwortet. Vor jeder
Routing-Diagnose zuerst die Koepfe lesen, nicht den Code.
