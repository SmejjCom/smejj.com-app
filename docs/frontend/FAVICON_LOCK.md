# Dauerhafter Favicon-Lock

Status: **verbindlich, dauerhaft und fail-closed**

Schriftliche Nutzeranweisung vom 2026-07-13:

> Das Browser-Favicon ist final. Favicon-Dateien, HTML-Head-Referenzen und
> Web-Manifest-Icon-Einträge dürfen nicht verändert, gelöscht, überschrieben
> oder verschoben werden. Eine technisch notwendig erscheinende Änderung ist
> vor der Ausführung zu melden und benötigt eine ausdrückliche neue schriftliche
> Bestätigung.

## Geschützter Umfang

- Browser-Favicon SVG, PNG 16/32/48 und ICO
- Apple-Touch-Icon
- alle bestehenden `rel="icon"`- und `rel="apple-touch-icon"`-Einträge
- alle aktuellen Icon-Einträge in `manifest.webmanifest`
- Generatoren und Konfigurationen, die diese Dateien oder Referenzen erzeugen

## Technische Durchsetzung

`pnpm run check:favicon-lock` vergleicht den aktuellen Stand mit
`docs/frontend/favicon-lock-manifest.json`. Die Prüfung läuft verpflichtend in
`check:all` und damit vor jedem Release.

Der Lock besitzt absichtlich keinen automatischen Freeze- oder Update-Modus.
Eine Abweichung stoppt die Pipeline. Das Manifest darf erst nach einer neuen,
ausdrücklichen schriftlichen Bestätigung des Nutzers manuell aktualisiert werden.

Refactorings, Generatorläufe, Build-Anpassungen und Aufräumarbeiten sind keine
Ausnahme. Wenn sie den geschützten Stand berühren würden, müssen sie abgebrochen
oder so angepasst werden, dass alle geschützten Bytes und Referenzen identisch
bleiben.
