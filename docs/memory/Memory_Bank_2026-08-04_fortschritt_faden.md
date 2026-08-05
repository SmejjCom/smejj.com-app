## 2026-08-04 — Fortschritt sichtbar, Lauf im Faden (job_fortschritt_faden_20260804)

Die letzten drei Punkte der Betreiber-Liste. Volltext in der Kapsel.

- **EIN EREIGNIS, DAS DER SERVER SENDET, IST NOCH LANGE NICHT EINES, DAS DER
  NUTZER SIEHT.** Der Control Server sendete die Arbeitsschritte nachweislich
  (6 im Rohstrom), beim Nutzer kam keiner an: `pipeVisibleStream` in der Bruecke
  baut JEDEN Event neu und behaelt nur `choices[0].delta.content`. Zwischen
  Server und Auge liegt jeder Filter auf dem Weg — jeden einzeln pruefen.
- **RUECKWAERTSKOMPATIBEL PER BAUART:** Der Schritt steht in einem eigenen Feld
  (`smejj_schritt`), nicht in `choices[].delta`. Ein alter Client liest
  `delta.content`, bekommt `undefined` und haengt nichts an — unsichtbar, aber
  nie stoerend.
- **DIE SCHRITTLISTE IST GESCHWISTER DER ANTWORT, NICHT IHR KIND.** Der
  Markdown-Renderer ersetzt am Ende das `innerHTML` des Antwort-Knotens und
  liest dessen `textContent`. Ein Kind waere weg — und wuerde vorher die Antwort
  faelschen.
- **Punkt 6:** Der autonome Lauf brauchte die Formularfelder der Automatik-
  Ansicht; der Job-Endpunkt braucht sie gar nicht. NEU
  `public/autonomous-thread-run.js` startet im Faden. Fail-safe: bei jedem
  Fehler `false` -> der alte Weg uebernimmt. Ein Test nagelt fest, dass der
  Ansichtswechsel HINTER dem Rueckfall-Abbruch steht.
- **DER ZEABUR-BUENDLER LEHNT RE-EXPORT-LISTEN AB** (`bundle_export_list_unsupported`):
  sie verstecken die Namensherkunft und entziehen der Kollisionspruefung den
  Boden. Beim Auslagern aus `chat-bridge.js` (824 Zeilen) deshalb direkte
  Importe in den Tests, kein `export { … } from`.
- Der Import von `chat-bridge.js` startet einen echten HTTP-Server —
  `SMEJJ_CHAT_BRIDGE_NO_START = "1"` VOR dem Import setzen, sonst haengt der Test.
- Live belegt: Control sendet, Bruecke v114 reicht durch, ausgeliefertes
  `chat-stream.js` rendert („🔍 Suche: … · Markt us ✓ 8 Treffer"), CSS im
  Buendel. NICHT abgenommen: der angemeldete Durchlauf am Stueck — ein gemintetes
  Token wird abgewiesen und eine Sitzung darf sich nicht anmelden.
