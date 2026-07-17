#!/bin/bash
# smejj.com — GitHub-SSH-Key auf DIESEM Mac einrichten (einmalig).
# Erzeugt ~/.ssh/smejjcom_github_ed25519 (privater Schluessel bleibt nur auf diesem Mac),
# kopiert den OEFFENTLICHEN Schluessel in die Zwischenablage und oeffnet die
# GitHub-Seite zum Einfuegen. Danach: rescue-commit-2026-07-06-auto.command erneut starten.
set -euo pipefail

KEY="$HOME/.ssh/smejjcom_github_ed25519"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ -f "$KEY" ]; then
  echo "Key existiert bereits: $KEY — es wird KEIN neuer erzeugt."
else
  ssh-keygen -t ed25519 -N "" -C "smejjcom@gmail.com smejj.com-deploy $(date +%Y-%m-%d)" -f "$KEY"
  echo "Key erzeugt: $KEY"
fi

echo
echo "================= DEIN OEFFENTLICHER SCHLUESSEL ================="
cat "$KEY.pub"
echo "================================================================="
pbcopy < "$KEY.pub" && echo "(Wurde in die Zwischenablage kopiert.)"
echo
echo "NAECHSTE SCHRITTE (machst du selbst im Browser):"
echo "  1. Es oeffnet sich gleich github.com/settings/ssh/new (ggf. einloggen)."
echo "  2. Title: z.B. 'MacBook Alan smejj.com' — Key: Cmd+V einfuegen — 'Add SSH key'."
echo "  3. Danach das Skript rescue-commit-2026-07-06-auto.command erneut doppelklicken."
echo
open "https://github.com/settings/ssh/new"
read -r -p "Enter zum Schliessen." _
