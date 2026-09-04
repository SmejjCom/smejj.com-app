#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-04, abends):
# "100 % Schutz aktivieren" nach dem A-bis-Z-Livetest.
#
# Zu stempeln sind zwei Sperren:
#   start-lock     public/sw.js                 Cache-Nummer v752 -> v755
#                  public/index.html            preconnect auf api.smejj.com
#                                               (5 Zeilen; erster API-Ruf startet
#                                               dadurch bei 436 statt 2130 ms)
#                  public/composer-plus-menu.js NICHT von dieser Sitzung geaendert:
#                                               Repo und Auslieferung sind identisch
#                                               (5f3a314d), das Manifest vom 04.09.
#                                               11:48 UTC haelt eine Fassung fest,
#                                               die es nirgends gibt. Beim Stempeln
#                                               lag eine nicht eingecheckte Datei in
#                                               der Arbeitskopie (Hausregel:
#                                               "Lock-Manifest wird mitgeaendert").
#   security-lock  src/shared/controlAccessPolicy.js
#                                               /api/puls oeffentlich (Autopilot
#                                               Nr. 81, Besucher-Puls)
#
# WICHTIG, Lehre aus genau diesem Befund: Gestempelt wird aus einem FRISCHEN,
# eigenen Arbeitsbaum vom Stand des Zweiges — nie aus einer Arbeitskopie, in der
# noch etwas Ungespeichertes liegen koennte. Sonst friert der Stempel Dateien
# ein, die niemand nachvollziehen kann.
#
# Der Auto-Modus einer Sitzung darf nicht stempeln (Betreiber-Regel 03.09.) —
# deshalb dieser Klick.
set -u

ZWEIG="feature/auth-redesign-github-magiclink"
QUELLE="/private/tmp/claude-501/bau-zweig"
BAUM="/private/tmp/claude-501/stempel-$(date +%Y%m%d-%H%M%S)"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-04: 'Danach alles 100% schuetzen: Bestehende Funktionen duerfen nicht kaputtgehen und nichts darf ohne meine schriftliche Bestaetigung geaendert werden.' — Stempel nach dem A-bis-Z-Livetest: sw.js v755 (gelesene Seite zaehlt als Fund, Knopfbreite, toter Aktionsknopf entfernt), index.html mit preconnect auf api.smejj.com, composer-plus-menu.js auf den ausgelieferten Stand, controlAccessPolicy.js mit /api/puls (Autopilot Nr. 81)"

[ -e "$QUELLE/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $QUELLE"; exit 2; }
cd "$QUELLE" || exit 2

echo "1/6 Stand holen ..."
git fetch -q origin "$ZWEIG" || exit 3

echo "2/6 Frischen Arbeitsbaum anlegen (fremde Arbeit bleibt unberuehrt) ..."
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || exit 4
# Die Tests brauchen die Abhaengigkeiten; ein frischer Baum hat keine.
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 4
echo "    $(git log --oneline -1)"

aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }

echo "3/6 Tests der betroffenen Bereiche ..."
if ! node --test tests/tool-loop.test.mjs tests/chat-schritte.test.mjs tests/runde2-waechter.test.mjs \
      tests/besucher-puls.test.mjs tests/konto-formulare.test.mjs tests/rechtslinks.test.mjs \
      tests/smejj-1-1-datensatz.test.mjs tests/trainings-reife.test.mjs tests/modell-evolution.test.mjs; then
  echo "ABBRUCH: Tests rot — nicht gestempelt"; aufraeumen; exit 5
fi

# PHANTOM-PROBE (Befund 2026-09-04, zweimal am selben Tag): Ein Stempel friert
# ein, was im Baum LIEGT — nicht, was smejj.com AUSLIEFERT. Beides lief heute
# zweimal auseinander: erst composer-plus-menu.js (eine Fassung, die es
# nirgends gab), dann app.js, premium-surfaces.js und die Marke in index.html.
# Live ist die VEREINIGUNG beider Zweige; kein Zweig allein entspricht ihr.
#
# Darum wird vor dem Stempeln jede geschuetzte Datei gegen die Auslieferung
# gehalten. Eine Abweichung heisst: der Stempel wuerde eine Fassung einfrieren,
# die niemand bekommt — und check:start-lock meldet danach den Unterschied als
# Verstoss, obwohl live und Repo beide in Ordnung sind.
echo "4/7 Phantom-Probe: stimmt der Baum mit smejj.com ueberein? ..."
PHANTOME=0
for DATEI in $(node -e '
const m = JSON.parse(require("fs").readFileSync("docs/frontend/start-lock-manifest.json", "utf8"));
const liste = m.dateien || m.files || m;
for (const p of Object.keys(liste)) if (p.startsWith("public/") && !p.includes("/assets/")) console.log(p);
' 2>/dev/null); do
  [ -f "$DATEI" ] || continue
  ADRESSE="https://smejj.com/${DATEI#public/}"
  HIER="$(shasum -a 256 < "$DATEI" | awk '{print $1}')"
  DORT="$(curl -sf --max-time 20 "$ADRESSE" | shasum -a 256 | awk '{print $1}')"
  if [ -z "$DORT" ]; then
    echo "    ? $DATEI — nicht abrufbar, uebersprungen"
  elif [ "$HIER" != "$DORT" ]; then
    echo "    PHANTOM: $DATEI weicht von $ADRESSE ab"
    PHANTOME=$((PHANTOME + 1))
  fi
done
if [ "$PHANTOME" -gt 0 ]; then
  echo "ABBRUCH: $PHANTOME Datei(en) im Baum weichen von der Auslieferung ab."
  echo "         Ein Stempel wuerde Fassungen einfrieren, die niemand bekommt."
  echo "         Bitte diese Ausgabe in den Chat kopieren."
  aufraeumen; exit 6
fi
echo "    alle geprueften Dateien sind byte-gleich mit smejj.com"

echo "5/7 Sperren stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht gestempelt"; aufraeumen; exit 10; }
node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Security-Lock nicht gestempelt"; aufraeumen; exit 10; }

echo "6/7 Alle vier Sperren pruefen ..."
for pruefung in start security admin favicon; do
  node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; aufraeumen; exit 7; }
done

echo "7/7 Manifeste committen und hochladen ..."
GEAENDERT="$(git status --short docs/security docs/frontend docs/approvals | awk '{print $2}')"
if [ -z "$GEAENDERT" ]; then
  echo "Hinweis: kein Manifest geaendert — war schon gestempelt."
else
  git add $GEAENDERT || { aufraeumen; exit 8; }
  git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
    -m "chore(schutz): Start- und Security-Lock nach dem A-bis-Z-Livetest gestempelt (Betreiber-Doppelklick 2026-09-04)" \
    -m "sw.js v755, index.html mit preconnect, composer-plus-menu.js auf den ausgelieferten Stand, controlAccessPolicy.js mit /api/puls." \
    -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || { aufraeumen; exit 8; }
  if ! git push -q origin "HEAD:$ZWEIG"; then
    echo "Push abgelehnt (der Zweig hat sich bewegt) — bitte Claude Code Bescheid geben."
    aufraeumen; exit 9
  fi
fi

echo
git log --oneline -2
aufraeumen
echo
echo "FERTIG — alle vier Sperren gruen und eingefroren."
exit 0
