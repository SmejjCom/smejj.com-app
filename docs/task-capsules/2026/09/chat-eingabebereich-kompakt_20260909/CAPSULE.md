# Task Capsule — chat-eingabebereich-kompakt_20260909

Datum: 2026-09-09
Auftrag: Betreiber (Wof Kadavanich) — „Bitte optimiere den gesamten unteren
Chat-Eingabebereich professionell nach aktuellen UI/UX-Standards": Eingabefeld ganz
unten, Bereich kompakter, Leerraum oberhalb entfernen, ChatGPT als Vorbild, responsive
auf Desktop/Tablet/Mobile/iOS/Android, und ausdruecklich: „Analysiere zuerst die
komplette DOM-/Component-Struktur und finde die tatsaechliche Ursache fuer den
Leerraum. Entferne die Ursache sauber im Layout-System und vermeide unnoetige
Workarounds, negative Margins oder harte Positionswerte."
Status: abgeschlossen, live verifiziert (smejj.com auf smejj-shell-v828)

## Befund — die Ursache war meine eigene Annahme

Zuerst die Struktur gemessen statt geraten (Browser, 375x812, gefuellter Chat):

```
.home-feed   display:grid, grid-template-rows: minmax(0,1fr) auto
  #startLog      -> 1fr, scrollt selbst
  .prompt-glass  -> auto, position:relative
```

Das Layout war bereits das richtige Muster. Das Eingabefeld ist ein **Geschwister im
Raster**, kein schwebendes Dock — es liegt nie ueber dem Verlauf. Unter dem Verlauf ist
darum nichts freizuhalten.

Mein `padding-bottom:132px` aus der Runde vom 08.09. (`public/mobil-dock.js`) beruhte
auf der gegenteiligen Annahme. Es hielt keinen Platz frei, es verschenkte ihn: der
letzte Eintrag stand 81 px ueber dem Feld statt 16 px.

## Umsetzung

Ein Wert. Keine negativen Raender, keine festen Positionswerte, keine neue Regel.

| Datei | Aenderung |
|---|---|
| `public/mobil-dock.js` | `padding-bottom: 132px` -> `14px`, mit der Messung als Begruendung im Kommentar |
| `tests/mobil-dock.test.mjs` | prueft jetzt die SACHE (Abstand 8..24 px) statt der ZAHL |

Die Feldhoehe von 102 px bleibt und ist bereits das Minimum: 44 Textzeile + 6 Umbruch +
44 Knopfzeile + 8 Polster. `flex-wrap:wrap` bricht die Knopfzeile bewusst um —
dasselbe Muster wie ChatGPT. Kompakter ginge nur unter die 44-px-Grenze fuer
Touch-Ziele, und die ist Betreiber-Vorgabe.

## Messung (live, nach dem Deploy)

Abstand letzte Aktionsleiste bis Eingabefeld, bei gescrolltem Verlauf:

| Lage | vorher | nachher | Feld -> Unterkante |
|---|---|---|---|
| iPhone 375x812 | 81 px | **28 px** | 0 px |
| Android 412x915 | — | 28 px | 0 px |
| Tablet 768x1024 | — | 20 px | 0 px |
| Desktop 1280x900 | — | 20 px | 0 px |

Alle fuenf Aktionsknoepfe (Kopieren, Vorlesen, Gut, Schlecht, Mehr) per
`elementFromPoint` als oberstes Element bestaetigt — der kritische Punkt, denn genau
dafuer war das grosse Polster einmal gedacht.

Auf Tablet und Desktop galt die Regel nie (das Modul laedt nur bis 600 px Breite);
dort war das Quell-CSS mit 6 px Polster von Anfang an richtig.

## Zwei Nebenbefunde, beide repariert

1. **`app-helfer.js` war live 404**, obwohl der Precache sie erwartet. Die Datei
   entstand mit `b440e43a` (app.js unter die Hausgrenze), wurde aber nie ausgeliefert.
   Kein Live-Schaden, weil das ausgelieferte `app.js` den Import noch nicht hat — aber
   sobald es nachzieht, waere die App offline tot. Ausgeliefert in zwei Schritten:
   erst die Datei (HTTP 200 nachgemessen), dann die Precache-Zeile. `cache.addAll`
   bricht beim ersten 404 ab; umgekehrt haette sich der Service Worker nicht mehr
   installieren koennen.
2. **`tests/schutz-echtheit.test.mjs`** benutzte seit `741072d0` `fileURLToPath` ohne
   Import — vier Proben starben mit `ReferenceError`, statt den Waechter zu pruefen.
   Jetzt 6 von 7 gruen (die siebte misst die Live-Auslieferung).

## Sperren

`check:favicon-lock` war rot und blockierte jeden Stempel. Nachgemessen: **kein Favicon
veraendert** — 9 Dateien byte-identisch, Web-Manifest-Ikonen identisch,
Generatorquellen identisch. Es fehlte nur `public/auth/index.html` im Register, eine
Seite, die nach dem Einfrieren (23.08.) entstand und deren Verweise mit allen 43
registrierten Seiten zeichengenau uebereinstimmen. Auf ausdrueckliche Nachfrage gab
der Betreiber „Ja, nachtragen" frei.

Chirurgisch nachgetragen statt neu eingefroren: so bleiben `frozenAt` und der
urspruengliche Betreiber-Wortlaut erhalten, und der Nachtrag steht mit Grund und
Freigabe unter `amendments`. Ein Neu-Einfrieren haette beides ueberschrieben und die
Aenderung unsichtbar gemacht.

## Lehren

* **Ein Test, der einen Messwert festschreibt, versiegelt den naechsten Irrtum mit.**
  Mein alter Test verlangte woertlich `padding-bottom:132px` — er haette die Korrektur
  fuer immer als Regression gemeldet. Eigenschaften einfrieren, nicht Zahlen.
* **Erst die Struktur messen, dann urteilen.** Vier Runden Pixelschieben waeren
  vermeidbar gewesen, wenn ich am 08.09. `grid-template-rows` und `position` gelesen
  haette statt zu vermuten, das Feld schwebe.
* **Reihenfolge beim Precache ist Physik, nicht Stil.** Datei zuerst, Zeile danach.

## Nicht erledigt

Die Gegenprobe im iOS-Simulator konnte nur die abgemeldete Werbeseite zeigen (Vollbild
oben intakt, kein Balken unten, Feld buendig). Der Chat-Bereich in der installierten
App braucht eine Anmeldung; Zugangsdaten gebe ich nicht ein. Der Service-Worker-Sprung
auf v828 ist live, die App holt die neue Fassung beim naechsten Start.
