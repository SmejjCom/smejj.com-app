# job_verlauf_schlank_20260820 — Verlauf schlank, und ein toter Geraete-Sync kam ans Licht

Wortgleich aus `Memory_Bank.md` ausgelagert am 2026-08-23 wegen der
800-Zeilen-Regel der Charta. Nichts geloescht, nichts gekuerzt. Die Kurzfassung
mit Verweis steht weiterhin in `Memory_Bank.md`; die Messwerte zusaetzlich in
`capsule.json`.

---

## 2026-08-20 — Verlauf schlank, und ein toter Geraete-Sync kam ans Licht (job_verlauf_schlank_20260820)

Capsule: `task-capsules/2026/08/job_verlauf_schlank_20260820/capsule.json`
(Object Brain: `s3://smejj-model-files/capsules/app/job_verlauf_schlank_20260820/`).
Tag: `stand-2026-08-20-verlauf-schlank` auf `bb7c8e1`. Frontend live: `44f35a5`.

**Entscheidung:** Die Startseite laedt den Verlauf nicht mehr als Volltext.
`/api/chats?nurAbgleich=1` liefert nur id/updatedAt/ownerId; ein Chat wird per
`?id=` einzeln nachgeholt, und zwar nur, wenn er wirklich neuer ist. Der alte
Vertrag (GET ohne Parameter) bleibt fuer aeltere Clients unveraendert.
Zusaetzlich fragt der Abgleich VOR dem Einzelabruf dieselbe Funktion, die auch
importiert (`gehoertNutzer`) — was der Import abweisen wuerde, wird gar nicht
erst geholt.

**Begruendung:** Gemessen wurden 2,50 MB je Seitenaufruf bei 88 Chats — 65 %
des Seitengewichts, und der Control Server stand damit im Pfad jedes normalen
Aufrufs (Static-First gebrochen). Zum Entscheiden braucht der Abgleich die
Nachrichten gar nicht.

**Verifikation (live, smejj.com, angemeldet, Vorrat smejj-shell-v635):**

| | vorher | nachher |
|---|---|---|
| Seitengewicht | 4.054 KB | 1.174 KB |
| Chat-Verkehr | 2.500 KB | 15 KB |
| Einzelabrufe je Aufruf | 14 bis 24 | 0 |
| Listen-Abruf | 12.100 ms | 2.330 ms |

Datenstand unversehrt: 100 Chats lokal, 100 mit Nachrichten, 0 leer, 533
Nachrichten gesamt. Tests 31/31 gruen, `check:start-lock` gruen.

**Der eigentliche Fund — NICHT behoben, entscheidungspflichtig:** Server und
Client rechnen die Kontokennung verschieden aus. Der Server stellte am
2026-08-15 auf SHA-256 um (Kollisionsleck, bewusst ohne Rueckfall), der Client
stempelt weiter nach der alten Adressregel:

    Server: user_158c1e609cc03bb4c36f70b7e059fbfd   (sha256 "email:smejjcom@gmail.com")
    Client: user_smejjcom_gmail_com

Dasselbe Konto. `gehoertNutzer` haelt die eigenen Server-Chats fuer fremd,
`importChat` gibt `false` — **der Geraete-Sync importiert nichts.** 24 Chats
wurden deshalb bei jedem Seitenaufruf einzeln geholt (~72 s, ~1 MB) und
weggeworfen. Ein Angleichen ist Rote Liste: es importiert ~92 Chats, und
`MAX_CHATS = 100` loest `pruneOld()` aus — vorhandene lokale Chats wuerden
geloescht.

**Lehre:** Der Fehler war vorher genauso da. Im 2,5-MB-Paket kamen dieselben
Chats mit und wurden ebenso abgewiesen — nur sah es niemand. Erst die schlanke
Liste machte jeden Leerabruf einzeln sichtbar. Eine Optimierung deckte einen
kaputten Kernweg auf; die Sparmassnahme meldet ihn jetzt einmal je Abgleich,
statt ihn still zu wiederholen.
