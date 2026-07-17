# CSP and CORS Policy

## CSP

Die App nutzt eine restriktive Content Security Policy:

- `default-src 'self'`
- `connect-src 'self' https://accounts.google.com`
- `frame-src https://accounts.google.com`
- `script-src 'self' https://accounts.google.com/gsi/client`
- `object-src 'none'`
- `frame-ancestors 'none'`
- `base-uri 'self'`
- `form-action 'self'`

## CORS / Origin

Es gibt keinen offenen `Access-Control-Allow-Origin: *` Pfad. Schreibende Requests pruefen den Origin und erlauben nur:

- gleiche Origin,
- `https://smejj.com`,
- `https://www.smejj.com`,
- fuer Google Auth zusaetzlich `https://accounts.google.com`.

## Redirects

Unsichere Redirects sind nicht erlaubt. Der Worker redirectet nur `www.smejj.com` nach `smejj.com`. Auth-Redirects gehen auf `/`.

## Service Worker

API-GETs werden nicht mit der PWA-Shell als Offline-Fallback beantwortet. Shell-Fallback gilt nur fuer normale statische Navigation.
