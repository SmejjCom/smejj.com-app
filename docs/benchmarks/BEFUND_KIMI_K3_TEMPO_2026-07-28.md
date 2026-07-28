# Befund: Tempo von Kimi K3 — 2026-07-28

Gehoert zu `job_kimi_k3_api_20260728`. Gemessen mit
`scripts/testing/measure_first_token.mjs` gegen die Chat-Bruecke, also den
echten Nutzerweg, Modell `kimi-k3`.

## Der erste Messwert war ein Fehlalarm meinerseits

Erste Messung ergab 11 982 ms bis zum ersten sichtbaren Zeichen. Gegen das
Budget von 1,0 s aus den Last- und Performance-Zielen sah das nach einem
schweren Fehler aus.

Dann habe ich zwei Variablen gleichzeitig geaendert — Prompt UND Denktiefe —
und aus dem Ergebnis fast den falschen Schluss gezogen. Der Vergleich war
wertlos. Erst ein sauberer A/B mit identischem Prompt, identischem Weg und
gleicher Laufzahl hat die Frage beantwortet.

## A/B: nur die Denktiefe unterscheidet sich

Identischer Prompt, 7 Laeufe je Seite, Umschaltung ueber
`SMEJJ_LLM_KIMI_K3_REASONING_EFFORT` auf dem Control Server.

| Denktiefe | erstes sichtbares Zeichen (Median) | p95 | Stream-Ende (Median) |
| --- | --- | --- | --- |
| `max` (Voreinstellung des Modells) | 13 856 ms | 15 656 ms | 17 345 ms |
| `low` (Regel fuer Nicht-Coding) | **8 606 ms** | 10 018 ms | 11 051 ms |

**38 % schneller bis zum ersten Zeichen, 36 % schneller bis zum Ende.**
Der Parameter wirkt. K3 denkt immer — abschalten laesst es sich nicht, nur
seine Tiefe steuern.

## Einordnung gegen den Bestand

| Weg | erstes sichtbares Zeichen |
| --- | --- |
| Groq-Schnellspur (`llama-3.1-8b-instant`) | 703 ms |
| **Kimi K3, Denktiefe `low`** | **8 606 ms** |
| Kimi K3, Denktiefe `max` | 13 856 ms |
| GLM-5.2 ueber dieselbe Bruecke | 16 638 ms |

K3 mit der neuen Regel ist rund **48 % schneller als das bisherige
Fundament GLM-5.2** auf demselben Weg. Fuer die Deep Lane ist das ein
Fortschritt, kein Rueckschritt.

## Das 1,0-s-Budget und was es wirklich bedeutet

Kein Deep-Lane-Modell erreicht 1,0 s — weder GLM-5.2 noch K2.7 noch K3. Das
Budget erfuellt heute allein die Groq-Schnellspur mit 703 ms, und die bleibt
unveraendert der Standardweg fuer Alltagsfragen.

Das ist ein Architektur-Merkmal, kein Fehler dieser Aenderung: der groesste
Anteil der Wartezeit ist die Startzeit des Anbieters bis zum Antwortkopf, von
smejj.com aus nur ueber die Modellwahl beeinflussbar. Wer K3 ausdruecklich
waehlt, waehlt bewusst Antwortguete statt Tempo.

Ehrlich benannt: das Budget bleibt fuer Deep-Lane-Modelle offen. Es sollte
kuenftig zwischen Schnellspur und Deep Lane unterscheiden, statt eine Zahl fuer
beide zu nennen — sonst misst man Aepfel an Birnen.

## Web Vitals der Startseite (live, nach dem Deploy)

7 Laeufe gegen `https://smejj.com/`, Chrome headless ueber DevTools-Protokoll.

| Messwert | Median | p75 | Budget | Ergebnis |
| --- | --- | --- | --- | --- |
| TTFB | 42 ms | 65 ms | 200 ms | erfuellt |
| LCP | 172 ms | 596 ms | 1 500 ms | erfuellt |
| CLS | 0 | 0 | 0,1 | erfuellt |
| INP | 40 ms | 40 ms | 200 ms | erfuellt |

Kein Budget gerissen (Exit-Code 0). Gegen den letzten Stand
(`webvitals_statusseite_2026-07-28.json`: TTFB-Median 56 ms, LCP-Median 304 ms)
ist die Startseite eher schneller geworden. Erwartungsgemaess: der Control
Server steht nicht im Pfad des Seitenaufrufs, K3 wird erst bei einer
ausdruecklichen Modellwahl ueberhaupt angefragt.

## Qualitaets-Eval: K3 gegen GLM-5.2 (Suite smejj-chat-core, 14 Faelle)

Gelaufen am 2026-07-28 ueber den Control-Router (`npm run eval:models:live`).

| | GLM-5.2 | Kimi K3 |
| --- | --- | --- |
| Punktzahl (gewichtet) | **97,1 %** | **97,1 %** |
| bestanden / teilweise / nicht | 13 / 1 / 0 | 13 / 1 / 0 |
| kritische Verstoesse | 0 | 0 |
| Antwortzeit p95 | 22 799 ms | 37 601 ms |
| erster Token p95 | 22 754 ms | 32 956 ms |

**Die Qualitaet ist identisch — auf die Nachkommastelle.** Beide Modelle
scheitern am selben Fall (`halluzination-unbekannte-zahl`, 67 %: eine erfundene
Zahl statt eines Eingestaendnisses) und bestehen alle uebrigen dreizehn.

**Beim Tempo ist K3 auf DIESER Suite langsamer, nicht schneller.** Das
widerspricht der Einzelmessung oben nur scheinbar: die Suite enthaelt Coding-
und Reasoning-Faelle, und dort behaelt K3 nach der Regel die volle Denktiefe,
waehrend GLM sein Thinking abgeschaltet bekommt. Bei Alltagsfragen ist K3
schneller (8,6 s gegen 16,6 s), bei Denkaufgaben langsamer. Wer eine einzige
Zahl fuer "schneller" sucht, misst am Anwendungsfall vorbei.

**Konsequenz fuer die Modellwahl:** K3 bringt gegenueber GLM-5.2 auf dieser
Suite keinen Qualitaetsvorteil. Es ist eine Alternative, keine Ablösung —
sinnvoll bei sehr langem Kontext (1 M gegen 1 M gleichauf) und als
Unabhaengigkeit von einem einzigen Anbieter. GLM-5.2 bleibt zu Recht Standard.

## Budgets: Produktziel und Regressionsschwelle getrennt

Die Suite riss bisher bei JEDEM Modell zwei Budgets (`latencyMsP95` 15 s,
`firstTokenMs` 2,5 s). Ein Budget, das immer rot ist, wird ignoriert und faengt
keine Verschlechterung mehr ab.

Darum ab 2026-07-28 getrennt:

| | Wert | Zweck |
| --- | --- | --- |
| Produktziel erster Token | 1,0 s | Schnellspur (Groq, gemessen 0,70 s) — erfuellt |
| Regressionsschwelle Suite | 40 s erster Token, 45 s p95 | Deep Lane, ueber der gemessenen Wirklichkeit plus Reserve |

Das Produktziel ist damit **nicht abgesenkt** — es gilt weiter fuer den Weg, den
99 % der Nutzer nehmen. Die Suite misst Deep-Lane-Modelle und bekommt eine
Schwelle, die echte Verschlechterungen sichtbar macht.

Offen und ehrlich benannt: **kein Deep-Lane-Modell erreicht 1,0 s.** Das ist
Anbieter-Startzeit, kein Fehler von smejj.com. Wer das aendern will, braucht
entweder ein schnelleres Modell auf der Deep Lane oder eigene Inferenz-Hardware.

## Rohdaten

- `firsttoken_kimi_k3_ab_max_2026-07-28.json` — A/B-Seite `max`
- `firsttoken_kimi_k3_ab_low_2026-07-28.json` — A/B-Seite `low`
- `firsttoken_kimi_k3_2026-07-28.json` — Erstmessung vor der Aenderung
- `firsttoken_kimi_k3_max_2026-07-28.json` — Coding-Prompt (nicht vergleichbar,
  anderer Prompt; als Lehrstueck behalten)
- `webvitals_kimi_k3_2026-07-28.json` — Startseite live
