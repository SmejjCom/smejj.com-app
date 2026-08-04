# job_livetest_az_websuche_20260804 — A-bis-Z-Livetest nach dem Websuche-Release

## Ziel

Betreiber-Auftrag: "Hast du alle Aenderungen hochgeladen, die Datenbank
gespeichert und das Deployment abgeschlossen? Bitte oeffne smejj.com im Browser
und teste die gesamte App von A bis Z. Wenn du Fehler findest, behebe sie
sofort, deploye erneut und teste live weiter. Danach alles 100% schuetzen."

## Auslieferungsstand geprueft

| Was | Befund |
|---|---|
| Git | **Zwei Doku-Commits waren noch offen** -> gepusht, danach lokal == origin |
| IDrive e2 | Kapsel + Freigabe-Nachweis liegen unter `capsules/app/job_websuche_markt_20260804/` |
| Control Server | v135 live (Websuche-Fix) |
| Frontend | war v212, jetzt v213 |

## Testumfang und Ergebnis

- **13 HTTP-Routen + alle 15 Sprachseiten**: korrekt, `/gibtsnicht` korrekt 404.
  `/nl/` und `/pl/` sind KEIN Fehler — diese Sprachen gibt es nicht.
- **4 Backends** gesund (0,3–0,8 s). `/api/health` auf Zeabur ist die bekannte
  Messfalle: dort existiert nur `/health`.
- **126 vom Service Worker referenzierte Dateien**: alle erreichbar.
- **Seitenstruktur**: je genau ein `h1`, korrekte `lang`/`dir` (RTL bei `/ar/`),
  keine leeren Links, keine externen Skripte, 0 Konsolenfehler.
- **Mobil 375 px + Dunkelmodus**: kein waagerechter Ueberlauf, keine Klickflaeche
  unter 24 px.
- **Statusseite** misst live: alle vier Dienste gruen.
- **Nicht testbar**: der angemeldete Bereich. Die Chrome-Erweiterung war nicht
  verbunden, und eine Sitzung darf sich nicht anmelden.

## Befund 1 — die 15 Sprachseiten warfen jeden Suchbesucher zur Anmeldung

`/ja/` lud sichtbar und sprang dann auf `/auth/login/`. Die Suche nach der
Ursache dauerte, weil der Weg dreifach verdeckt war:

1. Der Quelltext von `/ja/` enthaelt KEIN `auth-gate` — die Textsuche lief ins Leere.
2. Ein Verdacht auf den Service Worker war falsch: nach `unregister()` und
   geleertem Cache leitete die Seite genauso um.
3. Erst das **Netzwerkprotokoll** zeigte `GET /assets/auth-gate.js?v=1`.
   `voice-landing.js:9` holt es ueber einen **dynamischen Import** — den findet
   keine Suche nach `from "./…"`.

In `PUBLIC_PATHS` fehlte ein Muster fuer die Sprachpfade. Gleichzeitig tragen
dieselben Seiten `robots: index,follow` und stehen mit hreflang in der Sitemap:
Die Seite bat Google um Besucher und sperrte sie dann aus.

**Nicht eigenmaechtig geaendert:** `tests/auth-gate.test.mjs` fuehrte `/en/` und
`/fr/` ausdruecklich als App-Seiten, die umleiten SOLLEN. Das war also eine
Entscheidung, keine Panne — und es gab zwei gegensaetzliche Reparaturen
(oeffentlich machen ODER aus dem Index nehmen). Fix zurueckgenommen, nachgefragt,
Betreiber hat "oeffentlich machen" gewaehlt.

Muster bewusst eng: `^/(code)/(index\.html)?$`. Ein Praefix wuerde jede kuenftige
Unterseite mitoeffnen. Live gegen die AUSGELIEFERTE Datei geprueft: 15 von 15
Sprachen offen, `/`, `/index.html`, `/profile`, `/en/konto` und `/ja/chat`
weiterhin anmeldepflichtig.

## Befund 2 — CSP fehlte auf 18 Seiten

Startseite, Anmeldung, Registrierung, Status und Verlauf trugen eine CSP; die 14
Sprachseiten sowie Hilfe, Impressum, Datenschutz und Maus-Replay nicht. Wortlaut
jetzt identisch zur Startseite, eingebaut im **Generator**, damit er nicht beim
naechsten Lauf wieder verschwindet. Vorher geprueft: keine der Seiten nutzt
inline-Skripte; nur `maus-replay.html` ein `style`-Attribut, von
`style-src 'unsafe-inline'` gedeckt. Live nachgemessen: 16 von 16 Seiten mit CSP,
Seiten rendern unveraendert, 0 Konsolenfehler.

## Behoben nebenbei

Der **Start-Lock war verletzt**: `public/sw.js` wurde nach dem letzten Einfrieren
auf v211/v212 gebumpt und ausgeliefert, der Lock blieb zurueck. Vor dem
Nachziehen geprueft, dass die Datei byte-identisch mit `https://smejj.com/sw.js`
ist — das Einfrieren aendert keine Datei, es schreibt den laufenden Stand fest.

## Merkregeln

- **EIN DYNAMISCHER IMPORT VERSTECKT SICH VOR JEDER TEXTSUCHE.** `import "./x.js"`
  als Anweisung ohne `from` faellt durch jeden Grep nach `from "./`. Wenn eine
  Seite etwas tut, das ihr Quelltext nicht erklaert: **Netzwerkprotokoll lesen**,
  nicht weiter im Text suchen.
- **EIN TEST KANN EINEN FEHLER ALS ABSICHT FESTSCHREIBEN.** `/en/` und `/fr/`
  standen in der Liste der umzuleitenden Seiten. Ein gruener Test beweist, dass
  das Verhalten GEWOLLT war — nicht, dass es RICHTIG war. Bei Widerspruch zwischen
  Test und Produktlogik entscheidet der Betreiber, nicht die Sitzung.
- **"INDEXIERE MICH" UND "MELDE DICH AN" SCHLIESSEN SICH AUS.** Wer `robots:
  index,follow` setzt und in die Sitemap schreibt, verspricht Besuchern eine
  sichtbare Seite. Beides gehoert zusammen geprueft.
- **EIN VERSIONSPIN IN TESTS IST TEIL DES CACHE-SPRUNGS.** Fuenf Testdateien
  pinnen `CACHE_NAME`. Wer sw.js bumpt und sie vergisst, macht `check:all` rot.
- **DER FAVICON-LOCK HASHT DEN SPRACHSEITEN-GENERATOR.** Jede Aenderung daran
  verletzt ihn, auch wenn kein Favicon betroffen ist. Nachziehen: NUR den einen
  Hash uebernehmen und nachweisen, dass Assets, HTML-Kopfbezuege und Web-Manifest
  unveraendert sind.
- **PARALLEL-SITZUNGEN VERGEBEN VERSIONEN WEITER.** sw.js lief waehrend dieser
  Sitzung von v210 ueber v211 auf v212. Vor der eigenen Vergabe unmittelbar vorher
  `git log` UND die Live-Datei pruefen.

## Offen

`tests/lora-trainer-vertrag.test.mjs` flackert unter Volllast: 15 s Startbudget
fuer `python3`, standalone laeuft die Datei in 1,2 s durch. An diesem Tag zwei
volle `check:all`-Laeufe gruen, zwei rot — jedes Mal ein anderer Test, immer
exakt 15 s. Kein Produktfehler, aber ein unzuverlaessiges Release-Tor. Der
Trainer-Bereich gehoert einer Parallel-Sitzung; nicht angefasst.
