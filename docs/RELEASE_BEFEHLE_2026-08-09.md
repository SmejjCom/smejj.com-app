# Release-Runbook — Marktreife-Umbau 2026-08-09

Fertig vorbereitete Befehlsliste zum **selbst ausführen**. Reihenfolge einhalten.
Alle Befehle laufen im App-Repo-Wurzelverzeichnis, außer wo anders vermerkt.

> **Wichtig — Parallelsitzung:** Während dieser Arbeit lief eine zweite Sitzung
> und hat überlappend committet (u. a. eigene H1-Client-Änderungen in
> `public/account-sessions.js`, dazu `index.html`, `sw.js`, mehrere CSS). Vor dem
> Deploy **einmal den Branch sichten** (`git log --oneline -30`,
> `git diff main...HEAD --stat`), damit du nur das freigibst, was du willst.

---

## 0. Preflight (nichts wird verändert)

```bash
npm run release:preflight
node --test "tests/*.test.mjs" 2>&1 | tail -8
```

Erwartung: `release:preflight` grün; Testsuite **1903/1906**. Die 3 Restfehler
sind bekannt und KEIN Blocker:
- `dateisperren` (3) — die Sicherheitssperre meldet die absichtlich geänderten
  gesperrten Dateien (siehe Schritt 1). Verschwindet nach dem Neu-Einfrieren.
- `rag-regelfragen` (2) — vorbestehend, Korpus-Ranking, unabhängig von diesem Umbau.

---

## 1. Lock-Freigaben (deine schriftliche Bestätigung IST der Freigabe-Mechanismus)

Jeder `--confirm`-Text ist deine Freigabe im Wortlaut. Ohne ihn verweigern die
Skripte den Dienst. Erst NACH der inhaltlichen Prüfung ausführen.

**1a. Security-Lock** — 3 geänderte gesperrte Dateien (`public/auth/auth-page.js`,
`public/account-sessions.js`, `public/chat-bridge.js`):
```bash
node scripts/check-security-lock.mjs --freeze --confirm "DEIN FREIGABE-WORTLAUT"
node scripts/check-security-lock.mjs   # Gegenprobe: muss jetzt grün sein
```

**1b. Favicon-Lock** — zwei NEUE Rechtsseiten (`public/agb.html`,
`public/widerruf.html`) tragen denselben Favicon-Block:
```bash
node scripts/check-favicon-lock.mjs --print-manifest > docs/frontend/favicon-lock-manifest.json
node scripts/check-favicon-lock.mjs    # Gegenprobe: grün
```

**1c. Start-Lock — NUR falls du iOS-Splash in `index.html` aufnimmst** (sonst
überspringen; ich habe `index.html` NICHT angefasst):
```bash
node scripts/check-start-lock.mjs --freeze --confirm "DEIN FREIGABE-WORTLAUT"
```

Danach die neuen Lock-Manifeste mitcommitten:
```bash
git add docs/security/security-lock-manifest.json docs/frontend/favicon-lock-manifest.json
git commit -m "chore(locks): Security- und Favicon-Lock nach Marktreife-Umbau neu eingefroren (Freigabe Betreiber)"
```

---

## 2. Backend / Control-Server deployen

Betrifft die Auth-/Infra-Änderungen: `src/server.js`,
`control-server/src/auth/sessionToken.js`, `…/sessionRegistry.js` (neu),
`control-server/src/routes/emailAuthRoutes.js`, `src/shared/controlAccessPolicy.js`,
`control-server/src/storage/s3Signer.js`.

Über den bewährten Control-Release-Weg (baut aus der Arbeitskopie):
```bash
"./smejj.com Auth-Release.command"
```

> Die neuen Flags bleiben AUS (kein Verhaltenswechsel), bis du sie in Schritt 5
> setzt: `SMEJJ_SHORT_ACCESS_TOKEN` (H1), `SMEJJ_SESSION_REGISTRY` (H2),
> optional `IDRIVE_E2_MAX_RETRIES` (H4, Default 2).

---

## 3. Chat-Bridge neu starten (lädt Code beim Start von raw.githubusercontent)

Nötig für den H3-Crash-Guard in `public/chat-bridge.js`. Erst den Code ins Repo
pushen (Schritt 4 oder vorab), dann die Bridge neu ausrollen:
```bash
# Zeabur-Reserve-Bridge (Token nötig):
CONFIRM_BRIDGE_DEPLOY=YES node scripts/deploy/deploy_chat_bridge_zeabur.mjs
# Salad-Primär-Bridge: Container in der Salad-Konsole neu starten (zieht die
# neue chat-bridge.js beim Hochfahren). /health-Version anschließend prüfen.
```

---

## 4. Frontend (Live-Site smejj.com) deployen

Die Live-Site ist das SEPARATE Repo (`smejj-app-frontend`), das
`smejj.com Deploy.command` befüllt (kopiert `public/*` → `assets/*` bzw. Root,
committet, pusht, verifiziert). **Neu hinzugekommene Dateien** müssen in die
Kopierliste des Deploy-Skripts, sonst gehen sie nicht live:

- **Neue Root-Seiten:** `public/agb.html`, `public/widerruf.html`
- **Neues Modul:** `public/offline-banner.js`
- **Geändert:** `public/account-privacy.js`, `public/onboarding-welcome.js`,
  `public/datenschutz.html`, `public/impressum.html`, `public/settings-runtime.js`,
  `public/settings-surface.js`, `public/auth-gate.js`, `public/i18n/*.js` (14)

Pflichtschritte im Deploy (das Skript erzwingt sie bereits):
1. **`sw.js`-Cache-Version bumpen**, damit Clients die neuen/geänderten Assets
   ziehen. **Vorher Live-Stand prüfen** (eine fremde Sitzung kann die Version
   überholt haben): `curl -fsS https://smejj.com/sw.js | grep -i cache_name`.
2. Secrets-Grep (macht das Skript).
3. Push + Live-Verifikation.

```bash
"./smejj.com Deploy.command"
```

---

## 5. Flags scharfschalten — ERST nach eigenem End-to-End-Test

H1/H2 sind absichtlich hinter Flags. Reihenfolge:

1. **H2 zuerst** (risikoarm, additiv): `SMEJJ_SESSION_REGISTRY=1` in der
   Control-Server-Umgebung setzen → Logout beendet ab jetzt auch Google-/Passkey-/
   Magic-Link-Sitzungen fern. Bestandssitzungen bleiben gültig.
2. **H1 danach**: `SMEJJ_SHORT_ACCESS_TOKEN=1` setzen. **Vorher** cross-origin
   E2E prüfen: Login in Tab A → neuer Tab B ohne Reload mintet still über das
   Cookie; DevTools: `localStorage["smejj.auth.accessToken.v1"]` bleibt leer,
   Bearer-TTL ≤ 10 min. `SameSite=None` erhöht die CSRF-Fläche — vor dem
   Einschalten bestätigen, dass alle mutierenden Routen über die (gehärtete)
   Origin-Allowlist laufen.

---

## 6. Nach dem Deploy verifizieren

```bash
curl -fsS https://smejj.com/agb.html      | grep -q "Allgemeine Geschäftsbedingungen" && echo "AGB live"
curl -fsS https://smejj.com/widerruf.html | grep -q "Widerrufsbelehrung"             && echo "Widerruf live"
curl -fsS https://smejj.com/datenschutz.html | grep -q "Zahlungsabwicklung (Stripe)" && echo "Stripe-DS live"
curl -fsS https://smejj.com/sw.js | grep -i cache_name    # neue Version?
# Bridge-Gesundheit:
curl -fsS https://smejj-chat-bridge.zeabur.app/health
```

---

## 7. Rollback (falls nötig)

- **Flags:** einfach wieder entfernen (`SMEJJ_SHORT_ACCESS_TOKEN`,
  `SMEJJ_SESSION_REGISTRY`, `IDRIVE_E2_MAX_RETRIES`) — Code fällt aufs alte
  Verhalten zurück. Das ist der schnellste, gefahrloseste Rückweg.
- **Code:** die einzelnen Commits sind pfadbegrenzt und per `git revert <hash>`
  isoliert rücknehmbar.
- **Frontend:** `smejj.com Deploy.command`-Repo hat `backups/`/Rollback-Stände.

---

## Offen — nur du kannst das liefern (kein Deploy-Befehl möglich)

- **EU-Vertreter (Art. 27 DSGVO)** + **US-Registerangaben** → `impressum.html` +
  `datenschutz.html §1`.
- **Stripe-Kundenportal-Link** → Konstante `STRIPE_BILLING_PORTAL_URL` in
  `public/account-privacy.js` (für den vollen §312k-Button-Flow).
- **H5 Voice/Browser-Fallback:** zweiten Host provisionieren, dann kleiner
  Aufrufer-Fix (`buildChatTargets`-Muster).
- **iOS App Store:** native Hülle (Capacitor) — die PWA allein reicht nicht.
- **Anwaltliche Prüfung** der Rechtstexte vor Livegang der Zahlungen.
