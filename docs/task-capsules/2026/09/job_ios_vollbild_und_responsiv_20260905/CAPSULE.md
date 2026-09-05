# Task Capsule — iPhone-Vollbild und A-bis-Z-Responsivtest

**job-id:** job_ios_vollbild_und_responsiv_20260905
**Datum:** 2026-09-05, Nacht
**Auftrag (Betreiber, Wortlaut):** "in meine iPhone PWA ist nicht hundert Prozent Vollbild
und ganz unten ist frei ... mach endlich fertig ... komplette App von a bis z checken und
muss hundert Prozent responsive sein."

## Ziel
Der schwarze Streifen über dem Home-Balken der iPhone-PWA muss weg, und die gesamte App
muss auf Telefon, Tablet und im Querformat ohne Fehler laufen.

## Ausgangslage
Drei Anläufe in der Nacht blieben wirkungslos, weil sie auf Vermutungen beruhten:
Gefälle auf dem Wurzelelement, festes Hintergrundelement mit `inset: 0`, PWA neu zum
Home-Bildschirm hinzufügen. Gemessen wurde nie — auf dem Mac fehlte Xcode und damit
jeder iPhone-Simulator.

## Vorgehen
Statt weiter zu raten wurde eine **Messanzeige in die App gebaut** (nur im Vollbild am
Telefon sichtbar): Gerätehöhe, Seitenhöhe, beide Safe-Areas, dazu ein eingefärbter
Streifen an der Unterkante. Ein Screenshot des Betreibers lieferte die Wahrheit.

## Befund (gemessen am Gerät, iPhone X-Klasse)
```
S812  V759  D53  SAoben53  SAunten29  ST1  DPR3
```
`screen.height` 812 pt gegen `innerHeight` 759 pt — es fehlen **53 pt, exakt die obere
Safe-Area**. iOS meldet der PWA im Vollbild mit `black-translucent` einen um die
Statusleiste **verkürzten Layout-Viewport**, obwohl der Inhalt oben schon bei 0 beginnt.
Damit endet jedes Element, das sich am Viewport ausrichtet, 53 pt über der Gerätekante —
auch `position: fixed; inset: 0`, denn `fixed` hängt am Layout-Viewport, nicht am Schirm.
Das erklärt rückwirkend alle drei Fehlversuche.

## Umsetzung
* `public/mobil-composer.css`: Der Grund liegt auf `body::before` und reicht mit
  **120 px Überstand auf jeder Seite** über den Viewport hinaus. Ein fest positioniertes
  Element erzeugt keinen Scrollbalken; der Überstand kostet nichts und deckt jede
  Geräteklasse. Gemessen am emulierten iPhone: 1052 px Grundhöhe bei 812 px Viewport.
* `public/code-modell-menue.js`: Die Code-Ansicht begrüßte mit der **Anmelde-Adresse**
  ("Was steht als Nächstes an, name@gmail.com?"), weil das Profil-Dock ohne hinterlegten
  Namen darauf zurückfällt. Eine E-Mail ist keine Anrede — jetzt wird neutral begrüßt.
  Im Dock selbst bleibt die Adresse (dort zeigt sie das angemeldete Konto).
* Messanzeige nach der Auswertung wieder vollständig entfernt.

## Prüfung
* `check:all` EXIT 0, 687 Frontend-Tests grün.
* Neuer Wächter in `tests/code-modell-menue.test.mjs` (Anrede-Regel, mit Gegenprobe).
* **A-bis-Z-Responsivtest** am emulierten Gerät, 13 Ansichten je Breite:
  * 320 x 568 (iPhone SE): 0 px Überlauf, keine Klickfläche unter 28 pt
  * 375 x 812 (iPhone): 0 px Überlauf, keine zu kleinen Knöpfe
  * 768 x 1024 (Tablet): 0 px Überlauf
  * 812 x 375 (Querformat): 0 px Überlauf, Eingabefeld und Senden-Knopf im Bild
* Live-Klickpfade: Chat rechnet korrekt (17 × 23 = 391), Suche lädt ihr Modul und liefert
  Treffer, Anhang-Menü öffnet mit 11 Einträgen.
* Alle **neun Schutz-Sperren grün** nach dem Stempeln.

## Benchmark (smejj.com, frischer Aufruf)
| Wert | Messung | Budget |
|---|---|---|
| TTFB | 506 ms | 200 ms — über Budget, entspricht der bekannten Netz-Umlaufzeit des Betreibers |
| DOM interaktiv | 700 ms | — |
| Laden vollständig | 1051 ms | 2000 ms ✓ |
| CLS | 0 | 0,1 ✓ |
| Dateien / Gewicht | 101 / 724 KB | Startgewicht-Wächter grün |

## Auslieferung
design-v11 → Klon (GitHub Pages) → Bauzweig (Zeabur), Service-Worker v760 bis v763.
Live bestätigt: Überstand in der ausgelieferten CSS, Gruß-Fix im ausgelieferten Modul,
Messanzeige liefert 404.

## Nebenbefund, offen
Xcode 26.6 ist installiert, aber die Lizenz ist unbestätigt. Das blockiert nicht nur den
Simulator, sondern auch `/usr/bin/git` — jeder Testlauf stirbt mit "You have not agreed
to the Xcode license agreements". Ausweg ohne Passwort:
`/Library/Developer/CommandLineTools/usr/bin/git` als PATH-Präfix. Dauerhaft löst es nur
`sudo xcodebuild -license accept`; die Doppelklick-Datei "smejj.com Xcode
freischalten.command" liegt bereit. Danach kann die Sitzung iPhone-Simulatoren selbst
starten und muss nie wieder am Screenshot raten.

## Lehre
Bei Geräte-Eigenheiten nicht raten, sondern eine Messung ins Produkt bauen. Vier Runden
Raten kosteten mehr Zeit als die eine Messanzeige.
