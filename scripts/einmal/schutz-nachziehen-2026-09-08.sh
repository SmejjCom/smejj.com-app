#!/bin/zsh
# smejj.com — die beiden offenen Schutz-Sperren nachziehen und die Kaskade wieder freigeben.
#
# WARUM: start-lock und admin-lock stehen seit dem 06.09. auf einem alten Stand. Seitdem
# kamen fuenf Aenderungen dazu, die der Betreiber alle selbst live gestempelt hat:
#   public/index.html        Vollbild oben (08.09.)
#   public/app.js            Refactoring 812 -> 742 Zeilen, Modell-Staffel (07.09.)
#   public/config.js         Live-Abgleich (07.09.)
#   public/ai/chatClient.js  Auto-Wahl ueber den Server-Weg (07.09.)
#   public/sw.js             Runde 2, 3, 4 der Mobil-QA (07.09.)
#   control-server/src/admin/opsAutopilotenBereiche.js   drei Zeilen: Autopilot Nr. 85 (08.09.)
# Alle sind live und abgenommen — nur die Sperren wurden nie nachgezogen. Deshalb bricht
# die Stempel-Kaskade seit dem 08.09. bei Schritt 4 ab.
#
# WAS DIESES SKRIPT TUT: die Sperren auf den heutigen Stand einfrieren, danach die
# normale Kaskade (Service-Worker-Sprung, Stempel, Auslieferung) durchlaufen lassen.
# Es loescht nichts und aendert keinen Code.
set -u
cd "$(dirname "$0")/../.." || exit 1
WORTLAUT="Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen. (Betreiber, 2026-09-08)"

echo "1/4  Stand pruefen ..."
node scripts/check-start-lock.mjs 2>&1 | head -8
node scripts/check-admin-lock.mjs 2>&1 | head -4

echo
echo "2/4  Start-Lock auf den heutigen Stand einfrieren ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht eingefroren"; exit 1; }

echo
echo "3/4  Admin-Lock auf den heutigen Stand einfrieren ..."
node scripts/check-admin-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Admin-Lock nicht eingefroren"; exit 1; }

echo
echo "4/4  Gegenprobe ..."
node scripts/check-start-lock.mjs 2>&1 | head -3
node scripts/check-admin-lock.mjs 2>&1 | head -3

echo
echo "Stempel sichern ..."
git add docs/frontend/start-lock-manifest.json docs/security/admin-lock-manifest.json 2>/dev/null
git add -A docs/ 2>/dev/null
git commit -q -m "chore(locks): start-lock und admin-lock auf den Stand vom 2026-09-08 nachgezogen

Fuenf Frontend-Aenderungen und eine Admin-Zeile, alle vom Betreiber live gestempelt,
waren seit dem 06.09. nicht im Manifest. Die Stempel-Kaskade brach dadurch bei Schritt 4 ab.
Betreiber-Freigabe 2026-09-08.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && echo "  Stempel gesichert" || echo "  (nichts zu sichern)"

echo
echo "FERTIG. Die Kaskade laeuft ab jetzt wieder durch."
echo "Naechster Schritt (nicht noetig, nur wenn du willst):"
echo "  SMEJJ_APP_ORDNER=\"\$PWD\" zsh scripts/einmal/sw-sprung-2026-09-07.sh"
