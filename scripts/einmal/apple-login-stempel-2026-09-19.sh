#!/bin/zsh
# Apple-Login: Sperren stempeln und EINEN Commit anlegen (nur die eigenen Dateien).
# Aufruf: Doppelklick auf "smejj.com Apple-Login stempeln.command" im App-Ordner.
# Kein Deploy — der Code ist ohne die vier SMEJJ_APPLE_LOGIN_*-Variablen wirkungslos.
set -e
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
cd "$REPO"

WORT='Betreiber 19.09.2026 im Chat: "Kannst du Apple Login einrichten? Und User sollen mit Apple Login einloggen koennen." Ergaenzt wurde nur "Mit Apple anmelden": neue Dateien src/auth/appleAuth.js und appleAuthRoutes.js, in controlAccessPolicy.js zwei Apple-Routen plus Origin appleid.apple.com nur fuer die Rueckkehr-Adresse, in auth-page.js der Apple-Knopf statt des Platzhalters, in config.js die Route authApple, in login/register nur die Cache-Marke. Keine Aenderung an CSP oder an der Logik von E-Mail, Passkey, Google, GitHub.'

echo "== 1/4 Tests vor dem Stempel"
node --test tests/apple-auth.test.mjs tests/github-auth-routes.test.mjs tests/control-access-policy.test.mjs tests/auth-pages.test.mjs tests/i18n-ui.test.mjs

echo "== 2/4 Sperren stempeln"
node scripts/check-security-lock.mjs --freeze --confirm "$WORT"
node scripts/check-start-lock.mjs --freeze --confirm "$WORT"

echo "== 3/4 Pruefung nach dem Stempel"
node scripts/check-security-lock.mjs
node scripts/check-start-lock.mjs
node scripts/check-auslieferung-lock.mjs
node --test tests/dateisperren.test.mjs tests/module-queries.test.mjs

echo "== 4/4 Commit (nur Apple-Dateien)"
git add src/auth/appleAuth.js src/auth/appleAuthRoutes.js src/auth/anbieterKonto.js src/auth/extraAuthRoutes.js \
  src/server.js src/shared/controlAccessPolicy.js src/shared/platform.js \
  public/auth/auth-page.js public/auth/login/index.html public/auth/register/index.html public/config.js \
  public/assets/auth/auth-page.js public/assets/auth/index.html public/assets/config.js \
  public/i18n/ar.js public/i18n/bn.js public/i18n/en.js public/i18n/es.js public/i18n/fr.js public/i18n/hi.js \
  public/i18n/id.js public/i18n/it.js public/i18n/ja.js public/i18n/ko.js public/i18n/pt.js public/i18n/ru.js \
  public/i18n/tr.js public/i18n/zh.js \
  tests/apple-auth.test.mjs tests/auth-pages.test.mjs \
  docs/auth/APPLE_LOGIN_EINRICHTUNG_2026-09-19.md docs/security/security-lock-manifest.json docs/frontend/start-lock-manifest.json \
  scripts/einmal/apple-login-stempel-2026-09-19.sh
git commit -q -m "feat(auth): Mit Apple anmelden (Web-Ablauf, form_post) — Server, Knopf, Tests; wirkt erst mit SMEJJ_APPLE_LOGIN_*

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git log -1 --stat | tail -30
echo; echo "Fertig. Fenster kann geschlossen werden."
