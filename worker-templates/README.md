# worker-templates

Vorlagen fuer stateless Salad Worker von smejj.com. Jeder Worker startet ohne Zustand, laedt alles Noetige aus IDrive e2 (Object Brain) und schreibt Ergebnisse dorthin zurueck.

## Prinzipien

- Vollstaendig zustandslos: kein lokaler Zustand ueberlebt den Job.
- Input: Task Capsule von IDrive e2 (Job-Definition, Kontext, Budget).
- Output: Artefakte, Logs und Ergebnis-Capsule zurueck nach IDrive e2.
- Idempotent: gleicher Job → gleiches Ergebnis, sicher wiederholbar.

## Geplante Templates

```text
worker-templates/
  inference/    # GLM-5.2 Inferenz (SGLang zuerst, vLLM danach)
  build/        # Builds und Bundling
  typecheck/    # Typechecks
  test/         # Unit-/Integrationstests
  shared/       # Gemeinsame Capsule-I/O- und e2-Hilfen
```

Regeln: siehe `../AI_Guidelines.md`.
