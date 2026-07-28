# MEMORY-ARCHIV 2026-07-H

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel (2026-07-28).
> Der Hauptindex traegt einen Zeiger hierher.

### [2026-07-28] STATUSSEITE LIVE — ohne Status-Server (job_statusseite_20260728)

Freigabe: "Ja" auf den Vorschlag Statusseite (Wof Kadavanich, 2026-07-28).
Arbeits-Commits `6d06605`/`2bdc970`/`62d55a4`, Live `f3a1297`, Rueckfall
`ebab85d`, sw v172.

**Entscheidung:** `/status.html` ist eine statische Datei und fragt Control-
Server, Chat-Bridge und Browser-Bridge DIREKT AUS DEM BROWSER ab. Kein
Status-Server. Begruendung: ein Dienst, der Zustaende sammelt, waere selbst ein
Single Point of Failure und schwiege genau dann, wenn er gebraucht wird.
Ausserdem null Dauerlast und keine neuen Kosten. Der Preis ist benannt: der
Besucher sieht SEINE Verbindung, keinen Mittelwert — die Seite sagt das selbst.

Vier Eigenschaften, die den Zweck sichern: oeffentlich (nicht hinter dem
Anmelde-Gate — wer die Anmeldung pruefen will, kann sich nicht anmelden), im
Precache (bei totem Netz anzeigbar), Zustaende als WORT statt nur als Farbe
(WCAG 1.4.1), `noindex` (Momentwert gehoert nicht in den Suchindex).

**Verifikation:** live abgemeldet "Alle Dienste laufen" (Anmeldung 224 ms,
Chat 289 ms, Browser 603 ms), 0 Fehler. Gegenprobe mit abgeschnittenen
Antworten: Hauptdienst tot -> "Ein Hauptdienst antwortet nicht", nur
Zusatzfunktion tot -> "Die Hauptfunktionen laufen". check:all und
release:preflight gruen (isolierter Klon), Budgets eingehalten.

**LEHRE 8 (neu, teuer verhindert):** Beim Deploy standen 15 i18n-Dateien als
"geaendert" da. Die Richtungspruefung zeigte: LIVE ist dem Repo ZWEI Schluessel
VORAUS. Ein Upload haette zwei Uebersetzungen in 15 Sprachen geloescht. Das ist
exakt der Fall, vor dem der Eintrag zu QA-Welle 1-3 warnt — er ist erneut
eingetreten. Regel bleibt: vor jedem Frontend-Deploy jede Datei einzeln gegen
den eigenen VORZUSTAND hashen und bei Abweichung die RICHTUNG pruefen, nicht
nur die Tatsache. OFFEN: die zwei Schluessel gehoeren aus dem Live-Stand ins
Repo uebernommen, nicht umgekehrt.

**LEHRE 9 (neu):** Zwei Sitzungen bumpten sw.js auf DIESELBE Version v171 mit
UNTERSCHIEDLICHEN Precache-Listen. Bestandsnutzer haetten die neuen Dateien nie
bekommen. Ein Cache-Name darf nur eine einzige SHELL-Liste bezeichnen — bei
paralleler Arbeit vor dem Deploy pruefen, ob die eigene Version schon von
jemand anderem belegt ist. Behoben mit Pflicht-Sprung auf v172.

**LEHRE 10 (neu):** Meta-CSP allein reicht auf dem eigenen Server NICHT — bei
Header-CSP UND Meta-CSP gilt die SCHNITTMENGE. `connect-src 'self'` im Header
blockierte alle drei Statusabfragen; live waere es nie aufgefallen, weil GitHub
Pages keine CSP-Kopfzeile setzt. Wer eine Seite baut, die fremde Hosts
kontaktiert, muss BEIDE Listen pflegen (jetzt per Test erzwungen).
