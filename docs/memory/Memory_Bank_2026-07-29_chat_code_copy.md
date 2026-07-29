# Memory_Bank — Auslagerung 2026-07-29: Codeblock im Chat mit einem Klick kopieren

Volltext des Eintrags zu `job_chat_code_copy_20260729`. In `Memory_Bank.md`
steht die Kurzfassung mit Verweis hierher (800-Zeilen-Regel). Nichts geloescht.

## 2026-07-29 — Codeblock im Chat mit EINEM Klick kopieren (job_chat_code_copy_20260729)

Live: smejj.com, Service Worker **v192** (Frontend-Repo-Commit `4697269`).
App-Repo-Commit `5af5738`. Volltext/Messwerte:
`docs/task-capsules/2026/07/job_chat_code_copy_20260729/CAPSULE.md`.

- **Was fehlte, war nicht das Kopieren an sich.** `chat-actions.js` kopiert die
  GANZE Antwort seit 2026-07-28 mit einem Klick. Die Luecke war der EINZELNE
  Codeblock: dafuer blieb nur Markieren mit der Maus, was im horizontal
  scrollenden `<pre>` abreisst und auf dem Handy praktisch nicht geht. Neu:
  `public/chat-code-copy.js`, ein Knopf oben rechts an jedem `pre.chat-code`.

- **DIE REGEL, die man hier kennen muss: kein Textknoten in einem Bedienelement
  innerhalb einer Nachricht.** `chat-store.js` speichert `entry.textContent`,
  `chat-history-context.js` baut daraus den Modellkontext. Ein geschriebenes
  "Kopieren" waere mitten im Code gelandet — im gespeicherten Verlauf UND in der
  naechsten Frage ans Modell. Beschriftung kommt deshalb aus CSS
  (`::after { content: "Kopieren" }`), der Name aus `aria-label`; beides steht
  nicht in `textContent`. Gleiche Ueberlegung wie bei der Aktionsleiste, die
  deshalb GESCHWISTER der Nachricht ist.

- **Knopf als Geschwister des `<pre>`, nicht als Kind.** Das `<pre>` hat
  `overflow-x: auto`; ein Kind darin waere beim Scrollen an der Kante
  verschwunden. `.chat-code-wrap` traegt die Positionierung.

- **`chat-markdown.js` blieb unangetastet.** Der Renderer escaped Modellausgabe
  und ist sicherheitskritisch. Ein eigener, idempotenter Beobachter ruestet
  neue und aus IndexedDB wiederhergestellte Codebloecke nach — beide Beobachter
  verwerfen ihre eigenen Records (`takeRecords`), deshalb kein Aufschaukeln.

- **ZWEI BEFUNDE, die nur der Browsertest fand — Unit-Tests waren gruen:**
  (a) Das Touch-Ziel mass 31x23 px. `styles.css` setzt projektweit
  `button { min-height: 42px }`; ein `min-height: 0` hebelt das aus. Kompakt
  jetzt nur hinter `@media (pointer: fine)`, wie in `chat-actions.css`.
  (b) Der Knopf ueberlappte die erste Codezeile um 17 px:
  `.entry.assistant .chat-code` hat hoehere Spezifitaet als
  `.chat-code-wrap .chat-code` und gewann mit ihrem `padding`. Sichtbar wurde
  es erst bei langen Zeilen — bei kurzen steht der Code links, der Knopf
  rechts, und nichts wirkt falsch.

- **DEPLOY AUF LIVE-BASIS, nicht aus dem Repo.** Live lief `smejj-shell-v191`,
  das Repo `smejj.com-app` stand bei v186 (fuenf Versionen aus
  Parallel-Sitzungen). Ein Upload der lokalen `sw.js` haette diese Arbeit
  zurueckgerollt. Vorgehen: HTTPS-Klon des Frontend-Repos, alle acht
  Buendel-Quelldateien gegen live geprueft (byte-identisch), `sw.js`
  chirurgisch auf der LIVE-Fassung geaendert (v191 -> v192).

- **Start-Lock:** `index.html` und `sw.js` gehoeren zu den 31 eingefrorenen
  Dateien. Freigabe des Betreibers am 2026-07-29 ("Freigeben und live
  stellen"), Lock mit diesem Wortlaut neu eingefroren, Backup unter
  `backups/start-design-lock/2026-07-29T20-48-00-329Z/`.

- **Zur Clipboard-API:** im eingebetteten Browser-Panel gesperrt
  (`visibilityState: "hidden"`, "Write permission denied") — auch fuer direkte
  Aufrufe ohne eigenes Modul. Belegt wurde deshalb der Klickpfad mit einer
  Attrappe an `writeText`: der Knopf bekommt exakt den Code des Blocks, zeigt
  "Kopiert" plus Haekchen und setzt sich nach 2 s zurueck. Live auf smejj.com
  an einer echten Modellantwort durchgefuehrt.

- **Verifikation:** `check:all` gruen, 270 Frontend-Tests (8 neue Schutztests in
  `tests/chat-code-copy.test.mjs`), Live-Hash der Datei = lokaler Hash,
  Web-Vitals alle im Budget
  (`docs/benchmarks/webvitals_code_copy_v192_2026-07-29.json`).

- **BEFUND ZUM MITNEHMEN:** Der Puffer im Erstbesuch-Seitengewicht ist auf
  12 KB geschrumpft (288 von 300 KB, vorher 283). Die naechste Ergaenzung an
  der Startseite muss ihr Gewicht vorher rechnen.
