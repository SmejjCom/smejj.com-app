# Task Capsule — Grenznahe Chats entlasten, bevor sie kippen (job_verlauf_vorsorge_20260823)

## Auftrag
Betreiber, 2026-08-23, Live-Test auf `/code`: Toast *„Ein Chat ist zu gross und
wurde NICHT gesichert — er bleibt nur auf diesem Geraet."* Auftrag: messen, wie
viele Chats über der Grenze liegen, und einen Weg bauen, bei dem große Chats
trotzdem überleben.

## Erste Messung — und der Fehler darin

Gemessen am echten Speicher (`chats/<konto>/` auf IDrive e2, nur gelesen):

| | Betreiber-Konto | zweites Konto |
|---|---|---|
| Chats auf dem Server | 118 | 16 |
| Median | 6,7 KB | 3,3 KB |
| über 512 KB | **0** | 0 |
| zwischen 256–512 KB | 4 | 0 |

**Diese Messung war am falschen Ort.** Serverseitig sieht man nur, was
durchgekommen ist — das Problem ist definitionsgemäß das, was fehlt. Eine
Parallelsitzung maß am selben Tag **lokal im Browser** und fand zehn Chats über
der Grenze, bis 1938 KB. Sie fand außerdem, was mir entging: es gibt **zwei**
Grenzen.

| Größe | Server-Antwort |
|---|---|
| 512 KB – 1 MB | HTTP 400 `chat_zu_gross` |
| über 1 MB | HTTP 413 „Request too large" — der Body-Leser bricht ab, **bevor** die Chat-Prüfung läuft |

Sechs der zehn lagen über 1 MB, also im blinden Fleck. Meine erste Lösung hätte
die vier kleinen gerettet und die sechs großen liegen lassen. Sie wurde deshalb
**verworfen statt gemergt** (gesichert auf `claude/verworfen-doppelarbeit-20260823`);
ein Merge hätte die live laufende Rettung ersetzt und den 413-Fall wieder
aufgerissen.

## Was übrig blieb — und umgesetzt wurde

Zwei Lücken, die auch die vorhandene Lösung nicht schloss:

**1. Die Rettung ist rein reaktiv.** `brauchtRettung()` verlangt *zu groß* UND
*hat Medien*. Vier Chats (466 / 293 / 280 / 263 KB) liegen **unter** der Grenze,
werden also nie abgewiesen und nie gerettet — obwohl jeder ein vollständiges
Video im `raw`-Feld trägt (bei 466,3 KB entfallen 464,6 KB darauf). Sie sind
heute nicht kaputt, aber eine weitere Nachricht kippt sie.

→ `VORSORGE_BYTES = 128 KB` für den **Bestandslauf**. Der Sende-Weg bleibt bei
der echten Grenze: dort ist die Frage „kommt dieser Chat durch?", und die
beantwortet allein `MAX_CHAT_BYTES`. 128 KB statt 0, damit nicht jedes kleine
Vorschaubild einen Upload auslöst.

**2. `MAX_CHAT_BYTES` stand an zwei Stellen ohne Verbindung** (Browser-Modul und
Server-Modul). Laufen sie auseinander, winkt der Client genau die Chats durch,
die der Server abweist. Ein Import über die Grenze ist nicht möglich → ein Test
vergleicht sie jetzt direkt gegeneinander.

## Ship-Loop Runde 2 — der Live-Test fand einen echten Fehler

Nach dem ersten Deploy (sw v656): Die Vorsorge lief, der Chat schrumpfte im
Browser **466 KB → 2,0 KB** (0 data:-URLs, 2 ausgelagerte Adressen) — und auf
dem Server blieb er **466,6 KB**. Vier Chats, kein einziger übernommen.

Ursache in `speichereChat` (chatSyncStore.js): bei **gleichem** `updatedAt` wird
übersprungen (`server_ist_neuer`). Bei den zu großen Chats fiel das nie auf — die
lagen serverseitig gar nicht oder nur älter. Die grenznahen liegen dort mit
exakt demselben Zeitstempel; der geheilte Stand wurde jedes Mal still verworfen.

Die Wurzel: `updatedAt` trägt **zwei Bedeutungen**, die hier auseinanderfallen —
„zuletzt vom Nutzer bearbeitet" (danach sortiert der Verlauf) und „zuletzt
geändert" (danach entscheidet der Sync). Eine Rettung ändert das Zweite, nicht
das Erste. Meine ursprüngliche Begründung, `updatedAt` unberührt zu lassen, war
für die Sortierung richtig und für den Sync falsch.

→ `naechsterZeitstempel()`: **eine Millisekunde**. Der Sync sieht einen neueren
Stand, die Sortierung bleibt (die Nachbarn liegen Stunden bis Tage entfernt).
Bewusst **kein** `new Date()` — das wäre ein Sprung von Tagen und höbe einen
alten Chat an die Spitze der Liste, obwohl niemand ihn angefasst hat. Und nur,
wenn wirklich etwas ersetzt wurde.

## Ergebnis, live gemessen

| | vor der Arbeit | danach |
|---|---|---|
| Summe aller Chats des Kontos | 3.968,3 KB | **2.952,3 KB** (−1.016 KB) |
| größter Chat | 466,6 KB | **280,1 KB** |
| über 256 KB | 4 | **1** |
| Median | 6,6 KB | 6,1 KB |

Der geheilte Chat im Browser geöffnet: **Video vollständig geladen**
(640×640, 4 s, `readyState` 4) bei 2 KB Chatgröße. Alle drei ausgelagerten
Videos per `GET /api/chat-medien` abrufbar (HTTP 200, `video/mp4`).

Kein Toast auf `/` und `/code`. Keine Konsolenfehler.

**Die vier verbleibenden Chats über 128 KB** (191 / 190 / 132 / 128 KB) wurden
vom Lauf geprüft und zu Recht in Ruhe gelassen: **0 data:-URLs**, 10 bis 23
Nachrichten — echter Text. Genau die Zusage „ein Chat aus reinem Text wäre durch
Auslagern keinen Deut kleiner".

## Benchmark (Live, smejj.com, angemeldet)

| Messwert | Budget | gemessen |
|---|---|---|
| TTFB | < 200 ms | **2 ms** |
| LCP | < 1.500 ms | **80 ms** |
| CLS | < 0,1 | **0** |
| DOMContentLoaded | — | 85 ms |

## Tests
28 Rettungs-Tests (8 neu), 619 Frontend-Tests, 226 Charta, 226 Control-Server —
alle grün. Neu darunter ein Test gegen die **echte** Serverfunktion
`konfliktSieger`: `"gleich"` war der Fehler, mit dem angehobenen Zeitstempel
`"neu"`.

## Offen
`chat_1786659168789_zeyjod` (280,1 KB) liegt serverseitig unter einer **fremden
Kontokennung** und fehlt lokal — er gehört zu den 5 Chats, die der Abgleich als
„andere Kontokennung" ausblendet (Altbestand der alten Kennungsregel). Ohne
lokalen Zugriff nicht heilbar; kein Datenverlust, nur nicht entlastet.

## Rollback
`rollback/vor-vorsorge-20260823` → `c2c2ca66`.
Frontend-Repo: Commit vor `d1614b5`.

## Marken und Auslieferung
`chat-medien-rettung.js?v=5`, `chat-store.js?v=b60`, `sw` **v655 → v657**
(beide Male gegen LIVE gemessen, nicht gegen den Arbeitsbaum — Parallelsitzungen
hatten Nummern vergeben). Start-Lock zweimal mit Betreiber-Freigabe neu
eingefroren; beide Male geprüft: **0 geänderte Zeilen ohne `?v=` oder
`CACHE_NAME`**, Manifest 34 Dateien vorher wie nachher.
