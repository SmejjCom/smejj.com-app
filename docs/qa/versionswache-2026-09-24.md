# Versionswache ab 24.09.2026 (Fortsetzung von app-a-bis-z-2026-09-19.md, das an die 800-Zeilen-Grenze kommt)

## v978 — IndexedDB-Lesefehler abgefangen (Sitzung „Browser smejj", Betreiber 24.09.: „baue das Abfangen des IndexedDB-Fehlers ein")

- **Anlass:** Autopilot Nr. 50 Fehler-Fänger rot — 3× „Unhandled rejection: Failed to read large IndexedDB value" in 24 h
  (ohne Quelle; zeitlich passend zu zwei Emulator-Abstürzen der Wache — Chrome verliert dabei ausgelagerte große Werte).
- **Ursache im Code:** `chat-store.js` `tx()` bekam bei Lesezugriffen das innere Promise der Leseanfrage zurück. Scheitert das
  Lesen, lehnen inneres Promise UND Transaktion ab; abgefangen wurde nur die Transaktion → „Unhandled rejection".
- **Fix:** eine Zeile `result?.catch?.(() => {})` in `tx()`; der Verlauf fällt bei Lesefehler leer bzw. `getChat` → `null`,
  statt zu werfen. Test in `tests/chat-store-selbstheilung.test.mjs` mit nachgebautem Lesefehler (ohne Fix rot, mit Fix grün).
  Markenkette mit `marken-heilen.mjs` der Auth-Sitzung geheilt (Marken in index.html, willkommen.html, app.js und den
  Importeuren von chat-store.js), Start-Lock mit Betreiber-Wortlaut gestempelt.
- **Auslieferung:** Kaskade `~/smejj-messwerkzeug/runde-idb.sh` (Vorlage runde27.sh), aufgesetzt auf v977; Anker
  `schutz-100-2026-09-24-app-v978` (App 4970ec98, Bau 9886bffd, Frontend 9c515ba). Offline-Liste live vollständig,
  Schutz-Echtheit 48/48.
- **Live-Beweis Android (Emulator, v978 allein aktiv):** Live-Modul `chat-store.js?v=g20260924012606-2-3` trägt den Fix.
  `IDBObjectStore.get/getAll` künstlich mit „UnknownError: Failed to read large IndexedDB value" scheitern lassen →
  `listChats()` 0 Einträge, `getChat()` null, **0 unbehandelte Ablehnungen**; danach wieder 54 Chats.
- **iPhone (App):** Verlauf lädt normal (206 Gespräche), keine Störung.
- **Nr. 50** wird grün, sobald die drei Alt-Meldungen aus dem 24-h-Fenster fallen.
