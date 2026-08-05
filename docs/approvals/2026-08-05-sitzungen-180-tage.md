# Freigabe-Nachweis — Dauerhafte Anmeldung (Freigabe C), 2026-08-05

Control-Releases brauchen eine getrennt festgehaltene menschliche Freigabe
(`productionDeployAuthorized`-Regel des Release-Builders). Sie wird hier
festgehalten.

## Wortlaut des Betreibers

Dem Betreiber wurde am 2026-08-05 vorgelegt: Sitzungen laufen nach 7 Tagen ab;
Wunsch des Betreibers war "alle Login-Arten sollen eingeloggt bleiben, solange
nicht manuell abgemeldet". Vorgeschlagen wurde Option C: Sitzungsdauer 180 Tage
plus gleitende Verlaengerung bei jeder Nutzung, als Control-Release. Antwort:

```
A, B und C freigegeben
```

## Was freigegeben und gebaut wurde (C)

| Teil | Aenderung |
|---|---|
| `control-server/src/auth/sessionToken.js` | `MAX_TTL_MS` 7 -> 180 Tage |
| `src/server.js` `handleAuthMe` | legt jeder gueltigen Antwort ein frisches `accessToken` mit voller Laufzeit bei (gleitende Verlaengerung) |
| `public/account-sessions.js` (sw v223) | speichert das frische Token — nur wenn bereits ein localStorage-Token existiert; Passkey-Sitzungen (session-only) bleiben unangetastet |

Abmelden bleibt der einzige Weg raus: `logoutCurrentSession()` loescht das
lokale Token und widerruft die Server-Sitzung; `emailSessionStillValid` prueft
E-Mail-Sitzungen weiterhin serverseitig (Widerruf wirkt sofort, unabhaengig von
der Token-Laufzeit).

Kosten: 0,00 USD (keine neuen Dienste, kein neuer Anbieter).

## Sicherheitsabwaegung

- Ein gestohlenes Token lebt laenger. Gegengewichte: HttpOnly-Cookie-Weg bleibt
  7-Tage-frei rotierend ueber /api/auth/me; Sitzungs-Widerruf im Konto-Bereich
  wirkt serverseitig; Passkey bleibt bewusst session-only.
- Der Betreiber hat die Abwaegung mit Freigabe C ausdruecklich getroffen.
