# evals/ — Modell-Eval-Suiten für smejj.com

Hier liegt die Entscheidungsgrundlage für jede Modellwahl. Kein Bauchgefühl, keine
Herstellerzahlen: echte smejj.com-Fälle, maschinell prüfbare Erwartungen, gemessene
Antwortzeiten.

## Wozu

Wenn ein neues Modell erscheint (Kimi K3, GLM-Nachfolger, was auch immer), lautet die
einzige Frage: **Ist es für smejj.com messbar besser als das, was heute läuft?**
Diese Suite beantwortet sie in etwa drei Minuten statt in einer Diskussion.

## Aufbau

```text
evals/
  README.md                        # diese Datei
  suites/
    smejj-chat-core-v1.json        # 14 Fälle: Namensregel, Architektur, Kosten,
                                   # Codequalität, JSON-Ausgabe, Sicherheit,
                                   # Schutz-Locks, Halluzinationsneigung
```

Code dazu:

| Datei | Aufgabe |
| --- | --- |
| `src/evaluation/evalSuite.js` | Suite laden, validieren, Inhalts-Hash |
| `src/evaluation/evalScoring.js` | Antworten gegen Erwartungen bewerten |
| `src/evaluation/evalReport.js` | Budgets, Regressionsvergleich, Urteil |
| `src/evaluation/evalTransport.js` | Weg zum Modell (Live-Kette oder BYOK) |
| `scripts/evaluation/run_model_eval.mjs` | Kommandozeile |
| `tests/model-eval.test.mjs` | 25 Tests, ohne Netz und ohne Schlüssel |

## Benutzung

Trockenlauf — prüft die Suite, ruft kein Modell auf, kostet nichts:

```bash
npm run eval:models
```

Echter Lauf gegen die Live-Kette von smejj.com (keine lokalen Schlüssel nötig):

```bash
node scripts/evaluation/run_model_eval.mjs --live --model glm-5-2 --delay-ms 6000
```

Ohne `--model` antwortet die schnelle Spur der Brücke; mit `--model glm-5-2` wird
die Spur umgangen und der Control-Router mit GLM-5.2 gemessen. `--delay-ms 6000`
hält die öffentliche Begrenzung von 12 Anfragen pro Minute ein.

Ein noch nicht live geschaltetes Modell direkt über BYOK prüfen:

```bash
node scripts/evaluation/run_model_eval.mjs --live --transport provider --model kimi-k2-7
```

Ohne konfigurierten Zugang bricht dieser Weg fail-closed ab — es wird nichts geraten.

## Berichte

Jeder Lauf schreibt `docs/benchmarks/modeleval-<suite>-<modell>-<datum>.json`.
Der Bericht enthält **nie** Modellantworten im Klartext, nur Kennzahlen:
Punktzahl, Antwortzeiten, fehlgeschlagene Erwartungstypen und den Beleg, welches
Backend tatsächlich geantwortet hat.

Ein neuer Lauf wird automatisch mit dem letzten Lauf desselben Modells **und
derselben Suite-Fassung** verglichen. Zwei Läufe mit unterschiedlichen Erwartungen
sind nicht vergleichbar und werden nie gegeneinandergestellt.

## Regeln für neue Fälle

1. Ein Fall bildet etwas ab, das smejj.com wirklich können muss — kein Quizwissen.
2. Jeder Fall hat mindestens eine Erwartung mit `critical: true`. Eine verletzte
   kritische Erwartung setzt den Fall auf null und kann nicht ausgeglichen werden.
3. Muster (`matches`, `not_matches`) prüfen die Groß- und Kleinschreibung mit.
   Genau darauf beruht die Namensregel. Wer das nicht braucht, setzt `ignoreCase`.
4. Nach jeder Änderung an einer Suite muss der Inhalts-Hash neu berechnet werden,
   sonst wird sie fail-closed abgelehnt.

## Bekannte Grenze

Die Bewertung arbeitet mit Stichwörtern und Mustern, nicht mit einem Modell als
Richter. Das ist bewusst so: reproduzierbar, kostenlos, replaybar. Der Preis ist
Sprödigkeit — eine sachlich richtige Antwort kann an einer zu engen Wortliste
scheitern.

Verbindliche Regel dazu: Eine Wortliste wird **nur dann** erweitert, wenn die
betroffene Antwort von Hand gelesen und als sachlich richtig bestätigt wurde. Die
Erweiterung wird im Änderungsverlauf begründet. Erwartungen aufzuweichen, damit ein
Modell besser dasteht, ist ein Verstoß gegen die Kernprinzipien von smejj.com.
