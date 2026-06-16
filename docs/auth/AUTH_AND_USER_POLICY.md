# Auth and User Policy

## Grundsatz

smejj.com behandelt Konto- und Session-Funktionen local-first und fail-closed. Ohne gepruefte Auth darf keine serverseitige Nutzeraktion, kein IDrive-e2-Schreibzugriff und kein kostenpflichtiger Provider aktiviert werden.

## Erlaubt

- Lokales Nutzer-Manifest im Browser fuer Offline-Arbeit.
- Sichtbarer Session-Status in der App.
- Logout ohne Datenverlust.
- Google Login nur, wenn Client-ID und serverseitige Pruefung korrekt konfiguriert sind.
- Team-faehige Rollen als Datenmodell: `owner`, `editor`, `viewer`, `local-only`.

## Verboten

- Keine Secrets im Browser.
- Keine IDrive Master Keys im Client.
- Keine API-Keys im Repo.
- Keine BYOK-Keys dauerhaft unverschluesselt speichern.
- Kein Paid-Fallback.
- Keine Trial- oder Auto-Billing-Dienste.
- Keine Veroeffentlichung ohne schriftliche Freigabe.

## Fail-Closed-Regeln

- Fehlende Auth blockiert serverseitige Projektrechte.
- Unklare Session blockiert Online-Aktionen.
- Fehlende Provider-/Quota-Konfiguration blockiert KI- und Sync-Aktionen.
- Lokale Offline-Projekte bleiben nutzbar, solange keine Serverrechte behauptet werden.

## Datenmodell

- User Manifest: lokale Identitaet, Rolle, keine Secrets.
- Workspace Manifest: Projektbezug, Offline-Faehigkeit, Browser-Cache-Status.
- Provider Settings: BYOK getrennt, Default `disabled`.
- Local Settings: Offline-Modus, Loeschbestaetigung, keine Secrets.
- AI Mode Settings: Default `disabled`, kein automatischer Paid-Modus.
