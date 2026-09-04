#!/bin/zsh
# smejj.com — Doppelklick im Finder: pdf.js-Worker in zwei Teilen (Sicherheitsregel: keine Datei
# ueber 1 MB im Repo), check:all wieder gruen. Ruft die Kaskade
# scripts/einmal/pdfjs-worker-teilung-2026-09-04.sh auf (SW-Cache +1, Start-Lock-Stempel,
# Klon -> GitHub Pages, Bauzweig -> Zeabur, Live-Beweis). Protokoll liegt daneben als .log.
cd "$(dirname "$0")"
echo "smejj.com — pdf-Worker Teilung ausliefern ($(date))"
echo
zsh "scripts/einmal/pdfjs-worker-teilung-2026-09-04.sh" 2>&1 | tee "scripts/einmal/pdfjs-worker-teilung-2026-09-04.log"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — live. PDF-Anhaenge funktionieren unveraendert."; else echo "ABBRUCH mit Code $STATUS — das Protokoll liegt in scripts/einmal/pdfjs-worker-teilung-2026-09-04.log, die Sitzung liest es selbst."; fi
read -k 1 "?Taste druecken zum Schliessen ..."
