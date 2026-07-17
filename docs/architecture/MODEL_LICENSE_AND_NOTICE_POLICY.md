# Model License, API Rights and Notice Policy

## Pflicht

Vor produktiver Modellnutzung muessen Lizenz, Notices, Inventar und Checksums
geprueft und in IDrive e2 archiviert sein.

Eine Modellgewichts-Lizenz und API-Nutzungsbedingungen sind getrennte
Rechtsquellen. Eine offene Weight-Lizenz erlaubt nicht automatisch die Nutzung
von API-Prompts, API-Ausgaben, Reviews oder abgeleiteten Labels fuer Training,
Fine-Tuning, Distillation oder Evaluation eines anderen Modells.

## Mindestdaten

- Upstream-Quelle
- Lizenzname
- Lizenzdatei
- Third-party notices
- Dateiinventar
- SHA256-Checksums
- Review-Datum
- unveraenderliche Repository- und Modellrevision
- Container-Image-Digest, Tokenizer-Revision und Quantisierung
- API-Terms-Version, Abrufzeitpunkt und Inhalts-Hash, falls eine API beteiligt ist
- ausdrueckliche Rechte fuer Training und abgeleitete Modelle
- verifizierte Permission-ID, Gueltigkeitszeitraum und Ablaufdatum bei Ausnahme
- Datenschutz-, Vertraulichkeits-, Aufbewahrungs- und Loeschpruefung

## Stopper

Ohne Lizenzreview, Notice-Archiv, exakte Revision und Checksum-Plan wird kein
Modell produktiv aktiviert. Ohne positive und schriftlich verifizierte
Trainings- und Derivatrechte wird keine API-Quelle in einen Trainingskandidaten
uebernommen. Fehlende, unklare oder abgelaufene Evidenz bedeutet `denied`.

Die aktuelle technische Entscheidung fuer smejj 1.0 steht in
`docs/architecture/SMEJJ_1_0_TRAINING_RIGHTS_2026-07-10.md` und muss vor jeder
spaeteren Trainingsnutzung anhand der offiziellen Quellen erneut geprueft
werden.
