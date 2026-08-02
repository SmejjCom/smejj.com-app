# [2026-08-02] Kimi K2.7 gegen glm-4.7-flash am Coding-Fall — 3 von 3 gegen 1 von 3

Direkt gegen den Endpunkt gemessen, den die Startseite aufruft
(`/api/agent` der Salad-Bridge), je drei Ziehungen, Aufgabe wortgleich zum
Suite-Fall `code-esm-failclosed`.

| Modell (Antwortkopf) | bestanden |
| --- | --- |
| `zhipu:glm-4.7-flash` (heutiger Standard) | **1 von 3** |
| `kimi:kimi-k2.7-code` | **3 von 3** |

Geprueft wurde die geforderte Form `export function parseBudget` im
zusammengesetzten Antworttext.

## Eine Messfalle, in die ich zuerst selbst getappt bin

Der erste Durchlauf meldete **0 von 3 fuer beide Modelle** — und das war falsch.
Gesucht wurde im ROHEN SSE-Strom. Dort steht jedes Wort in einem eigenen
`data:`-Paket, der Antworttext ist nie zusammenhaengend, und ein `grep` findet
selbst eine perfekte Antwort nicht.

```
data: {"choices":[{"delta":{"content":"export"}}]}
data: {"choices":[{"delta":{"content":" function"}}]}
data: {"choices":[{"delta":{"content":" parseBudget"}}]}
```

**Merkregel: einen SSE-Strom immer erst zusammensetzen, dann pruefen.** Wer im
Rohstrom sucht, misst seine eigene Auswertung, nicht das Modell — und haette hier
beinahe ein gesundes Modell als kaputt gemeldet. Der Eval-Harness macht es
richtig (`readSseStream` in `src/evaluation/evalTransport.js`); nur meine
Kommandozeilen-Probe nicht.

Ein wiederverwendbarer Entpacker liegt als Muster in diesem Befund; fuer echte
Messungen bleibt der Harness die Referenz.

## Was daraus folgt

Der Coding-Weg laeuft heute auf `glm-4.7-flash`, waehrend `kimi-k2.7-code`
eingerichtet, aktiv und gesund danebenliegt und die Aufgabe dreimal von drei
loest. Die Umstellung braucht keinen neuen Zugang und keine neuen Kosten — der
Moonshot-Schluessel ist bereits hinterlegt (BYOK).

Wirksam wird sie mit dem naechsten Control-Release: Commit `228743b`
("keine Modellangabe ist keine Wahl") sorgt dafuer, dass `SMEJJ_MODEL_DEFAULT`
ueberhaupt greift — vorher machte der Markenname "smejj 1.0" jede Anfrage zu
einer ausdruecklichen GLM-Wahl.
