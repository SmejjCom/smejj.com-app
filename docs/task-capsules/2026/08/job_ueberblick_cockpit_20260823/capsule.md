# Task Capsule — job_ueberblick_cockpit_20260823

**Ziel:** „Die eine Seite, die du morgens ansiehst" (Cockpit, Startseite des Adminbereichs) nach dem Design-Vorschlag — nur gemessen.

## Gebaut (Bau-Branch 7c5900b5, Frontend bc71caf)
- `opsCockpit.morgenLage` (nur mit `mitNetz` aus der Route; Tests bleiben netzlos, Stubs 8/8):
  Nutzer (Index, +neu diese Woche), Umsatz im Monat (MRR bei Stripe), Antwortzeit (= Gesundheitsabfragen
  der Dienste, `opsAuslieferung` misst jetzt ms — ausdrücklich NICHT der Chat), Autopiloten ohne Signal
  (dieselbe Regel wie die Autopiloten-Seite).
- Dienste-Tabelle: Antwort des Dienstes neben dem letzten echten Lauf seines Wächters (Container-Puls,
  Brücken-Wächter, Augen und Ohren), plus Speicher (Schreibprobe des Nachweis-Wächters) und Nachtbau
  (Werkstatt — „kein Herzschlag, aber gelaufen").
- Protokoll (letzte 8 Audit-Einträge), Vier-Augen (offene Freigaben), roter Adminbalken, „Neu messen".
- Bestehende Blöcke (Lage, Automatiken, Speicher, „Was hier NICHT steht") bleiben. Admin-Lock 29 Dateien.

## Live-Beweis (07:16Z, keine Konsolenfehler)
Nutzer 2 · Umsatz 9,00 € (1 Abo bei Stripe) · Antwortzeit 0,9 s (langsamster smejj-video-worker, 6 Dienste) · Autopiloten ohne Signal 1 (Betriebswache) · Dienste mit letztem echten Lauf (Container-Puls vor 1 min) · Protokoll (index rebuild, user record read, step up) · Adminbalken rot. Nachbesserung: Dienste/Protokoll untereinander bis 1500 px, sonst war die Lauf-Spalte abgeschnitten.
