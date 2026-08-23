# Task Capsule — job_nutzer_seite_20260823

**Ziel:** Seite „Nutzer — und die Zeile, die euch mal Stunden gekostet hat" (Seite B) mit echten Daten.

## Gebaut (Bau-Branch b22c33bc, Frontend e64083a)
- `control-server/src/admin/opsNutzerLage.js` (+ Test 5/5), Route `GET /api/admin/users/lage` (users.read):
  Nutzer-Index verknüpft mit Abos (`paidEmail` neu in `opsAbrechnung.aufbereiten`) → Spalte **„bezahlt als"**;
  Abos ohne Konto stehen oben mit zahlender Adresse und nächstem Schritt; Verbrauch je Einweg-Kennung
  (`authenticatedUserId`) seit Neustart; „zuletzt" aus neuem Index-Feld `lastSeenAt` (userIndex.js, erst nach Neubau).
- Kennzahlen: Konten gesamt (+neu diese Woche), zahlend, heute aktiv, zwei Adressen.
- Ansicht B in views.js umgebaut; Aktionsliste nennt nur, was die Akte wirklich kann; „nie in fremde Gespräche schauen".
- Admin-Lock 26 Dateien.

## Live-Beweis (06:53Z, Hard-Reload, keine Konsolenfehler)
2 Konten · zahlend 1 · **„1 bezahlte Abo(s) passen zu keinem Konto — plus, bezahlt als 7shahnazaryan@gmail.com"** —
genau der Fall aus der Geschichte, jetzt als erste Zeile sichtbar. Spalten Konto · Angemeldet mit (Google) ·
Bezahlt als · Plan · Verbrauch seit Neustart · Zuletzt.

## Offen
- „Zuletzt"/„heute aktiv" füllen sich erst nach dem nächsten Index-Neubau (Feld neu).
- Abo „plus" hängt an 7shahnazaryan@gmail.com statt smejjcom@gmail.com — Betreiber-Entscheidung: Abo umhängen oder mit der Adresse anmelden.
