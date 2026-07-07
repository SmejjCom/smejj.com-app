# AI_Guidelines.md — Entwicklungsregeln fuer smejj.com

Verbindlich fuer jeden AI-Agenten und jeden menschlichen Contributor.

## 0. Schreibregel

Die Plattform wird ausnahmslos exakt als `smejj.com` geschrieben. Niemals SMEJJ, SMEJJ.COM oder Smejj — in Code, Doku, UI, APIs, Dateinamen, Ordnern und Metadaten.

## 1. Pflicht vor jeder Aenderung (Context Planner)

1. Lies `AI_Guidelines.md`, `Memory_Bank.md`, `Project_Goals.md`.
2. Lade relevante Task Capsules von IDrive e2.
3. Analysiere den betroffenen Repository-Bereich.
4. Bereite einen Rollback vor (Git-Branch oder Commit-Referenz vor der Aenderung).

## 2. Code-Begrenzung & Modularitaet

- **Harte Grenze: max. 800 Zeilen pro Datei.** Bei Erreichen sofort modular aufteilen.
- Single Responsibility Principle (Unix-Philosophie): eine Komponente, eine Aufgabe.
- Keine zirkulaeren Abhaengigkeiten; gemeinsame Logik in `shared/`-Module.
- Control Server enthaelt nur Steuerlogik; Rechenarbeit gehoert in Worker-Templates.

## 3. Code-Stil

- Sprache: TypeScript/JavaScript (ESM), Node LTS.
- Benennung: `kebab-case` fuer Dateien/Ordner, `camelCase` fuer Funktionen/Variablen, `PascalCase` fuer Typen/Klassen.
- Funktionen klein und pur, Seiteneffekte an den Raendern (I/O-Schicht).
- Fehler explizit behandeln: fail-closed, keine stillen Fallbacks.
- Keine Secrets im Repo; Konfiguration nur ueber Umgebungsvariablen (`.env`, Secret-Stores).
- Jede oeffentliche Funktion/Schnittstelle kurz dokumentiert (Zweck, Input, Output).

## 4. Task Capsules (Pflicht, IDrive e2)

Jede Aufgabe wird als Task Capsule auf IDrive e2 angelegt, bevor Code geschrieben wird.

Pfadschema:

```text
e2://smejj.com/capsules/{YYYY}/{MM}/{job-id}/
  capsule.json      # Ziel, Scope, Budget, betroffene Dateien, Rollback-Referenz
  context/          # relevante Code-Ausschnitte, Doku, RAG-Treffer
  result/           # Diff, Logs, Testreport, Screenshots
  status.json       # pending | running | verified | failed
```

Regeln: Capsule vor Arbeitsbeginn schreiben, `result/` nur nach bestandener Verification Pipeline befuellen, `status.json` bei jedem Uebergang aktualisieren.

## 5. Verification Pipeline

Kein Patch gilt ohne folgende Schritte als abgeschlossen:

1. Build
2. Typecheck
3. Lint
4. Tests (Unit + Integration)
5. Bei UI-Aenderungen: Browserpruefung + Screenshots (abgelegt in der Task Capsule)

Bestehende Pflichtpruefungen bleiben gueltig: `npm run check:architecture` nach Architektur-/Kosten-Aenderungen, `npm run check:frontend` nach Frontend-Aenderungen, `npm run release:preflight` vor Releases.

## 6. Memory System

- Lerne NIEMALS aus fehlgeschlagenen Builds oder Halluzinationen.
- Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen fliessen in `Memory_Bank.md` bzw. das Object Brain auf IDrive e2.
- Jeder Memory-Eintrag referenziert die zugehoerige Task Capsule (job-id).

## 7. Kosten-Guardrails

`docs/architecture/FREE_ONLY_MASTER_POLICY.md` ist verbindlich: GitHub ausschliesslich Free-Tier, Hosting nur GitHub Pages Free, DNS/Domain bei Spaceship, Cloudflare wird nicht genutzt, Salad nur pay-per-use hinter Budget-Gate; keine Trials, keine Auto-Billing-Pfade. IDrive e2 ist der einzige zentrale Speicher fuer grosse Dateien und Artefakte.
