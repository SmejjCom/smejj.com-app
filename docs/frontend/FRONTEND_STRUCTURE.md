# Frontend Structure

## Seiten

- Startseite mit zentralem Chat / KI-Assistent
- Coding
- Projekte
- Dateien
- Speicher / IDrive e2 Status
- AI-Modus / Provider
- Einstellungen
- Nutzer / Login
- Kostenstatus / Free-Schutz
- Systemstatus
- Fehlerseite
- Offline-Seite

## Grundregeln

- mobile-first und PWA-faehig
- schnelle statische Shell
- klare Statusanzeigen
- kein falsches Premium-KI-Versprechen
- aktiver KI-Modus und Kostenstatus bleiben sichtbar
- keine zweite Chat-Maske; Chat laeuft zentral ueber die Startseiten-Eingabe
- GitHub und Cloudflare bleiben Free-only
- IDrive e2 bleibt Hauptspeicher

## Dateien

- `public/index.html`: Seitenstruktur
- `public/app.js`: Interaktion und Statuslogik
- `public/components.js`: zentrale UI-Komponenten
- `public/styles.css`: zentrales Styling
- `public/sw.js`: PWA-Shell-Cache
