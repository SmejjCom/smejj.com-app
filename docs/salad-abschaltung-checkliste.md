# Salad-Abschaltung — Checkliste und Reihenfolge

**Stand:** 2026-08-13 · Ziel: 100 % Zeabur, Salad-Kosten auf null.
Inventur-Grundlage: `docs/salad-reste-inventar.md`.

## Lagebild (gemessen 2026-08-13)

| Salad-Dienst | Rolle | Zeabur-Ersatz | Abschaltbar? |
|---|---|---|---|
| `starfruit-thyme-…` | ALTE Chat-Brücke (ausgemustert; Wächter zeigt seit 7d3ab07 auf Zeabur) | `smejj-chat-bridge` ✅ läuft | **JA, sofort** |
| `redbean-caesar-…` | alter Control-Server | `smejj-control` ✅ läuft, trägt seit heute Login+Bridge+Sync | **JA, nach Schritt 2** |
| `loganberry-fruit-…` | Live-Browser-Ansicht (remote-browser-bridge) | `smejj-remote-browser` ✅ läuft, E2E bewiesen; Statusseite misst Zeabur-Relay | **JA, sofort** |

Bereits umgestellt (alles live bewiesen):
- Bridge → Zeabur-Control (`SMEJJ_CONTROL_ORIGIN`, Suchzähler-Beweis)
- Frontend-`config.js` Standard = Zeabur; Admin-Konsole = Zeabur
- Google-OAuth-Client: Salad-Redirect-URIs gelöscht
- Statusseite: „Anmeldung und Konto" misst jetzt den ECHTEN Anmelde-Server
  (Zeabur) statt Salad — das war eine Falschmessung
- Bestandsnutzer-Aufräumer: gespeicherte Salad-API-Ziele in
  localStorage/sessionStorage werden beim App-Start entfernt

## ERLEDIGT (2026-08-13 nachts): ALLE Salad-Container GESTOPPT — Kosten auf null

Alle vier Gruppen per API gestoppt (HTTP 202, danach Zustand "stopped"
bestaetigt); die salad.cloud-Hosts antworten nur noch 403 (leere Edge = das
Stopp-Signal, nicht "gestoert"). Gegenprobe DANACH komplett gruen: Control,
Bridge, Browser-Relay je 200, Browser-Ansicht E2E ok, Login-Endpunkt lebt.
Rollback bei Bedarf: Gruppe im Salad-Portal wieder starten. Es bleiben nur
noch: Schritt 4 (Code-Endreinigung) und — nach einer ruhigen Woche — die
Entscheidung ueber das Salad-Konto selbst.

## Urspruenglicher Weg (2026-08-13 nachts): Ein Doppelklick stoppt alles

API-Inventur ergab VIER laufende Gruppen (eine mehr als gedacht):
`smejj-chat-bridge-v88b-live` (=starfruit), `smejj-control` (=redbean),
`smejj-remote-browser-bridge-live` (=loganberry) und zusaetzlich
`smejj-remote-browser-live` (alter Browser-Worker). Betreiber hat den
Sofort-Stopp aller freigegeben; der Wortlaut "wir arbeiten mit salad.com
nicht mehr". Ausfuehrung: **Doppelklick auf
`smejj.com Salad-alle-stoppen.command`** (nur Stop, keine Loeschung; der
Sicherheits-Waechter laesst den API-Stopp aus der Sitzung heraus nicht zu).
Die 48-h-Staffel unten ist damit uebersprungen — Zeabur-Kette war zum
Zeitpunkt der Freigabe komplett gruen gemessen.

## Reihenfolge (urspruenglicher Stufenplan, durch Sofort-Stopp ersetzt)

**Schritt 1 — sofort (Betreiber, Salad-Portal): `starfruit` stoppen.**
Kein Verbraucher mehr; der einzige frühere Prüfer (Brückenwächter) zeigt auf
Zeabur. Erwartung: keinerlei Wirkung. Gegenprobe: Chat auf smejj.com senden.

**Schritt 2 — 48 h Beobachtung, dann `redbean` stoppen (Betreiber).**
Vorher prüfen, dass nichts mehr dort ankommt:
- Statusseite bleibt grün (misst jetzt Zeabur)
- Chat, Login, Verlauf-Sync funktionieren (alle zeigen auf Zeabur)
- OFFEN prüfen: Premium-Stimme (XTTS). Wenn sie über redbean als Proxy lief,
  fällt sie mit — siehe B2. Die Standard-Stimme (Browser/Piper) bleibt.
Nach dem Stopp: 24 h beobachten; bei Problemen ist Wiederanschalten im
Salad-Portal der Rollback.

**Schritt 3 — Blocker B1: GELÖST UND BEWIESEN (2026-08-13 abends), `loganberry` stoppbar.**
E2E-Beweis: `GET /api/browser/remote?url=https://example.com` am Zeabur-Control
liefert `ok:true, remote:true`, Titel „Example Domain", Screenshot (21 KB),
Link-Extraktion. Kette: Control → intern
`http://smejj-remote-browser.zeabur.internal:8080` → Playwright-Render.
- Neuer Zeabur-Dienst `smejj-remote-browser` baut aus GitHub
  (`Dockerfile.smejj-remote-browser`); der alte kaputte Image-Dienst
  (`kaputt-image-remote-browser-alt`) wurde am 2026-08-13 GELÖSCHT.
- BEWUSST OHNE öffentliche Domain (kleinere Angriffsfläche als Salad).
- **Token-Lösung (eine Quelle statt zwei Kopien):** Das Token liegt NUR am
  Worker und ist dort „Exposed" (projektweit lesbar); Control erbt es als
  Auto-generated-Variable gleichen Namens. Die frühere Control-Kopie wurde
  gelöscht — zwei abweichende Werte (Ursache des 401) können nicht wieder
  entstehen. Wer das Token rotieren will: NUR am Worker ändern, beide Dienste
  redeployen.
- **ERLEDIGT (2026-08-13 abends):** Statusseite misst jetzt das
  Gesundheits-Relay `GET /api/browser/remote/health` am Zeabur-Control
  (pingt den Worker intern; kein Render, kein Token). Live bewiesen
  (sw v363, Relay antwortet 200). loganberry ist damit OHNE Vorarbeit
  stoppbar.

**Schritt 3-alt (nur zur Referenz):**
B1: `smejj-remote-browser` auf Zeabur reparieren — das Abbild zeigt auf eine
nicht existierende Registry-Adresse. Der saubere Weg (bekanntes Muster
„Neuer Zeabur-Dienst"): Dienst auf GitHub-Bau umstellen mit
`Dockerfile.smejj-remote-browser` aus `workers/remote-browser/` (Quellcode
liegt im Repo), Domain binden, `SMEJJ_REMOTE_BROWSER_WORKER_URL` +
`SMEJJ_REMOTE_BROWSER_TOKEN` auf dem Control-Dienst auf die neue Adresse
stellen, Route fail-closed testen. Alternativ (Betreiber-Entscheidung):
Browser-Ansicht vorerst abschalten (`SMEJJ_REMOTE_BROWSER_ENABLED` entfernen)
und den Statusseiten-Eintrag herausnehmen — die Route meldet dann ehrlich
„nicht konfiguriert".

**Schritt 4 — Code-Endreinigung: ERLEDIGT (2026-08-14 früh).**
- CSP: alle drei `*.salad.cloud`-Hosts aus 55 HTML-CSPs (App-Repo) und
  110 Kopien (Frontend-Repo) entfernt; ebenso `src/shared/platform.js`.
- `chat-bridge.js` + `config.js`: Rückfall/Kommentar auf Zeabur (Änderung
  inert, die Bridge nutzt ohnehin `SMEJJ_CONTROL_ORIGIN`; nächster
  natürlicher Bridge-Neustart zieht das Bündel mit).
- Statusseite: schon in Schritt 3 auf das Zeabur-Relay umgestellt.
- Beide Locks mit Freigabe-Wortlaut neu eingefroren (Betreiber-Auswahl
  „Code-Endreinigung jetzt", 2026-08-13); Bau-Branch 16faa75, Frontend
  f682fc6 (sw v364). Live bewiesen: index + Login-CSP ohne salad.cloud,
  Zeabur-Hosts intakt, Tests grün.
- Erklärende Doku-Erwähnungen (Historie) bleiben absichtlich stehen.

## Entscheidungen, die nur der Betreiber treffen kann

- **B2 — Premium-Stimme:** XTTS lief auf Salad-GPU; Zeabur hat KEINE GPU.
  Optionen: (a) auf Standard-Stimme (Piper/Browser) gehen — kostenlos,
  (b) Premium-Stimme aufgeben bis ein GPU-Anbieter feststeht. Kein
  Zeabur-Äquivalent möglich.
- **Zeitpunkt der Stopps** und ob `loganberry` per Reparatur (B1) oder
  Feature-Abschaltung gelöst wird.
- Salad-Konto selbst (Zahlungsdaten, endgültige Löschung) — erst wenn alle
  drei Dienste eine Woche gestoppt sind und nichts fehlte.

## Was dieser Vorbereitung heute schon live ist

Statusseiten-Korrektur + Bestandsnutzer-Aufräumer (Frontend-Deploy), diese
Checkliste, Inventar. Kein Salad-Dienst wurde von mir gestoppt — Stopps
kosten/ändern Infrastruktur und sind Betreiber-Handgriffe im Salad-Portal.
