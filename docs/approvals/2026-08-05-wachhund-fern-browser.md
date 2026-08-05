# Freigabe — Wachhund für die zwei Fern-Browser-Dienste

**Datum:** 2026-08-05
**Betreiber-Freigabe im Wortlaut:**

> FREIGABE — Wachhund für die zwei Fern-Browser-Dienste, 2026-08-05
>
> Ich gebe frei, bei den beiden Salad-Diensten smejj-remote-browser-bridge-live
> und smejj-remote-browser-live eine Start- und eine Lebendsonde einzurichten.

## Anlass

Beim A-bis-Z-Test am 2026-08-04 war der Fern-Browser **tot, ohne dass es jemand
merkte**: der Container lief (`running`, `running_count: 1`), die App darin
antwortete mit HTTP 503. Erst ein Handtest deckte es auf.

Nachgemessen: von fünf laufenden Diensten hatten genau diese zwei **gar keine**
Sonden.

```
smejj-control                      startup, liveness
smejj-chat-bridge-v88b-live        startup, liveness
smejj-fast-1                       startup, readiness, liveness
smejj-remote-browser-bridge-live   KEINE
smejj-remote-browser-live          KEINE
```

## Korrektur am ursprünglichen Vorschlag

Zuerst war geplant, die **TCP-Sonde** der funktionierenden Dienste zu kopieren.
Das wäre **wirkungslos** gewesen: eine TCP-Sonde prüft nur, ob der Anschluss
offen ist. Der tote Dienst *hat* geantwortet — mit 503. Anschluss offen, App
tot, Sonde zufrieden.

Beide Dienste haben eine echte Gesundheitsauskunft (gemessen vor dem Eingriff):

```
loganberry-fruit-…/health  HTTP 200  { "ok": true, "app": "…remote-browser-bridge" }
cherry-wasabi-…/health     HTTP 200  { "ok": true, "app": "…remote-browser-worker" }
```

Gesetzt wurden deshalb **HTTP-Sonden auf `/health`**. Alles außer 2xx zählt als
Ausfall — genau der Fall vom 2026-08-04.

## Prüfung VOR dem Eingriff

Beide Dienste laden ihr Programm **beim Start frisch aus dem Netz**. Ein
Wachhund, der in einen kaputten Startbefehl neu startet, wäre schlimmer als gar
keiner. Deshalb zuerst nachgewiesen, dass ein Neustart trägt:

- Bridge: `raw.githubusercontent.com/SmejjCom/smejj-app-frontend/main/assets/remote-browser-bridge.js`
  → HTTP 200, 11 058 Bytes, Syntax geprüft. **Nicht auf einen Commit fixiert** —
  ein Neustart holt, was gerade auf `main` liegt (siehe Restrisiko).
- Worker: Bootstrap auf Commit `0bb7eb58` fixiert, HTTP 200, 2 398 Bytes.
  Der Startbefehl prüft `sha256 = c938863d…5efb`; gemessen **identisch**. Bei
  Abweichung würde der Worker den Start verweigern.

Vollständige Sicherung beider Dienst-Definitionen vor dem Eingriff angelegt.

## Werte

| | Startsonde | Lebendsonde |
|---|---|---|
| Ziel | `GET /health`, Port 8080 | `GET /health`, Port 8080 |
| Verzögerung | 0 s | 60 s |
| Abstand | 20 s | 30 s |
| Zeitlimit | 10 s | 15 s |
| Fehlversuche bis Eingriff | 15 (= bis 5 min Startzeit) | 4 (≈ 2 min Dauerausfall) |

Der Schwellwert darf bei Salad höchstens 20 sein — der erste Versuch mit 30
wurde mit HTTP 400 abgelehnt und hat nichts verändert. Die fünf Minuten sind
deshalb über den Abstand erreicht, nicht über die Anzahl.

Ein kurzes Stolpern löst nichts aus: erst rund zwei Minuten ununterbrochener
Ausfall führen zum Neustart.

## Nachweis

- PATCH nur mit den zwei Sondenfeldern; `container` **nicht** angefasst.
  Nach jedem Eingriff geprüft: Umgebungswerte und Startbefehl unverändert
  (Bridge 6 Werte, Worker 10 Werte). Siehe [[smejj-salad-patch-ersetzt-env]].
- Nach dem Setzen je Dienst rund fünf Minuten beobachtet: Startzeit,
  Zustand und externe Antwort.

## Rücknahme

`node sonde-zuruecknehmen.mjs <dienstname>` setzt beide Sondenfelder auf `null`.
Keine Code-Änderung, kein neuer Dienst, keine neuen Kosten.

## In Kauf genommen (vom Betreiber ausdrücklich)

- Ein automatischer Neustart bricht eine gerade laufende Fern-Browser-Sitzung ab.

## Restrisiko

Der Bridge-Startbefehl zieht `main` **unfixiert**. Wird dort eine defekte
`remote-browser-bridge.js` veröffentlicht, startet der Wachhund den Dienst
wiederholt in genau diesen Defekt. Vorher war der Defekt erst beim nächsten
Neustart sichtbar — die Sonde macht ihn schneller sichtbar, nicht schlimmer.
Ein Fixieren auf einen Commit wäre eine eigene Änderung und eigene Freigabe.
