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

echo "1/8 Stand holen ..."
git fetch -q origin "$ZWEIG" || exit 3

echo "2/8 Frischen Arbeitsbaum anlegen (fremde Arbeit bleibt unberuehrt) ..."
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || exit 4
# Die Tests brauchen die Abhaengigkeiten; ein frischer Baum hat keine.
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 4
echo "    $(git log --oneline -1)"

aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }

# Bei einem Abbruch wird der Arbeitsbaum NICHT abgeraeumt (Befund 04.09. abends):
# Als die Kaskade FERTIG meldete, ohne etwas zu hinterlassen, war der einzige
# Ort, an dem man haette nachsehen koennen, schon geloescht. Ein Fehler, den man
# nicht mehr ansehen kann, kostet eine ganze Runde.
behalten() {
  echo "         Der Arbeitsbaum bleibt zum Nachsehen stehen:"
  echo "           $BAUM"
  echo "         Aufraeumen spaeter mit:  git -C \"$QUELLE\" worktree remove --force \"$BAUM\""
  exit "$1"
}

echo "3/8 Tests der betroffenen Bereiche ..."
if ! node --test tests/tool-loop.test.mjs tests/chat-schritte.test.mjs tests/runde2-waechter.test.mjs \
      tests/besucher-puls.test.mjs tests/konto-formulare.test.mjs tests/rechtslinks.test.mjs \
      tests/smejj-1-1-datensatz.test.mjs tests/trainings-reife.test.mjs tests/modell-evolution.test.mjs; then
  echo "ABBRUCH: Tests rot — nicht gestempelt"; behalten 5
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
echo "4/8 Phantom-Probe: stimmt der Baum mit smejj.com ueberein? ..."
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
  behalten 6
fi
echo "    alle geprueften Dateien sind byte-gleich mit smejj.com"

echo "5/8 Sperren stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht gestempelt"; behalten 10; }
node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Security-Lock nicht gestempelt"; behalten 10; }

echo "6/8 Alle vier Sperren pruefen ..."
for pruefung in start security admin favicon; do
  node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; behalten 7; }
done

echo "7/8 Manifeste committen und hochladen ..."
GEAENDERT="$(git status --short docs/security docs/frontend docs/approvals | awk '{print $2}')"
if [ -z "$GEAENDERT" ]; then
  # KEIN stiller Durchmarsch mehr (Befund 2026-09-04 abends): Hier stand
  # frueher nur ein Hinweis, und danach lief das Skript bis zur Erfolgszeile
  # "FERTIG — alle vier Sperren gruen und eingefroren" durch. Der Betreiber
  # hat geklickt, FERTIG gelesen — und der Schutz war NICHT in Kraft: das
  # start-lock-Manifest stand unveraendert auf 11:47:51 und bewachte vier
  # Fassungen, die smejj.com gar nicht ausliefert (composer-plus-menu.js,
  # index.html, app.js, sw.js). Ein Nichts-Tun sah aus wie ein Erfolg.
  #
  # Wenn hier nichts zu committen ist, ist das entweder harmlos (war wirklich
  # schon gestempelt) oder der Beweis, dass Schritt 5 nichts geschrieben hat.
  # Schritt 8 unterscheidet das — gegen origin, nicht gegen diese Ausgabe.
  echo "    kein Manifest geaendert — pruefe in Schritt 8, ob der Stand schon steht"
else
  git add $GEAENDERT || { behalten 8; }
  git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
    -m "chore(schutz): Start- und Security-Lock nach dem A-bis-Z-Livetest gestempelt (Betreiber-Doppelklick 2026-09-04)" \
    -m "sw.js v755, index.html mit preconnect, composer-plus-menu.js auf den ausgelieferten Stand, controlAccessPolicy.js mit /api/puls." \
    -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || { behalten 8; }
  if ! git push -q origin "HEAD:$ZWEIG"; then
    echo "Push abgelehnt (der Zweig hat sich bewegt) — bitte Claude Code Bescheid geben."
    behalten 9
  fi
fi

echo
git log --oneline -2

# ---------------------------------------------------------------------------
echo
echo "8/8 Gegenprobe gegen origin: steht der Stempel WIRKLICH im Zweig? ..."
#
# Die entscheidende Frage, und die einzige, die heute niemand gestellt hat:
# nicht "hat das Skript FERTIG gesagt", sondern "haelt das Manifest AUF DEM
# SERVER genau das fest, was smejj.com ausliefert?". Alles davor kann in einem
# Arbeitsbaum passieren, der gleich danach abgeraeumt wird — und dann ist der
# Stempel weg, ohne dass es jemand merkt.
git fetch -q origin "$ZWEIG" || { echo "ABBRUCH: konnte den Zweig nicht nachlesen"; exit 11; }
FEHLER=0
for MANIFEST in docs/frontend/start-lock-manifest.json docs/security/security-lock-manifest.json; do
  HIER="$(shasum -a 256 < "$MANIFEST" | cut -d' ' -f1)"
  DORT="$(git show "origin/$ZWEIG:$MANIFEST" 2>/dev/null | shasum -a 256 | cut -d' ' -f1)"
  if [ "$HIER" != "$DORT" ]; then
    echo "    NICHT ANGEKOMMEN: $MANIFEST steht im Zweig anders als hier"
    FEHLER=$((FEHLER + 1))
  else
    echo "    ok: $MANIFEST"
  fi
done
if [ "$FEHLER" -gt 0 ]; then
  echo
  echo "ABBRUCH: Der Stempel ist NICHT im Zweig gelandet. Der Schutz ist damit"
  echo "         nicht in Kraft, egal was oben stand."
  echo "         Der Arbeitsbaum bleibt zum Nachsehen stehen:"
  echo "           $BAUM"
  echo "         Bitte diese Ausgabe in den Chat kopieren."
  exit 12
fi

aufraeumen
echo
echo "FERTIG — alle vier Sperren gruen, eingefroren UND im Zweig nachgewiesen."
exit 0
