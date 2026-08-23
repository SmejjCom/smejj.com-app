# Task Capsule — job_sicherheit_seite_20260823

**Ziel:** Seite „Sicherheit — Sperren, Vier-Augen, Zugänge" aus dem Design-Vorschlag mit echten Daten (Seite L).

## Gebaut (Bau-Branch bb43d1e4 + a7550142, Frontend d993873 → 7a16359)
- `control-server/src/admin/opsSicherheitsLage.js` (+ Test 4/4): Endpunkte gegen die Erlaubnisliste gezählt
  (31 von 57 bekannten API-Pfaden geschlossen, 26 offen mit Grund), Sperren byte-genau im Abbild (4/4),
  offene Vier-Augen-Anträge mit Wartezeit, Zugänge nur als gesetzt/fehlt mit Nachweis (IDrive-Schreibprobe
  vom Nachweis-Wächter, Anzahl Autopilot-Kennungen) — Werte verlassen den Server nie (Test prüft es).
- Route `/api/admin/sicherheit/lage` (Leserecht audit.read — erster Live-Test gab 404, weil die
  Rechtetabelle den Bereich nicht kannte; behoben a7550142). Ereignisse (Audit-Linse) bleiben darunter.
- Admin-Lock 25 Dateien.

## Live-Beweis (06:33Z, Hard-Reload, keine Konsolenfehler)
Endpunkte 31/57 · Sperren 4/4 · Vier-Augen 0 · Zugänge 7/12, alle Pflichtwerte da; IDrive-Schreibprobe
erfolgreich 06:30:37Z; 6 Autopilot-Kennungen.

## Zwischenfälle im Ship-Loop
- GitHub-API-Drossel (60/h unangemeldet) durch meine Bau-Abfragen → Pre-Push-Wächter blockierte 20 min.
- Parallelsitzung (Frontend 0c84b93, Modul G) hatte 37 Konsolen-Dateien auf einen älteren Stand
  zurückgesetzt (Autopiloten-Umbau, Auslieferung, Sicherheit weg). Aus der Quelle (Bau-Branch HEAD)
  komplett neu gespiegelt (7a16359) — beide Arbeiten sind jetzt live.
