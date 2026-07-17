# smejj 1.0 Training Data Policy

Status: verbindlich, fail-closed  
Stand: 2026-07-10  
Geltungsbereich: alle Daten für SFT, LoRA, QLoRA, DPO, Distillation,
Reward-Modelle, RAG-Evaluationen und Modell-Benchmarks von smejj.com

## Architektur

Operative Aufzeichnungen und Trainingsdaten sind zwei getrennte Systeme.

```text
Operative Task Capsule
  -> keine automatische Trainingsberechtigung
  -> Sanitization im Arbeitsspeicher
  -> explizite menschliche Capture- und Trainingseinwilligung
  -> Quellen-, Repository- und Provider-Rechteprüfung
  -> vollständige technische Qualitätsprüfung
  -> verschlüsselter Kandidat oder gesperrte Quarantäne
  -> familienbasierter Split
  -> immutable, manuell freizugebende Datensatzversion
```

Fehlende, widersprüchliche, abgelaufene oder nicht verifizierbare Evidenz führt
immer zu `denied` oder `quarantined`, niemals zu `candidate`.

## Zulässige Daten

Folgende Inhalte dürfen nur nach vollständiger Bereinigung, bestätigten Rechten
und expliziter Einwilligung als Kandidat verarbeitet werden:

- anonymisierte Aufgabenbeschreibung und Prompts;
- notwendige First-Party-Codeausschnitte und betroffene Dateipfade;
- verifizierte Patches und Diffs;
- redigierte Werkzeugaktionen und Terminalbefehle;
- redigierte Build-, Lint-, Typecheck- und Testresultate;
- reproduzierbare Fehler und erfolgreich verifizierte Fehlerbehebungen;
- menschliche Korrekturen, Akzeptanz oder Ablehnung;
- Rollback-Nachweis und technisch geprüftes Endergebnis;
- deterministische Labels aus Tests oder statischer Analyse.

Zulässigkeit einer Kategorie ist keine Speicherfreigabe. Jeder einzelne Record
benötigt die nachfolgenden Gates.

## Verbotene Daten

Folgende Inhalte dürfen nie in Trainingskandidaten, Datensätze, Modellartefakte
oder Training-Logs übernommen werden:

- Passwörter, Passphrases, API-Schlüssel, Tokens, Cookies und Credentials;
- private Schlüssel, Session-Daten und Authentifizierungsheader;
- personenbezogene Daten, private Nutzer-, Chat-, Datei- oder Datenbankdaten;
- private lokale Benutzerpfade und nicht erforderliche Infrastrukturadressen;
- Screenshots, Browservideos, HAR-Dateien, Storage State und rohe Header;
- nicht freigegebener proprietärer Code oder Inhalte Dritter;
- fehlgeschlagene, unvollständige, halluzinierte oder ungeprüfte Lösungen;
- Rohantworten, abgeleitete Labels oder Reviews von Z.ai-, Kimi- oder anderen
  Provider-APIs ohne vorherige positive, schriftlich verifizierte Erlaubnis;
- Daten aus historischen Task Capsules, Jobs oder Logs ohne record-spezifische
  neue Einwilligung, Rechteprüfung und erfolgreiche Neuverarbeitung.

Ein Redaction-Token macht unzulässige Herkunft nicht zulässig. Inhalte mit
unklaren Rechten bleiben auch nach Anonymisierung gesperrt.

## Einwilligung und Widerruf

Training Capture ist standardmäßig deaktiviert. Persistenz ist erst zulässig,
wenn ein Mensch nachweisbar und getrennt zugestimmt hat zu:

1. Erfassung für die Trainingskandidaten-Prüfung;
2. Verwendung für Modelltraining;
3. bestätigten Nutzungsrechten an den gelieferten Quellen.

Die Evidenz enthält eine nicht geheime Einwilligungs-ID und eine
Widerrufsreferenz. Schweigen, Produktnutzung, bestehende Logs oder technische
Erreichbarkeit gelten nie als Einwilligung.

Ein Widerruf setzt den Record auf `revoked`, sperrt ihn für neue Datensatz- und
Trainingsversionen und erzeugt eine nachvollziehbare Lösch- oder
Ausnahmeanweisung. Bereits trainierte Checkpoints dürfen nicht automatisch als
bereinigt gelten; ihre weitere Nutzung bedarf einer dokumentierten
Datenschutzentscheidung und gegebenenfalls Neu-Training.

Einwilligungen und Widerrufe werden ausschließlich über authentifizierte
Control-Routen angenommen. Der Control Server bindet den authentifizierten
Nutzer und das freigegebene Repository mit einem eigenen HMAC-Schlüssel an
opake Referenzen, signiert jedes Ledger-Ereignis mit einem zweiten, getrennten
HMAC-Schlüssel und bindet es an den SHA-256-Hash der angezeigten
Datenschutzerklärung. Rohidentität und Repository-URL werden nicht im Ledger
gespeichert. Ereignisse werden auf IDrive e2 nur mit `If-None-Match: *`
unter `training/consents/v1/` angelegt; Überschreiben ist verboten. Dafür sind
ausschließlich die getrennten `IDRIVE_E2_TRAINING_*`-Zugangsdaten und eine
explizite Prefix-Allowlist zulässig. Der Writer akzeptiert eine Anlage erst,
wenn ein zweites bedingtes PUT mit `412` die Unveränderlichkeit und ein
anschließendes GET Größe und SHA-256 des gespeicherten Inhalts bestätigt.

Ein Widerruf erzeugt ein signiertes Ereignis und einen getrennten, ebenfalls
signierten Widerrufssentinel. Bereits ein gültiger Teilnachweis sperrt die
betroffene Einwilligung, damit ein partieller Speicherfehler nie zu einer
Freigabe führt. Policy und Pipeline akzeptieren ausschließlich eine frisch aus
diesem Ledger aufgelöste Entscheidung. Einwilligungsfelder in Prompts,
Kandidaten oder API-Nutzdaten besitzen keine Autorität.
Eine aufgelöste Entscheidung ist höchstens 60 Sekunden verwendbar und muss vor
Persistenz sowie vor Datensatzaufnahme erneut gegen das Ledger aufgelöst werden.
Unzulässige zukünftige Zeitstempel und ältere Entscheidungen sperren den Vorgang.

## Rechte und Provenienz

Jeder Record muss seine Quellen mit unveränderlicher Artefaktrevision und einer
Rechte-Referenz benennen. Erforderlich sind:

- bestätigte Repository-Rechte für Training und abgeleitete Modelle;
- positive Provider-Erlaubnis für Training und Derivate, sofern eine
  Provider-Quelle beteiligt ist;
- verifizierte schriftliche Permission-ID und Gültigkeitszeitraum;
- genaue Modell-, API-, Vertrag- und Artefaktversion;
- ausschließlich erlaubte Labelquellen: Mensch, deterministische Tests oder
  statische Analyse.

Eine technische Erfolgsmeldung ersetzt keine Rechte. Die für Phase 1 gültige
Entscheidung ist in `SMEJJ_1_0_TRAINING_RIGHTS_2026-07-10.md` dokumentiert.

## Datenschutz und Verschlüsselung

Sanitization muss vor jeder Persistenz im Arbeitsspeicher stattfinden. Der
Filter entfernt sensible Felder, erkennt bekannte Secret- und PII-Muster und
führt danach einen Residual Scan aus. Findings enthalten nur Kategorie und
JSON-Pfad, nie den entfernten Wert. Rohdaten dürfen nicht als Fallback
persistiert werden.

Persistierte Records werden mit AES-256-GCM und record-gebundenen Additional
Authenticated Data verschlüsselt. Deduplizierung, Payload- und
Familien-Fingerprints verwenden HMAC-SHA-256 mit einem getrennten 256-Bit-Key.
Schlüsselmaterial wird nie in IDrive e2, GitHub, Task Capsules, Logs oder
Dataset-Manifeste geschrieben.

Zugänge müssen Least Privilege verwenden. Verschlüsselungs- und
Fingerprint-Schlüssel besitzen getrennte IDs, Rotation, Zugriffsaudit und einen
dokumentierten Recovery-Prozess. Ohne beide gültigen Schlüsselkonfigurationen
bleibt die Pipeline gesperrt.

## Qualitäts-Gates

Ein Record wird nur `candidate`, wenn alle einschlägigen Prüfungen ausdrücklich
`passed` sind:

- Build;
- Typecheck;
- Lint;
- Unit Tests;
- Integration Tests;
- gesonderte Datenschutz-/PII-Prüfung;
- Security-Prüfung;
- Non-Regression-Prüfung;
- Rollback-Prüfung;
- Staging- oder Live-Prüfung;
- bei UI-Bezug zusätzlich Browserprüfung;
- nicht leerer, eindeutig zugeordneter Diff;
- menschliche Akzeptanz oder deterministischer Korrektheitsnachweis.

`skipped`, `unknown`, fehlende Werte und nur modellbasierte Reviews gelten als
nicht bestanden. Nicht permanent gesperrte Records können nur mit ausdrücklicher
Capture-Einwilligung, nach Sanitization und verschlüsselt zu Diagnosezwecken
quarantänisiert werden; sie dürfen weder trainiert noch als positive Labels
verwendet werden. Permanentes `denied` — insbesondere Provider-API-Daten ohne
Trainingsrecht — und `revoked` erzeugen kein neues Objekt im
Trainings-Namespace. Erforderliche Betriebsdiagnose bleibt ausschließlich im
getrennten operativen Audit-System.

## Datensatztrennung und Versionierung

Jede Aufgabe erhält über den signierten Repository-Fingerprint, Base Commit,
die betroffenen Pfade und Domain einen konservativen keyed
Familien-Fingerprint. Aufgabe und Diff werden bewusst nicht zur Trennung
verwendet, damit umformulierte oder leicht veränderte Patch-Varianten derselben
Repository-Scope nicht auf mehrere Splits verteilt werden. Alle Varianten
derselben Familie landen deterministisch im selben Split:

- Training: 80 Prozent;
- Validierung: 10 Prozent;
- Test: 10 Prozent.

Unterstützte Domains sind Coding, Browser, Terminal, Git, Datenbank, Web, PWA,
iOS, Android und Safety. Doppelte Record-IDs, Familien in mehreren Splits oder
unbekannte Domains blockieren die gesamte Version.

Dataset-Manifeste sind immutable, referenzieren nur verschlüsselte Kandidaten
und starten mit `promotionStatus: not-approved`. Sicherheits-, Coding- und
Agenten-Benchmarks, die als Freigabemaßstab dienen, dürfen nie nachträglich in
Training oder Validierung verschoben werden.

## Ordnerstruktur

```text
training/quarantine/                  temporär unvollständige, capture-freigegebene Records
training/sanitized/candidates/        vollständig geprüfte Kandidaten
datasets/smejj-1-0/                   immutable Datensatzversionen
evaluations/smejj-1-0/                getrennte Benchmark-Ergebnisse
training-runs/smejj-1-0/              Run-Manifeste und Kostenbelege
checkpoints/smejj-1-0/                versionierte Modellartefakte
```

Ein Record wird zuerst verschlüsselt geschrieben, danach sein Status. Beide
Objekte verlangen bedingte Neuanlage. Überschreiben, unbedingtes PUT und
status-first sind unzulässig.

## Implementierung

Die Richtlinie wird durch `src/training/` sowie die JSON-Schemas und
IDrive-e2-Manifeste erzwungen. Der Rights Ledger sperrt Z.ai- und Kimi-API-Daten
sowie historische Capsules. Der Base-Model-Gate sperrt Training, solange das
tatsächliche GLM-5.2-Basisartefakt (Fundament-Entscheidung 2026-07-17, vorher
Qwen-Kandidat) nicht vollständig attestiert ist; siehe
`SMEJJ_1_0_TRAINING_RIGHTS_GLM_5_2_2026-07-17.md`.

Eine spätere Writer- oder Trainer-Implementierung darf diese Regeln nur
verschärfen. Ausnahmen benötigen eine neue schriftliche Nutzerfreigabe,
Rechtsprüfung, versionierte Policy-Änderung und vollständige Regressionstests.

## Tests

Pflichttests umfassen Positiv- und Negativfälle für:

- Secret-/PII-Redaction und Residual Scan;
- Capture-off, fehlende Einwilligung und Widerruf;
- Provider- und Repository-Rechte;
- jedes einzelne Qualitäts-Gate;
- Verschlüsselung, Auth-Tag-Manipulation und getrennte HMAC-Keys;
- immutable, bedingte Objektanlage und Status-last;
- Deduplizierung, Familien-Leakage und Split-Stabilität;
- Dataset-Promotion und revoked Records.

Zusätzlich müssen `npm run check:all`, `npm run check:guidelines` und
`npm run check:architecture` erfolgreich sein. Tests dürfen keine realen
Secrets, personenbezogenen Daten oder Produktionsobjekte verwenden.

## Memory Update

Vorgeschlagener Eintrag, erst nach erfolgreicher Gesamtprüfung zu übernehmen:

> Trainingsmemory von smejj.com wird ausschließlich aus bereinigten,
> rechtskonformen, eingewilligten und vollständig verifizierten Kandidaten
> aufgebaut. Operative Capsules, historische Logs, fehlgeschlagene Ergebnisse
> sowie Provider-API-Ausgaben sind nicht automatisch Trainingsdaten. Capture und
> Promotion bleiben fail-closed.

## Nächster Schritt

Vor Aktivierung von Capture sind Einwilligungs- und Widerrufsablauf,
Datenschutzinformation, Aufbewahrungs- und Löschkonzept, Schlüsselverwaltung
und der IDrive-e2-Writer gemeinsam abzunehmen. Erst danach darf ein kleiner
First-Party-Seed-Datensatz erzeugt werden; Training bleibt bis zu einer eigenen
schriftlichen Freigabe gesperrt.
