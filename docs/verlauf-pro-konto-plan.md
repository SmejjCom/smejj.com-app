# Plan: Chat-Verlauf ans Konto binden

**Stand:** 2026-08-12 · **Befund:** Der Verlauf (IndexedDB `smejj-chats`, siehe
`public/chat-store.js`) haengt am GERAET. Live bewiesen: Ein zweites Konto am
selben Browser sieht die Chats des ersten. Claude/ChatGPT/Gemini binden den
Verlauf serverseitig ans Konto.

## Stufe 1 — Sofortschutz: Kontowechsel leert fremden Verlauf (VOR Marktstart)

Ein Merker `smejj.chat.owner.v1` = userId des Verlaufsbesitzers.
Beim App-Start mit Sitzung: userId ≠ Besitzer → IndexedDB `smejj-chats` +
Aktiv-Marker loeschen, Besitzer neu setzen. Gleicher Nutzer ueber Google UND
Magic-Link bleibt derselbe Besitzer (userId ist aus der E-Mail abgeleitet).

- Einbau in `chat-store.js` (NICHT Start-Lock) beim Restore-Pfad.
- Fail-safe wie alles dort: Fehler → nur kein Loeschen, Chat laeuft weiter.
- chat-store.js ist precacht → braucht CACHE_NAME-Sprung (eigene Freigabe).
- Aufwand: 1–2 Stunden inkl. Test. Verlust-Risiko: nur fuer den JEWEILS
  ANDEREN Nutzer — genau das ist der Zweck.

## Stufe 2 — Verlauf pro Konto lokal getrennt (statt geleert)

Jedes Chat-Objekt bekommt `ownerId`; Laden/Listen filtert auf die aktive
userId (eine DB, neuer Index — Migration: Bestandschats gehoeren dem ersten
angemeldeten Nutzer). Kontowechsel am selben Geraet verliert dann NICHTS mehr,
jeder sieht nur seins. Aufwand: ~1/2 Tag. Ersetzt die Loesch-Logik aus Stufe 1
(der Besitzer-Merker bleibt als Migrationshelfer).

## Stufe 3 — Server-Sync = Claude-Niveau (Verlauf auf jedem Geraet)

- Control-Server: `GET/PUT /api/chats` (Bearer), Ablage e2-Bucket `smejj-app`
  unter `chats/<userId>/<chatId>.json` (Bucket-Regeln beachten: der Server
  schreibt, also Hauptbucket; `timeoutMs` setzen — S3-Schreibwege ohne
  Zeitlimit scheitern still).
- Client: Push im vorhandenen Save-Debounce (600 ms), Pull bei Login/Start;
  Konflikt: hoeheres `updatedAt` gewinnt; Obergrenzen wie lokal (100 Chats,
  8 Fassungen) plus Groessendeckel pro Chat.
- Datenschutz: Chats liegen dann beim Anbieter — Datenschutzerklaerung
  ergaenzen; Loeschen-im-Konto muss auch den Server-Stand loeschen.
- Feature-Schalter, damit lokal-first (heutiges Verhalten) abschaltbar bleibt.
- Aufwand: 1–2 Tage + Livetest ueber zwei Geraete.

## Empfehlung

Stufe 1 sofort (Marktstart-Blocker, Datenschutz), Stufe 2 direkt danach,
Stufe 3 als eigener Meilenstein nach dem Marktstart.
