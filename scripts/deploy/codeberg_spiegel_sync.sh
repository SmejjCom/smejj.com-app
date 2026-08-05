#!/usr/bin/env bash
# Git-Spiegelung nach codeberg.org (kostenlos, nur Spiegel, nie Deploy-Pfad).
#
# Warum ein Skript und kein Codeberg-Pull-Spiegel:
# Codeberg bietet im Migrations-Dialog keine Spiegel-Option an (kein
# automatischer Abgleich alle 8 h). Der Abgleich muss daher von hier
# angestossen werden.
#
# PROTOKOLL: SSH ist Standard, HTTPS ist der Ausweg (Messung 2026-08-05).
# Der SSH-Schluessel ist bei Codeberg registriert und funktioniert; dieser Weg
# braucht KEINE weiteren Zugangsdaten.
#
# Am 2026-08-05 war ausgehendes SSH (Port 22) zeitweise gesperrt — bei
# codeberg.org ("No route to host") UND github.com ("Operation timed out").
# Wenige Stunden spaeter war der Port wieder offen und die Anmeldung lief
# ("Hi there, smejj!"). Die Sperre war also VORUEBERGEHEND; wer sie einmal
# misst, darf daraus keinen Dauerzustand schliessen.
#
# Fuer GitHub gaebe es dabei den Ausweg `-p 443 -o HostName=ssh.github.com`;
# fuer Codeberg gibt es den NICHT: codeberg.org:443 spricht HTTPS statt SSH
# ("Connection closed by 217.197.84.140 port 443") und ssh.codeberg.org loest
# nicht auf (NXDOMAIN). Der einzige Ausweg bei gesperrtem Port 22 ist deshalb
# HTTPS:  CODEBERG_PROTOKOLL=https bash scripts/deploy/…
#
# HTTPS braucht aber einen Token, und der ist NICHT hinterlegt. Einmalig durch
# den Betreiber (eine Session darf das nicht):
#   1. Auf codeberg.org einen Zugriffs-Token mit Schreibrecht auf Repositories
#      anlegen (Einstellungen -> Anwendungen -> Zugriffs-Token).
#   2. Einmal interaktiv anmelden, damit der osxkeychain den Token speichert:
#        git ls-remote https://codeberg.org/smejj/smejj.com-app.git
#      Benutzername: smejj    Passwort: der Token (NICHT das Konto-Passwort).
#   Solange das nicht geschehen ist, ist HTTPS kein nutzbarer Rueckfall.
#
# Nutzung:
#   bash scripts/deploy/codeberg_spiegel_sync.sh            # alles
#   bash scripts/deploy/codeberg_spiegel_sync.sh lokal      # nur dieses Repo
#   bash scripts/deploy/codeberg_spiegel_sync.sh github     # nur die GitHub-Repos

set -euo pipefail

SSH_KEY="${HOME}/.ssh/codeberg_smejj_ed25519"
CODEBERG_USER="smejj"
CACHE_DIR="${HOME}/.cache/smejj-codeberg-spiegel"
LOKALES_REPO="smejj.com-app"
CODEBERG_PROTOKOLL="${CODEBERG_PROTOKOLL:-ssh}"

# Repos, die nur auf GitHub liegen und ueber einen Zwischen-Klon gespiegelt werden.
GITHUB_REPOS=(
  "smejj-app-frontend"
  "smejj-control"
  "smejj-site"
  "imild-site"
)

# Kein interaktiver Prompt: fehlt der Zugang, soll das Skript SOFORT mit einer
# lesbaren Meldung abbrechen statt unbeaufsichtigt an einer Passwortfrage zu
# haengen. Die Pruefung unten faengt genau diesen Fall ab.
export GIT_TERMINAL_PROMPT=0

# Protokoll HIER pruefen, nicht in codeberg_url(): die Funktion laeuft in einer
# Kommandosubstitution, und ein 'exit' beendet dort nur die Subshell. Das Skript
# liefe weiter und meldete stattdessen einen "fehlenden Zugang" — eine falsche
# Spur. (Beim Bau genau so passiert.)
case "${CODEBERG_PROTOKOLL}" in
  https|ssh) ;;
  *)
    echo "FEHLER: CODEBERG_PROTOKOLL muss 'https' oder 'ssh' sein, ist '${CODEBERG_PROTOKOLL}'." >&2
    exit 1
    ;;
esac

codeberg_url() {
  local name="$1"
  if [ "${CODEBERG_PROTOKOLL}" = "https" ]; then
    printf 'https://codeberg.org/%s/%s.git' "${CODEBERG_USER}" "${name}"
  else
    printf 'ssh://git@codeberg.org/%s/%s.git' "${CODEBERG_USER}" "${name}"
  fi
}

pruefe_zugang() {
  if [ "${CODEBERG_PROTOKOLL}" = "ssh" ]; then
    if [ ! -f "${SSH_KEY}" ]; then
      echo "FEHLER: SSH-Schluessel fehlt: ${SSH_KEY}" >&2
      exit 1
    fi
    export GIT_SSH_COMMAND="ssh -i ${SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  fi

  # Fail-closed: ohne lesbaren Zugang gar nicht erst anfangen. Alle fuenf
  # Spiegel liegen unter demselben Konto, eine Probe genuegt.
  if git ls-remote "$(codeberg_url "${LOKALES_REPO}")" >/dev/null 2>&1; then
    return 0
  fi

  echo "FEHLER: kein Codeberg-Zugang ueber ${CODEBERG_PROTOKOLL}." >&2
  if [ "${CODEBERG_PROTOKOLL}" = "https" ]; then
    cat >&2 <<'HINWEIS'

  Es liegt kein Codeberg-Zugang im Schluesselbund. Einmalig durch den
  Betreiber (eine Session darf keine Zugangsdaten anlegen oder eingeben):

    1. codeberg.org -> Einstellungen -> Anwendungen -> Zugriffs-Token
       erzeugen, Schreibrecht auf Repositories.
    2. Einmal interaktiv anmelden, damit der Schluesselbund ihn speichert:

         git ls-remote https://codeberg.org/smejj/smejj.com-app.git

       Benutzername: smejj    Passwort: der Token (NICHT das Konto-Passwort).

  Danach dieses Skript erneut starten.
HINWEIS
  else
    cat >&2 <<'HINWEIS'

  Der SSH-Weg setzt einen offenen Port 22 voraus. Am 2026-08-05 war er im Netz
  des Betreibers zeitweise zu ("No route to host") und wenige Stunden spaeter
  wieder offen — eine solche Sperre kann also voruebergehen. Codeberg bietet
  keinen SSH-Endpunkt auf 443, der einzige Ausweg ist HTTPS:

    CODEBERG_PROTOKOLL=https bash scripts/deploy/codeberg_spiegel_sync.sh

  ACHTUNG: HTTPS braucht einen Codeberg-Token im Schluesselbund. Ist keiner
  hinterlegt, bricht auch dieser Weg ab (mit Anleitung).
HINWEIS
  fi
  exit 1
}

spiegle_lokales_repo() {
  local repo_root ziel
  repo_root="$(git rev-parse --show-toplevel)"
  ziel="$(codeberg_url "${LOKALES_REPO}")"
  echo "==> lokales Repo: ${repo_root}"

  # QUELLE DER WAHRHEIT IST origin, NICHT DIE LOKALEN BRANCHES (Befund 2026-08-05).
  # Vorher stand hier `git push "${ziel}" --all`. Das pusht die lokalen
  # Branch-Spitzen — und die sind in diesem Arbeitsbaum beliebig: parallele
  # Sessions halten Branches auf halbfertigen Zwischenstaenden, und `main` lag
  # auf 9af9906, waehrend GitHub UND Codeberg laengst auf 3d42346 standen
  # ("ahead 2, behind 64"). Der Push von main wurde zu Recht abgelehnt — haette
  # er durchgeschlagen, waere ein KORREKTER Spiegel durch einen veralteten
  # lokalen Stand ueberschrieben worden. Die Ablehnung brach ausserdem wegen
  # `set -e` den ganzen Lauf ab, noch vor Tags und den uebrigen Branches.
  #
  # Jetzt dieselbe Logik wie im GitHub-Pfad weiter unten: gespiegelt wird, was
  # bei origin steht. Damit ist `lokal` unabhaengig davon, welche Branches ein
  # Arbeitsbaum gerade ausgecheckt hat, und liefert dasselbe Ergebnis wie der
  # Zeitplan-Pfad mit seiner frischen Kopie.
  #
  # Bewusst kein 'git push --mirror': ein beschaedigtes Objekt in der Historie
  # laesst --mirror und gc scheitern. Refs einzeln sind robust.
  #
  # Bewusst die URL statt des Remote-Namens 'codeberg': dessen URL steht in
  # .git/config und ist dort noch ssh://. Ueber die URL haengt die Spiegelung
  # nicht daran, ob ein Arbeitsbaum den Remote schon umgestellt hat.
  #
  # '+' (erzwungen) wie im GitHub-Pfad: in diesem Projekt wird viel rebased,
  # ein Spiegel soll den Quellstand ABBILDEN, nicht ueber ihn diskutieren.
  # Kein --prune: Branches auf dem Spiegel zu LOESCHEN ist etwas anderes als
  # sie nachzufuehren, und das gehoert nicht in einen automatischen Lauf.
  local fehler=0 zweig
  while read -r zweig; do
    [ "${zweig}" = "HEAD" ] && continue   # origin/HEAD ist ein Symref
    if ! git push "${ziel}" "+refs/remotes/origin/${zweig}:refs/heads/${zweig}"; then
      echo "    FEHLGESCHLAGEN: ${zweig}" >&2
      fehler=$((fehler + 1))
    fi
  done < <(git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin)

  # Einzeln weiterlaufen statt beim ersten Fehler abzubrechen: sonst kostet ein
  # einziger stoerrischer Ref die Spiegelung aller uebrigen (genau das war der
  # main-Fall). Der Exit-Code sagt am Ende trotzdem die Wahrheit.
  if ! git push "${ziel}" --tags; then
    echo "    FEHLGESCHLAGEN: Tags" >&2
    fehler=$((fehler + 1))
  fi

  # Nichts soll UNBEMERKT ungespiegelt bleiben (Anliegen aus 6ded9b3, dort ueber
  # `--all` geloest — das scheiterte aber an genau dem main-Fall). Der Spiegel
  # bildet bewusst origin ab; lokale Branches, die es bei origin NICHT gibt,
  # sind damit nicht gesichert. Statt sie stillschweigend zu uebergehen oder
  # halbfertige Zwischenstaende in den Spiegel zu schieben, werden sie genannt.
  local nur_lokal=()
  while read -r zweig; do
    git show-ref --verify --quiet "refs/remotes/origin/${zweig}" || nur_lokal+=("${zweig}")
  done < <(git for-each-ref --format='%(refname:strip=2)' refs/heads)

  if [ "${#nur_lokal[@]}" -gt 0 ]; then
    echo "    HINWEIS: nur lokal, NICHT im Spiegel (erst nach GitHub pushen):"
    for zweig in "${nur_lokal[@]}"; do echo "      - ${zweig}"; done
  fi

  if [ "${fehler}" -gt 0 ]; then
    echo "    ${fehler} Ref(s) NICHT gespiegelt (siehe oben)." >&2
    return 1
  fi
  echo "    fertig: alle Branches und Tags von origin gespiegelt"
}

spiegle_github_repo() {
  local name="$1"
  local bare="${CACHE_DIR}/${name}.git"
  echo "==> GitHub-Repo: ${name}"

  mkdir -p "${CACHE_DIR}"
  if [ ! -d "${bare}" ]; then
    git clone --bare "https://github.com/SmejjCom/${name}.git" "${bare}"
  else
    git -C "${bare}" fetch --prune origin "+refs/heads/*:refs/heads/*" "+refs/tags/*:refs/tags/*"
  fi

  git -C "${bare}" push --prune \
    "$(codeberg_url "${name}")" \
    "+refs/heads/*:refs/heads/*" "+refs/tags/*:refs/tags/*"
  echo "    fertig: ${name}"
}

modus="${1:-alles}"

case "${modus}" in
  lokal|github|alles) ;;
  *)
    echo "FEHLER: unbekannter Modus '${modus}' (erwartet: alles | lokal | github)" >&2
    exit 1
    ;;
esac

echo "Codeberg-Spiegelung ueber ${CODEBERG_PROTOKOLL} (Konto ${CODEBERG_USER})."
pruefe_zugang

# Ein gescheitertes Repo darf die uebrigen nicht verhindern — dieselbe Lehre wie
# bei den Refs oben: unter `set -e` haette ein Fehlschlag im lokalen Repo die vier
# GitHub-Spiegel gar nicht erst erreicht. Fehler werden gezaehlt und am Ende
# benannt; der Exit-Code bleibt ehrlich.
gescheitert=()

lauf() {  # lauf <beschriftung> <befehl...>
  local name="$1"; shift
  if ! "$@"; then
    gescheitert+=("${name}")
  fi
}

case "${modus}" in
  lokal)
    lauf "${LOKALES_REPO}" spiegle_lokales_repo
    ;;
  github)
    for name in "${GITHUB_REPOS[@]}"; do
      lauf "${name}" spiegle_github_repo "${name}"
    done
    ;;
  alles)
    lauf "${LOKALES_REPO}" spiegle_lokales_repo
    for name in "${GITHUB_REPOS[@]}"; do
      lauf "${name}" spiegle_github_repo "${name}"
    done
    ;;
esac

if [ "${#gescheitert[@]}" -gt 0 ]; then
  echo "Spiegelung UNVOLLSTAENDIG — nicht gespiegelt: ${gescheitert[*]}" >&2
  echo "Primaerer Pfad bleibt GitHub; der Spiegel hinkt bei diesen Repos hinterher." >&2
  exit 1
fi

echo "Spiegelung abgeschlossen. Primaerer Pfad bleibt GitHub."
