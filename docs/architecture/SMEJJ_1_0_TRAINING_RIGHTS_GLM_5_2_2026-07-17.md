# smejj 1.0 Training Rights Review — GLM-5.2 Open Weights als Fundament

Status: technische Compliance-Entscheidung, keine Rechtsberatung  
Review-Datum: 2026-07-17  
Online-Nachpruefung: 2026-07-17 (Hugging Face Modellseite zai-org/GLM-5.2)  
Ergaenzt: `SMEJJ_1_0_TRAINING_RIGHTS_2026-07-10.md` (bleibt fuer API-Sperren und
Qwen-Historie gueltig)

## Entscheidung

Das Fundament fuer smejj 1.0 wechselt von Qwen3-8B (Kandidat) auf die separat
bezogenen **GLM-5.2 Open Weights**. Grundlage:

1. Schriftliche Betreiber-Anweisung (Wof Kadavanich, 2026-07-17): GLM-5.2 als
   Fundament, Kimi K2.7 nur als Zweitmodell.
2. Lizenzpruefung der Gewichte: Das Repository
   [zai-org/GLM-5.2](https://huggingface.co/zai-org/GLM-5.2) weist am
   2026-07-17 **MIT-Lizenz** aus ("Pure Open: An MIT open-source license — no
   regional limits"). 753B-Parameter-MoE, Safetensors, BF16/F32. MIT erlaubt
   Fine-Tuning, Derivate und kommerzielle Nutzung.

Der Ledger-Eintrag `glm-5-2-open-weights-unattested-artifact` steht auf
`conditional`. Training bleibt **gesperrt** (Base-Model-Gate
`blocked-exact-base-artifact-required`), bis das tatsaechlich auf IDrive e2
liegende Artefakt attestiert ist.

## Strikte Trennung: Gewichte vs. API (unveraendert)

Die MIT-Lizenz der Gewichte aendert NICHTS an der API-Sperre: Z.ai-API-Prompts,
-Ausgaben und Derivate bleiben `denied` (Terms 2026-04-14, Anti-Distillation).
Ebenso bleiben Kimi-API-Daten und historische Task Capsules gesperrt. Ein
GLM-5.2-Fine-Tune darf also nur mit First-Party-Daten nach
`SMEJJ_1_0_TRAINING_DATA_POLICY.md` trainiert werden — niemals mit
API-Gespraechsdaten des laufenden smejj.com-Chats, solange dieser ueber die
Z.ai-API laeuft.

## Kimi K2.7 Open Weights

Vom Betreiber ebenfalls als e2-Download benannt. Kein Review durchgefuehrt;
kein Ledger-Eintrag als Open-Weights-Quelle. Bis zu einem eigenen
revisionsgebundenen Review gilt die Default-Sperre (`defaultTrainingUse:
denied`). Rolle laut Betreiber-Anweisung: Zweitmodell (Inferenz ueber API),
kein Trainings-Fundament.

## e2-Bestandsaufnahme (Konsolen-Listing, 2026-07-17)

Bucket `smejj-model-files` (1,23 TB gesamt): Die GLM-5.2-Gewichte liegen als
**FP8** unter `model-files/glm-5-2-fp8/original/` (LICENSE, README,
config.json, chat_template.jinja, generation_config, model-Shards je ~5 GB).
Unter `model-files/glm-5-2-fp8/checksums/` existieren bereits
`upstream-file-inventory` (45,38 KB, 22.06.2026) und `streamed-checksums`
(14,28 KB, 23.06.2026); unter `models/glm-5-2/` liegen model-manifest.json,
checksums.json und shard-map.json. `model-files/kimi-k2-7/` existiert
ebenfalls (nicht inspiziert). Existenz bestaetigt — Inventar und Checksums
sind noch nicht file-by-file re-verifiziert.

## Checksum-Attestierung DURCHGEFUEHRT (2026-07-17, kostenlos)

Methode: streamed-checksums.sha256 (149 Eintraege, beim Upload ueber die
tatsaechlich zu e2 gestreamten Bytes berechnet) verglichen mit den offiziellen
Hugging-Face-SHA-256-Werten (API `?blobs=true`); kleine Nicht-LFS-Dateien
zusaetzlich direkt gehasht (SubtleCrypto im Browser, signierte Lese-URLs).

Ergebnis:

- Quelle exakt identifiziert: **zai-org/GLM-5.2-FP8, Revision
  70311cfa0158cce7dd2cf5d2e04f68e3fdc3efc1** (Commit "add Footnote",
  2026-06-23) — MIT-Lizenz auch im README-Frontmatter (`license: mit`).
- 143/143 LFS-Dateien (alle 141 Gewichts-Shards + Tokenizer-Binaries):
  SHA-256-Match mit Upstream. 0 fehlend, 0 abweichend. 755,7 GB, 149 Dateien.
- config.json, LICENSE, chat_template.jinja, generation_config.json,
  tokenizer_config.json: Hash-Match zu Revision 70311cfa.
- README.md: e2-Objekt byte-identisch zu Revision 70311cfa (10.909 B);
  NUR die Manifest-ZEILE in streamed-checksums.sha256 ist veraltet (vor dem
  README-Commit vom 23.06. berechnet). Daten intakt; Manifest-Reparatur
  ERLEDIGT (2026-07-17): Korrektur-Objekt
  `model-files/glm-5-2-fp8/checksums/streamed-checksums-corrections-2026-07-17.json`
  (1195 B, SHA 4768a4c9...) mit korrektem README.md-Hash
  `de23c1b7cab43a99f0fedf4edf10de0d165882a2ecb2e2bad6c5796fcabf2e46` (10.909 B,
  gegen Revision 70311cfa per resolve-Fetch verifiziert). Das Original-Manifest
  bleibt bewusst UNVERAENDERT, weil es im Notices-Archiv hash-gepinnt ist
  (Evidenz-Erhalt statt Ueberschreiben).
- Hinweis fuer spaeteres Serving: Upstream-Commit ba978f7d (02.07.) ergaenzt
  `moe_router_dtype` in config.json — bei Bedarf gezielt nachziehen (bewusste,
  dokumentierte Entscheidung, kein stiller Sync).

## Verbleibende Gates vor Trainingsfreigabe
- Tokenizer- und Chat-Template-Dateien pinnen;
- LICENSE- und Notice-Dateien unveraenderlich auf IDrive e2 archivieren
  (`model-files/smejj-1-0/base/glm-5-2/{revision}/`);
- Trainer-Image-Digest pinnen;
- Datenrechte- und Datenschutz-Gates der Trainingsdaten-Policy bestehen;
- schriftliche Kosten-/Budget-Freigabe fuer den Trainingslauf.

## Realistischer Trainingspfad (Information, keine Freigabe)

GLM-5.2 ist ein 753B-MoE; volles Fine-Tuning braucht einen 8x-H200-Knoten.
Realistisch fuer smejj 1.0: QLoRA/LoRA-Adapter auf stundenweise gemieteten
GPUs (Unsloth unterstuetzt GLM-5.2 offiziell), Adapter versioniert nach
`checkpoints/smejj-1-0/`. Jeder Lauf braucht eine eigene schriftliche
Budget-Freigabe.

## Memory Update

> Fundament-Entscheidung 2026-07-17: smejj 1.0 baut auf GLM-5.2 Open Weights
> (MIT, zai-org/GLM-5.2) auf; Qwen3-8B ist nur noch Historie. Training bleibt
> fail-closed gesperrt bis zur vollstaendigen e2-Artefakt-Attestierung.
> API-Daten (Z.ai, Kimi) bleiben fuer Training dauerhaft gesperrt.

## Naechster Schritt

e2-Inventar des GLM-5.2-Artefakts listen (kostenlos, Konsole), Revision
identifizieren; Checksum-Job und jeder Trainingslauf nur nach schriftlicher
Budget-Freigabe.
