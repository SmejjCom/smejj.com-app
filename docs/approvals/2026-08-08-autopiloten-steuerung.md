# Freigabe: Autopiloten-Steuerung (2026-08-08)

## Wortlaut des Betreibers

> **„Freigabe: Autopiloten-Steuerung (Start/Pause) als schreibende Adminaktion
> mit Step-up-Code und Audit-Eintrag; admin lock v1 danach neu einfrieren."**

## Was daraus geworden ist — und warum nicht wörtlich „Start/Pause"

Vor dem Bauen wurde nachgesehen, was der Control-Server tatsächlich fernsteuern
kann. Ergebnis aus der Salad-Umgebung (92 Werte, am 2026-08-08 gelesen):

| Zugang | vorhanden? | Folge |
| --- | --- | --- |
| `SALAD_API_KEY` | ja | steuert den Container, auf dem der Server **selbst** läuft |
| Zeabur-Token | **nein** | Brücken-Wächter und Training-Loop nicht steuerbar |
| claude.ai-Token | **nein** | Konkurrenz-Radar nicht steuerbar |
| Fernzugriff auf den Mac | **nein** | die beiden cron-Automatiken nicht steuerbar |

Ein „Start"-Knopf hätte also bei **fünf von sieben** Autopiloten nichts
gestartet. In einer Ansicht, deren erster Satz „Grün ist gemessen, nie
behauptet" lautet, wäre eine Attrappe der schlimmste Baustein — sie hätte genau
das Vertrauen zerstört, das die Ampel aufbaut.

Geliefert wurden deshalb die zwei Aktionen, die der Server **wirklich**
ausführen kann, beide unter der freigegebenen Sicherheitskette:

1. **Wartung ein/aus** (jeder Autopilot) — schaltet eine Automatik stumm, von
   der man weiß, dass sie gerade absichtlich stillsteht. Die Ampel zeigt
   „Wartung" statt Rot, die Alarm-Mail bleibt aus. Das ist die „Pause" aus der
   Freigabe, bezogen auf die Überwachung statt auf den fremden Dienst.
   **Warum das gebraucht wird:** Ohne diesen Knopf bleibt bei einem bewusst
   abgeschalteten Dienst nur, den Alarm zu ignorieren — und eine Ampel, die man
   ignorieren lernt, ist keine Ampel mehr.
2. **Jetzt prüfen** (nur Brücken-Wächter) — fragt ihn sofort ab, statt auf den
   5-Minuten-Takt zu warten. Er ist der einzige Autopilot mit einer Adresse,
   die dieser Server erreichen kann.

Für alles andere bleibt die Klartext-Anleitung stehen („So startest du ihn von
Hand: …") — sie funktioniert und lügt nicht.

## Sicherheitskette, wie freigegeben

- **Frische Rolle:** `resolveAdminActor` mit bestätigter E-Mail-Adresse.
- **Neue Berechtigung `ops.write`:** owner und admin dürfen, support/finance/
  auditor/readonly nicht. Bewusst enger als `ops.read` — ein Auditor, der einen
  Alarm stummschalten könnte, wäre ein Widerspruch in sich.
- **Step-up:** ohne frisches Bestätigungsfenster antwortet die Route 403.
  Stummschalten ist das perfekte Werkzeug, um einen Einbruch unsichtbar zu
  machen; genau deshalb steht der zweite Faktor davor.
- **Pflichtgrund** (mindestens 10 Zeichen) bei jeder Wartungsänderung — sonst
  ist sie im Nachhinein nicht von einem Versehen zu unterscheiden.
- **Audit-Eintrag** für jede Aktion (`autopilot.wartung.ein`,
  `autopilot.wartung.aus`, `autopilot.pruefen`) mit Akteur, Ziel und Grund.

## Geänderte Dateien

| Datei | Änderung |
| --- | --- |
| `control-server/src/routes/adminAutopilotAktionen.js` | **neu** — die Route |
| `control-server/src/admin/adminRoles.js` | neue Berechtigung `ops.write` (im Lock) |
| `control-server/src/routes/adminSurfaceRoutes.js` | Route eingehängt, VOR der lesenden Ops-Route (im Lock) |
| `control-server/src/admin/opsAutopiloten.js` | Wartungszustand, Ampelfarbe „wartung", Persistenz |
| `control-server/admin-ui/views-stage9.js`, `console-stage9.js`, `console.css` | Knöpfe und Dialoge |
| `scripts/check-admin-lock.mjs` | neue Route in die Schutzliste aufgenommen |

## Nachweise

- 41 Tests grün, darunter: ohne Step-up passiert nichts; ein Auditor wird
  abgewiesen; ein zu kurzer Grund wird abgewiesen; unbekannte Kennung 404.
- `check:release-imports` OK (192 Dateien).
- **Admin-Lock neu eingefroren** mit obigem Wortlaut: 15 Dateien (vorher 14),
  Manifest `docs/security/admin-lock-manifest.json`.

## Rücknahme

Route aus `adminSurfaceRoutes.js` aushängen und `ops.write` aus `adminRoles.js`
entfernen; danach Lock erneut einfrieren. Die Ampel bleibt ohne die Knöpfe
vollständig funktionsfähig — sie war es vorher auch.
