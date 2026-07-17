# smejj.com — Phase 2: Worker-Sandbox für autonomes Coding (Konzept, 2026-07-10)

## Umsetzungsstatus 2026-07-10

Der Phase-2-Code ist lokal implementiert und automatisiert geprueft, aber noch
nicht produktiv ausgerollt. Der belegte Stand steht in
`docs/testing/CODEX_PARITAET_2026-07-10.md`. Insbesondere existieren jetzt die
strukturierte GLM-Toolschleife, Git-Checkout/Branch/Diff, Multi-Datei-Edits,
Verifikation, Browser-Evidenz, IDrive-Ergebnisartefakte, Queue/Hydration sowie
Diff-gebundene Freigabe. Nach dem Sicherheits-Audit kamen durable
Modellaktionsbudgets, persist-first Jobanlage, echte Abbruchsignale bis zur
Prozessgruppe, Secret-Pfad-/Logschutz, sitzungsgebundene Passkey-Registrierung
und lokale Missbrauchslimits hinzu. Das darf erst nach einem echten Live-E2E
als aktive Produktfunktion bezeichnet werden.

Kostenbedingte Abweichung fuer den ersten Rollout: Statt einer zusaetzlichen
Dauer-Replica soll der vorhandene stateless Remote-Browser-Worker auch `/run`
bedienen. Produktiv ist dabei eine GitHub-Owner-Allowlist zwingend. Diese
Prozess-/Containergrenze ist fuer vertrauenswuerdige interne Repos vertretbar,
aber keine harte Mandanten-Sandbox fuer beliebige Fremd-Repos. Dafuer bleibt
ein ephemerer Worker pro Task mit begrenztem Netzwerk und ohne dauerhafte
Secrets Pflicht. Ohne bereitgestellten Salad-API-Key kann dieser Scale-to-zero-
Pfad nicht ehrlich als fertig gelten.

Ziel: Codex-Parität. Der fehlende Kern ist eine Ausführungsschleife:
Repo klonen → Code ändern → Build/Tests ausführen → Fehlerausgabe ans Modell →
iterieren bis grün → Diff + Protokoll als Task Capsule. Dieses Konzept baut
ausschließlich auf vorhandener smejj.com-Infrastruktur auf (Salad Worker,
IDrive e2, Control-Server, GLM 5.2 via Z.ai). Keine neue Infrastruktur.

## Architektur (Entscheidung)

Control-Server bleibt Orchestrator (Job-ID, Budget, Worker-Steuerung, Status-
Streaming — alles bereits seine Rolle). Die eigentliche Arbeit macht ein neues,
stateless Worker-Image "smejj-worker" auf SaladCloud (CPU-only, on demand).
Das Modell (GLM 5.2) läuft NICHT im Worker — der Worker ruft den Control-Server
für Inferenz auf (BYOK Z.ai). Damit bleibt der Worker klein, billig und
stateless.

```

Im lokal implementierten ersten Rollout hydriert der Control-Server die Task Capsule
aus IDrive e2 und persistiert das Worker-Ergebnis wieder dorthin. Der Worker
erhaelt keine IDrive-Zugangsdaten, sondern nur einen bereinigten Job-Payload und
einen kurzlebigen jobgebundenen Bearer. Die direkte Capsule-Ein-/Ausgabe im
Worker-Diagramm ist das Ziel fuer den spaeteren ephemeren Job, nicht der heute
behauptete Live-Stand.
Nutzer → Control-Server (Job anlegen, Budget prüfen)
            │ startet on demand
            ▼
       smejj-worker (Salad, CPU, stateless)
         1. Task Capsule + Repo-Kontext von IDrive e2 laden
         2. git clone (flacher Checkout, Token mit Minimal-Scope)
         3. Agent-Schleife:
            a) GLM 5.2 (über Control-Server) → geplante Aktion
            b) Aktion ausführen: Datei lesen/schreiben ODER Allowlist-Kommando
            c) stdout/stderr zurück ans Modell
            d) wiederholen bis Tests grün ODER Budget/Iterationslimit
         4. Ergebnis: Branch + Diff + Protokolle → Task Capsule → IDrive e2
         5. Worker beendet sich (kein Zustand bleibt zurück)
```

## Worker-Image

- Ziel-Image fuer den ephemeren Pfad: gepinntes Node-22-Debian-Image mit Git,
  Python 3 und `pytest`; Groesse und Checksums sind vor Release zu belegen.
- Erster Shared-Worker-Rollout: vorhandene Node-20-Laufzeit; interne sichere
  Suche ersetzt externes `rg`, `pytest` ist dort noch nicht vorhanden.
- Entry: Im ersten Rollout `remote-browser/worker.js` mit `/render` und `/run`;
  eigenstaendiges Ziel-Entry `worker.mjs`. Module bleiben jeweils unter 800
  Zeilen (`sandbox.mjs`, `agentloop.mjs`, `repository.mjs`, `allowlist.mjs`).
- Env: `SMEJJ_CONTROL_ORIGIN` und vorhandene Runtime-Konfiguration. Der
  kurzlebige Worker-Token kommt pro Dispatch im Authorization-Header, nicht als
  dauerhaftes Image-Secret.
- Git-Zugriff im ersten Rollout: oeffentliche Allowlist-Repos, `diff-only`,
  `SMEJJ_GITHUB_TOKEN` leer. Ziel fuer private Repos/Draft-PRs ist ein
  kurzlebiger repo-begrenzter GitHub-App-Installation-Token, der nie in einem
  Capsule-Log gespeichert wird.

## Kommando-Allowlist (fail-closed)

Fuer das Modell erlaubt (mit Timeout 300 s, Output-Cap 200 KB):
`npm ci`, `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`,
`node --check <js-datei>`, `python3 -m pytest`, eng signierte read-only
`git status/diff/rev-parse`-Varianten und interne begrenzte `rg`-Suche.
Direkte `cat`-/`ls`- sowie `git log/show`-Modellbefehle sind gesperrt, damit
Secret-Pfadregeln nicht umgangen werden.
`git add/commit/push` sind keine Modelltools, sondern interne Worker-Schritte
nach erfolgreicher Verifikation; Push nur im separat freigegebenen Draft-PR-
Pfad. Alles andere wird abgelehnt. Der Shared-Worker hat noch keine harte
Egress-Isolation; deshalb ist die Owner-Allowlist bis zur ephemeren Sandbox
zwingend.

## Task-Capsule-Format (JSON, versioniert, IDrive e2)

```json
{
  "capsuleVersion": 1,
  "jobId": "…", "ziel": "…", "anforderungen": ["…"],
  "repo": {"url": "…", "baseCommit": "…", "branch": "smejj.com/agent/<jobId>"},
  "iterationen": [
    {"n": 1, "aktion": "edit|cmd", "detail": "…", "exitCode": 0,
     "stdoutRef": "s3://…", "modellEntscheidung": "…"}
  ],
  "ergebnis": {"status": "gruen|abgebrochen", "diffRef": "s3://…",
               "testProtokollRef": "s3://…", "screenshots": ["s3://…"]},
  "budget": {"tokensVerbraucht": 0, "kommandos": 0, "limitErreicht": false},
  "rollback": {"baseCommit": "…", "revertAnleitung": "git revert …"}
}
```

Replay = Capsule laden, gleicher baseCommit, gleiche Aktionsfolge.

## Agent-Schleife (Kern, im Worker)

1. Systemprompt: Ziel + Repo-Baum + relevante Dateien (rg-Vorauswahl).
2. GLM 5.2 antwortet mit EINEM Tool-Call (read_file / write_file / run_cmd /
   finish). Kein Freitext-Codeblock-Parsing — Tool-Calling der Z.ai-API nutzen.
3. Worker führt aus, hängt Ergebnis (gekürzt) an den Kontext.
4. Abbruchkriterien: Tests gruen -> finish; 25 Iterationen; 55 min Standard,
   harte Obergrenze 60 min; durable Modellaktionsbudget.
5. Bei grün: lokaler Commit auf `smejj.com/agent/<jobId>`, Capsule abschliessen.
   Push und Draft-PR nur nach exakter, dauerhaft gespeicherter Diff-SHA-
   Freigabe. Merge in main bleibt immer externe Menschenaktion.

## Browser-Integration (Phase 4, Vorgriff)

Nach UI-Aenderungen nutzt der kombinierte Worker Playwright mit Desktop- und
Mobil-Viewport und speichert JPEG-Evidenz in die Capsule. Dieser Pfad ist lokal
implementiert; automatische Preview-Erzeugung und der Live-E2E fehlen noch.

## Kosten

Der Zielpfad ist ein CPU-Worker nur waehrend echter Arbeit. Fuer den ersten
Rollout wird aus Kostengruenden die vorhandene Remote-Browser-Replica geteilt;
das ist weder Scale-to-zero noch harte Isolation. GLM 5.2 nutzt den vorhandenen
Z.ai-Pfad. Keine unbestaetigten Preisannahmen, kein Trial, kein Auto-Billing.

## Verbleibende Umsetzungsreihenfolge

1. Gepruefte Runtime-Overlays commit-gepinnt ausrollen; Start-Lock bleibt.
2. End-to-End-Test mit Trivial-Task ("Kommentar-Tippfehler fixen") gegen ein
   Test-Repo, NICHT gegen Produktion.
3. Restart-/Replay-, Cancel- und Follow-up-Evidenz auf IDrive e2 pruefen.
4. Erst nach gruenem E2E fuer interne Allowlist-Repos freischalten.
5. Ephemeren Salad-Job pro Task bauen, bevor fremde Repos zugelassen werden.

Voraussetzung für alles: Phase 1 (AI Mode / Zhipu-Kette auf smejj-control) aktiv.
