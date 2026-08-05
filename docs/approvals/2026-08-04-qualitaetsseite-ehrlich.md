# Freigabe-Nachweis — Qualitätsseite ehrlich machen, 2026-08-04

## Wortlaut des Betreibers

```
FREIGABE — Qualitätsseite ehrlich machen, 2026-08-04

Ich gebe frei: verlauf.html und verlauf.js so ändern, dass das Alter der
Messdaten deutlich sichtbar ist und das Sechs-Stunden-Versprechen entfällt,
solange kein Zeitplan läuft. Ist die letzte Messung älter als 24 Stunden,
soll die Seite das klar sagen statt ein altes Urteil als aktuell auszugeben.
Cache-Versionssprung in sw.js und Nachziehen der Sperren sind eingeschlossen.

Betreiber smejj.com
```

```
Außerdem freigegeben: einen frischen Prüflauf gegen die Live-Kette fahren
und das Ergebnis auf der Qualitätsseite veröffentlichen.
```

## Befund 1 — fünf Tage alte Zahlen als aktueller Zustand

`verlauf.html` versprach „Alle sechs Stunden läuft ein Prüflauf". Einen Zeitplan
gibt es nicht: die Messwerte werden von Hand eingespielt, zuletzt am 31.07. Die
Seite meldete Besuchern trotzdem *„76,47 % — die Kette liefert **gerade** nicht
die geforderte Qualität"*, mit Daten vom 30.07. und aus der Zeit vor mehreren
Korrekturen.

Umgesetzt: `istVeraltet` ab 24 Stunden (fail-closed — ein unlesbares Datum gilt
als alt). Bei alten Daten steht das ALTER zuerst, das Urteil in der
Vergangenheit („Damals gemessen"), und `data-stufe="veraltet"` statt der
Bewertung. Die Standzeile nennt Zeitpunkt UND Alter.

## Befund 2 — gemessen wurde die Reserve, nicht der Nutzerweg

Fiel erst beim Messen auf: Der erste Prüflauf ergab **0 %**, weil
`DEFAULT_CHAT_ENDPOINT` auf die Zeabur-**Reserve** zeigte und die mit HTTP 401
antwortete. `public/config.js` führt seit dem 2026-08-03 die Salad-Brücke als
primär. Der Trainings-Loop, der diese Seite speist, nutzt dieselbe Funktion —
auch er maß den falschen Weg.

Zwei Tests halten die Adresse jetzt gegen `public/config.js`.

## Frische Messung, 14 Fälle je 3 Durchgänge gegen die echte Kette

| | vorher (30.07.) | jetzt |
|---|---|---|
| Punktzahl | 76,47 % | **98,04 %** |
| Kritische Verstöße | 3 | **0** |
| Urteil | blocked | **passed** |
| Bestanden | 11 von 14 | 13 von 14 |
| Wackelig | — | 1 (`halluzination-unbekannte-zahl`, 1/3) |
| p95 | 311 ms | 20 059 ms (Budget 45 000 ms) |

## Abnahme live

- `smejj.com/verlauf.html` zeigt „Letzte Messung 98,04 % — alle Budgets
  eingehalten" und „Stand der Daten: 05.08. 01:09 UTC — vor 20 Minuten".
- Der wackelige Fall wird benannt, nicht verschwiegen.
- Gegen das AUSGELIEFERTE Modul geprüft: mit +5 Tagen liefert es
  `stufe="veraltet"` und „Diese Zahlen sind vor 5 Tagen gemessen worden und
  sagen nichts über den heutigen Zustand."
- `check:all` grün, 1591 Zusicherungen. sw v219 -> v220, danach `public/sw.js`
  byte-identisch mit `https://smejj.com/sw.js`; Start-Lock neu eingefroren.

## Merkregeln

- **EIN VERSPRECHEN OHNE MECHANIK IST EINE LÜGE MIT VERZÖGERUNG.** „Alle sechs
  Stunden" stand vier Wochen auf der Seite, ohne dass es je einen Zeitplan gab.
- **EIN MESSWEG, DER NICHT DER NUTZERWEG IST, MISST EIN ANDERES PRODUKT.** Der
  Prüflauf zeigte auf die Reserve. Aufgefallen ist es nur, weil die Reserve
  ausfiel — wäre sie erreichbar gewesen, hätte niemand es gemerkt.
- **TESTS AUF TAGESWERTE REISSEN BEI JEDER MESSUNG.** Vier Tests hingen an
  „76,47 %". Sie prüfen jetzt die Zusage statt des Tagesstands.

## Offen

Es gibt weiterhin keinen Zeitplan. Die Seite sagt das jetzt ehrlich. Ein
automatischer Läufer bräuchte Zugangsdaten im Container und ist damit eine
eigene Entscheidung des Betreibers.
