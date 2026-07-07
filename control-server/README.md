# control-server

Minimaler Steuerungsserver von smejj.com. Fuehrt KEINE rechenintensiven Prozesse aus.

## Verantwortung (Single Responsibility)

- Authentifizierung und Autorisierung
- Routing eingehender Anfragen
- Vergabe von Job-IDs
- Budgetierung und Quota-Kontrolle
- Start/Stopp der Salad Worker (stateless, on demand)
- Status-Streaming (SSE) an Clients

## Explizit NICHT hier

- Inferenz, Builds, Typechecks, Tests → Salad Worker Layer
- Persistenz von Daten, Logs, Capsules, Memory → IDrive e2 (Object Brain)

## Struktur

```text
control-server/
  src/
    auth/        # Authentifizierung, API-Keys
    routing/     # Request-Routing, Job-Dispatch
    budget/      # Budget- und Quota-Logik
    workers/     # Salad Worker Lifecycle-Steuerung
    streaming/   # SSE-Status-Streaming
  tests/
```

Regeln: siehe `../AI_Guidelines.md` (max. 800 Zeilen pro Datei, Verification Pipeline, Task Capsules).
