# AI Router and BYOK Policy

## Grundregel

Der AI Router ist provider-neutral und arbeitet fail-closed. Wenn kein
kostenkontrollierter Modus verfuegbar ist, bleibt die App ohne KI nutzbar.

## Erlaubte Modi

- `local-browser`: lokale kleine Modelle und Werkzeuge, wenn das Geraet es kann.
- `byok`: Nutzer bringt einen eigenen OpenAI-kompatiblen API-Key mit.
- `free-demo-hardlimit`: nur mit serverseitigem hartem Limit und ohne Paid-Fallback.
- `disabled`: sicherer Standard, wenn Kosten, Auth oder Provider unklar sind.
- `later-partner-compute`: nur nach separater schriftlicher Freigabe.

## BYOK

BYOK bedeutet:

- Kostenbeziehung liegt beim Nutzer.
- Generisches OpenAI-kompatibles BYOK bleibt memory-/session-only und wird
  nicht serverseitig gespeichert.
- Für ausdrücklich freigegebene Anbieterprofile (aktuell Cline) darf der
  Nutzer optional eine verschlüsselte, kontogebundene Ablage wählen. Diese
  Ausnahme verlangt AES-256-GCM, einen externen Master-Key, Authentifizierung,
  IDrive e2 als Produktionsspeicher, keine Key-Ausgabe und keinen Worker-Zugriff.
- Keys werden nicht in GitHub, Cloudflare, Logs oder Markdown dokumentiert.
- Nutzer muss Anbieter, Modell und Kostenrisiko bewusst auswaehlen.

## Verboten

- Automatischer Wechsel auf bezahlte OpenAI-, Kimi-, Cloudflare- oder andere APIs.
- Trial-Provider als Kernbestandteil.
- Cloudflare Workers AI Paid als Standard.
- GitHub oder Cloudflare als KI-Compute-Kern.

## UI-Pflicht

Die UI zeigt immer KI-Modus, Kostenstatus und ob ein Nutzer-Key aktiv ist.
