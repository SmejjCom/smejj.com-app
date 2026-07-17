# Security and Secret Policy

## Grundregel

Secrets gehoeren nie in den Browser, nie ins Repo, nie in Markdown-Beispiele und
nie in Logs. Der Browser darf nur kurzlebige, policy-gepruefte signierte URLs
oder Nutzer-eigene BYOK-Konfigurationen verwenden.

## Verboten

- IDrive-e2-Access-Keys im Browser.
- API-Keys, Tokens, Session-Secrets oder private Keys im Repo.
- Secrets in GitHub Issues, Pull Requests, Actions, Packages oder Pages.
- Secrets in Frontend-Code oder statischen Assets.
- Modellgewichte, grosse Medienarchive oder zentrale Nutzerdaten im Repo.
- Private absolute Rechnerpfade in Dokumentation oder Manifesten.

## Erlaubt

- `.env.example` mit Platzhaltern.
- Lokale Secret-Dateien ausschließlich außerhalb jedes synchronisierten
  Projektordners. Standardpfad ist `~/.config/smejj.com/env.local` mit
  Verzeichnisrecht `0700` und Dateirecht `0600`; `SMEJJ_LOCAL_ENV_FILE` darf
  nur auf einen absoluten, nicht synchronisierten Pfad zeigen.
- Server-/Worker-seitige Secret-Verwendung ausschließlich in den freigegebenen
  Control-Server- und Salad-Worker-Grenzen, mit Least Privilege, Rotation und
  ohne Ausgabe in Logs oder Trainingsdaten.
- BYOK im Nutzerbesitz. Generisches BYOK bleibt session-only; ausdrücklich
  freigegebene Provider-Profile dürfen ausschließlich kontogebunden,
  AES-256-GCM-verschlüsselt und mit externem Master-Key in IDrive e2 liegen.

`.gitignore` ist kein Schutz vor Google Drive, OneDrive, Dropbox oder anderen
Dateisynchronisierungen. `.env`, `.env.local` und vergleichbare Secret-Dateien
sind deshalb innerhalb eines synchronisierten Workspaces ausnahmslos verboten.

## Fail-Closed

Wenn ein Secret fehlt, falsch konfiguriert ist oder ein Kostenrisiko erzeugen
koennte, stoppt die Funktion sichtbar. Es gibt keinen Paid-Fallback.

## Dokumentation

Alle Dokumente verwenden relative Repo-Pfade. Keine Dokumentation enthaelt
private lokale Pfade, echte Bucket-Namen mit Privatbezug, echte Tokens oder
Maschinenpfade.
