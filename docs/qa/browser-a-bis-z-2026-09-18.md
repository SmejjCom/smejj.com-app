# smejj Browser — Prüfung A bis Z (18.09.2026)

Geprüft: https://smejj.com/ im echten Chrome des Betreibers (angemeldet, SW v900),
Gegenprobe der Fixes in einer lokalen Pages-Kopie (Chrome 1072 px, Vorschau 375 px).
Auftrag des Betreibers 18.09.: „Erst alle Probleme und Verbesserungspunkte auflisten,
danach vollständig umsetzen und anschließend alles erneut mit realen Tests prüfen.
Keine funktionierende bestehende Funktion darf dabei beschädigt werden."

## Wie der Browser gebaut ist (kurz)

Drei Wege, je nach Seite: **direkt** (fremde Seite als sandboxed iframe — am schnellsten),
**Proxy** (Server schreibt HTML um, ohne Skripte), **Live-Browser** (echter Chromium auf
dem Server, ein JPEG je Aktion über HTTP — kein Videostrom).

## Messwerte live (api.smejj.com, 18.09.)

| Vorgang | Zeit |
|---|---|
| Neue Live-Sitzung, amazon.com | 8,3–9,7 s |
| Neue Live-Sitzung, example.com | 4,1 s |
| Navigation **in** laufender Sitzung (Wikipedia) | 2,8 s |
| Neu laden in der Sitzung | 1,7 s |
| Zurück in der Sitzung | 0,6 s |
| Scrollen (eine Aktion, 15–73 KB Bild) | 0,53–0,71 s |
| smejj.com selbst: DOMContentLoaded / load | 397 / 415 ms, 128 Dateien aus dem SW-Vorrat |

## Befunde

| Nr. | Befund (live gemessen) | Schwere | Stand |
|---|---|---|---|
| B1 | **Direkt eingebettete Seiten bleiben grau** (example.com, de.wikipedia.org: Chromes „blockiert"-Symbol). Ursache: Meta-CSP ohne `frame-src` → `default-src 'self'` verbietet fremde Rahmen. | hoch | behoben: `frame-src 'self' https:` |
| B2 | **Globus verdeckt drei Knöpfe**: „Maus beauftragen", ≡ und ✕ — `elementFromPoint` lieferte `#browserButton`; der Klick klappte das Fenster zu. | hoch | behoben: Globus bei offenem Browser ausgeblendet |
| B3 | **Alle Kontextmenüs unsichtbar** (Tab-Menü, Verlaufs-Menü der Pfeile, Seiten-Menü): Menü z-index 60, Fenster 75. | hoch | behoben: z-index 90 |
| B4 | **Zurück/Vorwärts/Neu laden/neue Adresse im Live-Tab = neuer Server-Chrome** (9 s statt 0,6–2,8 s), Anmeldung der Sitzung geht verloren. | hoch | behoben: Schnellweg in derselben Sitzung, alter Weg bleibt Rückfall |
| B5 | **Fenster zu räumt nichts auf**: jede Live-Sitzung lief bis 30 min weiter (4 Plätze für alle Nutzer). | mittel | behoben: Freigabe nach 2 min Schonfrist |
| B6 | ≡ heißt „Browser anpassen und einstellen", klappte aber nur zur Übersicht zurück. | mittel | behoben: echtes Menü (Neuer Tab, Suche, Zoom, Vollbild, Adresse kopieren, extern, Übersicht) |
| B7 | **Vollbild fehlte** ganz. | mittel | neu: Fullscreen API übers Menü; Menüs erscheinen auch im Vollbild |
| B8 | Escape schloss ein Menü nicht mehr, sobald vorher irgendeine andere Taste gedrückt war (`once:true`). | klein | behoben |
| B9 | `tab.history` wuchs im Speicher unbegrenzt. | klein | behoben: Deckel 200 |
| B10 | con.ax/en/register bleibt im Proxy-Modus **leer** (16 KB Quelltext, 15 Zeichen sichtbar — Proxy entfernt Skripte). | mittel | behoben: `istLeereHuelle()` → Live-Browser |
| B15 | Escape schloss bei offenem Menü auch das ganze Browser-Fenster (panel-backdrop.js hört auf dasselbe Escape). Gefunden im Nachtest v901. | mittel | behoben v902: Menü-Haken in der Einfangphase mit Stopp |
| B16 | de.wikipedia.org blieb nach dem CSP-Fix **weiß**: Wikimedia weist unseren Server mit 403 ab, Antwort trug trotzdem `embeddable:true`; Wikipedia zeigt in jedem fremden Rahmen nur Weiß (auch ohne Sandbox gemessen). | hoch | behoben v902: Server-Status ≥ 400 → Live-Browser |
| B11 | Bedienknöpfe am Handy 22×22 px (Hausregel: 44 px). | mittel | offen — Vorschlag V2 |
| B12 | Live-Browser: **kein Download, kein Upload** (Server kennt beides nicht). | mittel | offen — Vorschlag V3 |
| B13 | Größenänderung des Fensters im Live-Tab baut eine neue Sitzung (9 s) statt den Viewport zu ändern. | klein | offen — Vorschlag V4 |
| B14 | `browser-pane-persistenz.js`: toter Code mit kaputten Importen, steht trotzdem im SW-Vorrat. | klein | offen (außerhalb des Auftrags) |

Nicht als Fehler gewertet: Klicks/Scrollen des Chrome-Automaten erreichen die Live-Bühne
nicht (sandboxed Rahmen, Grenze des Prüfwerkzeugs). Die Server-Strecke wurde deshalb direkt
gemessen (Tabelle oben). Vollbild ließ sich unter Fernsteuerung nicht bestätigen (Chrome:
„not granted"); der Klick meldet das jetzt sichtbar, statt zu verpuffen.

## Sicherheit und Datenschutz (geprüft, in Ordnung)

- Rahmen sandboxed; srcdoc-Ansichten ohne `allow-same-origin`; kein `allow`-Attribut →
  Kamera, Mikrofon, Standort für fremde Seiten gesperrt; `referrerpolicy=no-referrer`.
- Adressprüfung dreifach (Tor, Worker mit DNS-Auflösung, jede Unteranfrage); nur http(s).
- Live-Sitzung anmeldepflichtig, Profil-Kennung serverseitig aus der Identität.
- `frame-src https:` erlaubt keine http-, data:- oder blob:-Rahmen.
- Offen: `--no-sandbox` + abgeschaltete Site-Isolation im Server-Chromium (bekannt, begründet).

## Vergleich Chrome / Firefox / Safari / Edge

Vorhanden: Tabs (Pinnen, Ziehen, ⌘⇧T), Verlauf, Lesezeichen, Suche in Seite, Zoom 50–200 %,
Tastenkürzel, Stopp-Knopf, Schloss-Symbol, JS-Dialoge, Adressvorschläge ohne Suchmaschine.
Neu: Hauptmenü, Vollbild. Besser als die vier: KI-Maus bedient die Seite, Seitentext geht in den Chat.
Fehlt weiter: Downloads/Uploads im Live-Browser, Drucken, Lesemodus, Videostrom statt Einzelbildern.

## Vorschläge (nicht umgesetzt — brauchen Server-Umbau oder Design-Entscheid)

- V2 Trefferflächen der Panel-Knöpfe am Handy auf 44 px (unsichtbar vergrößert).
- V3 Downloads/Uploads im Live-Browser (Größengrenze, Virenprüfung, Ablage in smejjCloud).
- V4 Worker-Aktion `viewport` statt neuer Sitzung; warmer Chromium-Vorrat (Start 9 s → ~2 s);
  CDP-Screencast (`workers/maus-engine/screencast.mjs` existiert, ungenutzt) für flüssiges Scrollen.

## Tests

`tests/browser-livetest-2026-09-18.test.mjs` (9 Tests, Schnellweg und Schonfrist laufen wirklich),
`tests/csp-hosts.test.mjs` (+1). Browser-Familie 243/243 grün, Gesamtsuite 4139/4143 — rot sind
die zwei Lock-Tests bis zum Stempel und zwei Radar-Tests, die schon vorher rot waren.

## Live-Nachtest nach der Auslieferung (18.09., Chrome, smejj.com)

Ausgeliefert in zwei Runden per Doppelklick-Kaskade: **SW v901** (Frontend e349d75, Bauzweig 6bb83947,
Anker `schutz-100-2026-09-18-browser*`) und **SW v902** (Frontend 13e561d, Bauzweig ef9285c1, App ee3234d1,
Anker `schutz-100-2026-09-18-browser-v902*`). Alle ausgelieferten Dateien live byte-gleich nachgewiesen.
Der erste Anlauf brach VOR jeder Auslieferung an check-markenkette ab (vier Module ohne neue ?v=-Marke) — geheilt.

| Prüfpunkt | Ergebnis live |
|---|---|
| example.com (Direkt-Rahmen) | erscheint — vorher graues „blockiert"-Symbol |
| de.wikipedia.org/wiki/Berlin | erscheint im Live-Browser, Titel „Berlin – Wikipedia" — vorher grau, dann weiß |
| Neue Adresse im Live-Tab | **ein** Aufruf `session/act`, 2,4 s — vorher neue Sitzung 7,5–9,7 s |
| Zurück im Live-Tab | 1,8 s, „Vorwärts" danach aktiv |
| Neu laden im Live-Tab | 1,2 s |
| Globus bei offenem Browser | ausgeblendet; „Maus beauftragen", ≡ und ✕ per `elementFromPoint` frei |
| Tab-Kontextmenü (Rechtsklick) | sichtbar, 5 Einträge — vorher hinter dem Fenster |
| Hauptmenü ≡ per echtem Klick | sichtbar, 9 Einträge |
| Escape bei offenem Menü | Menü zu, Browser bleibt offen |
| Konsole | keine Fehler |
| Handybreite 375 px (lokale Pages-Kopie) | kein Überlauf, alle Kopfknöpfe frei, Menü im Fenster |

Nicht live bestätigbar: **Vollbild** (Chrome verweigert es unter Fernsteuerung mit „not granted"; der Klick
meldet das jetzt) und Klicks/Scrollen IN der Live-Bühne (der Chrome-Automat erreicht sandboxed Rahmen nicht).
Hinweis zur Messung: das gewöhnliche Bildschirmfoto des Automaten zeigt fremde Rahmen weiß — die Zoom-Aufnahme zeigt sie richtig.
