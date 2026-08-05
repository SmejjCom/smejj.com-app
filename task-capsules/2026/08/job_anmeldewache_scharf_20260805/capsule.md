# Task Capsule — Anmeldepflicht der Chat-Brücke wieder scharf (job_anmeldewache_scharf_20260805)

## Auftrag
Betreiber: „Anmeldewache wieder scharf schalten", danach auf Nachfrage die
ausdrückliche Freigabe ohne vorherige Messung (Wortlaut unten).

## Warum es die Wache braucht
Gemessen: Ein `curl` mit dem Kopf `Origin: https://smejj.com` bekam die volle
Antwort. Der Origin-Kopf wirkt **ausschließlich im Browser** — außerhalb setzt
ihn jeder selbst. Wer die Brücken-Adresse kannte, konnte den Chat mitbenutzen
und das geteilte Groq-Kontingent aufbrauchen, bis echte Nutzer 429 sahen.

## Die Vorgeschichte, die ich zuerst geprüft habe
Am 2026-08-04 war die Wache schon einmal scharf und musste **live zurück**: Sie
wies gültig *angemeldete* Nutzer ab. Ursache war nicht die Wache, sondern ein
älterer Fehler — `auth-gate.js` prüfte nur, **ob** ein Token im Speicher liegt,
nie **ob es gilt**. Im Browser des Betreibers lag ein Token, das der Control
Server ablehnt; die App zeigte ihn als angemeldet, der Server nicht.

**Vorbedingung heute geprüft und erfüllt:** `auth-gate.js` trägt seit
2026-08-05 `verifyStoredSession` und ist **live ausgeliefert** (im gelieferten
Bündel nachgewiesen). Ein ungültiges Token führt jetzt zur Anmeldung statt in
einen halben Zustand.

## Was ich beim Scharfschalten gefunden habe
`allowAuthenticated` wurde in `chat-bridge.js` **benutzt, aber nicht
importiert**. `node --check` prüft nur Syntax — das wäre erst zur Laufzeit als
`ReferenceError` aufgefallen, also genau in dem Moment, in dem der Chat schon
tot ist. Import ergänzt; der Test prüft ihn jetzt mit.

## Offen gelegt: der positive Weg ist NICHT gemessen
Der Zähler `anmeldung` in `/health` stand bei **0** — es lief kein Verkehr
durch, seit der Container zuletzt neu startete. Ich kann die Wache nur
**negativ** prüfen (Unangemeldete werden abgewiesen); den Fall „angemeldeter
Nutzer kommt durch" kann ich nicht prüfen, weil eine Sitzung sich nicht anmelden
darf. Ich habe das dem Betreiber vorgelegt, statt es zu überspringen.

Freigabe Wof Kadavanich, 2026-08-05, im Wortlaut:
> „Schalte die Anmeldepflicht der Chat-Bruecke jetzt scharf, ohne die vorherige
> Messung. Mir ist bewusst, dass der positive Weg (angemeldeter Nutzer kommt
> durch) nicht geprueft werden konnte, weil du dich nicht anmelden darfst.
> Wenn der Chat danach abweist, nimm die Wache sofort wieder zurueck und
> melde dich."

## Umsetzung
- `public/chat-bridge.js`: Wache verdrahtet, Import ergänzt, Version
  `20260805-v119` → **`v120-anmeldepflicht-scharf`**. Die Begründung und der
  Freigabe-Wortlaut stehen an der Fundstelle im Quelltext.
- `tests/bridge-anmeldepflicht.test.mjs`: Der Test, der bisher festhielt
  „bewusst NICHT verdrahtet", hält jetzt das Gegenteil fest — **und zusätzlich
  die Vorbedingung**: Er prüft, dass `verifyStoredSession` in `auth-gate.js`
  existiert. Fällt die Frontend-Prüfung je weg, fällt dieser Test.

## Prüfungen
`tests/bridge-anmeldepflicht.test.mjs` 16/16 · `check:llm-router` 210/210 ·
`auth-gate` + `statusseite` + `voice-ear` 26/26 · `check:guidelines` OK.

## Live-Abnahme (negativer Weg)
| Prüfung | Ergebnis |
|---|---|
| `/api/agent` ohne Token | **401** `authentication_required` |
| `/api/chat` ohne Token | **401** |
| `/api/agent` mit erfundenem Token | **401** |
| `/health` | 200 — bleibt offen, wie gewollt |

Brücke live: `20260805-v120-anmeldepflicht-scharf`, 663 Wissensabschnitte.

## Rückbau (falls der Chat abweist)
Ein Neustart mit der vorigen Fassung genügt — das Bündel liegt im Frontend-Repo:
```
cd ~/smejj-app-frontend && git revert --no-edit 23404af && git push origin HEAD:main
```
danach
```
CONFIRM_BRIDGE_RESTART=YES node scripts/deploy/restart_chat_bridge_salad.mjs "20260805-v119-rechner-vier-arten"
```
Rollback-Punkt Frontend: `b5d13f8`. App-Repo: `7651a80` (davor `ed1f59a`).

## Nächster Schritt
Der Betreiber testet den angemeldeten Weg. Danach zeigt `anmeldung` in
`/health`, was wirklich ankommt — die Zahl, die vorher fehlte.

## Nicht erledigt
`Memory_Bank.md` konnte ich nicht ergänzen: Sie ist gerade von einer
Parallel-Sitzung in Arbeit **und** steht bei 817 Zeilen über der
800-Zeilen-Grenze. Eintrag nachziehen, sobald sie frei ist.
