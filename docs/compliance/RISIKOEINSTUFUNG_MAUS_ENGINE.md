# Risikoeinstufung: Maus-Engine (autonome Browser-Steuerung)

> Stand: 2026-07-28 · System: `maus-engine-v2` · Anbieter: smejj.com (eigen)
> Ergebnis: **kein Hochrisiko-System.** Begrenztes Risiko mit verschaerfter
> Transparenzpflicht nach Art. 50.

**Rechtlicher Hinweis:** Selbsteinschaetzung des Betreibers auf Basis des
tatsaechlichen Systemverhaltens, keine Rechtsberatung.

## 1. Was das System tut

Die Maus-Engine ist eine zustandslose Worker-Huelle
(`workers/maus-engine/worker.mjs`), die auf Salad startet, **einen** Auftrag
ausfuehrt und sich danach sofort beendet. Sie arbeitet in zwei Stufen:

- **Stufe 1 (HTTP-only):** ruft Seiten ab und liest sie. Kein Browser, keine
  Interaktion. Der Playwright-Browser wird bewusst erst spaeter geladen.
- **Stufe 2 (Browser):** steuert einen echten Browser ueber Playwright —
  klicken, tippen, scrollen, navigieren — nach einem zuvor validierten
  Aktionsplan (`schemas/maus-action-plan.schema.json`).

Der Aktionsplan wird von einem Sprachmodell erzeugt, **vor der Ausfuehrung
gegen ein Schema validiert** (`plan-validator.mjs`) und erst dann interpretiert.
Alle Artefakte eines Laufs (Screenshots, Protokoll) landen auf IDrive e2.

## 2. Warum das kein Hochrisiko-System ist

Anhang III der KI-Verordnung zaehlt die Hochrisiko-Bereiche abschliessend auf.
Jeder Punkt wurde geprueft:

| Anhang-III-Bereich | Trifft zu? | Begruendung |
|---|---|---|
| Biometrie, Emotionserkennung | nein | Die Engine verarbeitet Seiteninhalte, keine biometrischen Daten |
| Kritische Infrastruktur | nein | Steuert keine Versorgung, keinen Verkehr, keine Netze |
| Bildung, Pruefungen | nein | Bewertet keine Lernenden |
| Beschaeftigung, Personalauswahl | nein | Trifft keine Personalentscheidungen |
| Wesentliche Dienste, Kreditwuerdigkeit | nein | Trifft keine Bonitaets- oder Leistungsentscheidungen |
| Strafverfolgung | nein | Kein Einsatz durch Behoerden |
| Migration, Grenzkontrolle | nein | Kein Einsatz in diesem Bereich |
| Justiz, demokratische Prozesse | nein | Kein Einsatz in diesem Bereich |

**Ergebnis:** kein Anhang-III-Fall. Die Maus-Engine ist ein
Automatisierungswerkzeug, das im Auftrag und im Kontext derselben Person
handelt, die es startet.

## 3. Warum die Transparenzpflicht trotzdem verschaerft gilt

Zwei Eigenschaften heben die Maus-Engine ueber ein gewoehnliches Chat-Modell:

1. **Sie handelt, statt zu antworten.** Ein Klick ist irreversibel, ein Satz
   nicht. Wer nicht weiss, dass eine Maschine seinen Browser bedient, kann das
   Ergebnis nicht richtig einordnen.
2. **Sie arbeitet ohne Zwischenbestaetigung.** Zwischen Auftrag und Ergebnis
   liegen viele Einzelschritte, die niemand einzeln freigibt.

Daraus folgt die Pflicht, **vor und waehrend** eines Laufs unmissverstaendlich
mitzuteilen, dass hier ein KI-System eigenstaendig einen Browser bedient.

## 4. Erkannte Risiken und was dagegen steht

| Risiko | Schutz | Wo |
|---|---|---|
| Ausfuehrung eines fehlerhaften oder manipulierten Plans | Schema-Validierung **vor** der Ausfuehrung; ungueltige Plaene werden abgewiesen | `plan-validator.mjs` |
| Unbemerkte Fremdsteuerung | Transparenzhinweis mit jeder Antwort; Lauf ist im Protokoll sichtbar | `aiTransparency.js` |
| Unkontrollierte Kosten | Budget-Gate blockiert vorab; Free-Guard steht auf 0 Euro Risiko | `budgetGate.js` |
| Endlosbetrieb | Worker beendet sich nach dem Lauf (`EXIT_AFTER_RUN`), Watchdog greift bei 10 Minuten | `worker.mjs`, `runtimeWatchdog.js` |
| Zugriff durch Unbefugte | Token-Auth am Worker, Auftrag nur ueber den Control-Server | `SMEJJ_MAUS_ENGINE_TOKEN` |
| Handeln auf fremden Konten | Der Lauf nutzt ausschliesslich den Kontext, den der Auftraggeber bereitstellt | Sitzungs-Store je Lauf |
| Prompt Injection aus Seiteninhalten | Seiteninhalte sind Daten, keine Anweisungen; der Plan steht vor dem Abruf fest | `plan-validator.mjs`, `interpreter.mjs` |
| Kein Nachweis im Streitfall | Artefakte und Protokoll je Lauf auf IDrive e2, Audit-Log unveraenderlich | `artifact-uploader.mjs`, `auditLog.js` |

## 5. Menschliche Aufsicht

- Der Lauf wird von einem Menschen ausgeloest, nie vom System selbst.
- Abbruch ist jederzeit moeglich (`/api/jobs/{id}` Abbruch, Watchdog).
- Das Budget-Gate blockiert **vor** der Ausfuehrung, nicht danach.
- Der Adminbereich zeigt laufende Worker und erlaubt das Stoppen.

## 6. Ergebnis

| Frage | Antwort |
|---|---|
| Verbotene Praktik nach Art. 5? | nein |
| Hochrisiko nach Anhang III? | **nein** |
| Transparenzpflicht nach Art. 50? | **ja, verschaerft** |
| Registrierungspflicht in der EU-Datenbank? | nein (folgt nur aus Hochrisiko) |
| Konformitaetsbewertung erforderlich? | nein (folgt nur aus Hochrisiko) |
| Dokumentation aufzubewahren? | ja, 10 Jahre |

## 7. Wann diese Einstufung neu zu pruefen ist

- Wenn die Maus-Engine in einem Anhang-III-Bereich eingesetzt wird
- Wenn sie ohne menschlichen Ausloeser startet
- Wenn sie auf Konten Dritter handelt
- Wenn sie Entscheidungen mit Rechtswirkung trifft
- Bei jeder Erweiterung des Aktionsplan-Schemas um neue Handlungsarten

Bis dahin gilt: **begrenztes Risiko, verschaerfte Transparenz, vollstaendige
Protokollierung.**
