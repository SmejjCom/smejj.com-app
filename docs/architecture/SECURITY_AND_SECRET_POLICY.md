# Security and Secret Policy

## Grundregel

Secrets gehoeren nie in den Browser, nie ins Repo, nie in Markdown-Beispiele und
nie in Logs. Der Browser darf nur kurzlebige, policy-gepruefte signierte URLs
oder Nutzer-eigene BYOK-Konfigurationen verwenden.

## Verboten

- IDrive-e2-Access-Keys im Browser.
- API-Keys, Tokens, Session-Secrets oder private Keys im Repo.
- Secrets in GitHub Issues, Pull Requests, Actions, Packages oder Pages.
- Secrets in Cloudflare-Frontend-Code oder statischen Assets.
- Modellgewichte, grosse Medienarchive oder zentrale Nutzerdaten im Repo.
- Private absolute Rechnerpfade in Dokumentation oder Manifesten.

## Erlaubt

- `.env.example` mit Platzhaltern.
- Lokale `.env.local` Dateien, wenn sie ignoriert und nicht committed werden.
- Server-/Worker-seitige Secret-Verwendung, sofern der Dienst im dauerhaft kostenlosen Cloudflare-Free-Rahmen bleibt.
- BYOK im Nutzerbesitz, ohne serverseitige Speicherung durch smejj.com.

## Fail-Closed

Wenn ein Secret fehlt, falsch konfiguriert ist oder ein Kostenrisiko erzeugen
koennte, stoppt die Funktion sichtbar. Es gibt keinen Paid-Fallback.

## Dokumentation

Alle Dokumente verwenden relative Repo-Pfade. Keine Dokumentation enthaelt
private lokale Pfade, echte Bucket-Namen mit Privatbezug, echte Tokens oder
Maschinenpfade.

