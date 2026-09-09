# smejj.com — Live-Befunde, deren Begründung aus dem Code ausgelagert wurde

Diese Datei nimmt Begründungen auf, die im Quelltext zu viel Platz brauchten. Der Code
verweist hierher. Nichts davon ist Beiwerk — jeder Eintrag erklärt, **warum** eine Zeile
so aussieht, wie sie aussieht.

## Code-Ansicht: eigener Tab-Titel (`<h2 class="visually-hidden">Code</h2>`)

**Befund live 2026-09-06.** `view-title.js` nimmt den Seitentitel aus der ersten `h1`/`h2`
der Ansicht. In der Code-Ansicht gab es keine — der Tab hieß dort weiter
„smejj.com — KI- und Code-Assistent", also genau wie die Startseite.

Folgen: Bei mehreren offenen Tabs, im Verlauf und in Lesezeichen war nicht erkennbar, wo
man ist. Screenreader sagten beim Wechsel nichts an — dieselbe Lücke, die W2-05 für alle
anderen Ansichten bereits geschlossen hatte.

Die Überschrift ist visuell versteckt: das Mockup bleibt unverändert.

## Startseite: `apple-mobile-web-app-status-bar-style` steht auf `black-translucent`

**Nicht auf `black` oder `default` ändern.** Im iPhone-Simulator am 08.09. alle drei Modi
gemessen (fixed inset:0 / 100dvh / safe-area unten):

| Meta-Wert | Fläche | oben | unten |
|---|---|---|---|
| `black-translucent` | 812 von 874 | **Vollbild** | 62 pt Schwarz |
| `default` | 874 | Statusleistenbalken | nichts |
| `black` | 874 | Statusleistenbalken | nichts |

Gewählt ist Vollbild oben (Betreiber-Anweisung). Der Streifen unten wird unsichtbar
gemacht statt bekämpft: der Grund läuft auf reines Schwarz aus, der Rahmen bekommt unten
weder Strich noch Schein, das Dock schließt bündig ab. Die vollständige Messung und die
Umsetzung stehen in `public/mobil-dock.js`.

**iOS friert den Modus beim Installieren ein** — bestehende Installationen müssen einmal
neu zum Home-Bildschirm hinzugefügt werden.

## Live-Browser: warum `oeffneImLiveBrowser()` eigens danach fragt

**Live gemessen 2026-08-18, mehrfach im Kreis gelaufen.** `navigate()` wählt den Modus nach
der **Seite**, nicht nach dem Zweck. Ist eine Seite einbettbar — und das sind die meisten —,
landet sie als gewöhnlicher iframe im Panel. Für einen Menschen ist das genau richtig:
volles JavaScript, schnell, kein Serverumweg. Für die Maus ist es wertlos: ein fremder
iframe lässt sich nicht auslesen, es entsteht keine `sessionId`, und der freie Lauf wartet
auf eine Sitzung, die nie kommt.

Solange `/api/browser/fetch` ausgefallen war (404), fiel alles auf den Live-Browser zurück
und es sah aus, als funktioniere die Kette. Als der Endpunkt zurückkam, verschwand die
Sitzung wieder — derselbe Fehler, neues Gesicht. Deshalb fragt die Maus jetzt selbst
danach, statt zu hoffen.
