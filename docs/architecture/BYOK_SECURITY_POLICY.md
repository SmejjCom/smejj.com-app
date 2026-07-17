# BYOK Security Policy

## Grundregel

BYOK bedeutet: Nutzer besitzt Key, Anbieterwahl und Kostenbeziehung. smejj.com
nutzt keinen eigenen kostenpflichtigen Standard-Key.

## Erlaubt

- Session- oder Memory-only Eingabe im Browser.
- OpenAI-kompatible Nutzer-Endpoints.
- Klare Anzeige `BYOK / Nutzer-Key`.
- Optional verschlüsselte, kontogebundene Provider-Profile, wenn der Nutzer
  dies ausdrücklich verlangt und der Anbieter in der serverseitigen Registry
  freigegeben ist. Der Klartext-Key darf dabei nur für den unmittelbaren
  Provider-Request im Control-Server existieren.

## Verboten

- API-Keys im Repo.
- API-Keys in Markdown-Beispielen.
- unverschlüsselte oder anonyme serverseitige Speicherung von Nutzer-Keys.
- Speicherung ohne externen 32-Byte-Master-Key oder ohne authentifizierten
  Benutzerkontext.
- unverschluesselte dauerhafte Speicherung im Browser.
- Auto-Fallback auf OpenAI, Kimi, Moonshot, Cloudflare Workers AI oder andere Paid-Provider.

## Fail-Closed

Fehlt Key, Endpoint oder Modell, wird der Modus `disabled`.

## Verschlüsselte Provider-Profile

- AES-256-GCM mit zufälliger 96-Bit-IV pro Schreibvorgang.
- AAD bindet Key-ID, Benutzerkennung und Provider-ID.
- Der Master-Key liegt ausschließlich außerhalb des synchronisierten Repos.
- Produktionsobjekte liegen unter einem gehashten Benutzerpräfix in IDrive e2.
- Browser, autonome Worker, Task Capsules, Exporte und Logs erhalten niemals
  den API-Key.
- Schlüsselwechsel, Entfernen und fehlende Verschlüsselung arbeiten fail-closed.
