#!/bin/sh
# smejj.com — Waechter fuer docs/policy/GITHUB_KOSTENFREI.md
#
# Schlaegt an, BEVOR bei GitHub Kosten entstehen koennen. Er prueft die drei
# Kostenwege, die im privaten Repo ueberhaupt Geld kosten koennen:
#   A  .github/workflows/* und .github/dependabot.yml -> Actions-Minuten
#   B  .devcontainer/ -> Codespaces
#   C  Git-LFS (Attribut-Filter, Zeigerdateien, lokale Filter-Konfiguration)
#
# Das Skript WARNT und BLOCKIERT. Es loescht, verschiebt und aendert nichts.
#
# Aufruf:
#   sh scripts/check/github_kostenfrei.sh          # prueft das aktuelle Repo
#   SMEJJ_CHECK_ROOT=/pfad sh scripts/check/...    # prueft ein anderes Verzeichnis
#
# Als Pre-Push-Hook: .git/hooks/pre-push ruft dieses Skript auf.
# Rueckgabe: 0 sauber, 1 Fund (Push wird abgebrochen).

set -u

# --- Wurzel bestimmen ------------------------------------------------------
if [ -n "${SMEJJ_CHECK_ROOT:-}" ]; then
  ROOT="$SMEJJ_CHECK_ROOT"
else
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "github_kostenfrei: kein Git-Repository — nichts zu pruefen." >&2
    exit 0
  }
fi
cd "$ROOT" 2>/dev/null || { echo "github_kostenfrei: $ROOT nicht lesbar." >&2; exit 1; }

# --- Nur das PRIVATE Repo ist betroffen ------------------------------------
# Im oeffentlichen Frontend-Repo sind Actions unbegrenzt frei; dort waere ein
# Block sachlich falsch. Erkennung ueber die Push-Adresse von origin.
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
case "$REMOTE" in
  *smejj-app-frontend*)
    echo "github_kostenfrei: oeffentliches Repo ($REMOTE) — Actions dort kostenlos, keine Pruefung."
    exit 0
    ;;
esac

FUNDE=0
melde() {
  FUNDE=$((FUNDE + 1))
  echo "  [$FUNDE] $1"
}

# Dateiliste: verfolgt + unverfolgt (ohne .gitignore-Treffer, ohne .git/).
DATEIEN=$(git ls-files --cached --others --exclude-standard 2>/dev/null || true)

echo "github_kostenfrei: pruefe $ROOT"
echo "  origin: ${REMOTE:-(keiner)}"
echo ""

# --- A) GitHub Actions -----------------------------------------------------
TREFFER=$(printf '%s\n' "$DATEIEN" | grep -E '^\.github/workflows/.+' || true)
if [ -n "$TREFFER" ]; then
  printf '%s\n' "$TREFFER" | while IFS= read -r f; do
    [ -n "$f" ] && echo "  TREFFER-A $f"
  done
  melde "GitHub-Actions-Workflow im privaten Repo: siehe TREFFER-A oben.
      Kosten: 0,002 \$/min Plattformgebuehr ab der ERSTEN Minute, danach
      0,006 \$/min ueber dem 2.000-min-Freikontingent.
      Regel A in docs/policy/GITHUB_KOSTENFREI.md. CI gehoert ins
      oeffentliche Frontend-Repo oder auf 'npm run check:all' lokal."
fi
# Auch das leere Verzeichnis melden — es ist die Vorstufe.
if [ -d ".github/workflows" ] && [ -z "$TREFFER" ]; then
  melde "Verzeichnis .github/workflows/ existiert (noch leer). Regel A: es darf
      im privaten Repo gar nicht erst entstehen."
fi

TREFFER=$(printf '%s\n' "$DATEIEN" | grep -E '^\.github/dependabot\.ya?ml$' || true)
if [ -n "$TREFFER" ]; then
  echo "  TREFFER-A $TREFFER"
  melde "Dependabot-Konfiguration gefunden. Dependabot-VERSION-UPDATES laufen
      auf Actions-Infrastruktur und verbrauchen im privaten Repo Minuten
      (Dependabot-ALERTS sind kostenlos und brauchen keine Datei).
      Regel A in docs/policy/GITHUB_KOSTENFREI.md."
fi

# --- B) Codespaces ---------------------------------------------------------
TREFFER=$(printf '%s\n' "$DATEIEN" | grep -E '^\.devcontainer(/|$)|^devcontainer\.json$' || true)
if [ -n "$TREFFER" ]; then
  printf '%s\n' "$TREFFER" | while IFS= read -r f; do
    [ -n "$f" ] && echo "  TREFFER-B $f"
  done
  melde "Codespaces-/Devcontainer-Konfiguration gefunden: siehe TREFFER-B oben.
      Codespaces rechnet Kern-Stunden und Speicher ab, sobald das kleine
      Free-Kontingent aufgebraucht ist.
      Regel B in docs/policy/GITHUB_KOSTENFREI.md."
fi
if [ -d ".devcontainer" ] && [ -z "$TREFFER" ]; then
  melde "Verzeichnis .devcontainer/ existiert (noch leer). Regel B."
fi

# --- C) Git-LFS ------------------------------------------------------------
# C1: .gitattributes mit LFS-Filter, an beliebiger Stelle im Baum.
# while-read statt "for": Dateinamen im Projekt enthalten Leerzeichen.
LFS_ATTR=""
MARKE="${TMPDIR:-/tmp}/smejj_kostenfrei_$$"
: > "$MARKE"
printf '%s\n' "$DATEIEN" | grep -E '(^|/)\.gitattributes$' | while IFS= read -r a; do
  [ -n "$a" ] && [ -f "$a" ] || continue
  if grep -qi 'filter=lfs' "$a" 2>/dev/null; then
    echo "  TREFFER-C $a (enthaelt filter=lfs)"
    echo "hit" >> "$MARKE"
  fi
done
[ -s "$MARKE" ] && LFS_ATTR="ja"
: > "$MARKE"
if [ -n "$LFS_ATTR" ]; then
  melde "Git-LFS-Filter in .gitattributes: siehe TREFFER-C oben.
      LFS ist der EINZIGE Git-Speicher bei GitHub, der abgerechnet wird
      (1 GB Speicher + 1 GB Bandbreite frei, danach kostenpflichtig) —
      normales Git-Hosting ist unbegrenzt frei.
      Regel C in docs/policy/GITHUB_KOSTENFREI.md. Grosse Dateien gehoeren
      nach IDrive e2 (scripts/model-management/)."
fi

# C2: LFS-Zeigerdateien im Baum (auch ohne .gitattributes moeglich).
# Eine Zeigerdatei traegt die Kennung immer in Zeile 1 — deshalb ":1:" filtern.
# Dieses Skript und die Regeldatei nennen die Kennung als Text und sind
# ausgenommen, sonst meldete der Waechter sich selbst.
# "--untracked": eine frisch abgelegte Zeigerdatei ist noch nicht im Index,
# waere ohne die Option unsichtbar (real gemessen 2026-07-29).
ZEIGER=$(git grep -I -n --untracked -e 'version https://git-lfs.github.com/spec' -- \
           ':!scripts/check/github_kostenfrei.sh' \
           ':!docs/policy/GITHUB_KOSTENFREI.md' 2>/dev/null \
         | grep ':1:' || true)
if [ -n "$ZEIGER" ]; then
  printf '%s\n' "$ZEIGER" | cut -d: -f1 | sort -u | while IFS= read -r f; do
    [ -n "$f" ] && echo "  TREFFER-C $f (LFS-Zeigerdatei)"
  done
  melde "LFS-Zeigerdateien im Baum: siehe TREFFER-C oben. Regel C."
fi

# C3: lokale LFS-Filterkonfiguration.
if git config --get-regexp '^filter\.lfs\.' >/dev/null 2>&1; then
  git config --get-regexp '^filter\.lfs\.' 2>/dev/null | while IFS= read -r l; do
    echo "  TREFFER-C git config $l"
  done
  melde "Git-LFS ist fuer dieses Repo konfiguriert (filter.lfs.*). Regel C.
      Entfernen mit: git config --unset-all filter.lfs.clean (usw.) —
      dieses Skript aendert nichts von selbst."
fi

# --- Ergebnis --------------------------------------------------------------
rm -f "$MARKE"
echo ""
if [ "$FUNDE" -eq 0 ]; then
  echo "github_kostenfrei: OK — keine Kostenquelle gefunden. GitHub bleibt bei 0,00 EUR."
  exit 0
fi

echo "github_kostenfrei: BLOCKIERT — $FUNDE Fund(e)."
echo ""
echo "  Nichts wurde geaendert oder geloescht. Entweder die Datei(en) entfernen,"
echo "  oder die Regel mit schriftlicher Freigabe des Betreibers aendern"
echo "  (docs/policy/GITHUB_KOSTENFREI.md, Abschnitt 9)."
echo "  Einmaliges bewusstes Uebergehen: git push --no-verify"
exit 1
