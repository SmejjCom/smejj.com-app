# Sync Conflict Policy

## Grundregel

Keine Daten duerfen still ueberschrieben werden. Kein Konflikt darf unsichtbar
bleiben.

## Konfliktfaelle

Sichtbarer Konflikt:

- zwei Geraete aendern dieselbe Datei gleichzeitig
- beide Deltas basieren auf demselben alten Stand
- dieselbe Zeile oder ein nicht sicher mergebarer Bereich wurde geaendert

Automatisch mergebar:

- verschiedene Dateien
- dieselbe Datei, aber eindeutig verschiedene Zeilen

## Verhalten

Bei Konflikt:

- lokale Version bleibt erhalten
- entfernte Version bleibt als Delta erhalten
- Konflikt wird mit Pfad, Hashes und betroffenen Zeilen gemeldet
- Sync-Status wird `konflikt`
- kein Manifest-Head darf still auf einen verlustbehafteten Stand wechseln

## Verboten

- Last-write-wins als Standard
- stille Ueberschreibung
- Konfliktloesung ohne UI-/Nutzerhinweis
- GitHub oder Cloudflare als Sync-Hauptspeicher
- Cloudflare Paid, GitHub Paid, Trials oder Auto-Billing

