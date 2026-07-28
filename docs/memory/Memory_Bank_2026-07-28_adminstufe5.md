# Memory_Bank — 2026-07-28: Adminbereich Stufe 5 (Betrieb)

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminstufe5_20260728`.

## [2026-07-28] ADMINBEREICH STUFE 5 LIVE — Modelle, Jobs, Worker, Deploy, Speicher

Freigabe: Auswahl "Alles der Reihe nach" auf die Frage nach den 16 offenen
A-Z-Modulen (Wof Kadavanich, 2026-07-28). Commits `056c73c`, `8ab5367` und `3ae4e39`, live als
Control-Server **Version 107**, Artefakt
`deployments/control/smejj-control-stufe5c-2026-07-28.tar.gz`.
Rueckweg: `smejj-control-stufe5b-...`, `smejj-control-stufe5-...` bzw.
`smejj-control-stufe4c-2026-07-28.tar.gz` (Stand vor diesem Job).

Damit sind 16 der 26 A-Z-Module gebaut. Offen bleiben Geld (E, F),
Sicherheit (J, L, Z) und Produkt (S, T, V, W, X, Y).

### Was jetzt geht

Fuenf Betriebsansichten, alle rein lesend, auf einer neuen Berechtigung
`ops.read` — als einzige fuer JEDE Adminrolle erlaubt.

### Die Entscheidung, die alles andere traegt: was NICHT drinsteht

`ops.read` ist so weit erteilt, weil in diesen Ansichten kein Inhalt steht.
Beides haengt zusammen — waere Inhalt drin, waere die Berechtigung falsch.

- **Ein Job-Datensatz enthaelt `task`, den Auftragstext der Nutzerin.** Das ist
  Inhalt, nicht Betriebszustand. Stufe 3 hat festgelegt, dass Inhalte
  Vier-Augen (Owner) oder die Einwilligung der betroffenen Person (Support)
  verlangen. Ein Betriebsbildschirm, der den Auftragstext nebenbei anzeigt,
  haette diese Regel still ausgehebelt — ohne dass es auffaellt, weil die
  Ansicht ja "nur" den Betrieb zeigt. Draussen bleiben deshalb Auftragstext,
  Kontextpfade und Repository-Adresse. Drin ist die Tatsache "mit Repository".
- **Die Modell-Registry reicht in `health.reason` den Fehlerwortlaut durch.**
  Ein Modell zitiert im Fehlerfall gern die Anfrage. Uebernommen wird nur, wie
  oft es in Folge schiefging und wann zuletzt geprueft wurde. Erst beim
  Schreiben der Tests aufgefallen, nicht beim Entwerfen.

**Regel daraus: Bevor eine Ansicht breit freigegeben wird, Feld fuer Feld
pruefen, was aus den Quelldaten mitkommt. Was durchgereicht wird, entscheidet
ueber die Berechtigung — nicht umgekehrt.**

### Weitere Entscheidungen

- **Drei Fragen, drei Spalten.** "Eingeschaltet", "eingerichtet" und
  "erreichbar" werden staendig verwechselt. Ein Modell kann eingeschaltet und
  eingerichtet sein und trotzdem schweigen — das ist der interessante Fall, und
  er steht oben. Ein gemeinsamer "Status" haette ihn verdeckt.
- **Eine ausgefallene Quelle zeigt "nicht erreichbar", nie eine Null.** Eine
  Null liest sich wie "alles ruhig", obwohl niemand nachsehen konnte.
- **Deploy sagt "unbekannt" statt "abweichend", wenn eine Seite fehlt.** Ein
  falscher Alarm auf einem Betriebsbildschirm kostet Vertrauen, und verlorenes
  Vertrauen macht den Bildschirm nutzlos.
- **Kein Audit-Eintrag je Aufruf.** Stufe 2 protokolliert Lesezugriffe auf
  Nutzerakten, weil dort eine bestimmte Person aufgeschlagen wird. Hier gibt es
  keinen Personenbezug; jeden Blick zu protokollieren wuerde das Audit-Log
  fluten und die Eintraege, auf die es ankommt, unauffindbar machen.

### FALLE: der Betrieb nutzt ZWEI Eimer

Beim Live-Vergleich gefunden, nicht im Code: `IDRIVE_E2_BUCKET` = `smejj-app`
fuer Daten, `IDRIVE_E2_DEPLOY_BUCKET` = `smejj-model-files` fuer
Release-Artefakte und Modellgewichte.

Die Speicher-Ansicht las anfangs alles aus dem Haupteimer. Auf Produktion haette
sie fuer die Release-Artefakte eine **Null** gezeigt — und eine Null sieht aus
wie "nichts da", nicht wie "am falschen Ort gesucht". Jeder Bereich kennt jetzt
seinen Eimer, und der Eimername steht in der Ansicht neben dem Praefix.

Aufgefallen ist es nur, weil lokal "Nutzerkonten: 0" stand, obwohl live fuenf
Konten existieren. **Eine Null, die nicht zur bekannten Wirklichkeit passt, ist
immer eine Spur — nie ein Messergebnis.**

### FALLE: "nie geprueft" als "antwortet nicht" gemeldet

Erst die Live-Daten haben es gezeigt: die Ansicht meldete zwei Ausfaelle
(GLM-5.2, Kimi K3) — daneben stand aber `gesundheitsstand: null`,
`zuletztGeprueftAm: null`, `fehlschlaegeInFolge: 0`. **Es war gar nichts
gemessen worden.** Die Registry setzt `runtimeAvailable` auf false, solange
niemand nachgesehen hat; geprueft wird beim ersten Aufruf eines Backends, nicht
auf Vorrat.

Unbehoben haette der Bildschirm nach JEDEM Neustart grundlos Alarm geschlagen.
Erreichbarkeit hat deshalb drei Werte: ja, nein, ungeprueft — nur "nein" ist ein
Ausfall.

**Das ist dieselbe Regel wie in der Deploy-Sicht ("unbekannt" ist nicht
"abweichend"): ein Betriebsbildschirm darf nur behaupten, was er gemessen hat.
Und: ein Bildschirm, der grundlos Alarm schlaegt, wird nach dem zweiten Mal
nicht mehr gelesen — dann ist er schlechter als keiner.**

### FALLE: zwei Pruefsummen, die nie zusammenpassen koennen

In der Deploy-Ansicht standen unter "Release-Abgleich" die Pruefsumme des
gepackten Archivs und die des ausgepackten Inhalts nebeneinander. Zwei
verschiedene Messungen, die nie uebereinstimmen — es sah aus wie eine
Abweichung. Verglichen wird jetzt nur die Release-Kennung; die Pruefsummen
haben eine eigene Tafel mit der Angabe, was sie messen.

### Verifikation

- 257 Unit-Tests gruen (33 neu), `check:guidelines` OK (1045 Dateien), voller
  `release:preflight` gruen inklusive Start-Lock und `check:release-imports`
  (154 Dateien transitiv).
- Lokal alle fuenf Ansichten durchgeklickt, keine Konsolenfehler; ohne
  Anmeldung 401.
- Beim Deploy-Vergleich: alle Abweichungen gegenueber dem Live-Artefakt waren
  bereits committet, mein Baum war ueberall der neuere. Eine nur live
  vorhandene, ungetrackte Mockup-Datei wurde uebernommen, damit das Artefakt
  keine Datei verliert.
- Benchmark: `docs/benchmarks/adminstufe5_2026-07-28.json`.
