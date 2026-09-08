#!/bin/zsh
# smejj.com — die zwei veralteten Pruefsummen im Foundation-Benchmark nachziehen,
# danach Gegenprobe und Stempel sichern. Ein Aufruf, mehr nicht.
set -u
cd "$(dirname "$0")/../.." || exit 1

echo "1/4  Abweichungen zeigen ..."
node scripts/einmal/benchmark-pruefsummen-2026-09-09.mjs --probe || { echo "ABBRUCH beim Pruefen"; exit 1; }

echo
echo "2/4  Nachziehen ..."
node scripts/einmal/benchmark-pruefsummen-2026-09-09.mjs || { echo "ABBRUCH beim Schreiben"; exit 1; }

echo
echo "3/4  Gegenprobe — laeuft der Beurteilungslauf jetzt durch?"
node --test tests/model-promotion.test.mjs 2>&1 | tail -6
if node --test tests/model-promotion.test.mjs 2>&1 | grep -q "fail 0"; then
  echo "    Beurteilungslauf GRUEN"
else
  echo "    ABBRUCH: Beurteilungslauf weiterhin rot — Sicherung zurueckspielen:"
  echo "    cp idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json.vor-2026-09-09.bak \\"
  echo "       idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json"
  exit 1
fi

echo
echo "4/4  Stempel sichern ..."
git add idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json scripts/einmal/benchmark-pruefsummen-2026-09-09.* 2>/dev/null
git commit -q -m "chore(benchmark): zwei Pruefsummen im Foundation-Benchmark nachgezogen

Das Manifest friert die Pruefskripte ein, mit denen ein Modell beurteilt wird — Absicht,
sonst koennte jemand eine Erwartung aufweichen, damit ein Modell besser aussieht. Zwei
dieser Skripte wurden seither VERBESSERT, ohne dass das Manifest nachgezogen wurde:
  scripts/check-no-paid-services.mjs   03.09. (Secret-Scanner-Verweisformen)
  scripts/check-guidelines.mjs         07.09. (CSP-Fix fuer Chat-Bilder)
Seitdem brach der Beurteilungslauf mit protected_asset_digest_mismatch ab und blockierte
damit die ganze Kette check:all. Kein Code und keine Erwartung geaendert — nur die
Buchhaltung darueber, welche Fassung eingefroren ist. Praezedenzfall: Version 2026-08-14.1.

Betreiber-Freigabe 2026-09-09.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && echo "    Stempel gesichert" || echo "    (nichts zu sichern)"

echo
echo "FERTIG."
