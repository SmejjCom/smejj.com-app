# EU AI Act — Bestandsverzeichnis der KI-Systeme von smejj.com

> Stand: 2026-07-28 · Betreiber: smejj.com · Verantwortlich: Wof Kadavanich
> Naechste Pflichtpruefung: bei jeder Aenderung an Modellen, Zweck oder Routing.

## Wozu dieses Dokument

Ab **2. August 2026** beginnt die aktive Durchsetzung der EU-KI-Verordnung; die
Transparenzpflichten werden verbindlich und die technische Dokumentation ist
aufzubewahren. Dieses Verzeichnis ist die eine Stelle, an der steht, **welche
KI-Systeme smejj.com einsetzt, wofuer, von wem, mit welcher Einstufung und mit
welcher Protokollierung**.

**Rechtlicher Hinweis:** Dies ist eine Selbsteinschaetzung des Betreibers auf
Basis des Systemverhaltens, keine Rechtsberatung. Die Einstufungen sind
begruendet und nachvollziehbar dokumentiert, damit eine juristische Pruefung
darauf aufsetzen kann statt bei null anzufangen.

## Rolle von smejj.com

smejj.com ist **Betreiber** (deployer) fremder KI-Modelle, die ueber APIs
angebunden sind, und **Anbieter** (provider) der eigenen Automatisierung
(Maus-Engine) sowie perspektivisch des eigenen Modells smejj 1.0. Die Gewichte
der Fremdmodelle werden nicht veraendert; es findet kein Fine-Tuning statt
(Training Capture ist fail-closed aus, siehe
`docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md`).

## Verzeichnis

| System | Zweck | Anbieter | Einstufung | Transparenzhinweis | Protokollierung |
|---|---|---|---|---|---|
| **glm-5.2** | Chat, Codeerzeugung, Reasoning | Zhipu / Z.ai (API) | begrenztes Risiko (Art. 50) | erforderlich | Job-Protokoll + Audit-Log |
| **llama-4-70b** (Welle 2) | Schnellantworten | Groq (API) | begrenztes Risiko (Art. 50) | erforderlich | Job-Protokoll |
| **kimi-k2.7 / k3** | Reserve-Fundament | Moonshot (API) | begrenztes Risiko (Art. 50) | erforderlich | Job-Protokoll |
| **ox-alpha** | Chat-Antworten (Menü Nr. 3) | Stealth / OpenRouter (API) | begrenztes Risiko (Art. 50) | erforderlich | Job-Protokoll |
| **cline-bridge** | Coding-Agent | Cline (API) | begrenztes Risiko (Art. 50) | erforderlich | Job-Protokoll |
| **maus-engine-v2** | autonome Browser-Steuerung | smejj.com (eigen) | begrenztes Risiko, **kein Hochrisiko** — siehe `RISIKOEINSTUFUNG_MAUS_ENGINE.md` | erforderlich, **verschaerft** | Job-Protokoll + Artefakte + Audit-Log |
| **voice-tts-premium** | Sprachausgabe | smejj.com (eigen) | begrenztes Risiko (Art. 50 Abs. 2) | erforderlich | Job-Protokoll |
| **embed-bm25** | Suche / RAG | smejj.com (eigen) | minimales Risiko | nicht erforderlich | — |
| **smejj 1.0** | eigenes Zielmodell | smejj.com (eigen) | noch nicht produktiv | bei Inbetriebnahme neu zu bewerten | — |

## Keine Hochrisiko-Anwendung

Keines der Systeme faellt unter die Hochrisiko-Kategorien des Anhangs III.
Geprueft und jeweils **nicht zutreffend**:

- Biometrie und Emotionserkennung — findet nicht statt
- Kritische Infrastruktur — smejj.com steuert keine
- Allgemeine und berufliche Bildung — keine Bewertung von Lernenden
- Beschaeftigung, Personalauswahl — keine Bewerber- oder Leistungsbewertung
- Wesentliche private und oeffentliche Dienste — keine Kredit-, Sozial- oder
  Versicherungsentscheidungen
- Strafverfolgung, Migration, Justiz — kein Einsatz in diesen Bereichen

smejj.com ist ein Werkzeug zur Softwareentwicklung. Die Ausgaben sind Vorschlaege
an eine Person, die sie prueft und uebernimmt oder verwirft.

## Verbotene Praktiken (Art. 5) — Selbstpruefung

Ebenfalls geprueft und jeweils **nicht zutreffend**: unterschwellige
Beeinflussung, Ausnutzung von Schutzbeduerftigkeit, Social Scoring, vorhersagende
Polizeiarbeit, ungezieltes Auslesen von Gesichtsbildern, Emotionserkennung am
Arbeitsplatz, biometrische Kategorisierung.

## Pflichtenuebersicht und Erfuellungsstand

| # | Pflicht | Stand | Wo umgesetzt |
|---|---|---|---|
| 1 | Kennzeichnung KI-erzeugter Inhalte (Art. 50 Abs. 2) | erfuellt | Antwort-Header `x-smejj-ai-generated`, `aiTransparency.js` |
| 2 | Hinweis auf Interaktion mit einem KI-System (Art. 50 Abs. 1) | erfuellt | `/api/compliance/ai-systems`, Produktname und Modellanzeige in der Eingabezeile |
| 3 | Technische Dokumentation | erfuellt | dieses Verzeichnis + Risikoeinstufung |
| 4 | Protokollierung der Laeufe | erfuellt | `control-server/src/jobs/jobStore.js`, `control-server/src/admin/auditLog.js` |
| 5 | Aufbewahrung | erfuellt | IDrive e2, Audit-Log unveraenderlich (If-None-Match + Hash-Kette) |
| 6 | Transparenzhinweis Maus-Engine (autonome Browser-Steuerung) | **erfuellt, serverseitig** | `aiTransparency.js`, ausgeliefert mit jeder Maus-Engine-Antwort |
| 7 | Risikoeinstufung Maus-Engine | erfuellt | `RISIKOEINSTUFUNG_MAUS_ENGINE.md` |
| 8 | Menschliche Aufsicht | erfuellt | Abbruch jederzeit moeglich, Budget-Gate blockiert vorab |
| 9 | In-App-Banner fuer den Maus-Engine-Lauf | **offen — Design-Lock** | siehe unten |

### Zu Punkt 9 — der einzige offene Punkt

Ein zusaetzlicher, sichtbarer Banner waehrend eines Maus-Engine-Laufs beruehrt
`public/index.html` und `public/browser-pane.js`. Beide stehen unter dem
Design-Lock (`docs/frontend/START_DESIGN_LOCK.md`) und duerfen ohne schriftliche
Freigabe des Betreibers nicht geaendert werden.

Der Hinweis wird deshalb bereits **serverseitig** mit jeder Antwort ausgeliefert
und ist ueber `/api/compliance/ai-systems` oeffentlich abrufbar — die
Informationspflicht ist damit erfuellt. Der Banner ist eine zusaetzliche,
freiwillige Verstaerkung. Der fertige Patch liegt bereit und braucht genau eine
schriftliche Freigabe.

## Aenderungshistorie der Modelle (nachweispflichtig)

| Datum | Aenderung | Wer | Grund |
|---|---|---|---|
| 2026-08-30 | ox-alpha ins Verzeichnis aufgenommen | ZCode (Betreiber-Freigabe "alle Rechte von A bis z") | Drift-Befund der EU-AI-Act-Wache (Nr. 68): aktives Modell ohne Eintrag |
| 2026-07-28 | Bestandsverzeichnis angelegt | Wof Kadavanich | AI-Act-Frist 2026-08-02 |
| 2026-07-28 | glm-5.2 auf Prioritaet 1 | Wof Kadavanich | Qualitaet |
| 2026-07-21 | Groq Welle 2 aufgenommen | Wof Kadavanich | 0-Euro-Runbook |
| 2026-07-14 | maus-engine-v2 in Betrieb | Wof Kadavanich | Abnahme dokumentiert |
| 2026-06-18 | gpt-oss-120b deaktiviert | Wof Kadavanich | Kosten |

Ab sofort wird jede Modelländerung ueber den Adminbereich vorgenommen und
erzeugt dort automatisch einen Audit-Eintrag (`model.priority.set`,
`model.enable`, `model.disable`). Diese Tabelle bleibt als Anfangsbestand
bestehen; der Audit-Log ist ab 2026-07-28 die fuehrende Quelle.

## Aufbewahrung

| Gegenstand | Frist | Ablage |
|---|---|---|
| Dieses Verzeichnis + Risikoeinstufung | 10 Jahre | Repository + IDrive e2 |
| Audit-Log | 10 Jahre, unveraenderlich | IDrive e2 `admin/audit/` |
| Job-Protokolle | 90 Tage | IDrive e2 |
| Abrechnungsbelege | 10 Jahre (§ 147 AO) | Stripe + IDrive e2 |
