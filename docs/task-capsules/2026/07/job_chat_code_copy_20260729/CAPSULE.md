# Task Capsule — job_chat_code_copy_20260729

Datum: 2026-07-29
Auftrag: "Ich will von Chat mit einem Klick kopieren." (Wof Kadavanich)
Status: abgeschlossen, live verifiziert (smejj.com, sw v192)

## Ziel

Inhalte aus dem Chat mit EINEM Klick in die Zwischenablage holen.

## Was schon da war — und was wirklich fehlte

Die Aktionsleiste unter jeder Nachricht (`chat-actions.js`, seit 2026-07-28)
kopiert die GANZE Antwort bereits mit einem Klick, ohne Umweg über ein Menü.
Die Lücke lag eine Ebene tiefer: ein EINZELNER Codeblock aus einer langen
Antwort. Dafür blieb nur Markieren mit der Maus — auf dem Handy praktisch
unmöglich, und im horizontal scrollenden `<pre>` reißt die Auswahl regelmäßig
ab. In einem Coding-OS ist genau das der häufigste Kopiervorgang.

Ergebnis: an jedem `pre.chat-code` sitzt oben rechts ein Kopieren-Knopf.

## Drei Entscheidungen, die keine Kosmetik sind

### 1. Der Knopf trägt KEINEN Textknoten

`chat-store.js` speichert `entry.textContent`, `chat-history-context.js` baut
daraus den Modellkontext. Ein geschriebenes "Kopieren" wäre mitten im Code
gelandet — im gespeicherten Verlauf UND in der nächsten Frage ans Modell. Die
Beschriftung kommt deshalb aus CSS (`::after { content: "Kopieren" }`), der
Name für Screenreader aus `aria-label`. Beides steht nicht in `textContent`.

Dieselbe Überlegung steht im Kopf von `chat-actions.js` — dort war es der Grund,
die Aktionsleiste als Geschwister der Nachricht zu bauen.

Live belegt auf smejj.com: `entry.textContent` einer echten Antwort mit
Codeblock lautet exakt `"function add(a, b) {\n  return a + b;\n}"` — kein
"Kopieren" darin.

### 2. Der Knopf ist GESCHWISTER des `<pre>`, nie Kind

Das `<pre>` hat `overflow-x: auto`. Ein Kind darin wandert beim horizontalen
Scrollen mit und verschwindet an der Kante. Der Wrapper `.chat-code-wrap` trägt
die Positionierung, das `<pre>` behält seinen Überlauf.

### 3. Nicht an `:hover`

Eine reine Hover-Bedienung existiert für Tastatur-, Touch- und
Screenreader-Nutzer nicht (WCAG 2.1.1). Der Knopf ist immer sichtbar, nur
zurückhaltend gefärbt, und wird bei `:hover` UND `:focus-within` deutlich —
dieselbe Regel wie bei der Aktionsleiste.

## Nachrüsten statt Mitrendern

`chat-markdown.js` bleibt unangetastet. Der Renderer escaped Modellausgabe und
ist sicherheitskritisch; eine Änderung dort hätte den XSS-Schutz berührt, ohne
dass es nötig wäre. Stattdessen zieht ein eigener, idempotenter Beobachter neue
und wiederhergestellte Codeblöcke nach.

Zwei Nebenwirkungen wurden geprüft und ausgeschlossen:

- **Endlosschleife zwischen zwei Beobachtern.** `observeLog` in
  `chat-messages.js` verwirft nach jedem Durchlauf die eigenen Records. Mein
  Beobachter tut dasselbe; ein zweiter Durchlauf findet nichts mehr und erzeugt
  damit keine Mutation, die den anderen erneut auslösen würde.
- **`meta.raw` bleibt unberührt.** `captureRaw` sichert den Rohtext nur bei
  kinderlosen Einträgen (`isRawCandidate`). Ein Eintrag mit Codeblock hat nach
  dem Rendern Kinder — der Rohtext steht da längst fest.
- **Wiederherstellung aus IndexedDB.** `renderEntriesInto` setzt gespeichertes
  `innerHTML`, in dem der Knopf bereits steckt. Der Umbau prüft den Wrapper und
  baut deshalb keinen zweiten. Live gemessen: 1 Knopf, 1 Wrapper.

## Betroffene Dateien

| Datei | Änderung |
| --- | --- |
| `public/chat-code-copy.js` | NEU — Knopf nachrüsten, Klick, Rückmeldung |
| `public/chat-markdown.css` | Wrapper, Knopf, Touch-Ziel, Icon-only ≤430 px |
| `public/start-styles.css` | erzeugt (`npm run build:start-styles`) |
| `public/index.html` | eine Zeile `<script>` |
| `public/sw.js` | Precache-Eintrag, v186 → v187 (lokal) |
| `tests/chat-code-copy.test.mjs` | NEU — 8 Schutztests |
| `tests/deferred-start.test.mjs`, `tests/platform-pwa.test.mjs`, `tests/profile-dock.test.mjs` | erwartete Cache-Version |
| `package.json` | neuer Test in `check:frontend`, Syntaxprüfung in `check` |

## Zwei Befunde aus dem Browsertest, beide behoben

Beide wären ohne Live-Messung durchgerutscht — die Unit-Tests waren grün.

**Das Touch-Ziel war zu klein.** Gemessen auf 375 px: 31×23 px. `styles.css`
setzt projektweit `button { min-height: 42px }`; mein `min-height: 0` hat das
überschrieben. Jetzt 42 px als Voreinstellung, kompakt (26 px) nur hinter
`@media (pointer: fine)` — genau das Muster aus `chat-actions.css`. Browser ohne
pointer-Abfrage behalten das größere, sichere Ziel.

**Der Knopf überlappte die erste Codezeile um 17 px.** Die Grundregel
`.entry.assistant .chat-code { padding: 10px 12px }` hat höhere Spezifität als
`.chat-code-wrap .chat-code` und gewann mit ihrem Padding. Der Selektor trägt
jetzt `.entry.assistant` davor. Sichtbar wurde es erst bei langen Codezeilen —
bei kurzen steht der Code links, der Knopf rechts, und nichts wirkt falsch.

## Start-Lock: Freigabe eingeholt

`check:start-lock` schlug an: `public/index.html` und `public/sw.js` gehören zu
den 31 eingefrorenen Startseiten-Dateien, und die Rote Liste der Autonomie-Charta
verlangt dafür schriftliche Freigabe. Der Betreiber hat am 2026-07-29 mit
"Freigeben und live stellen" freigegeben; der Lock wurde mit diesem Wortlaut neu
eingefroren (Backup `backups/start-design-lock/2026-07-29T20-48-00-329Z/`).

## Deploy auf Live-Basis, nicht aus dem Repo

Live lief `smejj-shell-v191`, das Repo `smejj.com-app` stand bei v186 — fünf
Versionen aus Parallel-Sitzungen. Ein Upload der lokalen `sw.js` hätte diese
Arbeit zurückgerollt.

Vorgehen: Frontend-Repo über HTTPS geklont, alle acht Bündel-Quelldateien gegen
live geprüft (byte-identisch), `index.html` und `start-styles.css` konnten
deshalb direkt hoch. `sw.js` wurde chirurgisch auf der LIVE-Fassung geändert:
Precache-Eintrag ergänzt, v191 → v192.

Rollback-Punkt Frontend-Repo: `383697e`. Deploy-Commit: `4697269`.
Rollback-Punkt App-Repo: `8d93d36`. Commit: `5af5738`.

## Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check:all` | grün (nach der Freigabe auch `check:start-lock`) |
| `npm run check:frontend` | 270 Tests, 0 Fehler |
| `npm run check:guidelines` | OK, 1109 Dateien |
| `npm run check:precache-imports` | OK, 88 Module erreichbar |
| Browsertest lokal | 1280 px und 375 px, keine Konsolenfehler |
| Live-Test smejj.com | echte Modellantwort mit Codeblock, 1 Knopf, richtige Nutzlast |
| Live-Hash `chat-code-copy.js` | `acc3a4fa53437e0e…` = lokal |

**Zur Clipboard-API:** `navigator.clipboard.writeText` ist im eingebetteten
Browser-Panel gesperrt (`visibilityState: "hidden"`, "Write permission denied") —
auch für direkte Aufrufe ohne mein Modul. Belegt wurde deshalb der Klickpfad:
mit einer Attrappe an `writeText` bekommt der Knopf exakt den Code des Blocks,
zeigt "Kopiert" plus Häkchen und setzt sich nach 2 s zurück. Dieselbe API trägt
seit 2026-07-28 die Kopierfunktion der Aktionsleiste live.

## Benchmark

`docs/benchmarks/webvitals_code_copy_v192_2026-07-29.json`

| Messwert (Erstbesuch, p75) | v186 (2026-07-28) | v192 (heute) | Budget |
| --- | --- | --- | --- |
| TTFB | 94 ms | 159 ms | 200 ms |
| LCP | 412 ms | 372 ms | 1500 ms |
| INP | 48 ms | 48 ms | 200 ms |
| CLS | 0 | 0 | 0,1 |
| Seitengewicht | 283 KB | 288 KB | 300 KB |

Alle Budgets eingehalten. Die TTFB-Streuung stammt aus der Auslieferung durch
GitHub Pages (min 25 / max 184 im selben Lauf); die Änderung liegt vollständig
hinter dem ersten Byte des HTML.

**Befund zum Mitnehmen:** Der Puffer im Erstbesuch-Seitengewicht ist auf 12 KB
geschrumpft (288 von 300 KB). Die nächste Ergänzung an der Startseite sollte ihr
Gewicht vorher rechnen, sonst kippt das Budget.

## Nächster Schritt

Seitengewicht der Startseite prüfen: 288 von 300 KB kalt. Ein Kandidat ist
`start-styles.css` (71 KB unkomprimiert) — dort liegen Regeln für Ansichten, die
beim Erstbesuch gar nicht sichtbar sind.
