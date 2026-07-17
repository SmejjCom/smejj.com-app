# smejj 1.0 Training Rights Review

Status: technische Compliance-Entscheidung, keine Rechtsberatung  
Review-Datum: 2026-07-10  
Letzte Online-Nachprüfung: 2026-07-10T14:31:28Z  
Geltung: bis zur nächsten nachweisbaren Änderung von Vertrag, Lizenz oder
Artefakt; vor jeder Nutzung erneut zu prüfen

## Entscheidung

Für Phase 1 dürfen weder Z.ai-/GLM-API- noch Moonshot-/Kimi-API-Prompts,
API-Ausgaben, Reviews, synthetische Labels oder daraus abgeleitete Daten zum
Training, Fine-Tuning, Distillieren, Optimieren oder Bewerten von smejj 1.0
verwendet werden.

Qwen3-8B ist als mögliches Open-Weight-Basismodell vorgemerkt, aber nicht
freigegeben. Die Apache-2.0-Lizenz eines Upstream-Kandidaten ersetzt nicht den
Nachweis, welches konkrete Artefakt der laufende Salad-Dienst tatsächlich lädt.

Historische Task Capsules, Jobs und Logs bleiben unabhängig von ihrer
Modellquelle ausgeschlossen, weil record-spezifische Einwilligung,
Rechteprovenienz und Datenschutzprüfung fehlen.

## Architektur

Rechte werden nicht aus einem Modellnamen oder einer erfolgreichen API-Antwort
abgeleitet. Jede Quelle verweist auf einen versionierten Rights-Ledger-Eintrag:

```text
Quelle und exakte Revision
  -> Vertrag oder Open-Weight-Lizenz
  -> Trainings- und Derivatrecht ausdrücklich positiv?
  -> Permission verifiziert und nicht abgelaufen?
  -> Datenschutz, Vertraulichkeit und Aufbewahrung geklärt?
  -> Lizenz, Notices, Inventar und Checksums archiviert?
  -> erst dann technische Eligibility-Prüfung
```

Fehlt eine positive Antwort, ist `trainingUse: denied` maßgeblich. Ein späteres
Terms-Update hebt die Sperre nicht automatisch auf.

## Quellenprüfung

### Z.ai API und GLM-5.2

Die [Z.ai API Terms of Use](https://docs.z.ai/legal-agreement/terms-of-use)
weisen den Stand 2026-04-14 aus. Nach technischer Compliance-Auslegung
untersagen sie, Z.ai-Modelle, Prompts oder generierte Inhalte für Entwicklung,
Training, Labeling, Fine-Tuning, Optimierung oder Iteration externer Modelle und
konkurrierender Modellentwicklung zu verwenden.

Entscheidung: `denied`. GLM-5.2 darf weiterhin gemäß Betriebsfreigabe als
Inferenzmodell genutzt werden, seine API-Ein- und -Ausgaben dürfen jedoch nicht
in smejj-1.0-Trainingskandidaten, synthetische Datensätze, Reward-Signale oder
Distillationsdaten einfließen.

### Moonshot OpenPlatform und Kimi K2.7 Code

Die [Kimi OpenPlatform Model Use Terms](https://platform.kimi.ai/docs/agreement/modeluse)
weisen den Stand 2026-05-27 aus. Sie enthalten nach technischer
Compliance-Auslegung keine positive Freigabe, API-Inhalte zum Training eines
externen Modells zu verwenden, und untersagen ohne Autorisierung die Erstellung
potenziell konkurrierender Produkte, Dienste oder Modelle.

Die [Kimi Privacy Policy](https://platform.kimi.ai/docs/agreement/userprivacy)
beschreibt außerdem eine mögliche standardmäßige Verwendung von Ein- und
Ausgaben zur Serviceverbesserung. Ohne gesonderte, belastbare
Unternehmensvereinbarung dürfen deshalb keine vertraulichen Repositories,
personenbezogenen Daten, Secrets oder privaten Nutzerdaten an die API gesendet
werden.

Entscheidung: `denied`. Kimi K2.7 Code darf im genehmigten Betrieb als
Inferenz-, Kontroll- oder Gegenprüfungsmodell eingesetzt werden, aber nicht als
Lehrer, Labelquelle, Judge für Trainingslabels oder Distillationsquelle von
smejj 1.0.

### Qwen3-8B Upstream-Kandidat

Der geprüfte Upstream-Kandidat ist
[Qwen/Qwen3-8B, Revision b968826d9c46dd6066d109eabc6255188de91218](https://huggingface.co/Qwen/Qwen3-8B/tree/b968826d9c46dd6066d109eabc6255188de91218).
Das Repository weist in dieser Revision
[Apache License 2.0](https://huggingface.co/Qwen/Qwen3-8B/blob/b968826d9c46dd6066d109eabc6255188de91218/LICENSE)
aus. Damit ist der Upstream-Kandidat grundsätzlich für eine vertiefte
Open-Weight-Prüfung geeignet.

Die aktuelle Salad-Laufzeit ist trotzdem nicht attestiert. Noch zu belegen sind
mindestens:

- exakte Repository-ID und unveränderliche Modellrevision;
- Dateiinventar und SHA-256-Checksums aller Gewichte;
- Gewichtsformat, Quantisierung und Adapterstand;
- Tokenizer-Dateien und deren Revision;
- Lizenzdatei, Copyright-Hinweise und Third-Party-Notices;
- unveränderlicher Digest des verwendeten TGI-Container-Images;
- vollständiger Ladepfad vom IDrive-e2-Objekt bis zum laufenden Prozess.

Die Online-Nachprüfung sah ausschließlich den veränderlichen Image-Tag
`saladtechnologies/text-generation-inference:3.3.0-qwen3-8b`; ein Image-Digest,
eine Weight-Revision und ein Tokenizer-Inventar werden von dieser
Containerdefinition nicht belegt. Die frühere Gruppe `smejj-llm-qwen3` wurde
nach sicherer Schlüsselrotation gestoppt. Die Ersatzgruppe
`smejj-llm-qwen3-v2` übernimmt denselben, weiterhin nicht attestierten
Inference-Stand und erteilt deshalb ebenfalls keine Trainingsfreigabe. Sie
erreichte innerhalb des begrenzten Kostenfensters keinen Running-Zustand und
wurde ebenfalls gestoppt; Autostart ist aus und alle aktiven Instanzzähler sind
null.

Entscheidung: `conditional`, technisch weiterhin blockiert. Vor Abschluss
dieser Attestierung darf der Dienst weder Basismodell für Training noch Beleg
für Reproduzierbarkeit sein.

### Separat bezogene Open-Weight-Modelle

Die API-Entscheidung sagt nichts automatisch über separat bezogene
Open-Weight-Artefakte aus. Umgekehrt erlaubt eine Weight-Lizenz nicht die
Verwendung von API-Prompts oder API-Ausgaben. Jedes GLM-, Kimi-, Qwen- oder
sonstige Artefakt benötigt einen eigenen, revisionsgebundenen Lizenz- und
Notice-Review nach `MODEL_LICENSE_AND_NOTICE_POLICY.md`.

## Ordnerstruktur

```text
idrive-layout/manifests/training/provider-rights.json
  technische Allow-/Deny-Entscheidungen je Quelle

idrive-layout/manifests/training/smejj-1-0-base-model-gate.json
  Identitäts- und Lizenz-Gate für das reale Basismodell

idrive-layout/manifests/training/legacy-capsules-policy.json
  generelle Sperre historischer operativer Daten

schemas/provider-training-rights.schema.json
  maschinenprüfbarer Ledger-Vertrag
```

Spätere Evidenzobjekte gehören versioniert und unveränderlich nach IDrive e2.
Sie dürfen keine Credentials oder Vertragsgeheimnisse enthalten; sensible
Verträge werden verschlüsselt und nur über Least-Privilege-Zugriff referenziert.

## Implementierung

Der Phase-1-Rights-Ledger setzt Z.ai API, Kimi API und historische operative
Daten auf `denied`. Qwen3-8B bleibt `conditional`, bis das tatsächlich geladene
Artefakt vollständig identifiziert ist. Die Trainingspolicy verlangt für jede
nicht menschliche First-Party-Quelle gleichzeitig:

- `trainingUse: allowed`;
- `derivativeTrainingUse: allowed`;
- verifizierte schriftliche Permission-ID;
- nicht abgelaufene Gültigkeit;
- exakte Artefaktrevision.

Fehlt nur eine Bedingung, bleibt der Record gesperrt. Eine Modellantwort darf
nicht durch Paraphrasieren, Zusammenfassen, Review, Mehrheitsvoting oder
deterministische Nachbearbeitung von `denied` zu `allowed` werden.

Vor jeder späteren Freigabe sind die aktuellen Bedingungen erneut von der
offiziellen Quelle abzurufen, mit Abrufzeitpunkt und Inhaltshash zu archivieren
und fachlich zu prüfen. Erforderlich sind außerdem Datenschutz-,
Vertraulichkeits-, Aufbewahrungs-, Lösch-, Territoriums- und
Unterauftragsverarbeiter-Prüfung.

## Tests

Automatisierte Negativtests müssen mindestens beweisen:

- direkte Z.ai- und Kimi-API-Quellen werden abgelehnt;
- deren Outputs bleiben auch nach Transformation oder Review gesperrt;
- fehlende oder abgelaufene Permission blockiert;
- fehlende Artefaktrevision blockiert;
- Modelllabels sind keine zulässigen Qualitätslabels;
- historische Capsules werden nicht importiert;
- ein Apache-2.0-Upstream-Kandidat umgeht das Runtime-Identitäts-Gate nicht.

Eine spätere Positivprüfung darf erst hinzugefügt werden, wenn reale,
schriftlich verifizierte Evidenz vorliegt. Fiktive Permission-IDs oder
Test-Fixtures dürfen niemals in den produktiven Rights Ledger übernommen
werden.

## Memory Update

Vorgeschlagener Eintrag, erst nach erfolgreicher Gesamtprüfung zu übernehmen:

> Rights Review vom 2026-07-10: Z.ai-/GLM- und Moonshot-/Kimi-API-Daten sind für
> Training, Distillation und modellbasierte Labels von smejj 1.0 gesperrt.
> Qwen3-8B Revision b968826d9c46dd6066d109eabc6255188de91218 ist nur ein
> Apache-2.0-Upstream-Kandidat; die konkrete Salad-Laufzeit bleibt bis zur
> vollständigen Artefaktattestierung blockiert.

## Nächster Schritt

Die reale Qwen-Laufzeit ist ohne Ausgabe von Tokens oder Secrets zu attestieren.
Parallel sind Änderungen der drei offiziellen Terms-/Privacy-Quellen zu
überwachen. Eine Ausnahme für API-Daten ist nur mit ausdrücklicher schriftlicher
Provider-Autorisierung, Rechtsprüfung, Nutzerfreigabe und neuem versioniertem
Rights-Ledger-Eintrag zulässig. Bis dahin findet kein Training statt.
