# Freigabe — Einwilligung in die PWA / smejj-Modellreihe im Datenschutzhinweis

Datum: 2026-08-30  
Betroffen: `public/datenschutz.html` (Abschnitt 11) und dessen Spiegel
`public/assets/datenschutz.html` — beide geschützt durch den
einwilligung-lock v1 (scripts/check-einwilligung-lock.mjs).

## Wortlaut der schriftlichen Freigabe des Betreibers (2026-08-30, ungekürzt)

> - Ich finde deinen Vorschlag gut. Kannst Du umsetzen
> - Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig. Lass nicht offen.

Der Vorschlag, auf den sich die Freigabe bezieht: Einbau der Trainings-
einwilligung für den smejj-1-1-Weg (Phase: "Sobald du Schritt 1 gibst
(‚Text ok' oder mit Änderungen), baue ich die Einwilligung in die PWA ein —
das ist der einzige Code-Schritt, der jetzt noch offen ist."), zuvor gebilligt
mit dem Einwilligungstext-Entwurf
(docs/architecture/SMEJJ_1_1_EINWILLIGUNG_TRAINING_ENTWURF_2026-08-30.md).

## Befund bei der Umsetzung (wichtig für spätere Leser)

Die Einwilligungskette war zum Freigabezeitpunkt BEREITS vollständig gebaut
und produktiv verdrahtet — der Entwurf vom Vormittag war eine Neufassung
aus Unkenntnis, keine Lücke:

- Oberfläche: Konto → Datenschutz-Sektion (public/account-privacy.js
  importiert fetchTrainingNotice/grantTrainingConsent/revokeTrainingConsent
  aus public/account-sessions.js; Endpunkte inkl. Widerruf mit withdrawalId,
  Art. 7 Abs. 3 DSGVO).
- Endpunkte: control-server trainingConsentRoutes (Notice/Grant/Revoke/
  Decision), getestet (tests/training-consent.test.mjs), fail-closed,
  protected durch denselben Lock.
- Text: datenschutz.html Abschnitt 11 mit der dreifach getrennten
  Einwilligung, wortgleich zur Route (umfang-Feld des Notice-Endpunkts).
- Deploy-Hash: scripts/deploy/set_training_consent_env.mjs mit eingebauter
  Reihenfolge-Garantie (ERST Frontend live, DANN Hash setzen; sonst Abbruch).

## Tatsächlich geänderte Stelle (minimal)

Abschnitt 11, Titel und erster Absatz: "smejj 1.0" → "die smejj-Modellreihe,
z. B. smejj 1.0" plus ausdrücklicher Satz, dass die Einwilligung für die
Modellreihe einschließlich künftiger Versionen gilt. Grund: Phase 1/2 dieses
Tages bereitet smejj-1-1 vor; ein Text, der nur "smejj 1.0" nennt, würde die
Reihe nicht decken. Alle übrigen Inhalte (dreifache Trennung, Sanitization,
Verschlüsselung, Widerruf, Löschung) blieben unverändert.

## Pflichten nach dieser Änderung (Reihenfolge, fail-closed)

1. Lock neu einfrieren — geschehen am 2026-08-30 mit dem obigen Wortlaut als
   --confirm.
2. Frontend-Deploy der neuen datenschutz.html (Betreiber-Ablauf,
   DEPLOYMENT_PLAN.md).
3. ERST DANACH Hash-Nachzug: scripts/deploy/set_training_consent_env.mjs
   (setzt SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256 auf die live abrufbare
   Fassung). Hinweis: das Skript spricht heute die (stillzulegende)
   Salad-Gruppe an — die Zeabur-Entsprechung ist ein offener Betreiber-/-
   Technikpunkt.
4. sw.js-Cache: datenschutz.html ist precached; Nutzer bekommen die neue
   Fassung mit dem nächsten Service-Worker-Stempel (Betreiber-Ritual, hier
   bewusst nicht angefasst — sw.js divergiert in einer Parallelsitzung).
