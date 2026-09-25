# Impressum-Lock (100 % Schutz)

Betreiber-Auftrag 25.09.2026 im Wortlaut: „Nachdem bist du fertig, sollst du 100% Schutz legen, soll Zukunft nicht ohne schriftliche Bestätigung geändert werden oder gelöscht werden und so weiter, soll 100% geschützt werden.“

Geschützter Stand (SW v982): nur **iMild LLC**, Anschrift und E-Mail — kein Personenname, kein Block nach § 18 MStV.

| Schicht | Datei | Was sie meldet |
|---|---|---|
| Dateisperre | `scripts/check-impressum-lock.mjs` | Jede Byte-Änderung oder Löschung von `public/impressum.html`, `public/assets/impressum.html`, `public/en/legal-notice.html` |
| Inhaltstest | `tests/impressum-lock.test.mjs` | Firma, Anschrift, E-Mail vorhanden; kein Personenname; Kopie = Quelle |
| Auslieferung | `scripts/check-auslieferung-lock.mjs` | Ausgelieferte Kopie weicht ab |
| Live-Echtheit | `scripts/check-schutz-echtheit.mjs` | smejj.com liefert etwas anderes als das Manifest |
| Werkstatt-Tor | `scripts/werkstatt/pruefe-tor.mjs` | Manifest im selben Zug wie der Code geändert |

Prüfen: `npm run check:impressum-lock` (Teil von `npm run check:all`).

Ändern NUR nach ausdrücklicher schriftlicher Bestätigung des Betreibers:

```
node scripts/check-impressum-lock.mjs --freeze --confirm "<Wortlaut des Betreibers>"
```
