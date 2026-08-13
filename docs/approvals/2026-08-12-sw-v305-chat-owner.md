# Freigabe: sw.js v304 → v305 (Chat-Verlauf-Sofortschutz)

**Datum:** 2026-08-12 · **Betreiber-Entscheidung:** Option „Stufe 1 jetzt bauen —
… und deploye — inkl. des noetigen sw-Sprungs, wenn du ihn freigibst" wurde in
der Claude-Sitzung ausdrücklich ausgewählt.

**Umfang im Repo smejj-app-frontend, Datei sw.js (Live-Basis):**
1. `CACHE_NAME`: `smejj-shell-v304` → `smejj-shell-v305`
2. EINE neue Precache-Zeile: `"/assets/chat-owner.js"` (neues Modul; ohne
   Precache wäre der Verlauf offline tot, weil chat-store.js es importiert)

**Zweck:** Stufe 1 aus docs/verlauf-pro-konto-plan.md — meldet sich ein
anderes Konto am selben Browser an, wird der fremde Chat-Verlauf geleert
statt angezeigt (Datenschutz, Marktstart-Blocker).

**Grenze:** Einmalig für genau diese zwei Änderungen.
