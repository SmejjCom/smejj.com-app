# Maus-E2E-Livenachweis 2026-07-15 — wiist.com im eigenen Browser (BESTANDEN)

- runId: `maus-mrm4obnf-8058c62fdbec`, capsuleRef: `maus-wiist-test-2026-07-15`, planId: `wiist-homepage-check`
- Start 13:40:42 UTC, Ende 13:41:30 UTC, Status `fertig`, ok:true, plannerCalls: 1 (Plan im ersten Versuch gueltig), aborted:false, failedStep:null
- Aufgabe (natuerliche Sprache): wiist.com oeffnen, Titel auslesen, Inhalt pruefen, Screenshot. domainAllowlist: wiist.com/www.wiist.com, budget.maxPlannerRoundtrips: 0
- Aktionen 7/7 ok: openBrowser 345ms -> navigate 727ms -> waitFor -> extract -> assert -> screenshot 261ms -> closeBrowser
- Extrahiert: page-title = "wiist – Real people, now around you"
- Capsule-Artefakte (IDrive e2, uploaded:true):
  - capsules/maus-engine/maus-wiist-test-2026-07-15/result/wiist-homepage-check/aktionsprotokoll.json.gz (2.692 Bytes raw)
  - capsules/maus-engine/maus-wiist-test-2026-07-15/result/wiist-homepage-check/screenshots/wiist-homepage.png.gz (104.162 Bytes raw)
- Infrastruktur: Worker-Gruppe smejj-maus-engine, Knoten e4438b34 (erster Knoten 44d59900 wurde von Salad waehrend des Image-Pulls ersetzt), Health vor Start: {"ok":true,"running":false}
- Control-Server: Prod V72 (rc3) mit Worker-Health-Gate (waitForWorkerReady) — erster vollstaendig bestandener Maus-E2E-Lauf.
