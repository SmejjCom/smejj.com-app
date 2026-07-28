# job_hilfeseite_20260728 — Hilfeseite /hilfe.html

**Freigabe:** „Ja" auf den Vorschlag Hilfeseite (Wof Kadavanich, 2026-07-28).
Der Punkt stand seit QA-Welle 1, Abschnitt 8.2: „Hilfe- oder Dokumentationsseite
(`/docs/` ist 404) — es gibt keinerlei Anleitung."

**Arbeits-Commits:** `7e6f8a3`, `cc65f72` in `SmejjCom/smejj.com-app`
**Live-Commits:** `7d2e267`, `66b7e06` in `SmejjCom/smejj-app-frontend`
**Live-Rückfall:** `a0b7de7`
**Start-Lock-Backups:** `backups/start-design-lock/2026-07-28T09-56-39-475Z/`,
`…T10-00-07-000Z/`, `…T10-06-56-829Z/`
**Belege:** `backups/hilfeseite-live-2026-07-28-v176.png`,
`backups/hilfeseite-mobil-2026-07-28.png`,
`docs/benchmarks/webvitals_hilfeseite_2026-07-28.json`

---

## Architektur

Statische Seite, kein JavaScript, kein Dienst dahinter. Sie liegt im Precache
und ist ohne Anmeldung erreichbar — wer nicht in die App hineinkommt, braucht
die Hilfe am dringendsten. Anders als die Statusseite ist sie indexierbar und
steht in der Sitemap: Sie beschreibt Dauerhaftes, keinen Momentwert.

## Der eigentliche Trick: die Inhalte sind getestet

Das Risiko einer Hilfeseite ist nicht die Technik, sondern dass sie Dinge
verspricht, die es nicht gibt, oder Namen nennt, die in der Oberfläche anders
heißen. `tests/hilfeseite.test.mjs` prüft deshalb den **Text gegen den
Quelltext**:

- jeder genannte Arbeitsbereich muss als `title="…"` in `index.html` existieren
- jedes genannte Modell muss ein `data-model="…"` haben
- jeder genannte Schalter muss unter diesem `aria-label` existieren
- jede genannte Nachrichten-Aktion muss in `chat-actions-menu.js` stehen
- Apple-Anmeldung darf **nicht** vorkommen (live fail-closed abgeschaltet)

Beim Schreiben hat genau das zwei falsche Angaben von mir gefunden: Ich hatte
die Schalter „Sprachmodus" und „Ton" genannt — sie heißen **Audio** und
**Stimme**. Und ich hatte ein „Rückgängig" nach dem Löschen beschrieben, das im
Menü nicht existiert. Beides korrigiert, bevor irgendetwas live ging.

## Zwei Mängel, die erst die Live-Messung zeigte

**1. Querscrollen bei 200 % Zoom.** Auf einem 390-px-Handy bleiben bei 200 %
Zoom 195 CSS-Pixel. Das Wort „Datenschutzerklärung" ist breiter — ohne Umbruch
scrollte die **ganze Seite** waagerecht. Behoben mit `overflow-wrap: break-word`
für `p`, `dd` und `li`; gilt jetzt für alle Seiten mit `p-recht`.
Nachgemessen: kein Querscrollen bei 100 %, 200 %, 200 % mobil und 375 px.

**2. Logo-Link 1 px zu klein.** Er maß 30 × 23 px — der letzte Rest von
QA-Welle 1, Befund F-21 (die Fußzeilen-Links waren dort schon gefixt, der
Logo-Link nicht). Jetzt `min-height: 24px`, zentral für alle Rechtsseiten.

Sechs weitere Links liegen unter 24 px, alle **im Fließtext**. Dafür gilt die
ausdrückliche WCAG-2.5.8-Ausnahme für Ziele in einem Textblock — das ist kein
Mangel und wurde bewusst nicht „korrigiert".

## Nebenbefund korrigiert: Präfix statt genauer Pfad

Der öffentliche Pfad der Statusseite war `/^\/status/` — ein Präfix. Die App hat
unter `/status` aber eine **eigene, anmeldepflichtige Ansicht**
(`VIEW_PATHS.tools`). Das Muster hätte sie mit geöffnet. Jetzt exakt
`/^\/status\.html$/`, und der Test prüft ausdrücklich, dass kein Präfix
zurückkommt.

## Verifikation

| Prüfung | Ergebnis |
|---|---|
| `npm run check:all` | grün |
| `npm run release:preflight` | grün |
| `check:start-lock` / `check:favicon-lock` | OK, neu eingefroren (25 HTML-Seiten) |
| Live `/hilfe.html`, abgemeldet | 200, kein Redirect, **0 Fehler** |
| Gliederung | 1 × h1, 6 × h2, alle Sprungmarken gültig |
| Zoom 100 % / 200 % / 200 % mobil / 375 px | kein Querscrollen, 0 zu kleine Ziele |
| Statusseite (Regression) | „Alle Dienste laufen", 0 Fehler |
| App (Regression) | 0 Fehler, 0 von 22 Tab-Stationen außerhalb |
| Web-Vitals kalt | TTFB 35 ms · LCP 224 ms · CLS 0 · INP 56 ms · 274 KB |
| Web-Vitals warm | TTFB 64 ms · LCP 192 ms · CLS 0 · INP 40 ms · 38 KB |

Alle Performance-Budgets eingehalten.

## Korrektur einer früheren Aussage

In `job_statusseite_20260728` habe ich gemeldet, die 15 Live-Sprachdateien seien
dem Repo „zwei Schlüssel voraus" und ein Upload hätte Übersetzungen gelöscht.
**Das war falsch.** Die beiden Schlüssel (`Google-Anmeldung wird abgeschlossen …`
und die zugehörige Fehlermeldung) stehen weder im Repo- noch im Live-Quelltext —
sie sind **verwaiste Übersetzungen** für Oberflächentext, den es nicht mehr gibt.
Der Projekttest `i18n-ui` verbietet solche Schlüssel ausdrücklich; mein Versuch,
sie ins Repo zu holen, hat ihn sofort rot gemacht und wurde zurückgenommen.

Richtig bleibt: die Dateien nicht zu deployen war korrekt, weil ich die Richtung
zu dem Zeitpunkt nicht kannte. Falsch war meine Schlussfolgerung über die
Ursache. Der Live-Stand trägt zwei tote Schlüssel; das ist harmlos und wird beim
nächsten Deploy der Sprachdateien von selbst bereinigt.
