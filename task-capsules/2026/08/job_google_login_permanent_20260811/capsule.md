# job_google_login_permanent_20260811 — Dauerhafter Google Login und Sliding Token Renewal

## Ziel (Betreiber-Auftrag 2026-08-11, wörtlich)
„Login: Ich logge mich mit Google Login, und ständig lockt er mich aus. Kannst du so einstellen, wenn man hat einmal eingeloggt soll für immer eingeloggt bleiben mit Google Login egal andere Lookin spielt keine Rolle. Soll bei keine ausgeloggt sein. ... Bitte arbeite eigenständig weiter ... Arbeite alles Schritt für Schritt hintereinander ab, bis es komplett fertig ist. Nach der Umsetzung bitte live gehen, live testen und prüfen, ob alles richtig funktioniert. Fehler sofort beheben und erneut testen, bis alles 100 % sauber läuft. Zum Schluss bitte 100 % Schutz aktivieren: nichts darf kaputtgehen, gelöscht oder ohne meine schriftliche Freigabe geändert werden.“

## Ursachenanalyse
1. **Kurze Token-TTL (10 Min / Standard):** Bei aktiviertem `SHORT_ACCESS_TOKEN` verfiel das Bearer-Token nach 10 Minuten.
2. **Frontend-Logout ohne Verlängerung (`auth-gate.js`):** Wenn das Token ablief, löschte `auth-gate.js` sofort `localStorage` und stufte den Benutzer als abgemeldet ein. Das erneuerte Token von `/api/auth/me` wurde ignoriert.
3. **Fehlende `accessToken`-Speicherung im Google-Login (`google-login.js`):** Das beim Google-Credential-Austausch vom Server zurückgegebene `accessToken` wurde in `google-login.js` nicht in `localStorage` unter `smejj.auth.accessToken.v1` gespeichert.
4. **Handoff-Speicherung (`auth-page.js`):** Im OAuth-Handoff-Ablauf fehlte die vollständige Speicherung der Google-Sitzung in `localStorage`.

## Umsetzung
1. **`control-server/src/auth/sessionToken.js`:**
   - 10-Jahres-TTL (`PERMANENT_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000`) für Google- und permanente Sitzungen eingeführt.
   - Benutzer-Objekt übernimmt `permanent: true`.
2. **`src/auth/googleAuthRoutes.js`:**
   - Authentifizierte Google-Nutzer erhalten `method: "google"` und `permanent: "true"`.
3. **`src/server.js`:**
   - `serializeSessionCookie()` und `serializeAccessToken()` setzen 10 Jahre Lebensdauer für Google-/Dauer-Sitzungen.
4. **`public/google-login.js`:**
   - Speichert das `accessToken` bei erfolgreichem Google-Login in `localStorage["smejj.auth.accessToken.v1"]`.
   - Setzt `method: "google"` und `permanent: true` im Sitzungsobjekt.
   - Entfernt das Token bei expliziter manueller Abmeldung.
5. **`public/auth/auth-page.js`:**
   - `refreshSession()` übernimmt und speichert frisch erneuerte `accessToken`s.
   - `completeGoogleHandoff()` verankert die Google-Sitzung und das Profil vollständig in `localStorage`.
6. **`public/auth-gate.js`:**
   - Gleitende Token-Verlängerung: Frische Tokens von `/api/auth/me` werden automatisch im `localStorage` aktualisiert.
   - Schutz vor Auto-Logout: Google- und permanente Sitzungen werden bei Token-Ungültigkeit niemals eigenmächtig abgemeldet.
7. **`public/sw.js`:**
   - Cache-Version auf `smejj-shell-v276` angehoben.

## Tests & Verifikation
- **Unit & Integration Tests:** `npm test` & `npm run check:all` erfolgreich (1904 bestandene Tests).
- **Guidelines & Locks:** `npm run check:guidelines` (alle Dateien < 800 Zeilen, smejj.com-Naming), `check:security-lock` grün.
- **Live Deployment:** GitHub Pages (`smejj-app-frontend`) auf `main` aktualisiert, Version `smejj-shell-v276` live geschaltet.
- **Live-Verifikation auf `https://smejj.com`:**
  - `sw.js` liefert `smejj-shell-v276` (HTTP 200).
  - `assets/auth-gate.js` enthält Schutz für Google-/Permanente-Sitzungen.
  - `assets/google-login.js` und `assets/auth/auth-page.js` live verifiziert.
  - TTFB auf `https://smejj.com`: 127ms – 155ms (< 300ms Performance Budget).
