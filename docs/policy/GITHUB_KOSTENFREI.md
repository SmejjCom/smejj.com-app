# GitHub kostenfrei halten — verbindliche Regel

Stand: 2026-07-29. Gilt fuer beide Projekt-Repos.
Ergaenzt `docs/architecture/FREE_ONLY_MASTER_POLICY.md` (Null-Euro-Grundsatz)
und `docs/deployment/FREE_TIER_DEPLOYMENT_GUARDRAILS.md`.

Durchgesetzt wird diese Regel maschinell durch
`scripts/check/github_kostenfrei.sh` (Pre-Push-Hook, blockiert) und
`scripts/check-no-paid-services.mjs` (Teil von `npm run check:security`).

---

## 1. Ausgangslage (gemessen 2026-07-29)

| Gegenstand | Befund | Beleg |
| --- | --- | --- |
| `SmejjCom/smejj.com-app` | **privat** | GitHub-API liefert 404 ohne Token |
| `SmejjCom/smejj-app-frontend` | **oeffentlich**, `has_pages: true` | GitHub-API liefert 200 |
| `.github/` in beiden Repos | existiert nicht | lokal `ls`, remote API 404 |
| `.gitattributes` / Git-LFS | existiert nicht, `git-lfs` ist nicht einmal installiert | `git lfs` -> "is not a git command" |
| `.devcontainer/` (Codespaces) | existiert nicht | lokal `ls`, remote API 404 |
| `ghcr.io/smejjcom/smejj-maus-engine` | existiert, **oeffentlich** (anonymer Pull moeglich), ~692 MB komprimiert | anonymes ghcr-Token -> Manifest HTTP 200 |

Es laeuft heute keine einzige GitHub Action. **Kosten heute: 0,00 €.**

## 2. Preislogik GitHub Free (Stand 2026)

- **Oeffentliche Repos**: Actions unbegrenzt kostenlos, Git-Hosting kostenlos,
  Pages kostenlos, oeffentliche Packages kostenlos (Speicher und Bandbreite).
- **Private Repos**: Git-Hosting kostenlos, aber nur **2.000 Linux-Actions-
  Minuten** und **500 MB Actions-Storage** pro Monat frei.
- **Seit 01.01.2026**: **0,002 $/Minute Plattformgebuehr auf ALLE
  Actions-Laeufe** — auch auf selbst gehostete Runner. Ein selbst gehosteter
  Runner ist also *nicht* mehr kostenlos, nur billiger.
- **Ueberschreitung**: 0,006 $/min Linux, 0,25 $/GB-Monat Storage.

## 3. Die drei — und nur diese drei — Kostenwege

1. **GitHub Actions im privaten Repo.** Jede Minute kostet ab der ersten
   Minute 0,002 $ Plattformgebuehr, ab Minute 2.001 zusaetzlich 0,006 $/min.
2. **GitHub Packages / ghcr.io mit privaten Images.** Oeffentliche Pakete sind
   frei; sobald ein Paket privat gestellt wird, zaehlen Speicher (0,25 $/GB-
   Monat) und Bandbreite gegen das Free-Kontingent.
3. **Git-LFS im privaten Repo.** LFS hat ein eigenes, kleines Freikontingent
   (1 GB Speicher / 1 GB Bandbreite pro Monat) und wird danach als
   Datenpaket abgerechnet — unabhaengig davon, dass normales Git-Hosting frei ist.

Alles andere (Git-Push/Pull, Issues, PRs, GitHub-App-API-Aufrufe, Dependabot-
*Alerts*, Pages fuer das oeffentliche Repo) kostet nichts.

---

## 4. Regel A — Keine GitHub Actions im privaten Repo

**Im Repo `SmejjCom/smejj.com-app` wird kein `.github/workflows/` angelegt.**
Ebenso wenig `.github/dependabot.yml` (Dependabot-*Version-Updates* laufen auf
Actions-Infrastruktur und verbrauchen im privaten Repo Minuten — anders als die
kostenlosen Dependabot-*Alerts*).

CI-Bedarf geht stattdessen:
- in das **oeffentliche** Repo `SmejjCom/smejj-app-frontend` (dort sind Actions
  unbegrenzt frei), oder
- auf einen **eigenen Runner ausserhalb von GitHub** — konkret: die lokalen
  `npm run check:*`-Suiten und der bestehende Zeabur-Dienst. Ein *bei GitHub
  registrierter* selbst gehosteter Runner faellt seit 01.01.2026 unter die
  Plattformgebuehr und ist damit ausdruecklich **kein** Ausweg.

**Warum das Geld spart:** Das Repo hat 272 Commits in 12 Tagen (2026-07-17 bis
2026-07-29), also rund 23 Pushes pro Tag. Eine einzige Standard-Pipeline von
`npm run check:all` laeuft mehrere Minuten. Bei 23 Laeufen à 5 min sind das
~3.450 min/Monat: das Freikontingent (2.000 min) waere nach etwa 17 Tagen
aufgebraucht, und schon die Plattformgebuehr allein kostete ab dem ersten Tag
Geld (3.450 × 0,002 $ ≈ 6,90 $/Monat, plus 1.450 × 0,006 $ ≈ 8,70 $ Ueberzug).
Aus 0 € werden so ohne jede bewusste Entscheidung rund 15 $/Monat.

## 5. Regel B — Keine privaten Container-Images ueber ghcr.io / GitHub Packages

**Images entstehen per Git-Bau beim Hoster, nicht in einer Registry.**
Das bestehende Abbild `ghcr.io/smejjcom/smejj-maus-engine` bleibt
**oeffentlich** und wird nicht auf privat umgestellt. Neue Images werden gar
nicht erst nach ghcr.io geschoben, sondern durch ein `Dockerfile.<dienstname>`
im Repo definiert, das der Hoster bei jedem Push selbst baut
(siehe `docs/deployment/MAUS_ENGINE_GIT_BAU.md`).

**Warum das Geld spart:** Das Maus-Engine-Abbild ist komprimiert ~692 MB gross
(11 Schichten, gemessen ueber das ghcr-Manifest). Privat gestellt waere es
0,692 GB × 0,25 $ ≈ 0,17 $/Monat allein an Speicher — pro Tag. Bei fuenf
gehaltenen Tags (`v1`, `latest` und drei Commit-SHA-Tags liegen heute dort)
und ohne Schichten-Deduplizierung waeren es schnell ueber 3 GB, also ~0,75 $/
Monat plus Bandbreite bei jedem Zeabur-Pull. Der Git-Bau vermeidet das
vollstaendig: der Hoster baut aus dem Quelltext, es liegt gar kein Abbild bei
GitHub. Zweiter, wichtigerer Grund: er beseitigt die aktuelle Blockade, dass
lokal kein ghcr-Login und kein laufender Docker-Daemon vorhanden ist.

## 6. Regel C — Kein Git-LFS im privaten Repo

**Weder `.gitattributes` mit `filter=lfs` noch LFS-Zeigerdateien noch eine
lokale `filter.lfs.*`-Konfiguration.** Grosse Binaerdateien gehen nach
IDrive e2 (dafuer existiert der gesamte `scripts/model-management/`-Weg), nicht
in die Git-Historie.

**Warum das Geld spart:** LFS ist der einzige Git-Speicher bei GitHub, der
ueberhaupt abgerechnet wird — normales Git-Hosting ist unbegrenzt frei. Das
Projekt bewegt regelmaessig Modelldateien und Abbilder im Hundert-MB- bis
GB-Bereich; ein einziges versehentlich per LFS eingecheckter Modell-Shard
sprengt das 1-GB-Freikontingent sofort. Zusaetzlich zahlt LFS **Bandbreite**:
jeder Klon und jeder CI-Checkout laedt die Objekte erneut. Ohne LFS ist dieser
Kostenweg strukturell zu, nicht nur ungenutzt.

## 7. Regel D — Der GitHub-App-Publisher bleibt auf Inhalte beschraeckt

`control-server/src/github/trustedPublisher.js` fordert Token mit den
Rechten `contents: write`, `metadata: read`, `pull_requests: write`. API-Aufrufe
und Pushes kosten nichts. Diese Rechte duerfen **nicht** um `actions`,
`packages` oder `workflows` erweitert werden. Solange Regel A gilt, kann auch
ein automatisierter Push keine Minuten ausloesen — genau deshalb sind Regel A
und diese Regel gemeinsam zu lesen: fiele Regel A, wuerde der Publisher jeden
Job in einen bezahlten Actions-Lauf verwandeln.

---

## 8. Was diese Regel NICHT verbietet

- GitHub Pages fuer das **oeffentliche** Frontend-Repo (`has_pages: true`,
  `CNAME` + `.nojekyll` vorhanden) — fuer oeffentliche Repos kostenlos.
- Den `gh-pages`-Branch im privaten Repo als reines Deploy-Artefakt. Er wird
  nicht als Pages-Quelle bedient (Pages fuer private Repos ist auf dem Free-Plan
  ohnehin nicht verfuegbar). **Ungeprueft:** ob im privaten Repo eine
  Pages-Konfiguration hinterlegt ist, laesst sich ohne Token nicht abfragen —
  einmalig in den Repo-Einstellungen nachsehen.
- Issues, PRs, Releases, Dependabot-*Alerts*, Code-Scanning-Alerts fuer
  oeffentliche Repos.

## 9. Aenderung dieser Regel

Wie jede Kostenentscheidung im Projekt: nur mit ausdruecklicher schriftlicher
Freigabe des Betreibers, mit Nennung von Dienst und Betrag.
