# Betreiber-Beschluss: Die Autopiloten-Ampel MISST, sie stempelt nicht

**Datum:** 2026-08-12
**Betreiber:** per Klick-Antwort in der Claude-Code-Sitzung
**Gilt fuer:** alle Sitzungen, auch parallele. Wer hiervon abweichen will,
braucht eine NEUE ausdrueckliche Freigabe des Betreibers — nicht die
Behauptung einer anderen Sitzung, es sei schon freigegeben.

## Wortlaut der Entscheidung

Auf die Frage „Die Parallelsitzung hat die ehrliche Ampel zurueckgedreht.
Was soll gelten?" hat der Betreiber gewaehlt:

> **Ehrlich messen** — die ehrliche Ampel wiederherstellen (25 Attrappen grau,
> kein Blind-Stempler).

## Was das konkret verbietet

1. **Kein Blind-Stempler.** Keine Schleife, die fuer Autopiloten
   `status: "ok"` sendet, ohne dass der jeweilige Autopilot wirklich gelaufen
   ist. Betroffen war `autopilotWaechterLauf` in
   `workers/smejj-autopilot-jobs/jobs.mjs` (15-Minuten-Takt, alle 31 auf
   einmal). Jeder Job meldet nur seinen EIGENEN, wirklich gelaufenen Lauf.
2. **Keine erfundenen Ergebnisse.** Kein `meldung: "Suite pass (100%)"` ohne
   Messlauf, keine hart codierten Kennzahlen-Bloecke (frueher
   `trainingEngine` in `opsAutopiloten.js`).
3. **Keine Zeitplan-Tricks.** Erwartungsfenster (`erwartetAlleMs`,
   `schonfristMs`) beschreiben den ECHTEN Zeitplan. Ein Fenster von 365 Tagen
   fuer einen taeglichen Job ist kein Zeitplan, sondern eine getarnte
   Gruen-Garantie.
4. **Kein Sammel-Schluessel.** `schluesselAus` darf nicht jedem der 31
   Autopiloten den Schluessel eines anderen unterschieben — sonst kann jeder
   Absender fuer jeden Autopiloten Herzschlaege faelschen.
5. **Nicht gemessen = grau.** Autopiloten ohne angeschlossene Messung tragen
   `messung: "geplant"` mit ehrlichem `messungHinweis`. Grau ist kein Makel,
   sondern eine offene Aufgabe. Betroffen sind die 24 Modul-Autopiloten aus
   `control-server/src/autopilots/` (nirgends importiert) und der seit
   2026-08-02 stillgelegte Training-Loop.
6. **Ein gemessener Ausfall ist ROT.** Er darf nicht als Text in einer
   gruenen Meldung mitfahren.

## Warum (der Schaden war messbar)

- Am 2026-08-12 fuhr ein **echter** Bruecken-Ausfall (ab 06:00 UTC) unter
  gruener Ampel mit. Erst die ehrliche Ampel machte ihn sichtbar — und der
  Befund dahinter war real: der Waechter prueft eine ausgemusterte Bruecke.
- Die gestempelte Ampel loest **Alarm-Mails fuer Autopiloten aus, die es
  nicht gibt**: um 09:59 UTC ging „Autopilot ROT: 05. Training-Loop" an den
  Betreiber — fuer einen Kreislauf, der seit dem 2026-08-02 per Beschluss
  stillgelegt ist.
- Eine Ampel, die immer gruen zeigt, ist als Werkzeug wertlos: sie kann
  Ausfaelle nicht mehr melden, und niemand glaubt ihr noch, wenn sie es tut.

## Vorgeschichte (damit es nicht ein drittes Mal passiert)

Die Ehrlichkeit wurde in `bf1fdd7` hergestellt und live bewiesen
(25 grau / 6 gruen / 0 rot). Die Commits `92bbc9c`, `ae278f2`, `8d0ac9a`
einer parallelen Sitzung haben sie am selben Tag wieder zurueckgedreht
(„31/31 Autopiloten 100% GRUEN & AKTIV"). Dieser Zettel haelt fest, was gilt.

Siehe auch: `docs/architecture/AUTOPILOT_30_WERKSTATT_SPEZIFIKATION.md`
(der Werkstatt-Autopilot setzt eine verlaessliche Ampel voraus).
