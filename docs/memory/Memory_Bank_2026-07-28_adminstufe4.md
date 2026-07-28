# Memory_Bank — 2026-07-28: Adminbereich Stufe 4

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminstufe4_20260728`.

## [2026-07-28] ADMINBEREICH STUFE 4 LIVE — Moderation, DSGVO, Ankuendigungen, Flags

Freigabe: "Ja, Mach komplett endlich fertig, soll nichts offen bleiben."
(Wof Kadavanich, 2026-07-28). Commits `098d456`, `1d525b7` und `89e8313`, live als
Control-Server **Version 104**, Artefakt
`deployments/control/smejj-control-stufe4c-2026-07-28.tar.gz`.
Rueckweg: `smejj-control-stufe4b-...` (ohne den Latenz-Fix),
`smejj-control-stufe4-...` (ohne Sichtbarkeits- und Latenz-Fix) bzw.
`smejj-control-k3-prefs-2026-07-28.tar.gz` (Stand vor diesem Job).

### Was jetzt geht

Vier Bereiche auf einem gemeinsamen Datensatz-Speicher (`recordStore.js`):
Missbrauchssignale als Warteschlange, DSGVO-Vorgaenge mit Fristenuhr,
Ankuendigungsbanner und Feature-Flags. Alles schreibend, alles mit
Pflichtgrund und Audit-Eintrag.

### Die Entscheidungen, die den Unterschied machen

- **MODERATION SPERRT NIE AUTOMATISCH.** Ein Signal ist ein Verdacht, kein
  Urteil: die Erkennung schlaegt vor, ein Mensch entscheidet und begruendet
  (mindestens zehn Zeichen). Fehlalarme treffen echte Menschen, und ein
  automatisch gesperrtes Konto merkt niemand, bis sich jemand beschwert. Das
  Sperren selbst laeuft weiter ueber die Nutzerakte aus Stufe 3 — mit eigenem
  Grund und eigenem Nachweis.
- **Die DSGVO-Frist laeuft ab EINGANG, nicht ab Erfassung.** Wer eine Anfrage
  drei Tage spaeter eintraegt, hat drei Tage weniger, nicht dreissig neue.
  Nachtragen vergangener Eingaenge ist deshalb erlaubt, ein Datum in der
  Zukunft nicht. Die Restzeit wird bei jedem Aufruf gerechnet und nie
  gespeichert — ein gespeicherter Countdown ist ab der ersten Sekunde falsch.
- **Verlaengern geht genau einmal, um zwei Monate, mit Begruendung**
  (Art. 12 Abs. 3). Abschliessen verlangt einen Erledigungsnachweis. Ohne den
  ist "abgeschlossen" nur eine Behauptung.
- **Zuruecknehmen loescht nicht.** Was einmal als Banner angezeigt wurde, bleibt
  dokumentiert — sonst laesst sich hinterher nicht mehr klaeren, was die Nutzer
  wann zu sehen bekamen.
- **Feature-Flags ordnen stabil zu, nicht zufaellig**: sha256(Flag-Name +
  Konto-ID) → 0..99. Eine Zufallszahl je Anfrage waere kein Test, sondern
  Flackern; die Oberflaeche wuerde bei jedem Neuladen springen.
- **Keine neuen Rechte erfunden.** Moderation und DSGVO haengen an
  `users.block`, Ankuendigungen und Flags an `models.write`. Eine Rechtematrix,
  die fuer jede Kleinigkeit einen Eintrag bekommt, wird unuebersichtlich — und
  Unuebersichtlichkeit ist das Gegenteil von Sicherheit.

### FALLE: der eigene Schreibvorgang war eine Minute lang unsichtbar

Live gemessen auf Version 102: ein Feature-Flag wurde angelegt (HTTP 201,
Audit-Eintrag vorhanden), erschien aber rund eine Minute lang nicht in der
Uebersicht. **Ursache war nicht der Schreibvorgang, sondern der LIST-Index von
IDrive e2, der dem Objekt hinterherhinkt.** Das Objekt selbst ist sofort lesbar.

Fuer die Bedienerin sieht das aus wie "mein Klick hat nichts getan" — und der
zweite Klick legt dann den zweiten Datensatz an. Weil alle vier Bereiche ueber
denselben Speicher laufen, war es dieselbe Falle an vier Stellen.

`recordStore` merkt sich seither, was dieser Prozess geschrieben hat, und
ergaenzt beim Auflisten **nur die Datensaetze, die der Index noch nicht kennt**.
Die Grenzen sind Absicht: ein gelesener Datensatz wird nie ueberschrieben, nur
ein fehlender ergaenzt; nach zehn Minuten laeuft der Eintrag aus (haelt der
Index dann immer noch nichts bereit, ist das ein echter Fehler und soll sichtbar
werden); hoechstens 200 Eintraege.

**Regel daraus: Wer auf einen Objektspeicher schreibt und danach auflistet, darf
nicht annehmen, dass die Liste den eigenen Schreibvorgang schon kennt.**

### FALLE: reine Kalendertage in Ortszeit gerendert

`eingegangenAm` und `faelligAm` sind Kalendertage und werden als UTC-Mitternacht
gespeichert. Mit dem allgemeinen Zeit-Formatierer angezeigt, stand in einer
westlichen Zeitzone der **Vortag** in der Akte, dazu eine erfundene Uhrzeit
("19.07.2026 17:00" statt "20.07.2026"). Bei einer gesetzlichen Frist ist das
kein Schoenheitsfehler. Seither gibt es `datum()` neben `zeit()`.

### Latenz: dieselbe Stelle, zweites Problem

Derselbe Aufbau — ein LIST plus ein Abruf je Datensatz — kostete 285 bis 449 ms
je Aufruf, bei einem Budget von 300 ms und einer Netz-Grundlast von 151 ms
(gemessen an `/api/health`). Die gelesene Liste wird deshalb 20 Sekunden
wiederverwendet, wie beim Nutzer-Index. Drei Grenzen sind Absicht:

- **Schreiben verwirft den Zwischenspeicher sofort.** Sonst haette die Korrektur
  von oben genau den Fehler zurueckgebracht, den sie behebt.
- **Zwischengespeichert werden die ROHEN Datensaetze.** Restfristen und
  Sichtbarkeit werden bei jedem Aufruf neu gerechnet — eine Frist, die so alt
  ist wie der Zwischenspeicher, waere schlicht falsch.
- Die Ergaenzung noch nicht indizierter Datensaetze bleibt ausserhalb, sonst
  wuerde ein Eintrag ueber sein Ablaufdatum hinaus konserviert.

Ergebnis: 257 / 218 / 261 / 264 ms Median, alle unter dem Budget.

**Das Audit-Log wurde bewusst NICHT zwischengespeichert** (657 ms Median, ueber
dem Budget). Es ist die Nachweisgrundlage; ein Stand, der einen soeben
geschriebenen Eintrag nicht zeigt, waere genau dort falsch, wo Verlass am
wichtigsten ist. Die Ansicht wird von Hand geoeffnet und ist kein heisser Pfad.

### FALLE: die eigene Messung lief in die Ratenbegrenzung

Ein Benchmark mit 40 Aufrufen je Endpunkt misst bei Kapazitaet 30 und
Nachfuellung 0,4/s ueberwiegend 429er, nicht die echte Arbeit. **Messungen
muessen innerhalb des Limits bleiben** (hier: zehn Aufrufe im Abstand von 2,6 s),
sonst sind die Zahlen frei erfunden. Ebenso: bei fuenfzehn Messwerten ist "p95"
rechnerisch der Hoechstwert und keine belastbare Aussage.

### Zusammenarbeit mit einer Parallel-Session im selben Repository

Der Vergleich des laufenden Artefakts (Regel aus Stufe 3) hat diesmal etwas
Unerwartetes gezeigt: **die Parallel-Session hatte aus dem gemeinsamen
Arbeitsbaum gebaut und dabei meine noch uncommitteten Stufe-4-Dateien
mitgenommen** — Version 102 enthielt sie bereits, ohne dass sie je durch einen
Ship-Loop gegangen waren. Der dateiweise Vergleich hat das aufgedeckt, bevor
etwas ueberschrieben wurde.

Zwei Konsequenzen:

1. **In einem gemeinsam genutzten Arbeitsbaum ist "uncommittet" kein Schutz,
   sondern ein Risiko** — fremde Builds nehmen den Stand mit.
2. Gebaut wird aus einem **isolierten Worktree auf einem eigenen Commit**, und
   die live laufenden Dateien der anderen Sitzung werden vorher aus dem
   heruntergeladenen Artefakt uebernommen. Ergebnis: genau "live plus meine
   Aenderung", nachgewiesen ueber `contentRootSha256`.

### Verifikation

- 226 Unit-Tests gruen, `check:guidelines` OK (1023 Dateien), voller
  `release:preflight` gruen inklusive Start-Lock und `check:release-imports`.
- Live auf der Produktionsdomain: alle vier Ansichten gerendert, keine
  Konsolenfehler, Schreibweg ueber die Oberflaeche geprueft, Audit-Kette intakt.
- Web-Vitals smejj.com unveraendert im Budget (kein `public/`-Eingriff).
- Benchmark: `docs/benchmarks/adminstufe4_2026-07-28.json`.
