# Server-Architektur smejj.com — Ist-Stand

Stand: 2026-08-26. Zusammengestellt aus den Betriebs-Notizen (Gedächtnis-Bank);
Live-Verhalten ist Notizen-Stand vom 24.–26.08., nicht an diesem Tag frisch
nachgemessen. Zielbild/Planung: siehe `SERVER_ZIELBILD_2026-08-13.md` und
`ZWEITER_SERVER_UMZUG.md`.

## Gesamtbild

```
Nutzer (Browser, PWA)
   │
   ├── smejj.com ──────────────── GitHub Pages (Repo SmejjCom/smejj-app-frontend@main)
   │                              Service Worker smejj-shell-vNNN (Wurzel-sw.js zählt)
   │
   └── api.smejj.com ──────────── CNAME → smejj-control.zeabur.app (Zeabur-TLS)
                                       │
              ┌────────────────────────┴───────────────────────────┐
              │        Zeabur-Projekt „untitled“ — EIN Server      │
              │        (Tencent Ashburn, 2C/8GB, 6 €/Mo Flat,      │
              │         K3s / ZeaburOS, *.zeabur.internal)         │
              │                                                    │
              │  smejj-control ── Auth, Router, Admin, /v1-API     │
              │  smejj-chat-bridge ── Chat/Agent-Schnellspur (Groq)│
              │  smejj-maus-engine ── Browser-Automat („Maus“)     │
              │  smejj-remote-browser ── Fern-Browser (intern)     │
              │  smejj-video-worker ── Video/ffmpeg (intern :8080) │
              │  smejj-voice-piper ── Piper-TTS de (intern)        │
              │  smejj-bild-maler ── Bilderzeugung (CPU-Fresser)   │
              │  (+ brueckenwaechter; training-loop stillgelegt)   │
              └────────────────────────┬───────────────────────────┘
                                       │
                          IDrive e2 (S3, extern)
                 smejj-app · smejj-model-files · smejj-sicherung
```

## 1. Frontend (Auslieferung)

- **smejj.com** wird von **GitHub Pages** ausgeliefert, Quelle ist das Repo
  **SmejjCom/smejj-app-frontend**, Branch `main`. Kostenlos, bewusst getrennt
  vom Server.
- Dateien liegen dort **doppelt**: an der Wurzel UND unter `assets/`. Nur die
  **Wurzel-`sw.js`** wird registriert und trägt den echten Live-Cache-Stand
  (`smejj-shell-vNNN`, zuletzt v712); `assets/sw.js` ist eine Leiche.
- PWA mit Service Worker: Vorabspeicher mit Cache-Buster `?sw=<CACHE_NAME>`,
  seit v367 stale-while-revalidate (Randcache-Falle von GitHub Pages).
- DNS bei **Spaceship** (NS launch1/2.spaceship.net). **Kein Cloudflare**
  (Betreiber-Regel). Spiegel-Repo auf **Codeberg**.
- Drei Domains liefern byte-identische Bündel aus (Abgleich-Projekt 24./25.08.).

## 2. Zeabur — ein Server, ein Projekt, alle Dienste

Ein Zeabur-Projekt gehört zu **genau einem Server**; Dienste sind nicht auf
einen zweiten Server verschiebbar (zweiter Server = zweites Projekt =
`*.zeabur.internal` bricht — deshalb liegt der Zwei-Server-Plan in
`ZWEITER_SERVER_UMZUG.md`).

| Dienst | Aufgabe | Erreichbarkeit / Besonderheit |
| --- | --- | --- |
| **smejj-control** | Auth (Magic-Link, Google, GitHub), Modell-Router, Admin-Konsole, öffentliche `/v1`-API, Autopiloten-Anschlüsse | Öffentlich als **api.smejj.com** (seit 23.08.); alte Adresse smejj-control.zeabur.app bleibt parallel gültig (CSP additiv). Baut aus dem **Bauzweig** via `control-neu-bauen.mjs` |
| **smejj-chat-bridge** | Chat/Agent-Schnellspur, einziger Ort mit Groq-Key; eigene Such-/Schnellspur-Weiche VOR dem Control-Server (Header `x-smejj-bridge`) | `PREBUILT_V2` auf node:22, **ohne Git-Anbindung**: lädt beim Start per curl `assets/chat-bridge.js` (Bündel ~776 KB) von raw.github. Deploy = Bündel bauen → pushen → raw-CDN abwarten → `restartService` |
| **smejj-maus-engine** | Browser-Automat („Maus“, freier Modus) | eigener Dienst |
| **smejj-remote-browser** | Fern-Browser: echter Headless-Chrome für das Browser-Panel (Amazon & Co.) | **Bewusst ohne öffentliche Domain**, nur interne Adresse + Token; Roboter-Prüfungen werden erkannt und übergeben, nie umgangen |
| **smejj-video-worker** | Video-Erzeugung (kenburns/ffmpeg, fMP4 für MediaSource) | intern :8080, Schlüsselschutz `SMEJJ_VIDEO_WORKER_KEY` |
| **smejj-voice-piper** | Premium-Stimme (Piper-CPU-TTS, de) | intern smejj-voice-piper.zeabur.internal:8080, **kein Schlüssel belegt** — vor einer öffentlichen Domain klären |
| **smejj-bild-maler** | Bilderzeugung (CogView-Kette, GFPGAN) | Der Ressourcen-Fresser (gemessen 13.08.: 203 % CPU / 6,6 GB RAM) — Grund für die Zwei-Server-Überlegung; Schlüsselschutz `SMEJJ_BILDER_WORKER_KEY` |
| brueckenwaechter | Überwachung der Chat-Brücke | Hilfsdienst |
| training-loop | LoRA-Training | **stillgelegt** — Training seit 06.08. eingestellt, RAG gewinnt |

**Salad ist komplett abgeschaltet** (Trennung abgeschlossen); alles läuft auf
Zeabur. Merkregel Portal: vor jedem Restart den Dienstnamen auf der Seite
prüfen — Seitenleisten-Klicks treffen sonst den falschen Dienst.

## 3. Speicher — IDrive e2 (S3), drei Eimer

| Eimer | Inhalt | Zugriff |
| --- | --- | --- |
| **smejj-app** | Nutzdaten: Chats, `auth/email-users/`, `admin/audit+index/`, `jobs/`, `mail/zustellung/` | Nur der Server-Schlüssel; der lokale Laptop-Schlüssel bekommt 403 |
| **smejj-model-files** | Deploy-Artefakte, Modelle, `capsules/app/`, tägliche Betriebs-Schnappschüsse unter `sicherung/` | Server (`IDRIVE_E2_DEPLOY_BUCKET`) UND Laptop (lokal ist dies `IDRIVE_E2_BUCKET`!) |
| **smejj-sicherung** | Backup: serverseitige e2-Replikation (Job 2430_1 = smejj-app komplett, ohne Lösch-Sync; Job 2431_1 = `sicherung/`-Präfix) | **Kein** hinterlegter Dienst-Schlüssel kommt ran (gewollte Isolation); Kontrolle nur über die IDrive-Konsole |

Falle: Server und Laptop haben **verschiedene** `IDRIVE_E2_BUCKET`-Werte — eine
Auflistung, die lokal Treffer liefert, kann auf dem Server leer sein und
umgekehrt. Bei jedem neuen Präfix zuerst festlegen, WER schreibt.

## 4. Code-Seite — Repos und Zweige

| | Repo / Branch | Rolle |
| --- | --- | --- |
| Arbeitsordner (dieser Klon) | SmejjCom/**smejj.com-app**, `feature/design-v11` | Frontend-Arbeit (`public/` = Quelle), Tests, Wächter — NICHT die Live-Quelle |
| Bauzweig | `feature/auth-redesign-github-magiclink` | Control-Server-Deploys (`src/`, `control-server/src/`) — **keine gemeinsame Git-Wurzel** mit dem Arbeitszweig |
| Live-Frontend | SmejjCom/**smejj-app-frontend**, `main` | GitHub Pages + Quelle des Bridge-Bündels |
| Spiegel | Codeberg | Ausfallsicherung, kostenfrei |

Serverarbeit im Arbeitszweig geht **nie live** — sie gehört in den Bauzweig.

## 5. Betrieb auf dem Mac des Betreibers

- **62+ Autopiloten/Wächter** (Ampel-System im Adminbereich): u. a.
  Nutzerreise-Wächter Nr. 29 (alle 15 min die ganze App), Test-Wächter Nr. 61
  (tägliche Unit-Tests per LaunchAgent), Modell-Katalog-Wache Nr. 62,
  Web-Vitals-Wache Nr. 63, Speicher-Füllstand Nr. 64.
- `check:all` (Suite ~3055 Tests, Start-Lock über 32 Dateien) als lokales Tor
  vor jedem Deploy.
- Automatik läuft über **LaunchAgents** (crontab hängt am Admin-Klick;
  Google-Drive-Ordner ist für cron gesperrt).

## 6. Modelle / KI-Anbindung

- Modell-Liste kommt **nicht aus dem Code**, sondern aus dem Cline-Katalog
  (Lock + Ampel seit 23.08.); Router sitzt im Control-Server.
- Schnellspur (Groq, über die Bridge) vs. tiefe Spur; Gratis-Stufe 0 =
  Gemini Nano im Browser.
- Prompt-Caching und Token-Messung sind live; eigenes Training ist seit
  06.08. eingestellt — Projektwissen läuft über RAG.
