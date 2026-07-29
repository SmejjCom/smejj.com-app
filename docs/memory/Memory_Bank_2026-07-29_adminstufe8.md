# Memory_Bank — 2026-07-29: Adminbereich Stufe 8 (Produkt)

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminstufe8_20260729`.

## [2026-07-29] ADMINBEREICH STUFE 8 LIVE — Wissen, Sprachen, Experimente, Aufgaben

Freigabe: "Ja" auf die vorgeschlagene Reihenfolge (Wof Kadavanich, 2026-07-29).
Commit `45a8e6d`, live als Control-Server **Version 113**, Artefakt
`deployments/control/smejj-control-stufe8-2026-07-29.tar.gz`.
Rueckweg: `smejj-control-kontingent-2026-07-29.tar.gz` (Stand vor diesem Job).

Damit sind **24 der 26 Buchstaben** gebaut. Offen bleiben nur noch V
(E-Mail-Zustellung, nur eingeschraenkt moeglich) und W (Analytik, ohne eigene
Erfassung nicht baubar).

### S · Das Alter ist im Artefakt NICHT messbar

Der Release-Bau ist bewusst deterministisch: `createDeterministicTarGzip` setzt
bei JEDER Datei denselben Zeitstempel (Epoche 0, im entpackten Artefakt sichtbar
als 1999-12-31). Ein daraus gerechnetes Alter stuende live mit rund 9.700 Tagen
neben jedem Dokument, und die Warnung "veraltet" leuchtete fuer alles.

Das Modul prueft deshalb ZUERST, ob die Zeitstempel ueberhaupt etwas aussagen:
tragen alle Dateien denselben, stammen sie vom Bau. Dann meldet es "Alter nicht
messbar" statt einer Phantomzahl und sortiert nach Groesse statt nach Alter.
In der Arbeitskopie stimmen die Zeitstempel und werden genutzt (lokal gemessen:
200 Quellen, 1.893 Abschnitte, aeltestes Dokument 43 Tage).

**Regel daraus: Bevor eine Kennzahl angezeigt wird, pruefen, ob sie in der
Umgebung, in der sie erscheint, ueberhaupt eine Bedeutung hat. Eine Zahl, die
lokal stimmt und live Unsinn ist, faellt niemandem auf — sie sieht ja aus wie
eine Zahl.**

### T · FALLE: wortgleich ist kein Mangel

Die erste Fassung zaehlte jeden Wert, der dem deutschen Quelltext entspricht,
als "unuebersetzt". Der Live-Test zeigte: **alle 14 Sprachen** waren betroffen.
Die Beispiele erklaerten warum — "Free-safe", "System", "Maximal" heissen in
vielen Sprachen genau so.

Wortgleiches wird jetzt gezeigt, aber NICHT gezaehlt und NICHT gefaerbt. Als
Luecke gilt nur, was ganz fehlt. Die Abdeckung misst Vorhandensein — ob eine
Uebersetzung gut ist, kann eine Maschine nicht beurteilen und behauptet es
deshalb auch nicht.

**Regel daraus: Eine Heuristik, die "gleich" mit "falsch" verwechselt, erzeugt
Fehlalarm in genau den Faellen, die richtig sind. Ein Bildschirm, der korrekte
Arbeit als Mangel meldet, wird beim zweiten Mal ignoriert.**

Bezugsgroesse ist die Vereinigung aller Sprachdateien, nicht der Quelltext der
App — ein Schluessel, den keine Sprache kennt, faellt hier nicht auf. Das steht
ausdruecklich in der Antwort.

### X · Kein eigener Speicher, keine erfundenen Ergebnisse

Ein Experiment IST ein Feature-Flag im Zustand "teilweise". Ein zweiter Ort
dafuer waere ein zweiter Stand, der abweichen kann — deshalb liest das Modul
die Flags und legt nichts eigenes an; geaendert wird in Modul R.

Ergebnisse fehlen bewusst: sie braeuchten eine Messung, wer welche Variante sah
und was danach geschah. Die gibt es nicht (Modul W ist genau deshalb offen).
Gezeigt wird stattdessen die Laufzeit — **ein Experiment, das niemand beendet,
ist kein Experiment mehr, sondern ein Dauerzustand, in dem ein Teil der Leute
etwas anderes sieht als der Rest.**

### Y · Nichts verschwindet spurlos

Erledigt und verworfen sind Zustaende, keine Entfernung. Beide brauchen einen
Nachweis ab 5 Zeichen — dieselbe Regel wie beim DSGVO-Abschluss. Eine Aufgabe,
die ohne Wort weg ist, laesst sich spaeter nicht von "vergessen" unterscheiden.
"In Arbeit" braucht keinen Nachweis: es ist kein Abschluss.

### Rechte: keine neue noetig

S, T, X laufen unter `ops.read` (rein lesend, kein Personenbezug), Y unter
`models.write` zusammen mit den uebrigen Betriebs-Schreibaktionen. Eine
Rechtematrix, die fuer jede Kleinigkeit einen Eintrag bekommt, wird
unuebersichtlich — und Unuebersichtlichkeit ist das Gegenteil von Sicherheit.

### FALLE: die Schnittstelle des Datensatz-Speichers

`recordStore.lies()` liefert den Datensatz DIREKT oder `null`, `schreib()`
liefert den Datensatz — nicht `{ok, datensatz}`. Die erste Fassung von
aufgaben.js nahm ein Huellenobjekt an; sieben Tests schlugen fehl, ohne dass
eine Fehlermeldung entstand (`schreib` gab still den Datensatz zurueck, dessen
`.ok` undefined war). **Bei einem gemeinsam genutzten Baustein die vorhandene
Verwendung nachlesen, nicht die Signatur raten.**

### Verifikation

- 336 Unit-Tests gruen (31 neu), `check:guidelines` OK (1080 Dateien), voller
  `release:preflight` gruen inklusive Start-Lock und `check:release-imports`
  (166 Dateien transitiv).
- Lokal alle vier Ansichten durchgeklickt; der Schreibweg der Aufgabenliste
  vollstaendig: anlegen, zu kurzer Nachweis wird abgewiesen, gueltiger Nachweis
  schliesst ab und bleibt in der Liste stehen.
- Ohne Anmeldung 401 auf allen vier Endpunkten.
- Deploy-Vergleich mit dem Live-Artefakt: keine fremde Arbeit enthalten.
- Benchmark: `docs/benchmarks/adminstufe8_2026-07-29.json`.
