# BYOK Security Policy

## Grundregel

BYOK bedeutet: Nutzer besitzt Key, Anbieterwahl und Kostenbeziehung. smejj.com
nutzt keinen eigenen kostenpflichtigen Standard-Key.

## Erlaubt

- Session- oder Memory-only Eingabe im Browser.
- OpenAI-kompatible Nutzer-Endpoints.
- Klare Anzeige `BYOK / Nutzer-Key`.

## Verboten

- API-Keys im Repo.
- API-Keys in Markdown-Beispielen.
- serverseitige Speicherung von Nutzer-Keys als Standard.
- unverschluesselte dauerhafte Speicherung im Browser.
- Auto-Fallback auf OpenAI, Kimi, Moonshot, Cloudflare Workers AI oder andere Paid-Provider.

## Fail-Closed

Fehlt Key, Endpoint oder Modell, wird der Modus `disabled`.

