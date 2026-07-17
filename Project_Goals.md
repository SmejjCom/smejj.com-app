# Project_Goals.md — smejj.com

> Schreibregel: Die Plattform heisst ausnahmslos exakt `smejj.com` (niemals SMEJJ, SMEJJ.COM oder Smejj) — in Code, Doku, UI, APIs, Dateinamen, Ordnern und Metadaten.

## Mission

smejj.com ist ein vollstaendig autonomes AI Autonomous Coding OS auf Basis von GLM-5.2 als primaerem Qualitaets-, Reasoning- und Coding-Modell. Langfristiges Ziel: Claude-, Gemini- und zukuenftige Agentensysteme in autonomer Softwareentwicklung uebertreffen.

## Architektur-Saeulen (stateless & event-driven)

1. **Control Server (minimal):** Authentifizierung, Routing, Job-IDs, Budgetierung, Worker-Steuerung, Status-Streaming. Keine rechenintensiven Prozesse.
2. **IDrive e2 (Object Brain):** 99% aller Speicheraufgaben — Modelle, Task Capsules, RAG-Daten, Logs, Code, Memory, Doku. Speicher, keine Inferenz.
3. **Salad Worker Layer (stateless on demand):** Inferenz, Builds, Typechecks, Tests. Vollstaendig zustandslos, idempotent, ueber Task Capsules gesteuert.

## Verbindliche Rahmenpolicies

- `docs/architecture/FREE_ONLY_MASTER_POLICY.md`: GitHub nur dauerhaft Free-only, Hosting GitHub Pages Free, DNS Spaceship, Cloudflare wird nicht genutzt; keine Trials, keine Auto-Billing-Fallbacks.
- `docs/frontend/START_DESIGN_LOCK.md`: Startseite und Eingabefeld nur mit schriftlicher Freigabe aenderbar.
- `AGENTS.md`: bestehende Agent-Regeln bleiben gueltig.

## Ziele (messbar)

1. Autonomer Entwicklungszyklus: Task Capsule rein → verifizierter, getesteter Patch raus, ohne manuelles Eingreifen.
2. Jede Codeaenderung besteht die vollstaendige Verification Pipeline (Build, Typecheck, Lint, Tests; bei UI zusaetzlich Browserpruefung + Screenshot).
3. Keine Datei ueberschreitet 800 Zeilen; jede Komponente hat genau eine Verantwortung.
4. Memory_Bank.md enthaelt ausschliesslich verifizierte Loesungen und Architekturentscheidungen.
5. Control Server bleibt so klein, dass er auf Free-Tier-Infrastruktur laeuft.

## Nicht-Ziele

- Kein Monolith, keine serverseitige Persistenz ausserhalb IDrive e2.
- Keine kostenpflichtigen GitHub-Dienste; keine Cloudflare-Dienste jeglicher Art.
- Kein Lernen aus fehlgeschlagenen Builds oder Halluzinationen.

## Erfolgskriterium

Ein Nutzer beschreibt eine Aufgabe; smejj.com plant, implementiert, verifiziert und dokumentiert sie autonom — reproduzierbar, budgetiert und vollstaendig ueber IDrive e2 nachvollziehbar.
