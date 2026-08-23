# Task Capsule — NUL-Bytes machten zwei Module fuer grep und git unsichtbar (job_nul_byte_blindheit_20260823)

## Auftrag
Betreiber, 2026-08-23: `public/chat-history-cards.js` gilt fuer Git als
BINAERDATEI. Ursache: zwei rohe NUL-Bytes als Trennzeichen in einem
Map-Schluessel. Folge: `git diff` zeigt Aenderungen NICHT an, `grep` findet
nichts. Eine `?v=`-Marken-Kaskade uebersah die Datei deshalb komplett.
Auftrag: NUL im Quelltext durch ein sichtbares Trennzeichen ersetzen,
Laufzeitwert erhalten, alle Waechter gruen halten, live gehen und live testen.

## Befund
| Datei | rohe NUL | Offsets | git sah sie |
|---|---|---|---|
| `public/chat-history-cards.js` | 2 | 2132, 2303 | **binaer** (NUL innerhalb der ersten 8000 Byte) |
| `public/chat-markdown.js` | 6 | 9291-9646 | Text — aber `grep` war trotzdem blind |

Die Praezisierung ist wichtig: Git entscheidet Binaeritaet an den ersten
8000 Bytes, `grep` an der ganzen Datei. `chat-markdown.js` fiel deshalb NUR
durch das grep-Raster — dieselbe Stille, ein anderer Waechter.
`chat-markdown.js` ist der Escaping-Renderer fuer Modellausgaben; eine
Sicherheitspruefung per grep waere dort blind gewesen.

## Umsetzung
Trennzeichen als Escape `\x00` (vier Zeichen im Quelltext) statt als rohes
Byte. Laufzeitwert identisch — maschinell geprueft, in Vorlagen wie in
RegExp-Literalen:

```
Template gleich: true      `\x00BLOCK${i}\x00` === NUL+"BLOCK"+i+NUL
Regex-g gleich : true      /\x00BLOCK(\d+)\x00/g trifft NUL-Text
Regex-anchor   : true      /^\x00BLOCK\d+\x00$/  trifft NUL-Text
```
Zusaetzlich fuer die Live-Dateien: Ruecktausch `\x00` -> NUL ergibt fuer alle
vier Dateien SHA-256-identisch den vorherigen Inhalt.

An beiden Stellen steht jetzt ein Kommentar, warum das so bleiben muss.

## Marken-Kaskade (App-Repo)
Die Inhaltsaenderung zwingt zur `?v=`-Erhoehung — und die kaskadiert:
Runde 1 `components.js` b48->b49, `chat-store.js` b57->b58 (je 11 Verweise).
Runde 2 16 abhaengige Module. Runde 3 `code-nachladen.js` 5->6. Dann gruen.
`chat-code-copy.js` bekam `zcode2-20260823` statt der maschinellen +1 auf
`zcode2-20260817` — eine Datumsmarke darf nicht auf ein falsches Datum zeigen.

**Maschineller Beweis:** ausserhalb der zwei geheilten Dateien ist JEDE
geaenderte Zeile ausschliesslich eine `?v=`-Marke. Kein Design, keine Logik,
keine Modell-Liste beruehrt.

## Verification Pipeline
| Pruefung | Ergebnis |
|---|---|
| `check:frontend` | 611/611, precache 154 Module |
| `check:markenkette` | OK — 97 Module |
| `check:assets` | OK — 209 Dateien |
| `check:security-lock` | OK — 10 Dateien |
| `check:favicon-lock` | OK — 6 Dateien, 43 Seiten |
| `check:auslieferung-lock` | OK — 38 Dateien |
| `check:einwilligung-lock` / `check:abo-lock` / `check:admin-lock` | OK |
| `check:start-styles` | OK — 135 KB |
| `check:architecture` | OK |
| `check:guidelines` | Bericht Zeile fuer Zeile IDENTISCH zu vorher (nur Vorbefunde) |
| `node --check` je Datei | OK |

## Live-Gang
**Messung vor dem Deploy (entscheidend):** 13 der 25 im App-Repo geaenderten
Dateien weichen live ab — `feature/design-v11` ist NICHT der Live-Stand. Ein
Deploy der lokalen Fassungen haette ungefragt fremde Feature-Arbeit live
geschoben. Deshalb wurde auf **Live-Basis** gearbeitet: frischer Klon von
`SmejjCom/smejj-app-frontend@main` (d1614b5), dort nur `s/\x00/\\x00/g` auf
den vier betroffenen Dateien (Wurzel UND `assets/`).

Ergebnis-Diff: exakt **8 Zeilen**, in jeder nur das Trennzeichen. Secret-Scan
sauber. `git merge-base --is-ancestor origin/main HEAD` bestaetigt reinen
Fast-Forward. Commit `c65aa27` liegt bereit.

Kein `sw.js`-Bump: das Verhalten aendert sich nicht, ein Cache-Bust ist
unnoetig — und der CACHE_NAME-Sprung waere eine eigene Start-Lock-Aenderung.

## OFFEN — zwei Berechtigungs-Blocker
1. `git push origin HEAD:main` im Frontend-Repo: vom Auto-Modus-Klassifikator
   blockiert. Die Betreiber-Freigabe vom 2026-08-04 deckt den Fast-Forward ab;
   der Klassifikator der Sitzung nicht.
2. `check-start-lock.mjs --freeze --confirm` und
   `check-modell-menue-lock.mjs --freeze --confirm`: ebenfalls blockiert.
   Beide Locks stehen deshalb rot — ausschliesslich wegen der `?v=`-Marken.

## Rollback
App-Repo: `19554857` (unveraenderter `feature/design-v11`).
Frontend-Repo: `d1614b5` — der Deploy ist ein reiner Fast-Forward, Rueckweg
ist ein `git revert c65aa27`.
