# Prompt: smejj.com Loop-Fehler-Transparenz zu 100 % LIVE abschliessen (Rest-Arbeit, nichts offen lassen)

Diesen gesamten Text in einen neuen Chat kopieren.

## Kontext

Du arbeitest im Projektordner der smejj.com App. Lies zuerst und halte dich strikt daran:

* `AGENTS.md` (Change-Lock, Free-only, Pflichtpruefungen)
* `docs/architecture/FREE_ONLY_MASTER_POLICY.md`
* `Project_Goals.md`, `AI_Guidelines.md`, `Memory_Bank.md` (neueste Eintraege 2026-07-15)
* Rollback-Ordner: `backups/rollback-2026-07-15-loop-error-transparenz/`

## Was bereits ERLEDIGT und verifiziert ist (NICHT wiederholen, NICHT neu bauen)

1. **Root Cause diagnostiziert:** Autonomer Lauf zeigte nur "Autonomous loop failed after 3 attempt(s)" ohne Ursache. Zwei Transparenz-Luecken: (a) `resultForJob()` in `control-server/src/orchestrator/autonomousRunner.js` uebernahm `outcome.errors` nicht ins Job-Ergebnis; (b) `renderJob()`/`verificationText()` in `public/autonomous-coding.js` zeigte errors nicht an.
2. **Fix implementiert (additiv, verifiziert):**
   * `autonomousRunner.js`: `errors` in `resultForJob()` (max. 20 Eintraege, source 100 / detail 500 Zeichen). Neue Datei-SHA-256: `bab5e369f9b5e9d282289019d8adac82383b5b859b6612828088399179e36540`
   * `public/autonomous-coding.js`: "Fehlerursachen:"-Block in `verificationText()` (max. 10 Zeilen `- [source] detail`). Neue Datei-SHA-256: `76af24c275862a0f1a6f417660d386a7885483b085a80e22a23fbc25a639dc09`
   * `tests/autonomous-runner.test.mjs`: neuer Test "failed jobs preserve capped error causes...". SHA-256: `02c2b435f162c54dc64d484382f77ef640fea832189fe6fac6e753de5cee9bb9`
3. **Lokale Verifikation gruen:** autonomous-runner 24/24, check:control-server 167/167, check:guidelines 654 Dateien, check:favicon-lock gruen, frontend-structure 28/28.
4. **Start-Lock:** `public/autonomous-coding.js` steht unter dem Start-Design-Lock; Aenderung wurde vom Nutzer schriftlich freigegeben und der Lock neu eingefroren (Manifest `docs/frontend/start-lock-manifest.json`, Freeze 2026-07-15T11:18:25.964Z, Backup `backups/start-design-lock/2026-07-15T11-18-25-964Z/`). check:start-lock 28/28 gruen.
5. **Rollback-Punkt:** `backups/rollback-2026-07-15-loop-error-transparenz/` (autonomousRunner.js-before `db569560…`, autonomous-coding.js-before `0e506aef…`).
6. **Release rc3 gebaut + hochgeladen:** `deployments/control/smejj-control-cline-maus-2026-07-15-rc3.tar.gz` auf IDrive e2 (Bucket `smejj-model-files`), SHA-256 `055500f97c6f38428a2f0a8082a998af670960828ff3ae6eed8f91264c22225c`, 456 Dateien, 894.940 Bytes, secretsIncluded:false. Builder: `scripts/deploy/build_maus_control_release_artifact.mjs` mit `SMEJJ_CONTROL_RELEASE_ID=smejj-control-cline-maus-2026-07-15-rc3`. check:release-imports 108 Dateien gruen.
7. **Staging BESTANDEN:** Gruppe `smejj-control-staging-codex` (Gateway `https://elderberry-yam-kq6qh0kb892xquqw.salad.cloud`) Version 31 auf rc3: `/api/health` ok:true, `/api/maus/run` 200 JSON fail-closed (configured:false, Staging hat bewusst keine Maus-Env) — identisch zu rc2, Non-Regression bestaetigt.
8. **Prod-Cutover vorbereitet, NICHT ausgefuehrt:** Sicherheits-Klassifizierer blockiert Agent-Aenderungen an Prod-Env (korrekt). Nutzer traegt selbst ein.

## Verbindliche Regeln (unveraendert)

* Change-Lock: Rollback-Punkt vor jeder Aenderung; bestehende, verifizierte Funktionen nicht kaputt machen; Start-Design-Lock und Favicon-Lock nicht beruehren (Start-Lock-Stand vom 2026-07-15T11:18 ist der neue eingefrorene Stand).
* Free-only: keine neuen Dienste, keine Trials, kein Auto-Billing. Salad nur pay-per-use hinter Budget-Gate.
* Secrets: niemals Schluessel/Tokens anzeigen, loggen oder in Dateien schreiben. Portal-Eingaben macht ausschliesslich der Nutzer; der Agent zeigt exakt WAS wo einzutragen ist (Namen ja, Werte nur bei unkritischen Deploy-Referenzen wie ARTIFACT_KEY/SHA).
* Memory_Bank nur mit LIVE verifizierten Fakten; 800-Zeilen-Grenze — bei Ueberschreitung aelteste Eintraege 1:1 nach `docs/memory/MEMORY_ARCHIV_2026-07.md` verschieben.
* Naming exakt `smejj.com`; jede Datei < 800 Zeilen.
* Nichts als bestanden dokumentieren, was nicht live geprueft wurde.

## Aufgaben in dieser Reihenfolge — nichts offen lassen

### Schritt A — Prod-Cutover (NUTZER-Aktion, Agent zeigt an und wartet)

Zeige dem Nutzer exakt diese Werte und warte auf "gespeichert". Salad-Gruppe `smejj-control` (Prod, Gateway `https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud`) → Edit → Environment Variables — NUR diese 2 Werte aendern, alles andere NICHT anfassen:

```
SMEJJ_CONTROL_ARTIFACT_KEY    = deployments/control/smejj-control-cline-maus-2026-07-15-rc3.tar.gz
SMEJJ_CONTROL_ARTIFACT_SHA256 = 055500f97c6f38428a2f0a8082a998af670960828ff3ae6eed8f91264c22225c
```

Configure → Save. **Rollback Prod** (vorher notieren, gilt weiter): KEY `deployments/control/smejj-control-cline-maus-2026-07-15-rc2.tar.gz`, SHA `f534f82897a0090e7e255a56745f367368606f1522692b19f8f763b85db98152`.

### Schritt B — Prod-Live-Test (Agent)

Nach Save auf Boot warten (Instanz zeigt zwischenzeitlich 503 — normal; erst bei anhaltendem 503 mit "listen"-Log gilt die Knoten-Lehre: Stop → Start = neuer Knoten, NICHT Recreate). Dann pruefen:

1. `GET /api/health` → ok:true, app "smejj.com Code", storage:true.
2. `GET /api/maus/run` (mit Auth-Session von smejj.com aus) → configured:true, budget.ok:true (Prod hat Maus-Env; Non-Regression zu V71).
3. Cline non-regressed: Einstellungen → Modelle zeigt "Verbunden", Modellliste laedt; ein kurzer Chat streamt mit sauberem [DONE].
4. **Der eigentliche Fix-Beweis:** Auf `https://smejj.com/automation` einen bewusst fehlschlagenden Lauf starten (z. B. Analyse mit nicht erreichbarem Worker/Modell) ODER den Alt-Job `job_web_b1769f5fa2b64108b2fc12bc` erneut ausfuehren ("Wiederholen"). Ergebnis-Panel MUSS jetzt einen Block "Fehlerursachen:" mit `- [source] detail`-Zeilen zeigen (z. B. `[worker_http] status_503`). Screenshot als Nachweis sichern.

### Schritt C — Frontend-Deploy der UI-Anzeige (Agent, GitHub-Web-Upload)

Der Backend-Teil (rc3) liefert die errors; die Live-Site braucht zusaetzlich das neue `public/autonomous-coding.js`:

1. Im Frontend-Repo `SmejjCom/smejj-app-frontend` (main) den vorhandenen Pfad der Datei ermitteln (analog provider-settings.js, vermutlich `assets/autonomous-coding.js` — vorher im Repo verifizieren, nicht raten).
2. Datei per GitHub-Web-Editor/Upload committen (Mac hat keinen git-SSH-Key). Quelle: Arbeitskopie `public/autonomous-coding.js`, Soll-SHA-256 `76af24c275862a0f1a6f417660d386a7885483b085a80e22a23fbc25a639dc09`.
3. Live-Verifikation: Datei-URL auf smejj.com mit Cache-Buster laden, SHA-256 byteidentisch zur Arbeitskopie. Lehre beachten: Bytes NIE manuell uebertragen, immer programmatische Kanaele mit Ende-zu-Ende-Hashvergleich.
4. Danach Schritt B.4 im echten UI wiederholen (Fehlerursachen sichtbar) — erst dann gilt der Fix als live.

### Schritt D — Fehlerbehandlung

Fehler sofort beheben (Rollback-Punkt vor jeder Codeaenderung), betroffene Suiten erneut ausfuehren (`node --test tests/autonomous-runner.test.mjs`, `npm run check:control-server`, `npm run check:guidelines`, `npm run check:start-lock`, `npm run check:favicon-lock`). Bei Prod-Problemen: Rollback auf rc2 (Werte oben) und Befund dokumentieren. Nichts als bestanden dokumentieren, was nicht live bestanden wurde.

### Schritt E — Abschluss und 100 % Schutz

1. Memory_Bank-Eintrag `[2026-07-15] Loop-Fehler-Transparenz live` — NUR live belegte Fakten: rc3-Key+SHA, Prod-Version, Live-Testergebnisse (health/maus/cline/Fehlerursachen-Screenshot), Frontend-Commit+Live-SHA, Rollback-Werte (Prod rc2, backups/rollback-2026-07-15-loop-error-transparenz/, Start-Lock-Backup 2026-07-15T11-18-25-964Z). `trainingEligible:false`. 800-Zeilen-Grenze pruefen, ggf. archivieren.
2. Offene Alt-Punkte weiterfuehren, NICHT als erledigt markieren: voller `pnpm run check:all` + `release:preflight` auf dem Mac (Sandbox-Grenzen: natives resvg, pnpm-Binary); Repo-Sync `SmejjCom/smejj.com-app` (blockiert: SSH-Key = Nutzer-Aufgabe); Maus-E2E (e) Zwei-Modell-Livevergleich (extern: zhipu flappt); Watchdog-Completion-Persistenz (braucht Boot-Logs).
3. Schutzstatus bestaetigen: Start-Lock 28/28 byteidentisch (neuer Freeze-Stand), Favicon-Lock gruen, keine bestehende Funktion veraendert, keine Daten geloescht, Worker-Autostart AUS, Budget-Gate aktiv, keine laufenden Fixkosten. Ab dann: keine Aenderung ohne neue schriftliche Freigabe.

## Erfolgskriterium

Prod (smejj-control) laeuft auf rc3 mit gruenem Health; ein fehlgeschlagener autonomer Lauf zeigt im UI unter "Fehlerursachen:" die konkreten Ursachen; Frontend-Datei live byteidentisch (SHA `76af24c2…dc09`); Cline + Maus-Bridge non-regressed; Memory_Bank aktualisiert; alle Locks unveraendert gruen; Rollback-Werte dokumentiert; keine laufenden Fixkosten.

## Zusatzhinweis fuer den Agenten

Bitte eigenstaendig durcharbeiten, ohne unnoetig nachzufragen. Die benoetigten Portale (Salad, IDrive e2, GitHub, smejj.com) sind im Browser geoeffnet und eingeloggt; Chrome-Tools und die Sandbox-Shell stehen bereit. Prod-Env-Werte traegt der NUTZER ein (Klassifizierer blockiert das fuer Agenten — anzeigen, warten, weiter). Nach der Umsetzung live testen, Fehler sofort beheben und erneut testen, bis alles 100 % sauber laeuft. Zum Schluss 100 % Schutz aktivieren: nichts darf kaputtgehen, geloescht oder ohne schriftliche Freigabe geaendert werden; bestehende Funktionen, Daten, Design, Einstellungen und Zugaenge bleiben sicher.
