# Umzug der Arbeitskopie: Google Drive -> lokale Platte

Stand: 2026-07-03. Vorbereitet auf schriftliche Bestaetigung des Nutzers (PROMPT_WEITERMACHEN Punkt 4, Rest).

## Warum

- Google Drive hat das lokale `.git` beschaedigt (dokumentiert in Memory_Bank; Rettung liegt
  im privaten Repo SmejjCom/smejj-com-source als git-Bundle + tar.gz).
- Drive-Sync erzeugt Konflikte, wenn mehrere KI-Sessions parallel im selben Ordner arbeiten
  (mehrfach beobachtet an Memory_Bank.md, app.js, sw.js).
- Cloud-only-Dateien verlangsamen Checks und Builds.

## Durchfuehrung (einmalig, ~5 Minuten)

1. Finder: im Projektordner `scripts/migrate-to-local-disk.command` doppelklicken
   (bei Gatekeeper-Warnung: Rechtsklick -> Oeffnen).
   Das Skript KOPIERT alles nach `~/smejj.com App` — es loescht nichts,
   Drive bleibt vollstaendig als Backup erhalten. Ausgeschlossen: node_modules, .git, .DS_Store.
2. Terminal im neuen Ordner:
   ```bash
   cd "$HOME/smejj.com App"
   npm install
   npm run check && npm run check:guidelines
   ```
3. Git wieder herstellen (empfohlen ueber die Rettung):
   ```bash
   # Bundle aus SmejjCom/smejj-com-source herunterladen, dann:
   git clone smejj-com-source.bundle wiederhergestellt
   # oder einfach frisch beginnen:
   git init && git add -A && git commit -m "Stand von Google Drive uebernommen"
   ```
4. In Cowork/Claude-Sessions ab jetzt den NEUEN Ordner `~/smejj.com App` auswaehlen.
5. Optional spaeter: den Drive-Ordner in `- smejj.com info/ARCHIV-smejj.com App` umbenennen,
   damit niemand versehentlich weiter darin arbeitet.

## Wichtig

- Solange beide Ordner existieren, NUR noch im lokalen arbeiten (sonst Drift).
- Der Live-Betrieb (smejj.com, GitHub Pages) ist vom Umzug unberuehrt —
  deployt wird weiterhin ueber das Site-Repo SmejjCom/smejj-app-frontend.
