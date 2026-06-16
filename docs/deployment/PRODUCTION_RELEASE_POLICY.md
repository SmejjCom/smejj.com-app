# Production Release Policy

## Harte Regel

Keine Produktion ohne schriftliche Freigabe von Muesluem Akdeniz / Alan Best.

## Vorbedingungen

- `npm run check:all` bestanden.
- `npm run release:guard` bestanden.
- `npm run check:rollback` bestanden.
- Staging oder lokale Preview bestanden.
- Release-Notiz erstellt.
- Rollback-Punkt erstellt.
- IDrive-e2-Backup/Artefakt erstellt oder bewusst dokumentiert, warum es fuer diese Version nicht noetig ist.
- Keine Secrets im Repo.
- Keine privaten Pfade.
- Keine Paid-Dienste.

## Produktion

Produktion ist ein manueller Schritt. Es gibt keinen Auto-Deploy aus GitHub und keine automatische Cloudflare-Veroeffentlichung. Jeder Produktionsschritt muss die freigegebene Version, den Commit, das Artefakt, den Rollback-Punkt und die freigebende Person nennen.

## Nach Produktion

- Live-Health pruefen.
- PWA laden.
- Auth-Status pruefen.
- IDrive-e2-Storage-Status pruefen.
- AI-Modus muss default `disabled` oder explizit sicher sein.
- Free-Tier-Guard erneut ausfuehren.
- Release-Notiz finalisieren.

## Sofortiger Abbruch

Bei Kostenrisiko, Secret-Risiko, fehlender Freigabe oder unklarem Cloudflare-/GitHub-Free-Status wird nicht released.
