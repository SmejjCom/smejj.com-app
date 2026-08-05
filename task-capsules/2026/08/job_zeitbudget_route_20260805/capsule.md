# Task Capsule — Zeitbudget: die Route entscheidet mit (job_zeitbudget_route_20260805)

## Auftrag
Betreiber, 2026-08-05: „Untersuche und behebe, warum langsame Werkzeug-Antworten
abbrechen." Zuvor im Live-Test beobachtet: „Auf welchen Servern läuft smejj.com?"
endete mit **„Verbindung zum Server unterbrochen"**, obwohl der Server
weiterarbeitete; der zweite Versuch derselben Frage lieferte eine Antwort.

## Erste Hypothese — geprüft und VERWORFEN
Vermutung: Die Brücke schicke die Antwort-Kopfzeilen erst **nach** der
Werkzeugarbeit, weil `streamViaControl` erst nach `await fetch(...)` schreibt
(Zeile 297 nach Zeile 282). Dann hätte der Klient 30 s auf Kopfzeilen gewartet.

Gemessen am Control Server:
```
POST /api/agent  "Auf welchen Servern laeuft smejj.com?"
  erstes Byte 1,355 s   |   Gesamtantwort 23,851 s
POST /api/agent  "Welche Hauptstadt hat Italien?"
  erstes Byte 1,341 s
```
**Die Kopfzeilen sind schnell da.** Die Hypothese war falsch — und hätte zu
einem Umbau der Streaming-Kernlogik geführt, der nichts behoben hätte.

## Die echte Ursache — im Browser gemessen
Zeit bis zu den **Antwort-Kopfzeilen** der Brücke, mit gültigem Token:

| Frage | Zeit | Budget |
|---|---|---|
| „Welche Hauptstadt hat Italien?" | 852 ms | 6500 ms |
| „Auf welchen Servern läuft smejj.com?" | **4704 ms** | 6500 ms |

Nur **1,8 s Luft**. Die Latenz der Kette schwankte an diesem Tag zwischen
258 ms und 864 ms (drei `/health`-Messungen je Dienst) — genau dort riss es
sporadisch.

**Wurzel:** `firstByteBudgetFor` entschied ausschließlich am **Modellnamen** im
Anfragekörper (`DEEP_LANE_MODEL = /glm|kimi|cline/`). Der sagt aber, WELCHES
Modell antwortet — nicht, ob vorher gesucht und eine Seite geholt wird. Das
entscheidet die **Route**: `/api/agent` läuft über den Werkzeug-Pfad.

## Umsetzung (`public/ai/fetch-retry.js`, nicht unter Start-Lock)
- Neu `DEEP_LANE_ROUTE = /\/api\/agent(?:[/?#]|$)/`.
- `firstByteBudgetFor(init, tiefspurMs, url)` — dritter Parameter, **rückwärts-
  kompatibel**: ohne Adresse gilt unverändert der Modellname.
- Beide Aufrufstellen in `fetchStreamWithRetry` reichen die Zieladresse durch.
- `/api/chat` bleibt bei 6,5 s: Der schnelle Wechsel auf den Reserve-Server ist
  gewollt — eine tote Replika soll niemanden 15 s warten lassen.

## Tests (`tests/spurwahl-zeitbudget.test.mjs`, +5 Fälle → 18)
1. `/api/agent` bekommt das geduldige Budget, auch ohne Tiefspur-Modell
2. `/api/chat` bleibt schnell budgetiert
3. Pfadgrenze: `/api/agentur` ist NICHT die Agenten-Route; `?v=1` bleibt erkannt
4. **Mit Haupt- UND Reserve-Server wartet schon der ERSTE Versuch geduldig**
5. Gegenprobe: `/api/chat` mit zwei Endpunkten behält den schnellen Wechsel

**Ein Test war zunächst wertlos.** Der erste Entwurf prüfte mit *einem* Ziel —
dort ist der erste Versuch zugleich der letzte und war schon immer geduldig
(`letzterBudgetMs`). Er bestand deshalb auch gegen den alten Code. Erst mit
**zwei** Endpunkten, wie die App sie wirklich nutzt (`buildChatTargets`), zeigt
sich der Unterschied.

**Gegenbeweis:** 18/18 grün mit Fix, **3 rot** gegen `HEAD` davor.

## Auslieferung
Zwei Schritte, weil `ai/fetch-retry.js` cache-first im Precache liegt:

1. `a3acc2c` — Datei ausgeliefert. Erreichte nur **neue** Besucher.
2. `77c7951` — `sw.js` `CACHE_NAME` v223 → **v224**. Erst damit erreicht der Fix
   Bestandsnutzer. Start-Lock-Änderung, Freigabe des Betreibers im Wortlaut:
   > „Du darfst sw.js von CACHE_NAME v223 auf v224 heben."

Die Versionsnotiz musste **dreimal gekürzt** werden: `sw.js` steht bei 795
Zeilen Grundstand, die 800-Zeilen-Grenze lässt vier Zeilen Platz. Jetzt exakt 800.

## Live-Abnahme
| Prüfung | Ergebnis |
|---|---|
| `CACHE_NAME` live | `smejj-shell-v224` |
| Cache im Browser | nur `smejj-shell-v224` |
| geladenes Modul, `/api/agent` | **15000 ms** |
| geladenes Modul, `/api/chat` | 6500 ms |
| ohne Adresse | 6500 ms (rückwärtskompatibel) |
| echter Klickpfad | „Auf welchen Servern läuft smejj.com? Kurz." → Antwort kommt: „läuft auf **GitHub Pages** (Free only) … **IDrive e2** als Vault/Hauptspeicher" |

**Falle beim Nachmessen:** Direkt nach dem Deploy lieferte das geladene Modul
noch 6500 ms, obwohl die ausgelieferte Datei den Fix trug. Der Browser hielt die
alte Fassung in seiner Modul-Registry. Erst ein weiteres Neuladen (und ein
`?frisch=`-Import zur Kontrolle) zeigte 15000 ms.

## Prüfungen
`check:frontend` **390/390** · `check:precache-imports` OK (99 Module) ·
`check:llm-router` 214/214 · `guidelines` · `json` · `paths` · `security` ·
`favicon-lock` grün. **Start-Lock neu eingefroren** mit dem Betreiber-Wortlaut,
31 Dateien, Backup `backups/start-design-lock/2026-08-05T17-56-22-817Z/`.

## Eigene Fehler, offen gelegt
1. **Hypothese falsch** (siehe oben) — nur die Messung verhinderte den falschen Umbau.
2. **Zweimal falsch gegrept.** `grep -oE 'smejj-shell-v[0-9]+' | head -1` traf
   **Zeile 569, einen Kommentar**, statt der Konstante auf Zeile 582. Daraufhin
   habe ich die Versions-Tests erst richtig auf v223 gesetzt, dann fälschlich
   auf v221 „korrigiert", dann zurück. MERKREGEL: nach der **Konstante** suchen
   (`CACHE_NAME = "…"`), nie nach einer Zeichenkette, die auch im Fließtext steht.
3. **Erster Beweistest wertlos** (siehe oben).

## Nicht ausgeliefert — bewusst
Beim Abgleich `public/` gegen den ausgelieferten Stand wichen sechs Dateien ab.
Zwei davon wären schädlich gewesen:
- **`chat-bridge.js`** — im Repo Quellcode, live ein Bündel. Kopieren hätte die
  laufende Brücke zerstört. Bündel gegengeprüft: unberührt.
- **`maus-panel.js`** — importiert dynamisch `maus-auftrag.js`, das live 404 gibt.

## Rollback
Frontend `a3acc2c` (vor dem sw-Sprung), App-Repo `ce9ed39`.
Rückbau: `git revert` im Frontend-Repo, Push auf `main`.

## Nächster Schritt
Der Werkzeug-Pfad braucht **4,7 s bis zum ersten Byte** und rund 24 s bis zur
fertigen Antwort. Das Budget fängt das jetzt ab, macht die Antwort aber nicht
schneller. Wer die Wartezeit selbst angehen will: ein sichtbares Arbeitssignal
während der Werkzeugphase wäre der nächste Hebel — nicht mehr Timeout.
