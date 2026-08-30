# Task Capsule — Infrastruktur & DevOps: Vollverifikation des Free-Stacks (job_infra_verifikation_20260830)

## Auftrag

Betreiber, 2026-08-30: „Richte für smejj.com eine extrem kostengünstige,
sichere, skalierbare und automatisierte Infrastruktur ein" — Prioritätenkette
IDrive e2 → GitHub Free → Codeberg → Docker Free → Zeabur → Salad, mit
Abschlusstest-Checkliste über alle Portale und Live-Test auf smejj.com.

## Befund vorab: Die Infrastruktur STAND BEREITS

Der Auftrag traf auf einen reifen Betrieb (Architektur-Ist-Doku vom 26.08.).
Die richtige Lesart war deshalb Verifikation + Lückenschluss, nicht Neubau.
Alle sieben Komponenten der Prioritätenkette existieren und funktionieren;
gefunden und geschlossen wurden drei echte Lücken (siehe Maßnahmen).

## Verifikation je Komponente (alles live gemessen 30.08., ~08:00 Ortszeit)

| Komponente | Beweis | Ergebnis |
|---|---|---|
| Spaceship DNS | `dig` NS/A/CNAME/MX/TXT/DMARC + `npm run verify:free-stack:live-dns` | Guard meldet OK; 4 Subdomains aktiv (@, www, api, admin-Weiterleitung), bewusst minimal |
| GitHub Pages | `curl https://smejj.com/` | HTTP/2 200, server GitHub.com, HSTS, SW `smejj-shell-v712` = Repo-Stand; www → 301 Apex |
| GitHub Repo | `git push` + `ls-remote` | Offener Doku-Commit 6d7e5dbd war ungeschoben → gepusht (e589ae06..92bb6e55) |
| Codeberg | Sync-Skript + Ref-Gegenprobe | Spiegel war auf main-Stand 17.07. gealtert → vollständig aufgefrischt; ls-remote-Abgleich: alle gemeinsamen Refs identisch (bis auf GitHub-interne pull/*-Refs) |
| Docker | statische Dockerfile-Prüfung | 8 Dockerfiles: durchgehend slim-Basen (node:22/python:3.11/playwright), USER node, HEALTHCHECKs; Builds laufen auf Zeabur (lokal kein Docker installiert — dokumentierter Weg) |
| IDrive e2 | `npm run idrive:check` + `check:idrive-connection` | list OK auf smejj-model-files; Presign-Suite 7/7; Credentials in `~/.config/smejj.com/env.local` (nie im Repo) |
| Zeabur | `curl api.smejj.com` | `/` und `/healthz` 200 (Warm-TTFB ~0,77 s, Ashburn-Server aus Europa gemessen); `/v1/models` korrekt 401 |
| Salad | Checkliste + Inventar | Alle Container seit 13.08. gestoppt, Kosten null; API-Key nur als Notfall-Hinterlegung, Budget-Gate-Code bleibt getestet (check:salad) |
| Secrets | Muster-Grep über das Repo | Keine echten Secrets; 3 Treffer sind Test-Dummies (in Tests dokumentiert „kein echter Token") |

## Maßnahmen (3 Lücken geschlossen)

1. **DNS-Doku war älter als die Realität.** Die Bestandsaufnahme
   (2026-08-06) kannte `api.smejj.com` nicht (live seit 23.08.) und die
   `admin`-Weiterleitung. Neue Datei
   `docs/dns/DNS_VERIFIKATION_2026-08-30.md` mit vollständiger Live-Gegenprobe.
2. **Auftragsgeforderte Doku-Verzeichnisse fehlten** (`docs/dns/`,
   `docs/backup/`, `docs/disaster-recovery/`, `docs/costs/`), obwohl die
   Inhalte verstreut existierten. Vier README-Einstiege angelegt, die auf die
   verbindlichen Dokumente verweisen — nichts verschoben, keine Links gebrochen.
3. **Spiegel alterte unbemerkt** (kein Cron, Skript muss angestoßen werden —
   bewusste Betreiber-Entscheidung). Heute vollständig aufgefrischt und per
   ls-remote-Gegenprobe bewiesen.

Commit 92bb6e55 (nur Doku), gepusht zu GitHub UND Codeberg. Fremde
Arbeitsstand-Änderungen (werkstatt/BACKLOG, untracked Dateien) unberührt.

## Zwischenfall: Pre-Push-Hook blockierte den Spiegel (falsch positiv)

Der `github_kostenfrei`-Hook ließ den Codeberg-Push zweimal mit „BLOCKIERT"
abbrechen. Ursachen-Kette, vollständig aufgeklärt:

1. Der Hook fragt vor jedem Push die GitHub-API nach der Repo-Sichtbarkeit
   (öffentlich → Actions gratis → „keine Prüfung"). Der Sync-Sync macht
   DUTZENDE Pushes → anonymes API-Kontingent (60/h) verbraucht → Abfrage
   scheiterte → Hook prüfte strikt wie bei einem privaten Repo.
2. Bei URL-Pushes (Remote-Name unbekannt) sieht der Hook keinen Zielstand und
   meldet den GESAMTEN Baum als hinzugefügt — darunter zwei alte
   Workflow-Dateien. Beide sind Altbestand, bereits auf GitHub und damals
   freigegeben (eine davon sogar stillgelegt: 3ef5ddfd
   „Messlauf-Action stillgelegt").
3. Der Push selbst enthielt NUR den Doku-Commit; die Policy (GitHub Free) wurde
   nirgends verletzt. Genommen: der vom Hook selbst dokumentierte Ausweg
   `git push --no-verify` für diesen EINEN Spiegel-Push, Begründung hier
   festgehalten.

Lehre für künftige Läufe: Nach einem großen Sync ist das anonyme GitHub-API-
Kontingent erschöpft; Folge-Pushes zum Spiegel können dann falsch blocken.
Warten bis zum Limit-Reset (~1 h) oder die no-verify-Tür mit Begründung.

## Nichts verändert (bewusst)

- Keine DNS-Records, Secrets, Deployments, Dienste, Startseite, Favicons
  angefasst (Change-Lock vollständig eingehalten).
- Kein Merge nach main; Push nur auf feature/design-v11 (Arbeitszweig).
- Live-Systeme nicht neu deployt — es gab keinen Code-/Konfig-Change, der
  ein Deploy erforderte (rein additive Doku).

## Verifikations-Pipeline

`check:guidelines` OK (1999 Dateien), `check:paths` OK. `npm run check:all`
(~3055 Tests) als Abschlussnachweis — Ergebnis im Abschlussbericht des
Auftrags protokolliert.
