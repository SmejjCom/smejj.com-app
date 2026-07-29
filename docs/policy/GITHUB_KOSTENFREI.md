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

## 1b. Nachweis aus der GitHub-Rechnung (abgelesen 2026-07-29, eingeloggt)

`Settings → Billing`, Zeitraum 1.–31. Juli 2026:

```
Gross metered usage      $10.47
Discounts              - $10.47
Billable usage             $0        <- das ist die Zahl, die zaehlt
Actions minutes         0 min used / 2.000 min included
Actions storage         0 GB used / 0,5 GB included
```

In der Tagesaufstellung steht bei **jedem** der 22 Tage mit Verbrauch
`Billed amount $0`. Verbrauch nach Repo: `smejj-app-frontend` $10,21,
`smejj-control` $0,23, `smejj-site` $0,02, `smejj.com-app` unter $0,01.

Der Verbrauch von $10,47 entsteht durch **GitHub-Pages-Bauten**: Pages laeuft
intern auf Actions. Er ist vollstaendig rabattiert, weil die drei betroffenen
Repos oeffentlich sind (per API geprueft: alle drei HTTP 200).

### Zweite Schutzschicht: die Konten-Budgets stehen bereits auf 0

`Settings → Billing → Budgets and alerts` — fuenf Budgets, alle **$0 mit
"Stop usage: Yes"**, plus "Included usage alerts: On":

| Produkt | Budget | Stop usage |
| --- | --- | --- |
| Actions | $0 | ja |
| Packages | $0 | ja |
| Codespaces | $0 | ja |
| Git LFS | $0 | ja |
| All AI Credit SKUs | $0 | ja |

**Diese Budgets nicht anfassen.** Sie sind der Notaus: selbst wenn der
Pre-Push-Hook umgangen wird (Web-Editor, fremder Rechner, `--no-verify`),
stoppt GitHub die Nutzung, bevor ein Cent anfaellt. Der Hook verhindert den
Fehler, die Budgets begrenzen den Schaden — beide werden gebraucht.

Empirisch belegt, dass die Budgets nichts kaputt machen: sie stehen den
ganzen Juli auf $0, und die Pages-Bauten des Frontends liefen trotzdem
durch ($10,21 Verbrauch, $0 berechnet). Rabattierter Verbrauch in
oeffentlichen Repos zaehlt nicht gegen ein Ausgabenbudget.

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

## 7b. Regel E — Diese drei Repos muessen oeffentlich bleiben

`SmejjCom/smejj-app-frontend`, `SmejjCom/smejj-control`, `SmejjCom/smejj-site`.

**Warum das Geld spart:** Ihr gesamter Actions-Verbrauch — im Juli 2026
$10,46, praktisch alles Pages-Bauten — ist nur deshalb kostenlos, weil sie
oeffentlich sind. Wuerde eines davon auf privat gestellt, faellt der Rabatt
sofort weg. Das Actions-Budget steht auf $0 mit hartem Stopp, es entstuenden
also **keine Kosten, sondern ein Ausfall**: GitHub wuerde die Pages-Bauten
anhalten und smejj.com bekaeme keine Aktualisierungen mehr. Der Fehler saehe
nicht wie eine Kostenfrage aus, sondern wie eine kaputte Website.

Der einzige Grund, warum das private Repo `smejj.com-app` unter $0,01 liegt:
dort laeuft nichts. Genau so bleibt es (Regel A).

## 7c. Regel F — Das private Paket smejj-remote-browser bleibt beobachtet

Stand 2026-07-29 liegen drei Container-Pakete unter `SmejjCom`:

| Paket | Sichtbarkeit | zuletzt veroeffentlicht |
| --- | --- | --- |
| `smejj-control` | oeffentlich | — |
| `smejj-maus-engine` | oeffentlich | — |
| `smejj-remote-browser` | **privat**, Tag `latest`, 4 Downloads | vor 20 Tagen |

Das ist der einzige heute offene Punkt bei Kostenweg 2. Er kostet aktuell
nichts, weil das Packages-Budget auf $0 mit hartem Stopp steht — GitHub
wuerde eher den Zugriff sperren als eine Rechnung stellen. Trotzdem gilt:
**neue private Pakete werden nicht angelegt.** Ob dieses eine oeffentlich
gemacht oder entfernt wird, entscheidet der Betreiber; beides ist eine
Veroeffentlichungs- bzw. Loeschentscheidung und wird nicht nebenbei getroffen.

**Entscheidung des Betreibers vom 2026-07-29: so lassen.** Das Paket bleibt
privat und wird nur beobachtet. Es kostet nichts, solange das Packages-Budget
auf $0 mit hartem Stopp steht — deshalb haengt Regel F an dem Budget. Wird das
Budget je angehoben, muss dieser Punkt neu entschieden werden.

## 8. Was diese Regel NICHT verbietet

- GitHub Pages fuer das **oeffentliche** Frontend-Repo (`has_pages: true`,
  `CNAME` + `.nojekyll` vorhanden) — fuer oeffentliche Repos kostenlos.
- Den `gh-pages`-Branch im privaten Repo als reines Deploy-Artefakt. **Geprueft
  2026-07-29** unter `smejj.com-app → Settings → Pages`; GitHub antwortet dort
  woertlich: "Upgrade or make this repository public to enable Pages". Pages
  ist im privaten Repo auf dem Free-Plan also gar nicht einschaltbar — der
  Kostenweg existiert nicht, er ist nicht nur ungenutzt.
- Issues, PRs, Releases, Dependabot-*Alerts*, Code-Scanning-Alerts fuer
  oeffentliche Repos.

## 9. Aenderung dieser Regel

Wie jede Kostenentscheidung im Projekt: nur mit ausdruecklicher schriftlicher
Freigabe des Betreibers, mit Nennung von Dienst und Betrag.
