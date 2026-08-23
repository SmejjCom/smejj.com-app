# Task Capsule — job_umsatz_seite_20260823

**Ziel:** Seite „Abos & Umsatz" (Seite E) aus dem Design-Vorschlag — mit gemessenen Zahlen, nicht erfundenen.

## Gebaut (Bau-Branch 40b1b8e5, Frontend c3cf3e2)
- `control-server/src/admin/opsUmsatz.js` (+ Test 3/3), Route `GET /api/admin/geld/umsatz`:
  - MRR aus aktiven Stripe-Abos (je Posten auf den Monat gerechnet, Testmodus getrennt); ohne Stripe
    „geschätzt aus Planpreisen" — und so beschriftet.
  - Aufladungen/Guthaben aus Modul G (API), feste Kosten aus der Kostenpolitik (6 USD), Modellkosten
    aus dem Token-Messer **seit Neustart** (kein Monatswert), „Bleibt übrig" = MRR + Aufladungen − feste Kosten.
  - Umsatz je Plan = Zahlende × Planpreis (9/19/39 €); Absprünge = Kündigungen zum Periodenende;
    Zahlungsweg: Stripe-Schlüssel, Webhook-Geheimnis, offene Rechnungen (Stripe), Handlungsbedarf.
  - „Was hier NICHT gemessen wird": Punkte je Plan, Marge je Plan, Absprung-Gründe, Modellkosten je Monat.
- Seite E heißt jetzt „Abos & Umsatz" (views-stage7); Vorgänge-Tabelle bleibt. Admin-Lock 27 Dateien.

## Live-Beweis (07:05Z, keine Konsolenfehler)
MRR 9,00 € (1 aktives Abo bei Stripe gemessen) · Aufladungen 0,00 USD (Guthaben 1,00) · Kosten 6,00 USD/Monat, Modelle seit Neustart 0,00 · Bleibt übrig 3,00 (Währungen 1:1, so beschriftet) · Je Plan: plus 1/1 zu 9,00 € · Zahlung: Schlüssel + Webhook-Geheimnis gesetzt, 0 offene Rechnungen, 1 Vorgang mit Handlungsbedarf (plus-Abo ohne Konto, bezahlt als 7shahnazaryan@gmail.com).
