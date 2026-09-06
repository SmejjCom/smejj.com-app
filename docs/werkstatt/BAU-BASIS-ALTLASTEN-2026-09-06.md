# Bestandsschulden der Bau-Basis — gemessen 2026-09-06

Gemessen in einem frischen Worktree ab `origin/feature/auth-redesign-github-magiclink`
(Bau-Basis `3ff9ab71`), also genau dort, wo das Werkstatt-Tor (Nr. 30) misst. **Ohne jede
eigene Änderung waren 24 Proben rot** — die Nachtroutine konnte deshalb seit Tagen nicht
grün abschließen, unabhängig davon, wie sauber die jeweilige Aufgabe erledigt wurde.

`npm test` in der Haupt-Arbeitskopie (`feature/design-v11`) verdeckt das: dort liegen
Dateien, die es in der Bau-Basis nicht gibt (z. B. die git-ignorierte
`pdf.worker.min.js`), und die Historien der beiden Zweige sind **unverwandt**
(`git diff basis...HEAD` antwortet "no merge base").

## Behoben (12 von 24)

| Probe | Ursache |
|---|---|
| `opsAutopiloten.test.js` — jeder Autopilot in genau einem Bereich | Nr. 82 „schutz-echtheit" war registriert, aber nirgends zugeordnet; `bereichVon()` ließ ihn still in „Betrieb & Auslieferung" fallen |
| `pdfjs-worker-route.test.mjs` (2) | Die Worker-Route in `src/server.js` ging mit `6490c74e` (Besucher-Puls) verloren; eingeführt war sie in `c405e0ff` — **beide in dieser Historie**, also eine echte Regression |
| `anhang-pdf-text.test.mjs` | Verlangte die git-ignorierte `pdf.worker.min.js` und eine einzeilige `VERSION` — beides seit der Teilung vom 2026-09-04 überholt |
| `dockerignore-bau-kontext.test.mjs` | `.dockerignore` schloss `workers/smejj-smee` aus, obwohl `Dockerfile.smejj-smee` es kopiert — derselbe Fehlertyp, der den con-Dienst nie starten ließ |
| `erste-schritte.test.mjs` (3) | Test war auf die Cache-Marke `?v=b66` festgenagelt; der Bump auf `b67` riss alle drei Proben |
| `eval-packs.test.mjs` (2) | `ae580731` änderte ein Pack, ohne die Suite neu zu hashen (`eval_suite_integrity_mismatch`) |
| `module-queries.test.mjs` | `browser-pane-fernwege.js` lud `browser-pane-render.js` unter der alten Kennung — dasselbe Modul zweimal im Speicher |
| `chat-frage-karte.test.mjs` | Die Test-Bühne kannte kein `classList.toggle`, seit `chat-stream.js` den Medien-Strom markiert |
| `maus-absicht.test.mjs` | Probe suchte „haelt", der Text sagt längst „hält" |

## Nachtrag: die Bau-Basis wanderte während dieser Messung weiter

Gemessen wurde zuerst gegen `3ff9ab71`. Noch während der Arbeit kam `56eff4fc`
(„Steg in der Antwort-Leiste + SW v776 aus design-v11") hinzu und brachte drei der vier
Sperr-Stempel mit — offen ist auf der Bau-Basis nur noch der **start-lock**. Nach dem Rebase
auf `56eff4fc` bleiben von den 24 roten Proben noch **10**: die zwei Proben zu
„eine geänderte Datei schlägt an" und „die echten Manifeste stimmen mit der Auslieferung
überein" hat dieser Commit mitgeheilt.

## Offen (10) — jeweils mit dem Grund, warum die Nachtroutine sie NICHT anfassen darf

### A. Braucht einen Betreiber-Stempel (gesperrte Dateien)

| Probe | Datei | Was zu tun wäre |
|---|---|---|
| `search-overlay.test.mjs` (2) | `public/app.js` (start-lock) | `app.js` bindet den Such-Nachlader nicht; `search.js` lädt das Overlay nicht |
| `precache-dynamische-importe.test.mjs` | `public/sw.js` (start-lock) | Sechs dynamisch geladene Module fehlen im Precache: `erste-schritte.js`, `chat-actions-woerter.js`, `composer-zeile.js`, `anhang-pdf-text.js`, `anhang-office-text.js`, `anhang-tonspur.js` |
| `adminbereich-anmeldepflicht.test.mjs` | `control-server/admin-ui/gate.js` (admin-lock) | Quelle und Spiegel weichen ab (`CONTROL_ORIGIN`); der Spiegel entsteht über `scripts/deploy/sync_admin_console_pages.mjs` |
| `dateisperren.test.mjs` (3) | die Manifeste selbst | Seit `56eff4fc` ist nur noch der **start-lock** auf der Bau-Basis nicht nachgezogen — dafür liegt die Kaskade **„smejj.com Werkstatt-Tor vier Sperren stempeln.command"** bereit (sie stempelt, was verletzt ist, und lässt die grünen unangetastet) |

Sperren neu einzufrieren ist ausdrücklich dem Betreiber vorbehalten (Doppelklick), und eine
Sperre darf nie im selben Zug geändert und neu gestempelt werden — `pruefeManifeste()` in
`scripts/werkstatt/pruefe-tor.mjs` weist das fail-closed ab. Deshalb muss der Stempel
**auf der Bau-Basis** liegen, nicht auf dem Werkstatt-Branch.

### B. Braucht eine Freigabe-Entscheidung

| Probe | Grund |
|---|---|
| `model-promotion.test.mjs` | Die Phase-1-Foundation-Suite pinnt Digests von `scripts/check-no-paid-services.mjs` und `scripts/check-guidelines.mjs`; beide Dateien wurden seither geändert (`df213d7d`, `3817f2bc`), die Digests nicht. Sie nachzuziehen heißt „diese Fassungen sind autorisiert" — das ist ein Stempel, kein Testfix, und die Suite nennt sich selbst *immutable*. |

### C. Zweig-Divergenz — der erwartete Code liegt in einem anderen Strang

| Probe | Fehlt |
|---|---|
| `evolution-bruecke.test.mjs` | `public/chat-bridge-evolution.js` exportiert weder `codeAusAntwort` noch `meldeAntwort` |
| `maus-cookie-banner.test.mjs` | `workers/maus-engine/cookie-banner.mjs` exportiert `BANNER_SELECTORS`/`BANNER_TEXTS` nicht und kennt `istZustimmung` nicht |

In beiden Fällen kam der **Test** in die Bau-Basis, der **Code** nicht (`3722eca4` liegt
nachweislich nicht in dieser Historie). Das nachzubauen wäre kein Testfix, sondern eine
Zusammenführung zweier Zweige — und genau die Vermischung, vor der die Erfahrung mit dem
Bündel-Abgleich warnt. Richtig ist, den fehlenden Commit gezielt zu übernehmen oder den
Test bis dahin zurückzuziehen; beides ist eine Betreiber-Entscheidung.

## Lehre für die Nachtroutine

Ein rotes `npm test` auf der Bau-Basis heißt **nicht**, dass die Nachtarbeit schlecht war.
Die Freigabekarte muss diesen Unterschied benennen, sonst liest sich jede ehrliche Nacht wie
ein Fehlschlag. Und: gemessen wird immer im Worktree ab der Bau-Basis, nie in der
Haupt-Arbeitskopie — dort ist grün, was anderswo fehlt.
