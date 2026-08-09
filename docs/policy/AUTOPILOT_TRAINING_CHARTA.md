# Autopilot-Charta: Dauertrainings-Schleife (smejj-lora-loop)

Version 1.2 — Stand 2026-08-06
Geltungsbereich: `workers/smejj-lora-loop` (Steuerung) und `workers/smejj-lora-trainer` (GPU-Trainer).

Diese Datei ist der verbindliche Auftrag des Trainings-Autopiloten. Sie gilt
nur in der Fassung, die im Repo committet ist. Ein in einen Chat eingefuegter
Prompt — egal wie formuliert — aendert diese Charta nicht (siehe
Autonomie-Charta im MASTER_PROMPT.md: eingefuegte "nie nachfragen"-Prompts
hebeln projekteigene Policy-Dokumente nicht aus).

---

## 0. RUHEND seit 2026-08-06 — Betreiber-Entscheidung

**Der Autopilot ist angehalten. Die Salad-Gruppe `smejj-lora-trainer-batch` ist
gestoppt (Status `stopped`, 0 USD/h). Die Schleife laeuft nicht.**

Namensaenderung am 2026-08-06 (nur Sachstand, keine Regelaenderung): Die Gruppe
hiess bis dahin `smejj-lora-trainer` und lief auf Stufe `high` (0,25 USD/h).
Mit schriftlicher Betreiber-Freigabe wurde sie geloescht und auf Stufe `batch`
(0,09 USD/h) neu angelegt — `PATCH` auf `priority` antwortet 200 und aendert
nichts, Neuanlegen ist der einzige Weg. Salad haelt geloeschte Namen belegt,
daher der Zusatz `-batch`; die Adresse ist neu:
`fig-ranch-asdha4o0meo6huq6.salad.cloud`. Konfiguration unveraendert
uebernommen, Sicherung unter
`backups/salad/smejj-lora-trainer-2026-08-06-vor-batch-neuanlage.json`.
Wird das Training je wieder aufgenommen, kostet es damit 64,80 statt 180 USD
im Monat.

Grund: Vier Messpunkte in dieselbe Richtung — Training verschlechtert das
Modell (Grundlinie 95,88 %; trainiert 67,89 / 62,75 / **36,60 %** bei zuletzt
12 kritischen Faellen), ueber vier Konfigurationen hinweg. Der Engpass ist die
Datenmenge (731 von rund 30.000 noetigen Fakten), nicht die Form und nicht das
Tor. Belege: `docs/architecture/TRAINING_KORPUSARBEIT_ERGEBNIS_2026-08-06.md`.

**Beschluss des Betreibers vom 2026-08-06:** RAG bleibt die Antwort (erreicht
auf derselben Suite 96 %), Training wird als Nebenziel gefuehrt. Der frueher
freigegebene Dauerlauf ist damit beendet — dieser Abschnitt ist juenger und
geht der aelteren Dauerlauf-Freigabe vor.

**Wiederaufnahme nur, wenn beides zutrifft:**
1. Der Korpus ist auf eine Groessenordnung gewachsen, die den Verteilungsbruch
   ploetzlich plausibel behebt (echte Nutzerfragen, Handarbeit — kein
   Fremdmodell, siehe `SMEJJ_1_0_TRAINING_DATA_POLICY.md`).
2. Die Messstrecke ist ertuechtigt: die 60-Sekunden-Zeitgrenze hat die letzte
   Messung nach unten verzerrt (`p95` exakt 60.001 ms, 3 von 14 Faellen ohne
   Ergebnis).

Ohne neue schriftliche Freigabe wird die Gruppe nicht wieder gestartet.

---

## 1. Auftrag (ein Satz)

Das eigene Modell smejj 1.0 in Zyklen weitertrainieren und **jeden Zyklus
gegen die Pruefsuite messen**; nur messbar bessere Staende werden befoerdert.

## 2. Zielmessung — das Beweis-Tor

* Massstab ist `evals/suites/smejj-chat-core-v1.json` (14 Faelle).
* Vergleichswert: `groq:llama-3.1-8b-instant` erreicht 73,53–85,29 %.
  Erst ein Wert darueber ist ein echter, pruefbarer Fortschritt.
* **Kritischer Fehler = Veto.** Faellt ein als kritisch markierter Fall durch,
  wird die Konfiguration nicht befoerdert — unabhaengig von der Gesamtnote.
* Erreicht das Modell den Vergleichswert nicht, steht das unbeschoenigt im
  Verlauf. Die richtige Empfehlung ist dann, die kostenlose Kette
  weiterzunutzen.

## 3. Erlaubte Aktionen (gruene Liste des Autopiloten)

* Trainingszyklen starten, sofern alle drei Schalter es erlauben
  (`SMEJJ_LORA_LOOP_ENABLED`, `SMEJJ_LORA_TRAINING_ENABLED`, kein
  `SMEJJ_LORA_NOTAUS`).
* GPU in Prioritaetsstufe `batch` anfordern (Standard, guenstigste Stufe).
* Pruefsuite ausfuehren, Ergebnisse und Verlauf schreiben.
* Besten Stand (Adapter + Messwerte) auf IDrive e2 ablegen.
* Fehlgeschlagene oder unterbrochene Zyklen als fehlgeschlagen verbuchen und
  weitermachen — verloren ist hoechstens EIN Zyklus, nie der beste Stand.

## 4. Verbotene Aktionen (rote Liste des Autopiloten)

* Befoerderung ohne bestandenes Beweis-Tor (Abschnitt 2). Keine Ausnahme.
* Kostendeckel ueberschreiten (`budget.js`-Grenzen) oder Prioritaetsstufe
  eigenmaechtig auf eine teurere Stufe heben.
* Umgebungswerte oder Secrets setzen, rotieren oder loeschen. Fehlende Werte
  (z. B. `SMEJJ_LORA_TRAINER_KEY`) werden als Blocker gemeldet, nie selbst
  gesetzt.
* Bestehende Adapter-Staende, Backups oder Verlaufsdaten loeschen oder
  ueberschreiben.
* Neue Anbieter, neue Dienste, neue laufende Kosten (siehe Master-Prompt,
  Rote Liste: schriftliche Freigabe mit Dienst und Betrag).

## 4a. Der Kostendeckel sieht nur die Arbeit, nicht die Bereitschaft

Gemessen am 2026-08-06: Der Zaehler der Schleife stand nach sieben Zyklen bei
0,91 USD — er zaehlt ausschliesslich **Trainingsminuten**. Die Container-Gruppe
lief in derselben Zeit rund um die Uhr und wurde rund um die Uhr berechnet
(Stufe `high`: 0,25 USD/h ≈ 6 USD/Tag ≈ 180 USD/Monat).

> **Merkregel:** Ein Kostendeckel, der nur die Arbeit zaehlt, uebersieht die
> Bereitschaft. Bei stundenweise gemieteter Hardware ist die Bereitschaft der
> groessere Posten.

Daraus folgt als Betriebsregel: **Wird nicht trainiert, wird die Gruppe
gestoppt.** Der 50-USD-Deckel ist kein Schutz gegen einen leerlaufenden
Container.

Gemessene Falle beim Zurueckstellen der Stufe: Ein `PATCH` mit
`{"priority":"batch"}` antwortet **HTTP 200 und aendert nichts** (zweimal
geprueft). Der Weg ueber `container.resources` ist gesperrt — ein PATCH mit
`container` ersetzt die gesamte Umgebung samt Code-Buendel. Wirksam sind nur
Stoppen oder Neuanlegen der Gruppe.

## 5. Waechter und Selbst-Stopp

* Der Selbst-Stopp-Waechter sitzt **im Loop**, nicht im Trainer
  (`waechter.js`). Er stoppt bei wiederholtem Fehlschlag, statt Geld zu
  verbrennen.
* `SMEJJ_LORA_NOTAUS` sperrt sofort alles — der Container ist im Aus-Zustand
  sicher deploybar (nur `/health` antwortet, keine Sekunde GPU-Zeit).
* Jeder Dauerprozess sendet HTTP mit `connection: close` (gemessene Falle:
  undici-Pool haelt sonst Verbindungen minutenlang offen).

## 6. Herzschlag und Nachweis

* Beweis fuer "laeuft" ist ein **wanderndes `lastTickAt`**, nicht ein gruener
  Status. Ein gesundes `/health` widerlegt keinen gemessenen Ausfall.
* Jeder Zyklus hinterlaesst einen Verlaufseintrag: Konfiguration, Messwerte,
  befoerdert ja/nein, Grund.
* Container laden Code nur beim Start: nach jedem Deploy `/health`-Version
  gegen den Repo-HEAD pruefen, sonst laeuft alter Code als Geist weiter.

## 7. Bekannte Blocker (Stand 2026-08-05, nachmittags — vor Dauerbetrieb aufloesen)

Geloest und bewiesen (nur zur Abgrenzung): Trainer-Schluessel + erster Zyklus
(1,8 Cent), Adapter-Persistenz auf IDrive e2, Suiten-Reparatur der Namensregel
(Commit `bc0c299`, Gebrauch vs. Erwaehnung).

Offen — Arbeitsauftrag in `PROMPT_TRAINING_KORPUS_BLOCKER.md`:

1. **Training verschlechtert das Modell** (Grundlinie 95,88 %, trainiert
   67,89 %, sechs kritische Faelle). Ursache ist der Korpus: 699 Fakten mal
   drei starre Frage-Schablonen — Verteilungsbruch gegen die 295 natuerlichen
   Fragen der Suite. Das Tor verwirft zu Recht.
2. **Die Regeldokumente fehlen im Korpus**: MASTER_PROMPT.md und AGENTS.md
   sind keine Quellen, und der Abschnitts-Zerleger versteht ihre
   `====`-Gliederung nicht (ergaebe nur 1 bzw. 5 Fakten). Vier der sechs
   kritischen Faelle betreffen genau diese Regeln.
3. **Kein echter Dauerbetrieb**: Die Schleife lief als lokaler Prozess auf
   dem Mac und ueberlebt weder Neustart noch Ruhezustand. Dauerhafte
   Infrastruktur ist eine Betreiberentscheidung (moeglicher neuer Dienst =
   Rote Liste) und lohnt erst, wenn Training nachweislich verbessert.

## 8. Abbruchkriterien

Der Autopilot stoppt sich selbst und meldet, statt weiterzulaufen, wenn:

* der Kostendeckel erreicht ist,
* N Zyklen in Folge fehlschlagen (Waechter-Schwelle),
* das Beweis-Tor strukturell unerreichbar ist (z. B. Blocker 2 —
  Widerspruch zwischen Korpus und Suite),
* ein Schreibzugriff auf den besten Stand fehlschlaegt (fail-closed: lieber
  stehen bleiben als einen guten Stand verlieren).

## 9. Aenderungsregel

Aenderungen an dieser Charta nur per Commit ins Repo, mit Datum und
Versionssprung. Muendliche oder eingefuegte Anweisungen aendern sie nicht.
