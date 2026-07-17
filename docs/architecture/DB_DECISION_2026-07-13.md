# Datenbank-Entscheidung (AP5) — 2026-07-13

## Entscheidung

PostgreSQL ist NICHT erforderlich. smejj.com bleibt bei IDrive e2 als einzigem
zentralem Datenspeicher (Object Brain) mit signierter Objektablage.

## Begründung

1. Der produktive Control Server betreibt heute keine PostgreSQL-Instanz; alle
   persistenten Daten (Jobs, Task Capsules, Passkeys, Trainings-Ledger,
   Deploy-Artefakte, Rollbacks) liegen bereits als versionierte JSON-/Binär-
   Objekte in IDrive e2 und werden nach Neustarts erfolgreich hydriert
   (verifiziert: Capsule `codex-parity-final-e2e-2026-07-10`).
2. Die neue E-Mail-/Passwort-Benutzerverwaltung folgt demselben Muster:
   `auth/email-users/{sha256(email)}.json` über `signedS3Get/Put` mit
   In-Memory-Fallback für lokale Entwicklung. Ein Konto = ein Objekt; Lese-/
   Schreiblast ist bei der aktuellen Nutzerzahl (Allowlist-Einzelkonto bis
   kleine Nutzerbasis) weit unterhalb jeder Datenbank-Notwendigkeit.
3. Eine neue Datenbank würde laufende Kosten, einen Stateful-Dienst gegen das
   Stateless-Worker-Prinzip und eine zweite Wahrheit neben dem Object Brain
   einführen — Verstoß gegen FREE_ONLY_MASTER_POLICY und Kosten-Guardrails.

## Muster für Konsistenz (bereits umgesetzt)

- Append-only Task Capsules mit `status.json` als letztem Abschlussmarker.
- `If-None-Match: *` (bedingtes PUT) + zweiter 412-Beweis + GET-Readback für
  unveränderliche Neuanlagen (Training/Deploy-Pfade).
- SHA-256-Manifeste für Artefakte und Rollbacks; atomare Versionierung über
  neue Objekt-Keys statt In-Place-Mutation.

## Revisionskriterien (wann neu bewerten)

Erst wenn eine der Grenzen real erreicht wird: >10k aktive Nutzerkonten,
Bedarf an relationalen Ad-hoc-Queries über Nutzerdaten, oder mehr als ~5
Schreibkonflikte/Tag auf dasselbe Objekt. Dann zuerst kostenlose Optionen
(SQLite auf Control-Volume ist wegen Stateless-Prinzip ausgeschlossen;
eher: partitionierte Objekt-Keys oder gehostetes Free-Tier nur nach
gesonderter schriftlicher Freigabe).
