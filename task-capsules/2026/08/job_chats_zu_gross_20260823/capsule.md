# job_chats_zu_gross_20260823 — Zehn Chats waren nicht gesichert, Bestand gerettet

Wortgleich aus `Memory_Bank.md` ausgelagert am 2026-08-23 wegen der
800-Zeilen-Regel der Charta. Nichts geloescht, nichts gekuerzt. Die Kurzfassung
mit Verweis steht weiterhin in `Memory_Bank.md`; die Messwerte zusaetzlich in
`capsule.json`.

---

### [2026-08-23] ZEHN CHATS WAREN NICHT GESICHERT — BESTAND GERETTET (job_chats_zu_gross_20260823)

Capsule: `task-capsules/2026/08/job_chats_zu_gross_20260823/capsule.json`.
App-Repo `8f9a4ef3`, `b151770c`, `ed73fb6e`. Frontend `e2b5ccb`, `4acfd9f`, `722fe06`.
sw v652 -> v655.

**Ausgangslage:** 113 Chats, Median 7 KB, aber zehn ueber der 512-KB-Grenze und
damit seit Wochen NUR auf einem Geraet. Nie zu viel Text — immer ein Medium,
dreifach abgelegt (text, html, raw).

**DREI Befunde nacheinander, jeder erst durch den Live-Test sichtbar. Das ist
die eigentliche Lehre: die ersten beiden Fixes waren richtig und haetten
trotzdem nichts bewirkt.**

1. Der Fix vom 22.08. lagert Medien beim SPEICHERN aus — er wirkt nur
   vorwaerts. Ein alter Chat wird nie neu gespeichert und bleibt liegen.
   → `public/chat-medien-rettung.js` rettet bei Abweisung und sendet erneut.
2. Der Server hat ZWEI Grenzen, nur eine meldet sich ordentlich:
   512 KB-1 MB gibt `400 chat_zu_gross`, ueber 1 MB gibt `500 Request too
   large` (Body-Leser, `maxJsonBodyBytes`, greift VOR der Chat-Pruefung).
   `chat-sync.js` behandelte nur 4xx — SECHS der zehn lagen im blinden Fleck
   und waren nicht nur ungerettet, sondern unsichtbar.
   → `istZuGross(status, grund)` deckt beide Absagen und 413 ab.
3. Die Rettung haengt am Sende-Weg. `push()` arbeitet 113 Gespraeche der Reihe
   nach ab; nach gut einer Minute war genau EINER gerettet. Wer die App kurz
   oeffnet, kommt nie bei seinem Bestand an.
   → `raeumeBestandAuf()` sucht die betroffenen Chats direkt, hoechstens
   einmal am Tag, 12 s nach dem Start, Deckel bei 25 je Lauf.

**Verifikation (live, angemeldetes Konto):** 11.534 KB -> 51 KB ueber alle
zehn, kein einziges "gescheitert"; Konto gesamt 15.076 -> 3.593 KB bei
unveraendert 113 Chats, 0 ueber der Grenze. Die fuenf groessten per PUT
gesendet: HTTP 200 `ok:true`, Schluessel unter `chats/user_158c1e6…`. Die
ausgelagerten Medien danach abgerufen: video/mp4 480 KB, image/png 384 KB,
video/mp4 144 KB — alle 200. Der Bestandslauf laeuft nach dem Neuladen von
selbst (Merker gesetzt, je genau eine Modulfassung geladen). `check:frontend`
611/611, module-queries 185, markenkette 97, precache 154. Keine
Konsolenfehler.

**Abstimmung mit der Parallelsitzung** (die den 22.08.-Fix gebaut hat): mein
Muster erfasste auch `audio`, der Server kennt in `ERLAUBTE_TYPEN` nur png,
jpeg, webp, mp4, webm. Uebernommen — sonst meldet `brauchtRettung()` "ja",
die Rettung laeuft an und bewirkt nichts. Ein Waechter haelt die drei Stellen
(Server, `chat-medien.js`, `chat-medien-rettung.js`) jetzt zusammen.

**Offen, bewusst nicht behoben:** das `500` fuer "Request too large" ist die
falsche Fehlerklasse — 413 waere richtig. `src/server.js` gehoerte waehrend
der Arbeit einer Parallelsitzung, und das Frontend faengt beide Formen
ohnehin ab.

**VIERTER und FUENFTER Befund, 2026-08-23 nachmittags.** Capsule:
`task-capsules/2026/08/job_verlauf_vorsorge_20260823/capsule.md`. sw v655 -> v657.

4. Die Rettung ist REAKTIV. Vier Chats (466/293/280/263 KB) liegen UNTER der
   Grenze, werden nie abgewiesen und darum nie gerettet — obwohl jeder ein
   Video im `raw` traegt (bei 466,3 KB sind 464,6 KB genau das).
   → `VORSORGE_BYTES = 128 KB`, NUR fuer den Bestandslauf.
5. `updatedAt` traegt ZWEI Bedeutungen: "zuletzt bearbeitet" (Sortierung) und
   "zuletzt geaendert" (Sync). `speichereChat` ueberspringt bei GLEICHEM Wert —
   der geheilte Chat schrumpfte lokal auf 2 KB und blieb serverseitig 466,6 KB.
   Wer `updatedAt` unberuehrt laesst, hat fuer die Sortierung recht und fuer den
   Sync unrecht. → `naechsterZeitstempel()`: EINE Millisekunde, kein `new Date()`.

**Live:** Konto 3.968,3 -> 2.952,3 KB. Video im geretteten Chat geladen
(640x640, 4 s) bei 2 KB Chatgroesse. Kein Toast, TTFB 2 ms / LCP 80 ms / CLS 0.

**Lehre (Doppelarbeit):** Eine zweite Sitzung loeste dasselbe am selben Tag,
gruendlicher. Sie mass LOKAL im Browser, ich serverseitig — dort sieht man nur,
was durchkam; das Problem ist definitionsgemaess das, was fehlt. Meine Fassung
wurde verworfen statt gemergt (`claude/verworfen-doppelarbeit-20260823`).
