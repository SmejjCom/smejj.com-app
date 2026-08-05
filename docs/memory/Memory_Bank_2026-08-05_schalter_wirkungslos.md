## 2026-08-05 — Nutzerfragen-Erfassung: der Schalter ist WIRKUNGSLOS

Auftrag war, `SMEJJ_TRAINING_CAPTURE_ENABLED` einzuschalten. NICHT getan — er
haette nichts bewirkt, und ein gesetzter Schalter ohne Wirkung ist gefaehrlicher
als ein ausgeschalteter: er sieht aus wie eine laufende Erfassung.
- **GEMESSEN:** `isCaptureEnabled` wird ausschliesslich von
  `src/training/pipeline.js` gelesen. Die Pipeline-Funktionen
  (`prepareTrainingCandidate`, `buildTrainingCandidateWritePlan`) werden NUR aus
  Tests aufgerufen. **Kein einziger Aufruf im Live-Chatpfad** (control-server,
  public/, src/server.js). Es gibt keinen Weg, auf dem ein echtes Gespraech in
  die Pipeline gelangt.
- VORHANDEN: die Bibliothek (Sanitization, Verschluesselung, Schreibplan), das
  strenge Tor `evaluateTrainingEligibility` ("denied unless every condition is
  explicitly proven") und die Einwilligungs-Endpunkte am Control Server
  (`/api/training/consent`, `/revoke`, `/decision`; live, 401 ohne Anmeldung).
- **DIE OBERFLAECHE TAEUSCHT NICHT, ABER SIE ZAEHLT AUCH NICHT:** der Schalter
  "Modelltraining erlauben" in account-privacy.js sagt selbst, er sei lokal und
  "ersetzt keine serverseitige, signierte Einwilligung". Er schreibt nichts an
  den Consent-Endpunkt.
- ES FEHLT FUER EINE ECHTE ERFASSUNG: (1) ein Erfassungspunkt im Live-Chat,
  (2) die Verdrahtung des Schalters an den Consent-Endpunkt, (3) eine aktuelle
  Datenschutzerklaerung mit Hash (der Endpunkt erwartet `privacyNoticeSha256`),
  (4) das signierte Consent-Ledger auf IDrive e2.
- MERKREGEL: **bevor ein Feature-Schalter umgelegt wird, pruefen, ob ihn
  ueberhaupt jemand liest.** Ein wirkungsloser Schalter erzeugt die Illusion
  einer Funktion — hier bei personenbezogenen Daten besonders folgenreich.
