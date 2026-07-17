# PROMPT FÜR NEUEN CHAT — Cline-Integration auf smejj.com fertig live schalten

Aufgabe: Setze den Cline-Go-Live auf smejj.com fort. Arbeite eigenständig über den Browser (Salad, IDrive e2, GitHub, Cline sind eingeloggt). Schreibweise immer exakt „smejj.com". Geheime Werte (Vault-Key, Cline API-Key) füge ausschließlich ICH selbst ein — sag mir genau wann und wo. Nichts löschen, nichts ohne meine Freigabe ändern. Referenz im Repo: docs/deployment/CLINE_GO_LIVE_RUNBOOK_2026-07-14.md und docs/deployment/CLINE_API_INTEGRATION.md (docs/architecture/).

## STAND (bereits erledigt am 2026-07-14, NICHT wiederholen)

1. **Staging-Env gesetzt** — Salad-Container „smejj.com Control Staging" (Slug `smejj-control-staging-codex`), aktuell Version 24, alle 4 Cutover-Werte gespeichert und verifiziert:
   - SMEJJ_CONTROL_ARTIFACT_KEY    = deployments/control/smejj-control-cline-v62-2026-07-14.tar.gz
   - SMEJJ_CONTROL_ARTIFACT_SHA256 = 7775a87e0878b0815d6ed045600c9d30b926be562f720fbd72a27c81fd51ccda
   - SMEJJ_PROVIDER_CREDENTIAL_KEY_ID  = cline-cred-key-2026-07-14
   - SMEJJ_PROVIDER_CREDENTIAL_KEY_B64 = vom Nutzer eingefügt (44 Zeichen Base64, dekodiert exakt 32 Bytes — Format geprüft, Wert unbekannt/geheim)
   - Staging-Domain: https://elderberry-yam-kq6qh0kb892xquqw.salad.cloud

2. **Rollback-Werte notiert** (WICHTIG, weicht vom Runbook ab!):
   - Staging vorher: KEY = deployments/control/codex-parity-2026-07-12-rc18/smejj-control-context.tar.gz, SHA256 = 27b240b1956e2a3cb3d5a373bf3b861cf765b8778cd4c5bb157e627940372167
   - **Produktion `smejj-control` läuft AKTUELL auf rc3, NICHT auf v41-rc9** (Runbook-Angabe veraltet): KEY = deployments/control/smejj-control-auth-2026-07-13-rc3/smejj-control-context.tar.gz, SHA256 = afc0e5a46596753eb1aece0a9bab3789d7f7a730b0ce6dddd649f8670cb8e62b. Prod-Domain: redbean-caesar-yccqb9olg70i1ehu.salad.cloud. Produktion ist RUNNING und UNVERÄNDERT.

3. **Blocker gefunden und eingegrenzt (fail-closed funktioniert):**
   - Beide Container laden Artefakte aus IDRIVE_E2_DEPLOY_BUCKET = `smejj-model-files`.
   - Das v62-Artefakt liegt aber NUR in Bucket `smejj-rc9-deploy-staging-20260711` unter deployments/control/ (698.106 Bytes, verifiziert in der IDrive-Konsole).
   - Erster Boot: HTTP 404 → Crash-Loop. Mit Nutzer-Freigabe wurde Staging-IDRIVE_E2_DEPLOY_BUCKET testweise auf `smejj-rc9-deploy-staging-20260711` gestellt (Version 24) → jetzt **HTTP 403**: Der Container-Zugangsschlüssel `smejj-control-prod-rotation-20260712` (ID hjso7Wyb18FPmLbIkN0T) darf diesen Bucket nicht lesen.
   - Die IDrive-Konsole kann Objekte NICHT bucket-übergreifend kopieren (nur innerhalb desselben Buckets).
   - Staging crash-loopt weiter (kostet ~0,006 $/h, ungefährlich); er heilt sich selbst, sobald das Artefakt erreichbar ist.

4. **Frontend vorbereitet und verifiziert (noch NICHT deployt):**
   - Live-Frontend = GitHub Pages Repo `SmejjCom/smejj-app-frontend`, Branch main, Root-Layout, Module unter assets/.
   - Live sw.js = smejj-shell-v116. Lokales public/sw.js = v117 und ist byte-genau Live-Version + 2 Precache-Einträge (provider-settings.js/.css) — hash-verifiziert.
   - Lokales public/settings-surface.js = Live-Version + initClineProviderSurface-Import — hash-verifiziert.
   - /assets/provider-settings.js und .css sind live 404 → Upload ist rein additiv.
   - Zu übernehmen (aus Repo-Ordner public/): provider-settings.js → assets/, provider-settings.css → assets/, settings-surface.js → assets/, sw.js → Root. Etablierter Weg: GitHub-Web-Upload über die eingeloggte Browser-Session (Präzedenz in docs/memory/MEMORY_ARCHIV_2026-07.md).

## WAS NOCH ZU TUN IST (in dieser Reihenfolge)

1. **403 lösen — Entscheidung liegt beim Nutzer (zuerst fragen!):**
   - Option A (empfohlen): Nutzer kopiert das Artefakt manuell um — in der IDrive-Konsole aus `smejj-rc9-deploy-staging-20260711/deployments/control/smejj-control-cline-v62-2026-07-14.tar.gz` herunterladen und nach `smejj-model-files/deployments/control/` hochladen (gleicher Dateiname!). Danach Staging-Env IDRIVE_E2_DEPLOY_BUCKET zurück auf `smejj-model-files` setzen (mit Freigabe). Vorteil: Prod-Cutover braucht später KEINE Bucket-/Rechteänderung.
   - Option B: Nutzer erweitert selbst in der IDrive-Konsole (Zugangsschlüssel → Berechtigungen) den Schlüssel `smejj-control-prod-rotation-20260712` um Lesezugriff auf `smejj-rc9-deploy-staging-20260711`. Dann müsste beim Prod-Cutover auch Prod auf diesen Bucket zeigen.
   - Berechtigungsänderungen an Schlüsseln und das Einfügen von Geheimwerten macht der Nutzer immer selbst.

2. **Staging grün ziehen:** Nach dem Fix bootet der Container selbst (SHA-Prüfung fail-closed). Warten bis RUNNING, dann https://elderberry-yam-kq6qh0kb892xquqw.salad.cloud/health → 200. Bei erneutem Crash: Container Logs im Salad-Portal lesen (Fehlertext steht dort im Klartext zwischen Base64-Blöcken).

3. **Cline-Flow gegen Staging testen:** Staging-URL öffnen → Einstellungen → Modelle → Cline. Cline API-Key: liegt im Tab app.cline.bot (Dashboard → Account → API Keys) — der Nutzer fügt ihn SELBST ein, danach automatischer Verbindungstest muss grün sein, Modellliste (recommended/free/clinePass) lädt, Modellwechsel ohne Neustart, kurzer Chat streamt. Hinweis: Cline-Guthaben ist niedrig — falls Test an Credits scheitert, dem Nutzer sagen.

4. **Prod-Cutover (erst nach grünem Staging, mit expliziter Freigabe):** Container `smejj-control` → Edit → Environment Variables: die 4 Werte von oben setzen (ARTIFACT_KEY v62 + SHA + KEY_ID; KEY_B64 fügt der Nutzer selbst ein — er kann denselben Wert wie auf Staging nehmen oder neu erzeugen mit `openssl rand -base64 32 | pbcopy`, da noch keine Credentials verschlüsselt gespeichert sind). Vorher aktuelle Prod-Werte nochmal gegen die Rollback-Notiz prüfen. Save → Redeploy → Health https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/health → 200. ACHTUNG: Kurze Ausfallzeit möglich — nur mit Nutzer-OK auslösen.

5. **Frontend deployen (mit Freigabe des Commits):** Die 4 Dateien per GitHub-Web-Upload nach `SmejjCom/smejj-app-frontend` (3 nach assets/, sw.js in Root; Upload-Seiten: github.com/SmejjCom/smejj-app-frontend/upload/main/assets bzw. /upload/main). Import-Pfade sind relativ und funktionieren unter /assets/ (verifiziert). Startseiten-Design-Lock nicht anfassen. Nach Pages-Deploy: https://smejj.com/assets/provider-settings.js → 200, sw.js live = v117.

6. **Live-Test auf smejj.com:** wie Schritt 3, aber auf smejj.com (einloggen → Einstellungen → Modelle → Cline; API-Key fügt der Nutzer selbst ein).

7. **Abschluss/Schutz:** Nichts löschen (alte Artefakte rc18/rc3/v41 bleiben liegen). Rollback-Weg dokumentieren: Env-Werte auf die notierten alten Werte zurück + Redeploy; Frontend-Rollback = voriger Commit. `npm run check:start-lock` (26 Dateien byteidentisch). Memory_Bank.md ERST NACH erfolgreichem Live-Test mit verifiziertem Eintrag ergänzen.

## SICHERHEITSHINWEISE AUS DIESER SESSION
- Beim allerersten Versuch wurde versehentlich der Cline API-Key (67 Zeichen) statt des openssl-Werts in SMEJJ_PROVIDER_CREDENTIAL_KEY_B64 eingefügt und in Staging-Version 22 gespeichert (inzwischen mit v23 überschrieben). Empfehlung an den Nutzer: Cline API-Key bei app.cline.bot rotieren, falls noch nicht geschehen.
- Format-Check für KEY_B64 vor jedem Save: exakt 44 Zeichen, Base64, endet auf `=`, dekodiert 32 Bytes — Wert dabei nie ausgeben/lesen.
- Salad-Env-Editor: Werte per React-Setter setzen (native value setter + input/change Event), „Configure" schließt den Dialog, dann „Save" (neue Version wird deployt). IDrive-Ordner öffnen per Doppelklick.
