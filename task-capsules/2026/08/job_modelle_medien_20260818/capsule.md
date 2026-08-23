# job_modelle_medien_20260818 — Modell-Menue, Bilder, Video und Auto-Router

Wortgleich aus `Memory_Bank.md` ausgelagert am 2026-08-23 wegen der
800-Zeilen-Regel der Charta. Nichts geloescht, nichts gekuerzt.
Kurzfassung mit Verweis steht weiterhin in `Memory_Bank.md`; die Messwerte stehen zusaetzlich in `capsule.json`.

---

### [2026-08-18] MODELL-MENUE, BILDER, VIDEO UND AUTO-ROUTER (job_modelle_medien_20260818)

Capsule: `task-capsules/2026/08/job_modelle_medien_20260818/capsule.json`
(Object Brain: `s3://smejj-model-files/capsules/app/job_modelle_medien_20260818/`).
Rollback `stand-2026-08-17-v545` -> abgenommen `stand-2026-08-18-v546`.
Live: `smejj-shell-v578`, `code-flaeche.js?v=40`, Control-Bau 2026-08-18T00:42Z.

Sechs Fehler, jeder live an der Produktionsdomain nachgewiesen:

- **Eine Rate-Bremse fuer teure UND billige Wege.** `/status`, `/models` und
  `/chat` teilten einen Eimer (capacity 12, refill 0,2/s); `/chat` kostet 2
  Marken. Nach sechs Nachrichten bekam das Modell-MENUE 429 — und der Code las
  das als "kein Key". Fix: getrennte `leseGate` (60 / 1 pro s) fuer die
  GET-Wege, Menue merkt sich Status und Katalog, 429 wird ehrlich gemeldet und
  selbst nachgeladen. Nachweis: 30x `/models` = 0x 429; mit leergefahrener
  Chat-Bremse (200x6, dann 429,429) zeigte das Menue trotzdem alle 16 Modelle.
  **Merkregel: eine Bremse nie ueber teure und billige Wege legen — der Nutzer
  erlebt den Ausfall dort, wo niemand die Ursache vermutet.**
- **600-Zeichen-Falle bei Bildauftraegen.** `istMedienAuftrag()` warf jeden
  Auftrag ueber 600 Zeichen auf den Textweg; die Weiche sitzt vor der
  Modellwahl, also traf es ALLE Modelle. Fix: ein Auftrag, der MIT dem
  Malauftrag beginnt, zaehlt in jeder Laenge. **Merkregel: eine Laengengrenze
  als Heuristik-Schutz darf den EINDEUTIGEN Fall nie mitfangen.**
- **Der Auto-Router war eine Annahme.** 14 nutzbare Modelle x 19 AUSGEFUEHRTE
  Testfaelle (Code im Blob-Worker wirklich laufen lassen, nicht gelesen):
  minimax-m3 19/19 in 8 s, claude-opus-5 19/19 in 12 s, gpt-5.6-sol 19/19 15 s,
  mimo-v2.5-pro 16 s, glm-5.3 29 s, deepseek-v4-flash 30 s, deepseek-v4-pro
  38 s, kimi-k2.7-code 40 s, glm-5.2 78 s, kimi-k3 79 s, qwen3.7-plus 86 s,
  qwen3.8-max 122 s, kimi-k2.6 184 s. Einziger Ausreisser: mimo-v2.5 14/19.
  Folge: Denk-Woerter kosten kein Guthaben mehr, Opus 5 nur noch bei Dateien
  oder ueber 4000 Zeichen. Blindgaenger (HTTP 200, 0 Zeichen, 90-123 s):
  qwen3.7-max und x-ai/grok-4.5.
- **Bilder erschienen als Base64-Salat.** SIEBEN Kettenglieder waren gesund;
  schuld war EINE fehlende Umgebungszeile (`SMEJJ_CHAT_SYNC_ENABLED`, verloren
  am 14.08.): die Medien-Ablage gab 503, das Bild blieb als 512-KB-data:-URL im
  Chat und wurde bei exakt 524288 Zeichen mittendrin abgeschnitten. Fix per
  EINZEL-Mutation + Control-Neubau. Nachweis: 512x512-Bild im Chat.
- **Video hing 15 Minuten stumm.** Beide Dienste meldeten RUNNING, `/health`
  gab 200 — verraeterisch war ein NICHT-Ereignis: der Fortschritt stand still,
  obwohl die Bruecke alle 10 s taktet. Ein haengender Auftrag belegte den
  einzigen Video-Platz. Fix: Neustart Bruecke + Worker. Nachweis: 640x640-MP4
  in 103 s. **Merkregel: bei "haengt" nicht den Dienst-Status lesen (RUNNING
  sagt nur, dass ein Prozess laeuft), sondern den FORTSCHRITT.**
- **Stille-Wache.** `streamChatAnswer` bricht nach 90 s ohne ein einziges Byte
  ab und sagt es ehrlich; Teilantwort bleibt stehen. 90 s liegt bewusst ueber
  dem 10-s-Takt der Bruecke.

Dazu auf Betreiber-Auftrag: **Auto steht jetzt an erster Stelle** im
Modell-Menue, `smejj 1.0` darunter (live geprueft an
`smejj.com/assets/code-flaeche.js?v=40`).

**Verifikation:** 42 Tests gruen; `check:start-lock` gruen und frisch
gestempelt; `check:guidelines` unveraendert bei 17 Altlast-Meldungen (gegen den
Vorgaenger-Commit gemessen, keine gehoert dieser Arbeit);
`npm run check:funktionen-live` — alle 7 Kernwege antworten.

**Benchmark mit Vorbehalt:** `docs/benchmarks/webvitals_2026-08-19_messnetz-verfaelscht.json`.
Die Budgets sind formal verfehlt (TTFB p75 1765 ms, LCP p75 4096 ms), aber die
MESSUNG ist unbrauchbar: im selben Lauf mass `example.com` 4,66 s TTFB und
`github.com` 10,1 s; der TLS-Handshake kostete auf ALLEN Domains 1,7-3,1 s.
Der Engpass ist das Messnetz dieses Rechners — smejj.com war die schnellste der
vier Domains. Kein Ship-Loop, keine Regression. **Merkregel: bevor eine
Performance-Zahl eine Optimierung ausloest, eine bekannt schnelle Fremddomain
im selben Lauf gegenmessen.** Letzter gueltiger Benchmark bleibt
`webvitals_v214_abnahme_2026-08-04.json`.

**Kosten:** unter 0,03 USD Guthaben fuer den gesamten Abend; 26 Abo-Anfragen
aenderten das Guthaben nicht. Keine neue laufende Kostenposition.

**Neuer Waechter:** `npm run check:funktionen-live` meldet Funktionen, die sich
live als abgeschaltet ausgeben — ohne Token, weil die Abschalt-Pruefung vor der
Anmeldung laeuft (503 = aus, 401 = an). Gebaut, weil die Medien-Ablage
wochenlang aus war und es niemand sah.
