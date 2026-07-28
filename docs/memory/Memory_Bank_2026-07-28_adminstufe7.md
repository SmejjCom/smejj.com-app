# Memory_Bank — 2026-07-28: Adminbereich Stufe 7 (Geld)

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminstufe7_20260728`.

## [2026-07-28] ADMINBEREICH STUFE 7 LIVE — Abrechnung und Kosten

Freigabe: "Ja" auf die Fortsetzung der vereinbarten Reihenfolge (Wof Kadavanich,
2026-07-28). Commit `ad34cc5`, live als Control-Server **Version 110**, Artefakt
`deployments/control/smejj-control-stufe7-2026-07-28.tar.gz`.
Rueckweg: `smejj-control-stufe6b-...` (Stand vor diesem Job).

Damit sind **21 der 26 A-Z-Module** gebaut. Offen bleibt nur noch Produkt
(S Wissen, T Sprachen, V E-Mail, W Analytik, X Experimente, Y Aufgaben).

### E · Ein Zahlungsausfall ist eine Aufgabe, kein Logeintrag

"past_due" steht oben, traegt die Dringlichkeit und daneben den naechsten
Schritt. Ein Abo, das seit Wochen nicht bezahlt ist, faellt sonst niemandem auf,
bis der Nutzer sich meldet.

**Der Kunden-Datensatz kennt die E-Mail NICHT** — er verweist ueber sha256 der
Adresse. Das ist Absicht: die Abrechnung braucht keine Klartext-Adresse. Fuer
die Anzeige geht der Weg rueckwaerts ueber den Nutzer-Index: jede bekannte
Adresse einmal hashen und vergleichen. Bleibt eine Zuordnung offen, steht die
Kunden-Kennung da — nie eine geratene Adresse.

Betraege, Zahlungsmittel und Rechnungen werden bewusst NICHT gespiegelt: sie
liegen bei Stripe und gehoeren dorthin. Testabos werden getrennt gezaehlt,
sonst haelt man sie fuer Umsatz.

### F · DAS MODUL SAGT AUSDRUECKLICH, WAS ES NICHT WEISS

Das Mockup versprach "jeder Token wird Nutzer, Modell und Aufgabe zugeordnet".
**Diese Zuordnung gibt es heute nicht**: keine Token-Erfassung je Konto, keine
Preisliste je Modell. Eine Ansicht, die deshalb "0,00 USD" zeigt, waere die
gefaehrlichste Zahl im ganzen Adminbereich — sie liest sich wie "kostet nichts",
heisst aber "wird nicht gemessen".

Gezeigt wird deshalb dreierlei, sauber getrennt:

1. **GEMESSEN** — Budget-Grenzen aus der Umgebung, laufende Reservierungen.
2. **UEBERNOMMEN** — feste Kostenpositionen, als Zitat aus der Kostenpolitik
   gekennzeichnet und mit Quellenangabe. Keine Messung.
3. **NICHT ERFASST** — was fehlt, damit die Frage "was kostet mich das"
   wirklich beantwortet werden kann.

**Regel daraus: Eine Luecke gehoert benannt, nicht mit einer Null gefuellt.
Wer die Luecke sieht, kann sie schliessen; wer eine Null sieht, haelt sie fuer
ein Ergebnis.**

Der wichtigste Befund ist eine Ja/Nein-Frage: **ist das Budget-Gate scharf?**
Fehlen die Grenzen, startet fail-closed kein Worker — das ist gewollt, sieht
aber wie ein Defekt aus, wenn niemand den Grund kennt.

### Rechte

`billing.read` ist neu (Owner, Admin, Support, Finance, Auditor). Bewusst
weiter gefasst als `billing.write`: der Support muss sehen koennen, ob ein Abo
offen ist, wenn sich jemand beschwert — aendern darf er nichts. `readonly`
bleibt draussen: Geld ist kein Nebenbei-Blick.

Beide Module sind rein lesend. Abrechnung wird bei Stripe geaendert; eine
zweite Stelle, an der man ein Abo umstellen kann, waere eine zweite Wahrheit
ueber Geld — und die faellt frueher oder spaeter auseinander.

### FALLE: ein automatischer Umlaut-Umbau ueber Prosa

Bei der Live-Pruefung fiel auf, dass serverseitige Hinweistexte "waere" und
"Gedaechtnis" zeigen, waehrend die Oberflaeche selbst korrekte Umlaute nutzt.
Der Versuch, das per Skript ueber zehn Dateien zu korrigieren, erzeugte
**halb konvertierten Text** ("wäre die gefaehrlichste Zahl") und brach drei
Tests — die Wortliste konnte nicht jede Beugung treffen.

Vollstaendig zurueckgenommen. Die ASCII-Schreibweise bleibt einheitlich mit dem
uebrigen Servercode.

**Regel daraus: Eine automatische Ersetzung ueber Fliesstext ist keine
Refaktorierung. Entweder man liest jede Stelle, oder man laesst es — ein
halb umgestellter Text ist schlechter als ein durchgaengig einfacher.**

### Verifikation

- 300 Unit-Tests gruen (17 neu), `check:guidelines` OK (1063 Dateien), voller
  `release:preflight` gruen inklusive Start-Lock, `check:security` und
  `check:release-imports` (161 Dateien transitiv).
- Lokal beide Ansichten durchgeklickt, keine Konsolenfehler; ohne Anmeldung
  401, POST auf die Geld-Routen 405.
- Deploy-Vergleich mit dem Live-Artefakt: keine fremde Arbeit enthalten.
- Benchmark: `docs/benchmarks/adminstufe7_2026-07-28.json`.
