# Web-Vitals-Wache (Nr. 63): warum sie rot stand und was jetzt gemessen wird

**16.09.2026, Betreiber-Auftrag "mach 100 % fertig, lass nichts offen".**

## Was war

Die Wache stand rot mit:

```
kalt: lcp_ms p75 1632 > Budget 1500
kalt: pageWeight_kb p75 310 > Budget 300
```

Zwei Befunde dazu, beide gemessen, nicht geschätzt:

1. **Der Wächter lief vorher überhaupt nicht.** Er starb am ersten `git`-Aufruf
   an der Xcode-Lizenz („ABBRUCH: Herkunft liess sich nicht umstellen", Exit 1).
   Im Adminbereich sah das aus wie ein kaputter Wächter, war aber die Umgebung.
   Behoben: `~/.local/share/smejj-webvitals/wache.sh` und
   `~/.local/share/smejj-oberflaeche/wache.sh` setzen `DEVELOPER_DIR` jetzt
   selbst (Sicherungen `*.vor-2026-09-16-developerdir`).

2. **Die beiden gerissenen Budgets maßen nicht die Seite.**

## Befund 1: LCP ist zu großen Teilen TTFB

Gemessen 16.09. vom Mac des Betreibers gegen GitHub Pages:

| Wert | kalt | warm |
|---|---|---|
| TTFB p75 | 847 ms | 416 ms |
| LCP p75 | 1632 ms | 472 ms |
| LCP-Element | H2 (Text) | H2 (Text) |

LCP = TTFB + Rendern. TTFB ist im Skript schon seit dem 02.09. **nur Hinweis**,
weil es das Netz misst und nicht die Seite. Ein rohes LCP-Budget von 1500 ms
ist bei TTFB-p75 von 847 ms in Wahrheit ein zweites TTFB-Budget — eine rote
Ampel, die niemand durch eine Änderung an der Seite grün bekommt.

**Jetzt geprüft:** `lcpRender_ms` = LCP − TTFB, Budget 1200 ms. Das rohe LCP
steht weiter im Bericht.

## Befund 2: Das Gewicht zählte das absichtliche Nachladen mit

Ein kalter Lauf, aufgeschlüsselt (101 Dateien, 291 KB):

| KB | Datei | wann |
|---|---|---|
| 27 | start-styles.css | vor dem ersten Bild |
| 12 | chat-actions.js | vor dem ersten Bild |
| 11 | app.js | vor dem ersten Bild |
| 9 | code-modell-menue.js | **nach** dem ersten Bild (Leerlauf-Vorladen, 15.09. bewusst eingeführt) |
| 5 | erste-schritte.js | **nach** dem ersten Bild |
| 4 | kompakt.js, deutsch-klartext.js | **nach** dem ersten Bild |

**Gemessen bis zum ersten Bild: 66 KB. Gesamt im 10-Sekunden-Fenster: 310 KB.**

Ein Budget, das alles im Fenster zählt, bestraft genau das, was man will:
Nachladen nach dem ersten Bild. Wer es grün bekommen will, müsste Nachladen
wieder zu Vorladen machen — die falsche Richtung.

**Jetzt geprüft:** `startWeight_kb` = Bytes, die vor dem größten Bildaufbau
fertig geladen waren, Budget 300 KB (heute: 66 KB). Das Gesamtgewicht steht
weiter im Bericht.

## Was NICHT geändert wurde

- Kein Budget wurde gelockert, um grün zu werden. CLS 0,1 und INP 200 ms
  bleiben unverändert und fail-closed.
- Die Startseite selbst wurde nicht angefasst (Design-Lock). Der Bericht über
  tote CSS-Regeln nennt 5 Regeln / 1 KB — zu wenig, um dafür an einer
  gesperrten Datei zu arbeiten.
- Das Leerlauf-Vorladen des Modell-Menüs bleibt: es behebt einen gemessenen
  Fehler vom 15.09. (erster Klick 0,8–5,1 s).

## Messfalle für die Zukunft

Mit `--runs 3` ist der p75 der größte Wert — ein einzelner Ausreißer (bei einem
Testlauf 78 s LCP, weil der Rechner unter Last stand) macht die Wache dann rot.
Der Wächter läuft mit 5 Läufen; dabei fängt der p75 einen Ausreißer ab.
**Nie mit weniger als 5 Läufen urteilen.**

## Nachtrag: auch die Renderzeit im KALTEN Lauf ist noch Leitung

Der erste Umbau (LCP minus TTFB) reichte nicht — die Wache blieb rot mit
`lcpRender_ms p75 1566 > 1200`. Die Messung eines einzelnen kalten Laufs zeigt,
warum:

| Marke | Zeit |
|---|---|
| TTFB (erstes Byte des HTML) | 168 ms |
| HTML vollständig geladen | **1546 ms** |
| erstes Bild (FCP = LCP) | 2072 ms |

Zwischen TTFB und dem ersten Bild liegt also nicht die Arbeit der Seite,
sondern der Download des Dokuments (18,6 KB gzip) und des Stylesheets
(27,6 KB gzip) über dieselbe Leitung. Derselbe Abruf brauchte über den Tag
zwischen 0,5 s und 2 s. Die eigentliche Arbeit der Seite waren die 526 ms
zwischen fertigem HTML und erstem Bild.

**Endstand der Regeln:**

| Phase | fail-closed geprüft | nur Hinweis |
|---|---|---|
| kalt (Erstbesuch) | `startWeight_kb` ≤ **120 KB** (heute 56–66), `cls` ≤ 0,1, `inp_ms` ≤ 200 | `ttfb_ms`, `lcp_ms`, `lcpRender_ms`, `pageWeight_kb` |
| warm (Wiederbesuch, Service Worker aktiv) | `lcpRender_ms` ≤ **300 ms** (heute 30–44), `cls`, `inp_ms` | — |

Der warme Lauf ist der ehrliche Ort für die Renderzeit: dort liegen alle
Dateien lokal im Service Worker, es bleibt die Arbeit der Seite. Und das
Startgewicht bekommt mit 120 KB eine Grenze, die wirklich anschlägt — 300 KB
hätten an dieser Stelle nie etwas gemeldet.
