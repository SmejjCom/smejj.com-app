# MEMORY-ARCHIV 2026-07-I

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel (2026-07-28).
> Der Hauptindex traegt einen Zeiger hierher.

### [2026-07-28] HILFESEITE LIVE — Inhalte gegen den Quelltext getestet (job_hilfeseite_20260728)

Freigabe: "Ja" auf den Vorschlag Hilfeseite (Wof Kadavanich, 2026-07-28).
Commits `7e6f8a3`/`cc65f72`, Live `7d2e267`/`66b7e06`, Rueckfall `a0b7de7`, sw v176.

**Entscheidung:** `/hilfe.html` ist statisch, ohne JavaScript, ohne Dienst
dahinter, im Precache und OHNE Anmeldung erreichbar. Anders als die Statusseite
indexierbar und in der Sitemap — sie beschreibt Dauerhaftes, keinen Momentwert.

**Das Wesentliche:** tests/hilfeseite.test.mjs prueft den TEXT gegen den
QUELLTEXT — jeder Arbeitsbereich als title=, jedes Modell als data-model=, jeder
Schalter als aria-label=, jede Nachrichten-Aktion gegen chat-actions-menu.js,
und Apple-Anmeldung darf nicht vorkommen (live fail-closed aus). Das hat sofort
ZWEI falsche Angaben von mir gefunden, bevor etwas live ging: die Schalter
heissen Audio und Stimme (nicht "Sprachmodus"/"Ton"), und ein "Rueckgaengig"
nach dem Loeschen gibt es im Menue nicht. Muster fuer jede kuenftige
Dokumentationsseite.

**LEHRE 11 (neu):** Bei 200 % Zoom auf einem 390-px-Handy bleiben 195 CSS-px.
Ein einziges langes deutsches Wort ("Datenschutzerklaerung") sprengt dort die
Zeile und erzeugt Querscrollen auf der GANZEN Seite. `overflow-wrap: break-word`
gehoert auf jede Textseite; die Zoom-Pruefung muss den schmalsten Fall
einschliessen, nicht nur 320/375 px.

**LEHRE 12 (neu):** Ein Praefix-Muster in PUBLIC_PATHS oeffnet mehr als
gedacht. `/^\/status/` haette neben der statischen Statusseite auch die
anmeldepflichtige App-Ansicht unter `/status` (VIEW_PATHS.tools) freigegeben.
Oeffentliche Pfade immer exakt verankern (`$`), und die Annahme im Test
festhalten.

**KORREKTUR zu job_statusseite_20260728:** Die Aussage, die 15 Live-Sprach-
dateien seien dem Repo "zwei Schluessel voraus" und ein Upload haette
Uebersetzungen geloescht, war FALSCH. Die beiden Schluessel stehen weder im
Repo- noch im Live-Quelltext — es sind VERWAISTE Uebersetzungen fuer entfernten
Oberflaechentext. Der Test i18n-ui verbietet sie; der Versuch, sie ins Repo zu
holen, machte ihn sofort rot und wurde zurueckgenommen. Richtig bleibt: nicht zu
deployen war korrekt, weil die Richtung zu dem Zeitpunkt unbekannt war. Falsch
war die Begruendung. Regel praezisiert: Richtung pruefen heisst NICHT "wer hat
mehr Zeilen", sondern "was sagt der Quelltext dazu".

**Verifikation:** check:all und release:preflight gruen, Locks neu eingefroren
(25 HTML-Seiten). Live abgemeldet 200, 0 Fehler, alle Sprungmarken gueltig,
kein Querscrollen bei 100/200/200-mobil/375 px, 0 zu kleine Ziele ausserhalb des
Fliesstextes. Budgets eingehalten (warm LCP 192 ms, CLS 0).
