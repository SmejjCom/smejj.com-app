Aufgabe: Cline-Integration auf smejj.com fertig live schalten. Arbeite eigenständig über den Browser weiter (alle Portale sind geöffnet und eingeloggt: Salad, IDrive e2, GitHub, Cline). Triff fachlich sinnvolle Entscheidungen, arbeite Schritt für Schritt, teste live und behebe Fehler sofort. Am Ende 100 % Schutz: nichts darf kaputtgehen, gelöscht oder ohne meine Freigabe verändert werden. Schreibweise immer exakt „smejj.com".

STAND (bereits erledigt, nicht wiederholen):
- Backend-Code der Cline-Integration ist fertig, gehärtet und getestet (10/10 Cline-Tests grün, alle Release-Checks grün). Provider-Route ist in src/server.js:143 gemountet, Frontend in public/settings-surface.js + public/sw.js verdrahtet.
- Control-Artefakt wurde gebaut UND bereits nach IDrive e2 hochgeladen.
- Details im Repo: docs/deployment/CLINE_GO_LIVE_RUNBOOK_2026-07-14.md und docs/architecture/CLINE_API_INTEGRATION.md.

EXAKTE WERTE:
- Neues Artefakt (schon hochgeladen), Bucket smejj-rc9-deploy-staging-20260711:
  SMEJJ_CONTROL_ARTIFACT_KEY    = deployments/control/smejj-control-cline-v62-2026-07-14.tar.gz
  SMEJJ_CONTROL_ARTIFACT_SHA256 = 7775a87e0878b0815d6ed045600c9d30b926be562f720fbd72a27c81fd51ccda
- Rollback (aktuell live, unverändert lassen bis Erfolg bestätigt):
  SMEJJ_CONTROL_ARTIFACT_KEY    = deployments/control/smejj-control-phase1-v41-2026-07-11-rc9.tar.gz
  (alten SHA256-Wert vor jeder Änderung aus der Salad-Env notieren = Rollback)
- Neue Vault-Variablen für den Credential-Speicher:
  SMEJJ_PROVIDER_CREDENTIAL_KEY_ID  = cline-cred-key-2026-07-14
  SMEJJ_PROVIDER_CREDENTIAL_KEY_B64 = (32-Byte-Key; ICH erzeuge ihn mit `openssl rand -base64 32` und füge ihn selbst ein — der Assistent tippt keine Geheimnisse in Felder)

WAS NOCH ZU TUN IST:

1) BACKEND-CUTOVER (zuerst Staging, dann Produktion — Control Server bootet fail-closed):
   a. Salad → Container „smejj.com Control Staging" (oder smejj-control-rc9-staging) → Edit → Environment Variables.
   b. Die vier Werte oben setzen (Artefakt-Key + SHA neu, plus beide Vault-Vars). Den _KEY_B64-Wert lasse mich selbst einfügen; sag mir genau, wann und wo.
   c. Speichern/Redeploy → warten bis RUNNING. Health-Check der Staging-.salad.cloud-URL → 200.
   d. Cline-Flow gegen Staging testen (siehe Schritt 3). Wenn grün:
   e. Dieselben Env-Änderungen am Produktions-Container „smejj-control" (Domain redbean-caesar-yccqb9olg70i1ehu.salad.cloud) → Edit → Save → Redeploy → Health 200.

2) FRONTEND LIVE (die Cline-Maske fehlt live, /assets/provider-settings.js liefert 404):
   Das Live-Frontend wird aus einem separaten Repo mit /assets/-Struktur über GitHub Pages bedient, nicht aus public/. Übernimm diese Dateien ins Frontend-Repo und deploye:
   - public/provider-settings.js  → assets/provider-settings.js
   - public/provider-settings.css → assets/provider-settings.css
   - public/settings-surface.js   → assets/settings-surface.js (Version MIT initClineProviderSurface-Import)
   Import-Pfade auf /assets/... prüfen, Service-Worker-Cache-Version in sw.js erhöhen. Startseiten-Design-Lock nicht anfassen. Nach Deploy: https://smejj.com/assets/provider-settings.js → 200.

3) LIVE-TEST:
   - smejj.com → einloggen → Einstellungen → Modelle → Cline.
   - Mein Cline API-Key (aus app.cline.bot → Account → API Keys) einmalig eingeben — DAS FÜGE ICH SELBST EIN, frag mich danach.
   - Speichern → automatischer Verbindungstest muss grün sein (sonst wird nichts gespeichert).
   - Modellliste lädt (recommended/free/clinePass), Modellwechsel ohne Neustart, kurzer Cline-Chat streamt.
   - Hinweis: mein Cline-Guthaben ist niedrig; falls der Test an fehlenden Credits scheitert, sag es mir.

4) SCHUTZ / ABSCHLUSS:
   - Nichts löschen. Altes v41-rc9-Artefakt als Rollback behalten.
   - Rollback-Weg dokumentieren (Artefakt-Env zurücksetzen + Redeploy).
   - Start-Design-Lock prüfen (npm run check:start-lock, 26 Dateien byteidentisch).
   - Memory_Bank.md erst NACH erfolgreichem Live-Test mit einem verifizierten Eintrag ergänzen.

WICHTIG: Geheime Werte (Master-Key SMEJJ_PROVIDER_CREDENTIAL_KEY_B64 und der Cline API-Key) werden ausschließlich von mir selbst in Felder eingefügt. Fordere mich an der richtigen Stelle dazu auf und warte auf mein OK, bevor du weitermachst.
