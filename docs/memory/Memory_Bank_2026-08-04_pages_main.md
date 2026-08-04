# Memory_Bank — Volltext: GitHub Pages baut aus `main` (job_verlauf_selbstheilung_20260803)

Aus Memory_Bank.md ausgelagert am 2026-08-04 (800-Zeilen-Regel). Inhalt unveraendert.

- ERLEDIGT + LIVE ABGENOMMEN: sw v209 liefert die Selbstheilung des
  Chat-Verlaufs aus. Beweis am Live-Buendel: `assets/chat-store.js` traegt
  `ensureStore` 2x und `openAt` 1x, das alte `indexedDB.open(DB_NAME,
  DB_VERSION)` kommt **0x** vor. Frontend `main` 3c18f58 -> 232d0b3.
- DIE HEILUNG IST LIVE GELAUFEN, im angemeldeten Browser gemessen:
  `dbVersion: 2`, `stores: ["chats"]`, 8 Nachrichten gespeichert UND beim
  Neuladen alle 8 wiederhergestellt. Version 1 war der kaputte Stand — die 2
  beweist, dass `openDb()` den fehlenden Speicher erkannt und eine Version
  hoeher nachgezogen hat. Ohne den Fix waere dieses Profil dauerhaft tot.
- A-BIS-Z GEPRUEFT (angemeldet): Chat korrekt, Gespraechsgedaechtnis loest
  „diese Stadt" -> Portugal, Verlauf-Seite mit Loeschen, Split-View haelt beim
  Klick ins Schreibfeld, linkes Menue dunkelt weiter ab, Modellwahl zeigt 5
  Modelle, KEINE Konsolenfehler. Dazu 14/14 oeffentliche Seiten 200,
  **107/107 Precache-Dateien 200**, Betriebsstatus „Alle Dienste laufen".
- MERKREGEL (Fehlalarm vermieden): Ein Klick ins Schreibfeld schloss das Panel
  und `elementFromPoint` traf `sidebarBackdrop` — sah nach Rueckfall der
  Backdrop-Regression aus. `body.className` war aber nur `right-panel-open`
  OHNE `browser-pane-open`: „Browser oeffnen" oeffnet erst den generischen
  Panel-WAEHLER (dort ist Wegklicken gewollt), erst der Eintrag „Browser" darin
  den echten Split-View. **Vor jedem Regressionsbefund `body.className`
  pruefen — zwei Panels teilen sich dasselbe Backdrop.**
- BEOBACHTUNG (fremde Spur): „Auf welchen Servern laeuft das?" -> „auf eigenen
  Servern mit modernen Cloud-Technologien". Projektwissen kennt die echte
  Antwort (IDrive e2 / GitHub Pages / Zeabur / Salad), RAG griff nicht.
- NACHGEMESSEN (5 Laeufe, vorher UND nachher): kein Budget verschlechtert.
  Seitengewicht kalt 308 KB vorher wie nachher — der Fix waechst um ~1,5 KB,
  zaehlt im Erstbesuch aber nicht mit (chat-store.js ist ein Nachlade-Modul).
  Bewegung bei LCP/TTFB ist Streuung (kalt 84-576 ms Einzelwerte), kein Signal.
- WURZEL, teuer gemessen: Ein Push auf den Deploy-Branch
  `deploy-voice-send-20260721-rebased` aendert die WEBSITE NICHT. Pages baut im
  Repo `smejj-app-frontend` aus **`main`**. Belegt mit `git ls-remote --heads`:
  `main` stand auf `3c18f58` (= das live laufende sw v208), mein Push lag auf dem
  Arbeits-Branch. Live blieb 220 s lang unveraendert — kein Bau-Fehler, sondern
  der Ursprung selbst war nie angefasst worden.
- MESSFALLE dabei: Der Antwortkopf zeigte `age: 507` bei `max-age=600`. Das sieht
  nach "CDN haelt noch die alte Kopie" aus und kostete Wartezeit — der Cache lief
  ab, ohne dass sich etwas aenderte. **Ein ablaufender CDN-Cache beweist nichts
  ueber den Ursprung.** Erst `git ls-remote` gegen die Live-Datei haelt.
- WEG: Nach dem Commit auf dem Deploy-Branch zusaetzlich
  `git push origin <commit>:main` — ein reiner Fast-Forward
  (`git merge-base --is-ancestor origin/main <commit>` vorher pruefen). Kein
  Merge, kein Rewrite. In der Sitzung 2026-08-04 hat der Berechtigungs-
  Klassifikator diesen Push blockiert; er ist dem Betreiber vorzulegen.
- FALLE beim Auslieferungs-Umfang: `smejj.com Deploy.command` kopiert
  EINZELNE Dateien per `cp`. Wer eine Datei aendert, die dort nicht gelistet ist,
  deployt sie nicht — v208 ging deshalb ohne `chat-store.js` live, obwohl der Fix
  laengst committet war. Nach jedem Deploy die geaenderte Datei LIVE nachlesen.
- MERKREGEL: 5 Tests fordern `CACHE_NAME` woertlich ein (`deferred-start`,
  `platform-pwa`, `chat-code-copy`, `system-status-text`, `profile-dock`). Ein
  Cache-Sprung ohne sie ist rot — das ist Absicht, kein Hindernis.
- MESSUNG (Live v208, 5 Laeufe): TTFB 16 ms, LCP 176/140 ms, CLS 0, INP 56/48 ms
  — alle weit im Budget. **Seitengewicht kalt 308 KB gegen Budget 300 KB:
  VERFEHLT, vorbestehend.** Warm 40 KB. Eigener Auftrag noetig.
  Beleg: docs/benchmarks/webvitals_verlauf_selbstheilung_2026-08-04.json
