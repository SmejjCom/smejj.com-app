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

# Der Baum wird NUR im Erfolgsfall abgeraeumt. Befund 2026-09-04: eine Kaskade
# meldete FERTIG, ohne gestempelt zu haben — und hatte ihren eigenen Baum schon
# geloescht, bevor jemand nachsehen konnte, was darin lag. Ein Fehlerfall ohne
# Beweisstueck ist nicht nachvollziehbar.
aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }
behalten() { echo "    Der Arbeitsbaum bleibt zum Nachsehen stehen: $BAUM"; }

echo "3/6 Tests der betroffenen Bereiche ..."
if ! node --test tests/tool-loop.test.mjs tests/chat-schritte.test.mjs tests/runde2-waechter.test.mjs \
      tests/besucher-puls.test.mjs tests/konto-formulare.test.mjs tests/rechtslinks.test.mjs \
      tests/smejj-1-1-datensatz.test.mjs tests/trainings-reife.test.mjs tests/modell-evolution.test.mjs; then
  echo "ABBRUCH: Tests rot — nicht gestempelt"; behalten; exit 5
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
  behalten; exit 6
fi
echo "    alle geprueften Dateien sind byte-gleich mit smejj.com"

echo "5/7 Sperren stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht gestempelt"; behalten; exit 10; }
node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Security-Lock nicht gestempelt"; behalten; exit 10; }

echo "6/7 Alle vier Sperren pruefen ..."
for pruefung in start security admin favicon; do
  node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; behalten; exit 7; }
done

echo "7/7 Manifeste committen und hochladen ..."
GEAENDERT="$(git status --short docs/security docs/frontend docs/approvals | awk '{print $2}')"
if [ -z "$GEAENDERT" ]; then
  # BEFUND 2026-09-04: Genau hier fiel die Kaskade durch zu "FERTIG — alle vier
  # Sperren gruen und eingefroren", obwohl NICHTS gestempelt wurde. Der
  # Betreiber sah eine Erfolgsmeldung, im Zweig stand kein Stempel-Commit, und
  # vier Eintraege im Manifest waren Fassungen, die niemand ausliefert.
  #
  # Ein Nichts-Tun darf nicht aussehen wie ein Erfolg. Unveraenderte Manifeste
  # koennen zweierlei heissen: schon gestempelt (in Ordnung) oder der Stempel
  # hat nicht gegriffen (nicht in Ordnung). Unterscheidbar ist das nur an einem:
  # steht das eingefrorene Datum im Zweig, oder nicht?
  echo "Kein Manifest geaendert — pruefe, ob der Stand schon im Zweig steht ..."
  LIES='let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const d=JSON.parse(s);console.log(d.frozenAt||d.eingefroren||"")}catch{console.log("")}})'
  HIER="$(node -e "$LIES" < docs/frontend/start-lock-manifest.json 2>/dev/null)"
  DORT="$(git show "origin/$ZWEIG:docs/frontend/start-lock-manifest.json" 2>/dev/null | node -e "$LIES")"
  if [ -n "$HIER" ] && [ "$HIER" = "$DORT" ]; then
    echo "    In Ordnung: der Zweig traegt denselben Stempel ($HIER)."
  else
    echo "ABBRUCH: Der Stempel ist NICHT im Zweig angekommen."
    echo "         hier:  ${HIER:-unbekannt}"
    echo "         Zweig: ${DORT:-unbekannt}"
    echo "         Bitte diese Ausgabe in den Chat kopieren."
    behalten; exit 11
  fi
else
  git add $GEAENDERT || { behalten; exit 8; }
  git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
    -m "chore(schutz): Start- und Security-Lock nach dem A-bis-Z-Livetest gestempelt (Betreiber-Doppelklick 2026-09-04)" \
    -m "sw.js v755, index.html mit preconnect, composer-plus-menu.js auf den ausgelieferten Stand, controlAccessPolicy.js mit /api/puls." \
    -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || { behalten; exit 8; }
  if ! git push -q origin "HEAD:$ZWEIG"; then
    echo "Push abgelehnt (der Zweig hat sich bewegt) — bitte Claude Code Bescheid geben."
    behalten; exit 9
  fi
  # Erst wenn der Stempel WIRKLICH im Zweig steht, ist er gueltig. Ein Fenster,
  # das FERTIG sagt, ist kein Beweis (Befund 2026-09-04).
  git fetch -q origin "$ZWEIG"
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$ZWEIG")" ]; then
    echo "ABBRUCH: Der Stempel-Commit steht nicht als Spitze im Zweig."
    behalten; exit 12
  fi
  echo "    Nachgeprueft: der Stempel steht im Zweig."
fi

echo
git log --oneline -2
aufraeumen
echo
echo "FERTIG — alle vier Sperren gruen und eingefroren."
exit 0
