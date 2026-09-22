# Apple-Ablehnung 2.1 — Antwort mit Prüfer-Video (22.09.2026)

## Was an Apple gegangen ist
- **Antwort an App Review** (Nachricht 5208c86d, 22.09. 13:05 UTC-7 / 16:05 in ASC): die sechs
  geforderten Punkte (Video, Zweck/Zielgruppe, Zugang ohne Konto, externe Dienste, keine regionalen
  Unterschiede, keine regulierte Branche) — Text in `~/.config/smejj.com/apple/einreichung-2026-09-22/antwort-app-pruefung.txt`.
- **Anhang**: `smejj-app-review-iphone.mp4`, 74.242.207 Bytes, 734 s, 640×1434, vom echten
  iPhone 17 Pro Max mit Build 1.0 (3): App-Start → Erstfrage ohne Konto → Google-Anmeldung mit
  Rückweg in die App → Chat → Bild → „Inhalt melden" mit Bestätigung → Menü → Mein Konto → Meine
  Daten → Konto löschen (Bestätigungsschritt, abgebrochen).
- **Anmerkungen** der Version (App Review Information): UPDATE-Absatz zum Video ergänzt (3.848 Zeichen).
- **Version 1.0** hängt an **Build 3** (Schema smejj://, TestFlight intern).

## Wie es aufgenommen wurde
iPhone-Synchronisierung (macOS) spiegelt das Gerät; `screencapture -v` nimmt das Spiegelfenster
auf (feste Dauer, per Signal beendete Aufnahmen gehen verloren). Schnitt/Zuschnitt/Umkodierung mit
drei kleinen AVFoundation-Werkzeugen in Swift (kein ffmpeg auf dem Mac). Rohmaterial teil1.mov
(15 min) + teil2.mov (6 min) liegen im Einreichungsordner.

## Wie der Anhang hochkam
Die ASC-Maske scheitert bei ~74 MB still („Es ist ein Fehler aufgetreten"). Handweg über iris:
Datei in 9-MB-Stücken in die Seite laden, zusammensetzen (SHA-256 geprüft), `POST
resolutionCenterMessageAttachments` mit `resolutionCenterDraftMessage`, 15 PUTs à 5 MB auf Apple-S3
(3 parallel), `PATCH uploaded:true + md5`. Zwei liegengebliebene AWAITING_UPLOAD-Anhänge der Maske
gelöscht, Entwurf per „Entwurf fortsetzen" gesendet.

## Offen
`PATCH reviewSubmissions submitted:true` antwortet 409 „Version is not ready to be submitted yet".
Der Weg ist der Knopf **„Prüfung aktualisieren"** auf der Versionsseite, danach **„Erneut zur
App-Prüfung übermitteln"**. Genau davor beendete sich Chrome; die ASC-Sitzung (Sitzungscookies) ist
weg — Anmeldung mit Apple-ID + 2FA nötig.

## Am Gerät gefundene App-Befunde (nicht Teil dieser Einreichung)
1. Profilmenü: der Tipp auf „Mein Konto"/„Einstellungen" ging meist DURCH das Menü auf die
   Chatliste dahinter; erst nach Öffnen/Schließen des Verlaufs traf er. Nur am Touch-Gerät.
2. Textauswahl-Leiste „Korrekturlesen | Umformulieren" blieb nach einer Wischgeste kleben.
3. Gast-Erstfrage im WLAN des iPhones bei „Einen Moment …" hängen geblieben; über 5G in 6 s
   beantwortet (Server per curl in 6 s, Simulator sofort). Ursache offen.
