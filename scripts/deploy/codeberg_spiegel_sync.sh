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

  # Bewusst kein 'git push --mirror': ein beschaedigtes Objekt in der Historie
  # laesst --mirror und gc scheitern. Branches und Tags einzeln sind robust.
  #
  # Bewusst die URL statt des Remote-Namens 'codeberg': dessen URL steht in
  # .git/config und ist dort noch ssh://. Ueber die URL haengt die Spiegelung
  # nicht daran, ob ein Arbeitsbaum den Remote schon umgestellt hat.
  git push "${ziel}" --all
  git push "${ziel}" --tags

  # Branches, die nur bei origin liegen (z. B. gh-pages), sonst waere der
  # Spiegel unvollstaendig. origin/HEAD ist ein Symref und wird ausgelassen.
  local zweig
  while read -r zweig; do
    [ "${zweig}" = "HEAD" ] && continue
    git show-ref --verify --quiet "refs/heads/${zweig}" && continue
    echo "    nur bei origin, wird mitgespiegelt: ${zweig}"
    git push "${ziel}" "refs/remotes/origin/${zweig}:refs/heads/${zweig}"
  done < <(git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin)

  echo "    fertig: $(git rev-parse --abbrev-ref HEAD) und alle weiteren Branches"
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

case "${modus}" in
  lokal)
    spiegle_lokales_repo
    ;;
  github)
    for name in "${GITHUB_REPOS[@]}"; do
      spiegle_github_repo "${name}"
    done
    ;;
  alles)
    spiegle_lokales_repo
    for name in "${GITHUB_REPOS[@]}"; do
      spiegle_github_repo "${name}"
    done
    ;;
esac

echo "Spiegelung abgeschlossen. Primaerer Pfad bleibt GitHub."
