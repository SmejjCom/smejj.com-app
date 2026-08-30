# Task Capsule — Ergänzung: Browser-Runde durch alle Portale (2026-08-30, Nachmittag)

Betreiber-Auftrag: „Geh Browser. Ich bin im Browser bei allen eingeloggt.
Welche es nicht eingeloggt, kannst Du mir sagen?" — Vollzug im
In-App-Browser (IAB), Tabs seriell, DOM-Snapshots als Beweisgrundlage.

## Login-Stand (gemessen im IAB)

| Portal | Status | Beweis |
|---|---|---|
| Zeabur | **eingeloggt** (Smejj Com) | Projektliste mit beiden Projekten sichtbar |
| GitHub | **eingeloggt** | „You own SmejjCom/smejj.com-app", Avatar, Settings sichtbar |
| Salad-Portal | **eingeloggt** (smejjcom@gmail.com) | Organisation „smejjcom", Containerliste sichtbar |
| Spaceship | **NICHT eingeloggt** | „actions for logged out user" |
| Codeberg | **NICHT eingeloggt** | Sign-in-Link; Repo 404 weil Spiegel privat |
| IDrive-e2-Konsole | **NICHT eingeloggt** | /signin; Google-SSO-Popup-Flow im IAB zerrissen |
| Docker Hub | **NICHT eingeloggt** | Sign-in-Link (Hub wird nicht benutzt) |

Fachlich folgenlos: DNS per dig voll bewiesen (Spaceship), Spiegel per SSH
voll bewiesen (Codeberg), Speicher per S3-API voll bewiesen (IDrive e2).
Ein Login wäre nur für Portal-Änderungen nötig — es stand keine an.

## Neue Portal-Erkenntnisse (nicht in der CLI-Runde sichtbar)

1. **Zwei-Server-Umzug ist REALITÄT:** Projekt „untitled-1" (Tencent
   Silicon Valley 2C/8GB) läuft mit smejj-bild-maler isoliert — Running
   seit 15 Tagen, letzter Deploy = safetensors-Verträglichkeits-Fix.
   Die SERVER_ARCHITEKTUR_IST-Doku (26.08.) nannte den Umzug noch als
   Überlegung; er ist seit 14.08. vollzogen.
2. **Container-Registry ist GHCR**, nicht Docker Hub: Der Maus-Dienst im
   Hauptprojekt baut aus ghcr.io/smejjcom/smejj-maus-engine:v1 — läuft
   unter dem GitHub-Konto (kostenfrei für public images).
3. **Salad-Konsole bestätigt:** ALLE Containergruppen STOPPED (17
   Hauptgruppen + Job-/Staging-Gruppen im Snapshot, keine Ausnahme).
4. Hauptprojekt „untitled" (Ashburn): 9 Dienste, 8 running — der stille
   ist smejj-training-loop (dokumentiert stillgelegt).

## Falle dokumentiert: IDrive-Google-SSO im IAB

„Continue as Smejj" öffnet einen OAuth-Popup (accounts.google.com), der per
postMessage zum Opener zurückredet. Im IAB riss die Kette (erster Popup
blockiert, zweiter verwaist); Klicks auf die Konto-Auswahl blieben
wirkungslos (Rollen-, Text- und node_id-Klick je Timeout/ohne Effekt).
Lehre: IDrive-Konsole-Login beim Betreiber im eigenen Browser erledigen
(ein Klick auf „Continue as Smejj"); Agent prüft Speicher zustände über
die S3-API (idrive:check), nicht über die Web-Konsole.
