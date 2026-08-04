# Memory_Bank — Auslagerung 2026-08-04: Websuche im falschen Markt

Wortgleich aus Memory_Bank.md ausgelagert (800-Zeilen-Grenze).
Kapsel: `docs/task-capsules/2026/08/job_websuche_markt_20260804/CAPSULE.md`.

## 2026-08-04 — Die Websuche suchte im falschen Markt (job_websuche_markt_20260804)

Befund: Die Frage nach einem Buero im Silicon Valley beantwortete smejj.com mit
ImmobilienScout24. Live nachgemessen war die Suche nicht bei dieser einen Frage
kaputt, sondern grundsaetzlich — vier von sechs Standardfragen null Treffer,
„office space for sale San Jose" acht Microsoft-Office-Seiten.

- **EIN FESTVERDRAHTETER SPRACHKOPF IST EINE MARKTENTSCHEIDUNG.** `kl=de-de`,
  `setlang=de` und `Accept-Language: de,en` sahen aus wie Darstellungsdetails.
  Sie bestimmen, WELCHE Welt die Suchmaschine zeigt. NEU `src/search/searchRegion.js`:
  Markt aus dem Ortsbezug (17 Maerkte); bei zwei Orten gewinnt der ZULETZT genannte.
- **EIN FEHLENDER PARAMETER IST SCHLIMMER ALS EIN FALSCHER.** `lite.duckduckgo.com`
  hatte gar keine Region und antwortete nach der Server-IP — daher spanische
  Treffer. Bei mehreren Quellen muss JEDE den Parameter bekommen.
- **EIN GANZER SATZ IST KEINE SUCHANFRAGE.** Der rohe Fragesatz ging als Suchbegriff
  hinaus: 0 Treffer — die Suche war nie gestellt. NEU `buildSearchQuery` (nie leer).
- **EIN WORT IST KEIN BELEG — EIN SCHWACHER FILTER VERSTECKT EINEN TOTEN DIENST.**
  Acht microsoft.com-Treffer kamen durch, weil „office" vorkam. Ab drei pruefbaren
  Begriffen muessen jetzt zwei in DEMSELBEN Treffer stehen. Erst dadurch wurde
  sichtbar, dass beide Suchmaschinen laengst nichts Brauchbares liefern.
- **HTTP 200 HEISST NICHT „ANTWORT".** Bing liefert erkannten Automaten
  absichtliche Taeuschtreffer (brasilianische Motorrad-Preistabellen auf
  „Schlagzeilen Berlin", Tom-Hanks-Filmografie auf „Zoo Berlin"). Cookies,
  `Referer`, sauberer Browser-Kennstring: nachgemessen ohne Wirkung.
  DuckDuckGo antwortet aus dem Rechenzentrum mit HTTP 202 + Sperrseite.
- **AUS DER ARBEITSKOPIE BAUEN IST GEFAEHRLICH.** Der Release-Builder nimmt die
  Arbeitskopie; eine Parallel-Sitzung hatte 20 Dateien in Release-Pfaden offen. Weg:
  `git archive <commit> | tar -x`, dann `buildControlReleaseArtifact({ rootDir })`.
- Ergebnis live: `Bitcoin Kurs` jetzt finanzen.net/coinmarketcap.com/**de**/ statt
  `/es/`; `office space for sale San Jose` 0 statt 8 falscher Treffer; Antwort auf
  die Originalfrage nennt den US-Markt, ist vollstaendig und nennt LoopNet/Crexi
  mit Suchbegriffen. Control 133 -> 135, `check:all` gruen (1473 Zusicherungen).
- OFFEN (Rote Liste): Ohne Suchquelle mit Schluessel (BYOK, z. B. Brave Search
  API oder Tavily im Gratiskontingent) kann die Suche keine Objektlinks liefern.
  Mojeek, Marginalia, Brave-HTML, acht oeffentliche SearXNG-Instanzen geprueft und
  ausgeschieden. Neuer Anbieter = getrennte schriftliche Freigabe.
## 2026-08-03 — Breite Eval-Suite: 295 Faelle in 15 Fachgebieten (job_eval_breite_suite_20260803)
- GEBAUT + LIVE BEWIESEN: `evals/suites/smejj-chat-breit-v1.json` ist die neue
  Messlatte fuer Modellwahl und smejj-1.0-Training — 295 Faelle in 15 Paketen
  unter `evals/packs/` (Naming, Architektur, Kosten, Locks, Sicherheit, Coding,
  Struktur, Ehrlichkeit, Deployment, Performance, Training, Router, Sprache,
  Logik, RAG). Kern-Suite (14 Faelle) bleibt unveraendert vergleichbar.
- BAUART MANIFEST + PAKETE: `src/evaluation/evalPacks.js` expandiert
  Kurzschreibweisen (`muss`/`sollte` = kritisch/weich) zu den bestehenden
  Erwartungstypen; der Inhalts-Hash deckt die ZUSAMMENGEFUEHRTE Suite ab. Nach
  jeder Paket-Aenderung: `node scripts/evaluation/rehash_eval_suite.mjs <suite>`.
  Fail-closed bewiesen: Tippfehler-Felder werfen (`eval_pack_case_unknown_field`),
  jeder Fall braucht eine kritische Erwartung.
- LIVE-BEWEIS 2026-08-03: Stichprobe 12 Faelle gegen die Produktionskette —
  12/12 bestanden, Urteil passed, p95 775 ms (Bericht
  docs/benchmarks/modeleval-smejj-chat-breit-stichprobe-2026-08-03.json).
  Erste Messung fand echte 2 Verstoesse (Knopf/Commit ohne Markennamen); Ursache
  war der unterspezifizierte Prompt, nicht die Wortliste — Prompts geschaerft,
  Erwartung NICHT aufgeweicht (Regel aus evals/README.md).
- MERKREGEL: voller Lauf = 885 Aufrufe (3 Ziehungen) hinter 12/min ≈ Nachtlauf.
  Stichproben mit `--limit`, Berichte nur je gleicher Messart vergleichen.
  minScore 0.75 ist Startwert; anheben nach zwei Basislaeufen.
- Waechter: `tests/eval-packs.test.mjs` (8 Tests, u. a. Antwortschluessel-Regel
  fuer den RAG-Korpus) in `check:evaluation` verdrahtet.

## 2026-08-04 — Kontoansicht vollstaendig uebersetzt, Sprachseiten sind kostenpflichtig (job_livetest_a_bis_z_20260804)
- ERLEDIGT, live (`0cbeb48`): 63 Texte x 14 Sprachen ergaenzt, Schluesselsatz je
  Sprache 314 und identisch. Der Code rief `t()` schon ueberall auf — es fehlten
  NUR die Sprachdatei-Eintraege, deshalb keine Code-Aenderung. Rein additiv.
  Belegt gegen die ausgelieferten Dateien: 217 uebersetzbare Texte aus
  account-privacy.js + settings-surface.js, 0 Luecken (vorher 48).
- MERKREGEL: Die Sprachdateien liegen NICHT im Precache (nur `i18n/ui.js`) —
  Uebersetzungen brauchen KEINEN sw-Sprung, sie greifen nach dem
  600-s-HTTP-Cache. Vor jedem sw-Bump pruefen, ob die Datei ueberhaupt im SHELL
  steht; unnoetige Cache-Spruenge kosten alle Nutzer einen Neuladezyklus.
- WICHTIG (Kostenfalle): Die 15 Sprachseiten sind KEINE Marketingseiten.
  `voice-landing.js` ruft `api.agent`, `api.chatFallback`, `api.voiceTranscribe`
  und `api.voiceTts`. Sie per `PUBLIC_PATHS` zu oeffnen wuerde die
  kostenpflichtigen Routen fuer jeden Anonymen und jeden Bot freigeben — Rote
  Liste. Die Sitemap bewirbt 16 von 19 Adressen, die Abgemeldete zur Anmeldung
  schicken; richtige Loesung ist eine oeffentliche Marketing-Huelle mit
  gesperrter Eingabe, nicht ein Eintrag in PUBLIC_PATHS.
- EINSCHRAENKUNG: de/en verantwortet der Agent; die 13 weiteren Sprachen sind
  maschinell erstellt und nicht muttersprachlich gegengelesen.

## 2026-08-04 — Konto-Sicherheit ohne Browser-Dialoge (job_konto_formulare_20260804)

Commit `14f1a3d` + `20011ef`, Frontend `dd626c7`, live als `smejj-shell-v212`.
Freigabe des Betreibers vom 2026-08-04. `check:all` gruen (1718 + 1764 in zwei
Laeufen), Start-Lock neu eingefroren.

- **DERSELBE BEFUND WIE AUF DER ANMELDESEITE, NUR HINTER DER ANMELDUNG.**
  `account-sessions.js` fragte Passwoerter mit `window.prompt()` ab (unmaskiert,
  Klartext auf dem Schirm, keine Passwortverwaltung) und stapelte fuer die
  Loeschung `confirm` + zwei `prompt`. Chrome bietet nach dem zweiten Dialog an,
  weitere zu unterdruecken — wer das anklickte, kam nie ans Passwortfeld und
  stand vor einer Aktion, die scheinbar nichts tat. Jetzt Seitenformulare mit
  maskierten Feldern, Wiederholfeld und Abbrechen-Weg.
- **ALLE PRUEFUNGEN VOR DEM SERVERAUFRUF.** Live im Browser gegen den
  ausgelieferten Code bewiesen: falsches Loeschwort -> 0 Netzaufrufe, fehlendes
  Passwort -> 0 Netzaufrufe, ungleiche neue Passwoerter -> 0 Netzaufrufe. Vorher
  ging jede Eingabe ans Netz, auch eine leere.
- **MERKREGEL: ein Label als Flex-Spalte macht aus jedem eigenen Element eine
  eigene Zeile.** Ein `<code>`-Element in der Beschriftung brach
  "Zur Bestätigung KONTO LÖSCHEN eingeben" in DREI Zeilen — im Browser gesehen,
  nicht im Test. Beschriftungen in solchen Labels bleiben EIN Textstueck.
- **MERKREGEL: `?v=` allein erreicht Bestandsnutzer NICHT.** Precache-Dateien
  liegen cache-first mit `ignoreSearch`; nur ein CACHE_NAME-Sprung wirkt. Darum
  zwei Sprünge (v211 fuer die Formulare, v212 fuer die Nachbesserung).
- **MERKREGEL: eine Testbuehne ohne die echte Ansichtsklasse misst falsch.** Die
  Konto-Variablen haengen an `#profile.premium-view`; ohne die Klasse loesen
  `var(--konto-line)` und Co. zu leer auf und Raender verschwinden — das sah wie
  ein CSS-Fehler aus, war aber die Buehne.
- OFFEN (fremd): `tests/lora-trainer-vertrag.test.mjs` startet einen lokalen
  Dienst und wartet 15 s auf `/health`. Unter der Last eines vollen `check:all`
  reicht das manchmal nicht — dreimal an einem Tag rot, isoliert immer gruen.
  Ein Pflicht-Gate darf nicht vom Zufall abhaengen; Startfenster erhoehen.
