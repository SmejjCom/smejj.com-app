# Auftrag: eigenes Modell von smejj.com live bringen und rund um die Uhr messen

Fertiger Auftrag zum Einfügen in eine neue Sitzung. Absichtlich vollständig —
die andere Sitzung kennt das Vorgespräch nicht.

Kopierhilfe: `smejj.com Auftrag-Modell-live.command`.

---

## AUFTRAG

Du arbeitest am Projekt smejj.com. Ziel: das eigene Modell soll endlich
existieren, rund um die Uhr antworten und gemessen werden.

### Ausgangslage — gemessen am 01.08.2026, nicht geschätzt

- Im Modell-Lager auf IDrive e2 (Eimer `smejj-model-files`) liegen:
  `model-files/glm-5-2-fp8/` 755,7 GB und `model-files/kimi-k2-7/` 595,2 GB.
- **`model-files/smejj-1-0/` ist ein LEERER Ordner (0 Byte).**
- **`model-files/qwen3-6-35b-a3b/` existiert nicht**, obwohl
  `src/shared/modelRegistry.js` für `smejj-fast-1` genau darauf zeigt.
- Es hat **nie ein Training stattgefunden**. Der Dienst `smejj-training-loop`
  meldet dauerhaft `trainingCycleEnabled: false`; das projektweite
  Erfassungstor ist ebenfalls aus. Es gibt null Trainingsbeispiele.
- Antworten kommen heute von eingekauften APIs: die Schnellspur nutzt
  `groq:llama-3.1-8b-instant`, Coding läuft über den Control-Router auf
  `zhipu:glm-4.7-flash` (kostenlos).
- Die Prüfsuite `evals/suites/smejj-chat-core-v1.json` (14 Fälle) misst alle
  6 Stunden. Zuletzt 73,53 % bis 85,29 % — der Wert schwankt, weil die
  Antwortkette mit `temperature: 0.35` läuft und je Fall nur EINE Ziehung
  gemessen wird.

### Zielsetzung — bitte ehrlich lesen, bevor du beginnst

Der Betreiber wünscht ein Modell auf dem Niveau von ChatGPT, Claude oder
Gemini innerhalb von drei bis vier Tagen. **Das ist nicht erreichbar** und du
sollst es auch nicht versprechen: Modelle dieser Klasse kosten dreistellige
Millionenbeträge an Rechenzeit. Wer das in vier Tagen auf einer Einzel-GPU
zusagt, täuscht den Betreiber.

**Was in drei bis vier Tagen erreichbar ist — und der eigentliche Auftrag:**

1. Ein **eigenes, selbst gehostetes Modell existiert wirklich** — Gewichte im
   Lager, Dienst läuft, es antwortet.
2. Es läuft **rund um die Uhr** und ist über den bestehenden Router wählbar.
3. Es wird **mit derselben Suite gemessen** wie die eingekauften Modelle, also
   direkt vergleichbar.
4. **Messziel:** das eigene Modell schlägt die heutige Schnellspur
   (`llama-3.1-8b-instant`, zuletzt 73,53–85,29 %) auf derselben Suite. Das ist
   ein realistisches, überprüfbares Ziel — und ein echter Fortschritt.

Formuliere gegenüber dem Betreiber niemals „auf Claude-Niveau", sondern nenne
die gemessene Punktzahl gegen die Schnellspur.

### Schritte

**A. Basismodell wählen und beschaffen (kostenlos, Stunden)**
- Ein offenes Modell mit starker Coding-Leistung, das auf eine 24-GB-Karte
  passt. Kandidaten prüfen, nicht raten: Qwen3-Coder-30B-A3B (MoE, ~3 Mrd
  aktive Parameter) oder ein vergleichbares, quantisiertes 30B-Modell.
- Lizenz prüfen und im Task Capsule festhalten. Nur Lizenzen verwenden, die
  kommerzielle Nutzung erlauben.
- Nach `model-files/smejj-1-0/original/` auf IDrive e2 laden. Es gibt bereits
  ein Werkzeug dafür: `scripts/model-management/stream_hf_model_to_idrive.mjs`.
  Nicht neu bauen.

**B. Inferenz-Dienst aufsetzen (kostenpflichtig, siehe Kosten)**
- Der Salad-Container `smejj-fast-1` existiert bereits (llama.cpp-Server,
  RTX-4090-Klasse, 100 GB Datenträger), steht aber auf STOPPED.
- Modell laden, Dienst starten, OpenAI-kompatiblen Endpunkt bereitstellen.
- **Nicht** vor der Kostenfreigabe starten (siehe unten).

**C. In den Router einhängen (kostenlos)**
- `src/shared/modelRegistry.js`: Eintrag `smejj-fast-1` auf den tatsächlichen
  Pfad korrigieren (heute zeigt er ins Leere) und die Laufzeit-Adresse setzen.
- Fail-closed beibehalten: ohne erreichbaren Dienst muss der Router wie bisher
  auf die eingekauften Modelle zurückfallen. Kein Nutzer darf einen Fehler
  sehen, nur weil das eigene Modell gerade nicht läuft.

**D. Messen (kostenlos)**
- Die bestehende Suite gegen das eigene Modell laufen lassen und das Ergebnis
  neben die Schnellspur stellen.
- **Wichtig:** je Fall mehrfach messen. Eine Einzelmessung schwankt um bis zu
  12 Prozentpunkte allein durch Zufall — das ist belegt in
  `task-capsules/2026/07/job_einbruch_aufklaerung_20260731/`.

**E. Erst danach über Feintuning entscheiden**
- Ein LoRA-Feintuning braucht erlaubte Trainingsdaten. Die gibt es heute nicht:
  die Trainingsdaten-Richtlinie sperrt Ausgaben von Fremdmodell-APIs, und
  eigene Daten wurden nie gesammelt. Details:
  `docs/architecture/SMEJJ_1_0_TRAININGSWEG.md`.
- Ohne Daten ist Feintuning gegenstandslos. Nicht anfangen, sondern melden.

### Kosten — echte Preise aus dem Salad-Portal, Stand 01.08.2026

| GPU | pro Stunde | rund um die Uhr, 30 Tage |
|---|---|---|
| RTX 3090 (24 GB) | 0,25 USD | **ca. 180 USD/Monat** |
| RTX A5000 (24 GB) | 0,25 USD | ca. 180 USD/Monat |
| RTX 4090 (24 GB) | 0,30 USD | **ca. 216 USD/Monat** |
| RTX 5090 (32 GB) | 0,45 USD | ca. 324 USD/Monat |

Heute kostet der gesamte Betrieb **6 USD im Monat**. Ein eigenes Modell rund um
die Uhr ist damit eine Verdreißigfachung der laufenden Kosten.

**Das ist ein Punkt der Roten Liste.** Hole vor dem Start des GPU-Dienstes die
ausdrückliche schriftliche Freigabe des Betreibers ein, mit genannter GPU-Klasse
und Monatsbetrag. Ohne diese Freigabe: Schritte A, C und D vorbereiten, Dienst
NICHT starten, und den Betrag melden.

**Günstigere Alternative, die du ihm nennen sollst:** Coding läuft bereits auf
`glm-4.7-flash` und kostet 0,00 USD. Ein eigenes Modell bringt Unabhängigkeit
und Kontrolle — Qualität allein rechtfertigt die 180 bis 216 USD im Monat
nicht, solange die kostenlose Kette messbar gleich gut oder besser ist. Diese
Abwägung gehört in den Bericht.

### Harte Grenzen

- **Prüfsuite NICHT lockern**, Schwellen nicht verschieben, keinen Fall
  entfernen. Sonst misst man sich selbst schön.
- **Kein Modell befördern ohne menschliche Freigabe.**
  `src/evaluation/modelPromotion.js` verlangt sie — nicht umgehen.
- **Fail-closed:** fällt das eigene Modell aus, antwortet die bestehende Kette
  weiter. Kein Nutzer sieht einen Fehler.
- **Maximal 800 Zeilen pro Datei** (`npm run check:guidelines`). Mehrere
  betroffene Dateien liegen bereits an der Grenze.
- **Schreibweise immer `smejj.com`**, nie in Grossbuchstaben, nie mit grossem
  Anfangsbuchstaben. Ausnahme: Umgebungsvariablen wie `SMEJJ_MODEL_...`.
- **Keine Trainingsdaten aus Fremdmodell-APIs.** Das ist die eigene Richtlinie
  des Projekts, nicht verhandelbar.

### Fallen, die hier bereits Zeit gekostet haben

- Der lokale Frontend-Klon `~/smejj-app-frontend` ist veraltet (Juli-Branch,
  Service Worker v133 gegen live v194). **Immer frisch klonen.**
- Zeaburs „Restart" lädt Umgebungsvariablen **nicht** neu — nur „Redeploy".
- Der Salad-Bearbeitungsdialog zeigt alle Zugangsdaten im Klartext. Änderungen
  besser über die Salad-API mit `{container:{environment_variables:…}}` —
  flach gesendet antwortet sie 200 und ändert nichts. Immer zurücklesen.
- Der LIVE-Control-Server ist der **Salad**-Container `smejj-control`, nicht
  der gleichnamige Zeabur-Dienst.
- Der Messdienst hat absichtlich keine öffentliche Adresse; 404 von aussen ist
  richtig. Prüfen über das Zeabur-Container-Terminal.

### Pflicht vor dem Abschluss

1. `npm run check:guidelines`, `check:architecture`, `check:evaluation`,
   `check:training-loop`, `check:ai` — alle grün.
2. Live-Test: das eigene Modell antwortet über den Router, belegt durch den
   Antwortkopf `x-smejj-model-backend`.
3. Messung gegen die Suite, mehrfach je Fall, Ergebnis neben die Schnellspur.
4. Task Capsule mit Lizenz des Basismodells, Messwerten und Kosten.

### Abnahmekriterium

Das eigene Modell antwortet rund um die Uhr über den Router, und es liegt eine
Messung vor, die es direkt mit der eingekauften Schnellspur vergleicht. Ist es
schlechter, wird das berichtet und nicht beschönigt — dann ist die richtige
Empfehlung, die kostenlose Kette weiterzunutzen und das eigene Modell erst mit
Feintuning nachzuziehen.
