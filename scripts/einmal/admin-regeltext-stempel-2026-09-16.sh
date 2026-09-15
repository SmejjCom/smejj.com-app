#!/bin/zsh
# smejj.com — Admin-Regeltext 4/5 anpassen, Admin-Lock stempeln, ausliefern (16.09.2026).
#
# Start per Doppelklick: "smejj.com Admin-Regeltext stempeln und ausliefern.command".
# Der Auto-Modus der Sitzung darf den Admin-Lock nicht selbst stempeln — deshalb
# dieser Weg, gestartet vom Betreiber.
#
# Was passiert:
#   1. frische Arbeitskopie des Bauzweigs (eigener Ordner, nichts Lokales wird angefasst)
#   2. Regel 4 nennt die abgeleitete Commit-Kennung (ZEABUR_GIT_COMMIT_SHA fehlt seit 15.09.),
#      Regel 5 nennt die Schutz-Echtheit (Nr. 82) — nur Text in views-stage12.js
#   3. Tests der Admin-Ansichten + Sperr-Checks, dann Admin-Lock-Stempel mit Betreiber-Wortlaut
#   4. Push Bauzweig, Spiegel in den Frontend-Klon, Push Frontend (smejj.com/admin)
#
# TROCKEN=1 zsh <skript>  -> alles bis vor den Stempel, nichts wird gepusht.
set -u

ZWEIG="feature/auth-redesign-github-magiclink"
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
FRONTEND="$HOME/smejj-app-frontend"
WT="/tmp/smejj-admin-regeltext-$$"
TROCKEN="${TROCKEN:-0}"

[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
for K in /opt/homebrew/bin /usr/local/bin "$HOME/.volta/bin"; do [ -d "$K" ] && PATH="$K:$PATH"; done
if [ -d "$HOME/.nvm/versions/node" ]; then
  N=$(ls -1 "$HOME/.nvm/versions/node" | sort -V | tail -1); [ -n "$N" ] && PATH="$HOME/.nvm/versions/node/$N/bin:$PATH"
fi
export PATH

abbruch() { echo; echo "ABBRUCH: $1"; git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1; exit 1; }
schritt() { echo; echo "== $1"; }

command -v node >/dev/null || abbruch "node nicht gefunden"

schritt "1/6 Arbeitskopie des Bauzweigs"
git -C "$REPO" fetch -q origin "$ZWEIG" || abbruch "fetch fehlgeschlagen"
git -C "$REPO" worktree add -q --detach "$WT" "origin/$ZWEIG" || abbruch "Arbeitskopie nicht anlegbar"
cd "$WT" || abbruch "Arbeitskopie fehlt"
ln -s "$REPO/node_modules" node_modules 2>/dev/null
git log --oneline -1

schritt "2/6 Regeltext 4 und 5"
node - <<'JS' || abbruch "Text nicht ersetzbar (Datei hat sich geaendert?)"
const fs = require("fs");
const p = "control-server/admin-ui/views-stage12.js";
let s = fs.readFileSync(p, "utf8");
const ersetze = (alt, neu) => { if (!s.includes(alt)) throw new Error("fehlt: " + alt.slice(0, 60)); s = s.replace(alt, neu); };
ersetze("— der Control-Server kennt seinen Commit aus ZEABUR_GIT_COMMIT_SHA.\",",
  "— der Control-Server kennt seinen Commit aus ZEABUR_GIT_COMMIT_SHA; setzt Zeabur ihn nicht (seit 15.09.2026), leitet die Bau-Wache (Nr. 76) ihn aus dem erfolgreichen Check-Run am Prozessstart ab und sagt das dazu.\",");
ersetze("Die Brücke steht mit Bündel-Version gegen Repo-Version auf der Auslieferungsseite. Ein Screenshot-Vergleich fehlt noch — das steht dort auch.\",",
  "Die Brücke steht mit Bündel-Version gegen Repo-Version auf der Auslieferungsseite. Die Schutz-Echtheit (Nr. 82) vergleicht alle 30 Minuten die ausgelieferten Dateien per Prüfsumme mit ihren Freigabe-Manifesten. Ein Screenshot-Vergleich fehlt noch — das steht dort auch.\",");
fs.writeFileSync(p, s);
JS
cp control-server/admin-ui/views-stage12.js public/admin/views-stage12.js
node --check control-server/admin-ui/views-stage12.js || abbruch "Syntaxfehler"
git diff --stat

schritt "3/6 Tests und Sperren"
node --test control-server/admin-ui/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
node --test control-server/admin-ui/*.test.js >/dev/null 2>&1 || abbruch "Admin-Ansichts-Tests rot"
for C in check-guidelines check-security-lock check-start-lock check-autopilot-nummern; do
  node "scripts/$C.mjs" >/dev/null 2>&1 || abbruch "$C rot"
  echo "$C OK"
done
node scripts/check-admin-lock.mjs 2>&1 | head -3

if [ "$TROCKEN" = "1" ]; then
  echo; echo "TROCKENLAUF: bis hierher alles gut — kein Stempel, kein Push."
  cd /tmp && git -C "$REPO" worktree remove --force "$WT"
  exit 0
fi

schritt "4/6 Admin-Lock stempeln"
node scripts/check-admin-lock.mjs --freeze --confirm 'Betreiber, 16.09.2026, im Chat: "Ich gebe dir alle rechte von a bis z erledige, alles." (Regeln, Tagesmappe, Control Center, Autopiloten) und "Gib mir den Stempel als .command zum Doppelklicken", per Doppelklick ausgefuehrt. Geaendert: nur der Regeltext 4 (abgeleitete Commit-Kennung der Bau-Wache) und 5 (Schutz-Echtheit Nr. 82) in views-stage12.js. Unveraendert: Adminzugang, Rollen- und Rechtepruefung, Step-up, Vortuer, schreibende Adminaktionen, Vier-Augen-Prinzip, Audit-Nachweis, Impersonation.' \
  || abbruch "Stempel fehlgeschlagen"
node scripts/check-admin-lock.mjs || abbruch "Admin-Lock nach dem Stempel nicht gruen"

schritt "5/6 Push Bauzweig"
git add control-server/admin-ui/views-stage12.js public/admin/views-stage12.js docs/security/admin-lock-manifest.json
git status --short
git commit -q -m "fix(admin): Regeln 4/5 nennen abgeleitete Commit-Kennung und Schutz-Echtheit + Admin-Lock-Stempel

Betreiber 16.09.2026: \"Ich gebe dir alle rechte von a bis z erledige, alles.\"
und \"Gib mir den Stempel als .command zum Doppelklicken\" (per Doppelklick).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || abbruch "Commit fehlgeschlagen"
git push -q origin "HEAD:$ZWEIG" || abbruch "Push Bauzweig fehlgeschlagen (Parallelsitzung? erneut doppelklicken)"
BAU=$(git rev-parse --short HEAD)
echo "Bauzweig: $BAU"

schritt "6/6 Frontend (smejj.com/admin)"
git -C "$FRONTEND" pull -q --rebase origin main || abbruch "Frontend-Klon nicht aktualisierbar"
node scripts/deploy/sync_admin_console_pages.mjs "$FRONTEND" >/dev/null || abbruch "Spiegel fehlgeschlagen"
git -C "$FRONTEND" add admin
git -C "$FRONTEND" commit -q -m "admin: Regeln 4/5 aktualisiert (Bauzweig $BAU)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || echo "(Frontend: nichts zu committen)"
git -C "$FRONTEND" push -q origin main || abbruch "Push Frontend fehlgeschlagen"
FRONT=$(git -C "$FRONTEND" rev-parse --short HEAD)
if ! git diff --quiet docs/frontend/admin-console-sync.json 2>/dev/null; then
  git commit -q -m "chore(spiegel): Admin-Konsole-Sync-Nachweis nach Frontend $FRONT

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" docs/frontend/admin-console-sync.json && git push -q origin "HEAD:$ZWEIG"
fi
node scripts/check-admin-lock.mjs | tail -1
BAU=$(git rev-parse --short HEAD)

cd /tmp && git -C "$REPO" worktree remove --force "$WT"
echo
echo "FERTIG — Bauzweig $BAU, Frontend $FRONT. In ca. 1 Minute live auf https://smejj.com/admin/regeln/"
