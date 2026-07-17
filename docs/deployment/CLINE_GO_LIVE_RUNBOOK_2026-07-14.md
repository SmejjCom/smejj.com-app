# Cline Go-Live Runbook — 2026-07-14

Stand nach autonomer Umsetzung. Code fertig, gehärtet, getestet (10/10),
end-to-end verdrahtet. Backend-Artefakt gebaut **und bereits nach IDrive e2
hochgeladen**. Es fehlen nur noch zwei Aktionen, die ich aus Sicherheits- bzw.
Zugriffsgründen nicht selbst ausführe (siehe unten).

## Bereits erledigt (autonom)

- Backend-Code komplett + 3 Härtungen (Produktions-Guard, Katalog-Cache, Key-Rotation).
- Provider-Route in `src/server.js:143` gemountet, Frontend in `settings-surface.js` + `sw.js` verdrahtet — verifiziert.
- Tests 10/10 grün, alle Release-Checks grün, Start-Lock intakt (26 Dateien).
- **Control-Artefakt gebaut und nach IDrive e2 hochgeladen.**

### Exakte Werte für den Cutover

```
Neues Artefakt (bereits hochgeladen, Bucket smejj-rc9-deploy-staging-20260711):
  SMEJJ_CONTROL_ARTIFACT_KEY    = deployments/control/smejj-control-cline-v62-2026-07-14.tar.gz
  SMEJJ_CONTROL_ARTIFACT_SHA256 = 7775a87e0878b0815d6ed045600c9d30b926be562f720fbd72a27c81fd51ccda

Rollback (aktuell live, unangetastet):
  SMEJJ_CONTROL_ARTIFACT_KEY    = deployments/control/smejj-control-phase1-v41-2026-07-11-rc9.tar.gz
  SMEJJ_CONTROL_ARTIFACT_SHA256 = <aktueller Wert in Salad-Env, vor Änderung notieren>

Neue Vault-Variablen (Credential-Verschlüsselung):
  SMEJJ_PROVIDER_CREDENTIAL_KEY_ID  = cline-cred-key-2026-07-14
  SMEJJ_PROVIDER_CREDENTIAL_KEY_B64 = <selbst mit `openssl rand -base64 32` erzeugen und einfügen>
```

## Verbleibende Aktion 1 — Backend live (du, empfohlen zuerst auf Staging)

Der Control Server bootet fail-closed: falsche SHA = Server startet nicht. Darum
zuerst auf einem Staging-Container testen, dann Produktion.

1. Salad → Container `smejj.com Control Staging` (oder `smejj-control-rc9-staging`) → Edit → Environment Variables.
2. Die vier Werte oben setzen (Artefakt-Key + SHA neu, plus die zwei Vault-Vars). Den `_KEY_B64`-Wert selbst einfügen.
3. Speichern → Container startet, lädt das neue Artefakt, prüft SHA.
4. `<staging>.salad.cloud/health` → 200. Cline-Flow gegen Staging testen (siehe Aktion 3).
5. Erst wenn Staging grün: dieselben Env-Änderungen am Produktions-Container `smejj-control` → Edit → Save → Redeploy.
6. Health-Check `redbean-caesar-yccqb9olg70i1ehu.salad.cloud/health` → 200.

Warum nicht von mir: (a) `_KEY_B64` ist ein geheimer Schlüssel — geheime Werte
trage ich grundsätzlich nicht in Felder ein; (b) der Neustart des laufenden
Produktions-Control-Servers ist ein produktiver Eingriff mit Ausfallrisiko, den
ich nicht ohne dein direktes Auslösen mache.

## Verbleibende Aktion 2 — Frontend live (du)

**Befund:** Das Live-Frontend ist hinter dem Repo. Die live ausgelieferte
`https://smejj.com/assets/settings-surface.js` importiert `provider-settings.js`
noch nicht; die Cline-Maske ist live nicht vorhanden (404 auf
`/assets/provider-settings.js`). Das Frontend wird aus einem separaten Repo
(`SmejjCom/smejj-app-frontend`, `/assets/`-Struktur) über GitHub Pages bedient —
nicht aus `public/` dieses Repos.

Nötig: die Cline-Dateien in das Frontend-Repo übernehmen und das
`settings-surface.js`-Update mitziehen:

- `public/provider-settings.js`  → `assets/provider-settings.js`
- `public/provider-settings.css` → `assets/provider-settings.css`
- `public/settings-surface.js`    → `assets/settings-surface.js` (mit dem `initClineProviderSurface`-Import)
- Import-Pfade auf `/assets/...` prüfen, Service-Worker-Cache-Version (`sw.js`) erhöhen.

Design-Lock der Startseite bleibt unberührt (nur Einstellungen/Modelle). Weil
das die design-gelockte Live-Site betrifft und aus der Sandbox kein
GitHub-Zugriff besteht, mache ich diesen Schritt bewusst nicht per Hand.

## Verbleibende Aktion 3 — Live-Test (nach 1 + 2)

1. smejj.com → einloggen → Einstellungen → Modelle → Cline.
2. Cline API-Key aus app.cline.bot (Settings → API Keys) einmalig eingeben.
3. Speichern → automatischer Verbindungstest muss grün sein (sonst wird nichts gespeichert).
4. Modellliste lädt (recommended/free/clinePass), Modellwechsel ohne Neustart.
5. Kurzer Chat über Cline → Antwort streamt.

## Schutz / Rollback

- Neues Artefakt ist rein additiv hochgeladen; das alte v41-rc9-Artefakt liegt unverändert daneben.
- Produktions-Control-Server und Live-Frontend wurden **nicht** verändert.
- Rollback = Artefakt-Env auf die v41-rc9-Werte zurücksetzen, Container neu starten.
- Frontend-Rollback = vorheriger Commit im Frontend-Repo.
- Start-Design-Lock geprüft: 26 Dateien byteidentisch.
