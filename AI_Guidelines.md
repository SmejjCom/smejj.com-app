# AI_Guidelines.md — Entwicklungsregeln fuer smejj.com

Verbindlich fuer jeden AI-Agenten und jeden menschlichen Contributor.

## 0. Schreibregel

Die Plattform wird ausnahmslos exakt als `smejj.com` geschrieben. Niemals SMEJJ, SMEJJ.COM oder Smejj — in Code, Doku, UI, APIs, Dateinamen, Ordnern und Metadaten.

## 0.1 Arbeitsweise mit dem Betreiber (verbindlich, Wof Kadavanich, 2026-07-17)

Wortlaut der Festlegung: *"Ich habe keine Ahnung und ich will nichts machen. Merk dir
das fuer Zukunft. Lass nicht offen."*

Daraus folgt fuer JEDE Session:

- **Keine Aufgaben an den Betreiber delegieren.** Portal-Klicks, Uploads, ENV-Werte,
  Deploys, Tests: Die Session fuehrt alles selbst aus. Formulierungen wie
  "OFFEN (Nutzer): ..." sind unzulaessig, solange die Session es selbst tun kann.
- **Keine Rueckfragen zu Fachentscheidungen.** Der Betreiber ist nicht technisch;
  die Session entscheidet fachlich und begruendet die Entscheidung nachvollziehbar.
- **Was die Session physisch nicht kann** (z. B. echtes Mikrofon-Audio, Test auf
  echtem iPhone), wird NICHT als Nutzer-Aufgabe deklariert, sondern als
  **Restrisiko** benannt: maximal automatisiert absichern, Rest ehrlich beziffern.
- **Ausnahme (unveraendert bindend):** Alles, was Geld kostet oder Schutz-Locks
  beruehrt, braucht weiterhin eine schriftliche Freigabe. Ein pauschales "Ja" ist
  KEINE Budget-Freigabe — dafuer sind Dienst und Betrag explizit zu nennen.
  Sicherheit vor Bequemlichkeit: lieber einmal nachfragen als unautorisiert Kosten
  ausloesen.
- **Antwortstil:** kurz, in einfacher Sprache, ohne Fachjargon-Pflicht. Ergebnis und
  Konsequenz zuerst, Details nur wenn noetig.

## 1. Pflicht vor jeder Aenderung (Context Planner)

1. Lies `AI_Guidelines.md`, `Memory_Bank.md`, `Project_Goals.md`.
2. Lade relevante Task Capsules von IDrive e2.
3. Analysiere den betroffenen Repository-Bereich.
4. Bereite einen Rollback vor (Git-Branch oder Commit-Referenz vor der Aenderung).

## 2. Code-Begrenzung & Modularitaet

- **Harte Grenze: max. 800 Zeilen pro Datei.** Bei Erreichen sofort modular aufteilen.
- `Memory_Bank.md` waechst von selbst und reisst die Grenze darum immer wieder.
  Bewachung: `npm run check:memory-bank` — ab 760 Zeilen eine Warnung mit den
  auszulagernden Abschnitten, ab 800 ein Fehler. Beim Kuerzen wandert der
  Volltext WORTGLEICH in die zugehoerige Task Capsule (`task-capsules/<jahr>/<monat>/<job-id>/capsule.md`)
  oder nach `docs/memory/`, in der Bank bleibt eine Kurzfassung MIT Pfad.
  Derselbe Waechter meldet jeden Verweis, dessen Ziel nicht existiert.
- Single Responsibility Principle (Unix-Philosophie): eine Komponente, eine Aufgabe.
- Keine zirkulaeren Abhaengigkeiten; gemeinsame Logik in `shared/`-Module.
- Control Server enthaelt nur Steuerlogik; Rechenarbeit gehoert in Worker-Templates.

## 3. Code-Stil

- Sprache: TypeScript/JavaScript (ESM), Node LTS.
- **Exporte sind benannt: `export function foo`, nie `export default`.** Gemessen am
  2026-08-01 stehen in `src/`, `control-server/src/` und `workers/` 1012 benannte
  Exporte und 0 Default-Exporte — die Regel wurde bisher nur gelebt, nicht
  aufgeschrieben. Das ist kein Geschmack: Default-Exporte lassen den Namen an der
  Importstelle frei, wodurch dieselbe Funktion in verschiedenen Dateien anders
  heisst und `grep` sie nicht mehr findet. Einzige Ausnahme sind die generierten
  Sprachdateien unter `public/i18n/`.
  Warum das hier steht: solange die Regel nirgends stand, haben Modelle geraten —
  GLM-4.7-flash lieferte in drei Laeufen zweimal `export function` und einmal
  `export default function` auf dieselbe Aufgabe.
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

## 8. Auslieferung (Stand 2026-09-03)

Der tatsaechliche Weg steht in docs/deployment/DEPLOYMENT_PLAN.md, Abschnitt "Stand 2026-09-03": Frontend ueber den Klon nach GitHub Pages, Control ueber den Bauzweig nach Zeabur, Dienste ueber ihre deploy/-Zweige. Start-Lock-Dateien und Service-Worker-Spruenge nur per Betreiber-Doppelklick (Kaskaden unter scripts/einmal/). Vor jedem Auftrag ein Rollback-Tag, nach jedem Deploy Live-Beweis und Benchmark.
