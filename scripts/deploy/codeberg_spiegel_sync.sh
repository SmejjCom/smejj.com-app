#!/usr/bin/env bash
# Git-Spiegelung nach codeberg.org (kostenlos, nur Spiegel, nie Deploy-Pfad).
#
# Warum ein Skript und kein Codeberg-Pull-Spiegel:
# Codeberg bietet im Migrations-Dialog keine Spiegel-Option an (kein
# automatischer Abgleich alle 8 h). Der Abgleich muss daher von hier
# angestossen werden.
#
# Nutzung:
#   bash scripts/deploy/codeberg_spiegel_sync.sh            # alles
#   bash scripts/deploy/codeberg_spiegel_sync.sh lokal      # nur dieses Repo
#   bash scripts/deploy/codeberg_spiegel_sync.sh github     # nur die GitHub-Repos
#
# Voraussetzung: ~/.ssh/codeberg_smejj_ed25519 (Schluessel ist bei Codeberg
# unter dem Konto smejj registriert, Fingerprint SHA256:c7vHhee...).

set -euo pipefail

SSH_KEY="${HOME}/.ssh/codeberg_smejj_ed25519"
CODEBERG_USER="smejj"
CACHE_DIR="${HOME}/.cache/smejj-codeberg-spiegel"

# Repos, die nur auf GitHub liegen und ueber einen Zwischen-Klon gespiegelt werden.
GITHUB_REPOS=(
  "smejj-app-frontend"
  "smejj-control"
  "smejj-site"
  "imild-site"
)

if [ ! -f "${SSH_KEY}" ]; then
  echo "FEHLER: SSH-Schluessel fehlt: ${SSH_KEY}" >&2
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i ${SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

modus="${1:-alles}"

spiegle_lokales_repo() {
  local repo_root
  repo_root="$(git rev-parse --show-toplevel)"
  echo "==> lokales Repo: ${repo_root}"

  # Bewusst kein 'git push --mirror': ein beschaedigtes Objekt in der Historie
  # laesst --mirror und gc scheitern. Branches und Tags einzeln sind robust.
  git push codeberg --all
  git push codeberg --tags

  # Branches, die nur bei origin liegen (z. B. gh-pages), sonst waere der
  # Spiegel unvollstaendig. origin/HEAD ist ein Symref und wird ausgelassen.
  local zweig
  while read -r zweig; do
    [ "${zweig}" = "HEAD" ] && continue
    git show-ref --verify --quiet "refs/heads/${zweig}" && continue
    echo "    nur bei origin, wird mitgespiegelt: ${zweig}"
    git push codeberg "refs/remotes/origin/${zweig}:refs/heads/${zweig}"
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
    "ssh://git@codeberg.org/${CODEBERG_USER}/${name}.git" \
    "+refs/heads/*:refs/heads/*" "+refs/tags/*:refs/tags/*"
  echo "    fertig: ${name}"
}

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
  *)
    echo "FEHLER: unbekannter Modus '${modus}' (erwartet: alles | lokal | github)" >&2
    exit 1
    ;;
esac

echo "Spiegelung abgeschlossen. Primaerer Pfad bleibt GitHub."
