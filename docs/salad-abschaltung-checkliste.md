# Salad-Abschaltung — Checkliste und Reihenfolge

**Stand:** 2026-08-13 · Ziel: 100 % Zeabur, Salad-Kosten auf null.
Inventur-Grundlage: `docs/salad-reste-inventar.md`.

## Lagebild (gemessen 2026-08-13)

| Salad-Dienst | Rolle | Zeabur-Ersatz | Abschaltbar? |
|---|---|---|---|
| `starfruit-thyme-…` | ALTE Chat-Brücke (ausgemustert; Wächter zeigt seit 7d3ab07 auf Zeabur) | `smejj-chat-bridge` ✅ läuft | **JA, sofort** |
| `redbean-caesar-…` | alter Control-Server | `smejj-control` ✅ läuft, trägt seit heute Login+Bridge+Sync | **JA, nach Schritt 2** |
| `loganberry-fruit-…` | Live-Browser-Ansicht (remote-browser-bridge) | `smejj-remote-browser` ✅ läuft, E2E bewiesen | **JA — B1 gelöst; vorher status.js-Eintrag umstellen (s. Schritt 3)** |

Bereits umgestellt (alles live bewiesen):
- Bridge → Zeabur-Control (`SMEJJ_CONTROL_ORIGIN`, Suchzähler-Beweis)
- Frontend-`config.js` Standard = Zeabur; Admin-Konsole = Zeabur
- Google-OAuth-Client: Salad-Redirect-URIs gelöscht
- Statusseite: „Anmeldung und Konto" misst jetzt den ECHTEN Anmelde-Server
  (Zeabur) statt Salad — das war eine Falschmessung
- Bestandsnutzer-Aufräumer: gespeicherte Salad-API-Ziele in
  localStorage/sessionStorage werden beim App-Start entfernt

## Reihenfolge

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
  (`Dockerfile.smejj-remote-browser`); der alte kaputte Image-Dienst heißt
  `kaputt-image-remote-browser-alt` und kann jetzt gelöscht werden.
- BEWUSST OHNE öffentliche Domain (kleinere Angriffsfläche als Salad).
- **Token-Lösung (eine Quelle statt zwei Kopien):** Das Token liegt NUR am
  Worker und ist dort „Exposed" (projektweit lesbar); Control erbt es als
  Auto-generated-Variable gleichen Namens. Die frühere Control-Kopie wurde
  gelöscht — zwei abweichende Werte (Ursache des 401) können nicht wieder
  entstehen. Wer das Token rotieren will: NUR am Worker ändern, beide Dienste
  redeployen.
- **VOR dem loganberry-Stopp:** `public/status.js` („Browser-Ansicht") misst
  noch loganberry — Eintrag erst umstellen/entfernen, sonst zeigt die
  Statusseite falsches Rot. (Teil von Schritt 4, aber zeitlich an den Stopp
  gekoppelt.)

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

**Schritt 4 — NACH allen Stopps: Code-Endreinigung (eine Sitzung).**
- CSP `connect-src`: alle drei `*.salad.cloud`-Hosts entfernen aus
  `public/index.html` (Start-Lock!), `public/auth/login/index.html` +
  `register` (Security-Lock!), `src/shared/platform.js`; Test
  `tests/csp-hosts.test.mjs` zieht mit.
- `public/chat-bridge.js`: Salad-Rückfall-Konstante entfernen (Security-Lock).
- `public/status.js`: Browser-Ansicht-Eintrag auf neuen Träger umstellen.
- Kommentare/Doku (61 Fundstellen, meist erklärend) in einem Sammel-Commit.
- Beide Locks mit Freigabe-Wortlaut neu einfrieren.

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
