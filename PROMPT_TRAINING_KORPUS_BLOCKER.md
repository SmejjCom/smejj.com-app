# Prompt: smejj.com Training — die drei Korpus-Blocker aufloesen (Stand 2026-08-05)

Diesen gesamten Text in einen neuen Chat kopieren.

## Kontext

Du arbeitest im Projektordner der smejj.com App. Lies zuerst und halte dich
strikt daran:

* `AGENTS.md` und `MASTER_PROMPT.md` (Autonomie-Charta, Gruene/Rote Liste)
* `docs/policy/AUTOPILOT_TRAINING_CHARTA.md` (verbindlicher Auftrag des
  Trainings-Autopiloten, v1.1)
* `docs/architecture/TRAININGSKORPUS_VERMESSUNG_2026-08-05.md` (die Messung,
  aus der diese Aufgaben stammen)
* `workers/smejj-lora-loop/README.md` (was die Schleife kann und was nicht)
* `evals/packs/training-daten-policy.json` (Herkunftsregeln fuer Trainingsdaten)

## Was bereits ERLEDIGT und gemessen ist (NICHT wiederholen)

1. **Schleife und Trainer funktionieren.** Erster echter Zyklus am 2026-08-05
   gelaufen (rund 1,8 Cent pro Zyklus, Deckel 50 USD, Freigabe
   `freigabe-2026-08-01-dauertraining`, GPU-Stufe `batch`).
2. **Adapter-Persistenz ist gebaut und bewiesen** (`s3.py`/`ablage.py`,
   Upload auf IDrive e2; Container-Ersatz ueberlebt).
3. **Die Pruefsuite ist repariert** (Commit `bc0c299`): die Namensregel
   unterscheidet Gebrauch von Erwaehnung, `naming-schreibweise` besteht mit
   92 % und ist nicht mehr der Blocker.
4. **Der eigentliche Befund steht fest:** Training macht das Modell derzeit
   SCHLECHTER — Grundlinie 95,88 %, trainiert 67,89 %, sechs kritische
   Faelle. Das Qualitaetstor verwirft zu Recht. Ursache ist der Korpus,
   nicht das Tor und nicht der Trainer.
5. **Der Korpus ist vermessen:** 112 Dokumente, 2.097 Zeilen — aber nur
   **699 echte Fakten**, jeweils mit drei fest verdrahteten Frage-Schablonen
   (`src/training/projectcorpus/extract.js`). Das sind rund 2 % der im
   Trainingsplan veranschlagten 30.000 Beispiele. Vier der sechs
   durchgefallenen Faelle (`schutz-daten-loeschen`, `schutz-api-schluessel`,
   `schutz-design-lock`, `regel-800-zeilen`) betreffen Regeln aus
   MASTER_PROMPT.md und AGENTS.md — und genau diese zwei Dokumente fehlen in
   den Korpusquellen.

## Verbindliche Regeln

* **Keine Pruefung abschwaechen, damit Zahlen besser aussehen.** Das Tor
  arbeitet korrekt; veraendert werden Daten und Werkzeuge, nicht der Massstab.
* **Trainingsdaten-Policy:** Fragen duerfen NICHT von einem Fremdmodell frei
  erzeugt werden. Zulaessig sind deterministische Schablonen im Code und von
  Hand geschriebene oder aus echten Nutzerfragen stammende Formulierungen.
  Neue Schablonen-Saetze gelten als Werkzeug-Code: entwerfen, dem Betreiber
  als Liste zur Freigabe zeigen, erst nach Freigabe einbauen.
* Secrets niemals anzeigen, loggen oder selbst setzen. Loop-Start nutzt
  `~/.config/smejj.com/env.local` (Werte nie ausgeben).
* Naming exakt `smejj.com`; jede Datei unter 800 Zeilen; nichts als bestanden
  dokumentieren, was nicht live gemessen wurde.
* Kosten: Deckel 50 USD gilt weiter. Ein Messzyklus in der Stufe `batch` kostet
  rund 1,8 Cent.
* **ÜBERHOLT — DIESER AUFTRAG RUHT (Stand 2026-08-06).** Hier stand bis eben
  „Dauerlauf ist freigegeben, mach weiter" mit dem Zusatz, wer die Schleife
  stoppe, handle gegen eine Freigabe. Das galt am Vormittag des 2026-08-05.
  **Danach hat der Betreiber entschieden, dass das Training ruht**
  (`docs/policy/AUTOPILOT_TRAINING_CHARTA.md` v1.2, Abschnitt 0; RAG bleibt die
  Antwort). Die Charta ist die verbindliche Fassung, dieser Prompt nicht.
  Wer die Schleife startet, handelt jetzt GEGEN die Charta.
* **Warum das hier stehenbleibt statt geloescht zu werden:** ein Satz mit
  „ausdrueckliche Freigabe" in einem Arbeitsauftrag ueberlebt die Entscheidung,
  die ihn aufhebt — und die naechste Sitzung liest ihn als gueltig. Genau das
  ist am 2026-08-06 passiert. Ein aufgehobener Auftrag muss als aufgehoben
  dastehen, nicht verschwinden.
* Die Gruppe heisst seit dem 2026-08-06 **`smejj-lora-trainer-batch`** und steht
  auf Stufe `batch` (0,09 USD/h, 64,80 USD/Monat). Die alte Gruppe wurde dafuer
  geloescht; Salad haelt geloeschte Namen belegt, daher der neue Name. Neue
  Adresse: `fig-ranch-asdha4o0meo6huq6.salad.cloud`. Sie ist **gestoppt**.

## Die drei Blocker — Aufgaben in dieser Reihenfolge

### Blocker 1 — Der Abschnitts-Zerleger versteht keine `====`-Gliederung

`MASTER_PROMPT.md` gliedert mit `====`-Trennern statt Markdown-Ueberschriften.
Der Zerleger in `src/training/projectcorpus/` findet darin fast nichts
(gemessen: MASTER_PROMPT.md ergaebe 1 Fakt, AGENTS.md 5). Derselbe Defekt
traf schon den RAG-Index (10 Abschnitte mit identischer Ueberschrift).

* Zerleger so ertuechtigen, dass `====`-getrennte Abschnitte mit ihrer
  jeweiligen Ueberschrift erkannt werden. Bestehende Markdown-Zerlegung darf
  sich nicht veraendern (Tests!).
* Mit Tests belegen: MASTER_PROMPT.md und AGENTS.md liefern danach deutlich
  mehr als 1 bzw. 5 Fakten; die bisherigen Quellen liefern unveraendert
  dieselben Fakten wie vorher (Regressionszahl 699 festhalten und vergleichen).
* Pruefen, ob der RAG-Index denselben Zerleger nutzt — wenn ja, profitiert er
  mit; wenn nein, notieren, NICHT nebenbei umbauen.

### Blocker 2 — Die Regeldokumente fehlen in den Quellen

Erst NACH Blocker 1 (sonst bringt es nur 6 Fakten):

* Quellenliste des Korpus-Bauers um `MASTER_PROMPT.md` und `AGENTS.md`
  erweitern.
* Korpus neu bauen und neu vermessen: Dokumente, Zeilen, echte Fakten,
  Herkunftsverteilung (Top-Quellen). Ergebnis gegen die Vermessung vom
  2026-08-05 stellen.
* Manifest-Herkunft bleibt `first-party-owned` / `human-first-party` — die
  neuen Quellen sind Betreiber-Dokumente, das passt. Nichts anderes zufuegen.

### Blocker 3 — Drei Schablonen sind keine Vielfalt

Die Suite stellt 295 natuerliche Fragen; der Korpus kennt drei Frageformen.
Das Modell lernt "auf eine Ueberschrift den Abschnitt aufsagen" und verliert,
was das Basismodell konnte (Verteilungsbruch, gemessen: 95,88 → 67,89 %).

* Einen Satz neuer Frage-Schablonen ENTWERFEN (Ziel: deutlich mehr Formen,
  verschiedene Laengen und Perspektiven — Verbotsfragen, Entscheidungsfragen,
  "Darf ich…", "Was passiert, wenn…", Szenariofragen), als nummerierte Liste
  dem Betreiber zur Freigabe vorlegen. NICHT vorab einbauen.
* Nach Freigabe: Schablonen deterministisch in `extract.js` (oder sauber
  daneben) einbauen, Korpus neu bauen, Manifest hochladen.
* Merksatz aus der Vermessung beachten: drei Formulierungen derselben Frage
  sind keine drei Beispiele. Vielfalt zaehlt pro Fakt, nicht pro Zeile.

### Abschlussmessung — der Beweis

* Einen Trainingszyklus mit dem neuen Korpus fahren (batch, ~2 Cent) und die
  volle Suite messen (14 Faelle, 3 Wiederholungen, `max_tokens` mindestens
  700 — beim Reasoning-Modell nur den Teil hinter `</think>` bewerten).
* Erfolgskriterium ist NICHT "befoerdert": Erfolg ist, dass die trainierte
  Punktzahl sich der Grundlinie 95,88 % naehert und die kritischen Faelle
  sinken. Verwirft das Tor weiter, ist das ein ehrliches Ergebnis — dann
  steht die Menge (699 → 30.000) als naechste Arbeit an, nicht ein weiterer
  Umbau.
* Ergebnis unbeschoenigt in `Memory_Bank.md` (800-Zeilen-Grenze beachten)
  und als kurzes Dokument unter `docs/architecture/` festhalten.

## Bekannte Messfallen (alle schon einmal in die Irre gefuehrt)

* `signedS3List` liefert auf `smejj-model-files` IMMER 0 Objekte (kein
  Listenrecht). Ein leeres Listing beweist nichts — gezielt per GET pruefen.
* Binaerdateien nie mit dem Textleser pruefen (`adapter_model.safetensors`
  sah dadurch "fehlend" aus, lag aber da).
* `max_tokens` zu klein schneidet im `<think>`-Block ab und sieht wie eine
  Falschantwort aus.
* Ein gesundes `/health` widerlegt keinen gemessenen Ausfall; Beweis fuer
  "laeuft" ist ein wanderndes `lastTickAt`.
* Container laden Code nur beim Start — nach jedem Deploy die laufende
  Version gegen den Repo-HEAD pruefen.

## Ausdruecklich NICHT Teil dieses Auftrags

* Dauerbetrieb-INFRASTRUKTUR (LaunchAgent/Container fuer die Schleife): kommt
  erst, wenn das Training nachweislich verbessert; ein neuer Dienst waere Rote
  Liste.
  **Nicht zu verwechseln mit dem Dauerlauf selbst — der ist freigegeben.**
  Die Schleife laeuft ueber `scripts/deploy/lora_dauerbetrieb_starten.sh`
  (nohup + disown) und ueberlebt das Sitzungsende, aber keinen Neustart des
  Rechners. Reboot-Festigkeit waere die Infrastruktur-Frage oben.
* Skalierung auf 30.000 Beispiele — erst wenn Form und Quellen stimmen.
* Aenderungen an Suite-Zusicherungen oder am Veto in `sweep.js`.

## Abschlusskriterien (alles muss zutreffen)

1. Zerleger-Tests gruen, 699 Bestandsfakten unveraendert reproduziert.
2. MASTER_PROMPT.md + AGENTS.md liefern messbar viele Fakten und sind Quellen.
3. Neue Schablonen vom Betreiber freigegeben und eingebaut.
4. Ein voller Zyklus + Suite gemessen, Ergebnis dokumentiert — egal wie es
   ausfaellt.
5. Commits einzeln und gezielt (`git add <datei>`, nie `-A`), Push auf den
   Arbeits-Branch.
