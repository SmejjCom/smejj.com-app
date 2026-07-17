# smejj 1.0 Training Capture — Abnahme-Review (2026-07-17)

Status: technischer Abnahme-Bericht nach SMEJJ_1_0_TRAINING_DATA_POLICY.md,
Abschnitt "Naechster Schritt". Freigabe des Reviews: schriftlich ("Ja",
Wof Kadavanich, 2026-07-17). Capture bleibt AUS.

## Abnahme-Ergebnis in einem Satz

Die Implementierung (Einwilligung, Widerruf, Ledger, Sanitization,
Verschluesselung, immutable e2-Writer) ist vollstaendig, getestet und wird
ABGENOMMEN — die AKTIVIERUNG bleibt gesperrt, bis die vier unten gelisteten
Aktivierungsschritte erledigt sind (Datenschutz-Abschnitt, Schluessel,
getrennte e2-Zugangsdaten, Live-Probe).

## Geprueft und bestanden

1. **Einwilligungs-/Widerrufs-Flow** (`src/training/consent.js`, 464 Z.;
   `control-server/src/training/consentLedger.js`;
   `control-server/src/routes/trainingConsentRoutes.js`): authentifizierte
   Routen; Grant nur bei aktuellem `privacyNoticeSha256` (409 sonst);
   getrennte Signier- und Binding-HMAC-Keys; opake Referenzen (keine
   Rohidentitaet im Ledger); Widerruf mit separatem Sentinel; aufgeloeste
   Entscheidung max. 60 s verwendbar. Tests: training-consent 35/35.
2. **Immutable e2-Writer** (`idrive-conditional-writer.js`, 654 Z.):
   `If-None-Match: *`-Anlage, zweites bedingtes PUT erwartet 412,
   anschliessendes GET verifiziert Groesse+SHA-256; Status-last; kein
   Ueberschreiben. Tests: training-idrive-writer gruen (Suite 46/46 gesamt).
3. **Sanitization vor Persistenz** (`sanitize.js`): Secret-/PII-Muster,
   Residual Scan, Findings ohne Werte, kein Raw-Fallback. Tests gruen.
4. **Verschluesselung** (`encryption.js`): AES-256-GCM mit record-gebundener
   AAD; getrennte Fingerprint-HMAC-Keys. Tests gruen.
5. **Eligibility fail-closed** (`policy.js`): Consent, Rechte, alle
   Qualitaets-Gates, Evidenz — jede fehlende Bedingung -> denied/quarantined.
   Tests: training-pipeline 16/16.
6. **Live-Probe-Werkzeug** (`scripts/training/probe-idrive-training-writer.mjs`):
   doppelt opt-in (ENABLED + CONFIRMATION), Prefix-Validierung — bereit fuer
   die spaetere Abnahme-Probe gegen das echte e2.
7. **Aufbewahrungs-/Loeschkonzept**: in SMEJJ_1_0_TRAINING_DATA_POLICY.md
   (Widerruf -> revoked + Loesch-/Ausnahmeanweisung; Checkpoints brauchen
   dokumentierte Datenschutzentscheidung). Abgenommen als Konzept.
8. **Notices-Archiv des Basismodells**: HEUTE angelegt und live verifiziert
   ("3 von 3 Objekte abgeschlossen"):
   `smejj-model-files/model-files/smejj-1-0/base/glm-5-2/70311cfa0158cce7dd2cf5d2e04f68e3fdc3efc1/notices/`
   mit NOTICE.md (3,72 KB), LICENSE (1,04 KB, SHA f4a18c6a... = byte-identisch
   zu Original und Upstream) und attestation-report-2026-07-17.json (2,13 KB).

## Luecken — Pflicht vor Aktivierung (Capture bleibt bis dahin AUS)

1. **ERLEDIGT (2026-07-17, Runde 4):** Abschnitt "9. Trainingsdaten fuer
   smejj 1.0 (nur mit Einwilligung)" ist LIVE auf
   https://smejj.com/datenschutz.html (Deploy via smejj-app-frontend@main,
   GitHub-Web-Upload; Live-SHA-256 == Repo-SHA-256
   `ecf29df1f5f01657074eccfd77c3a5acd40f52b4cfd5d5be3594385788390650`,
   9705 Bytes; Browserpruefung: Rendering + 0 Konsolenfehler; Startseite
   unveraendert). Hash gepinnt in `.env.example`
   (SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256) — beim Schluessel-Schritt in die
   echte ENV uebernehmen. Urspruengliche Anforderung (erfuellt): Es fehlt
   ein Abschnitt "Trainingsdaten & Einwilligung". Er muss mindestens
   erklaeren: Zweck (Verbesserung des eigenen Modells smejj 1.0),
   Freiwilligkeit + getrennte Einwilligungen (Erfassung / Training /
   Rechtebestaetigung), Widerrufsrecht mit Wirkung, Sanitization vor
   Speicherung, Verschluesselung, Speicherort (IDrive e2), keine Weitergabe.
   Nach Deploy: SHA-256 der Live-Datei pinnen ->
   `SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256`. (Frontend-Deploy-Runde mit
   Browserpruefung; Design-Lock unberuehrt, datenschutz.html ist nicht
   startgelockt.)
2. **Schluessel erzeugen (12 ENV-Werte, .env.example Z. 241-259):** je 32-Byte
   zufaellig (openssl rand -base64 32) fuer Consent-Signing/-Binding,
   Encryption, Fingerprint; Ed25519-Paare fuer Evidence/Record-Proof; plus
   Key-IDs. SICHERHEITSREGEL dieser Session: Ich tippe keine Secrets in
   Portale. Ablage gehoert nach ~/.config/smejj.com/env.local (lokal) bzw.
   Salad-ENV (Betreiber oder gesondert freigegebener, geskripteter Weg).
3. **Getrennte IDRIVE_E2_TRAINING_*-Zugangsdaten:** eigener e2-Zugangsschluessel
   mit Prefix-Allowlist `training/` — im iDrive-Portal anzulegen (Zugangs-
   schluessel -> neuer Schluessel). Gleiche Sicherheitsregel wie Punkt 2.
4. **Live-Probe:** danach einmal `probe-idrive-training-writer.mjs` mit
   Probe-Prefix ausfuehren (schreibt 1 immutables Testobjekt + Replay) und
   das Ergebnis hier nachtragen. Erst dann darf
   `SMEJJ_TRAINING_CONSENT_API_ENABLED=YES` gesetzt werden;
   `SMEJJ_TRAINING_CAPTURE_ENABLED=YES` erst nach erster echter Einwilligung
   des Betreibers ueber den Flow.

## Ausdrueckliche Grenzen dieser Abnahme

- Keine Rechtsberatung; der Datenschutz-Text ist fachlich vorbereitet, die
  juristische Endpruefung liegt beim Betreiber.
- Training selbst bleibt durch das Base-Model-Gate gesperrt (u. a.
  Trainer-Image-Digest, Budget-Freigabe offen).
- Z.ai-/Kimi-API-Daten bleiben dauerhaft ausgeschlossen — der Chat auf
  smejj.com laeuft ueber die Z.ai-API und ist damit KEINE Trainingsquelle.
  First-Party-Quellen sind z. B. eigene verifizierte Task-Ergebnisse und
  menschliche Korrekturen gemaess Policy.

## Naechster Schritt

Datenschutz-Abschnitt deployen (Punkt 1) — kostenlos, eine Frontend-Runde.
Punkte 2-3 danach als gesonderter, sicherheitsbewusster Schritt.
