## 2026-08-04 — Sprachseiten waren unerreichbar (job_livetest_az_websuche_20260804)

A-bis-Z-Livetest nach dem Websuche-Release. Zwei Befunde, beide freigegeben und live.

- **EIN DYNAMISCHER IMPORT VERSTECKT SICH VOR JEDER TEXTSUCHE.** `/ja/` sprang auf
  `/auth/login/`, obwohl der Quelltext kein `auth-gate` enthielt und die Umleitung
  auch OHNE Service Worker auftrat. Erst das Netzwerkprotokoll zeigte
  `GET /assets/auth-gate.js?v=1`: `voice-landing.js:9` holt es per
  `import "./auth-gate.js"` — ohne `from`, also unsichtbar fuer jeden Grep.
  MERKREGEL: Tut eine Seite etwas, das ihr Quelltext nicht erklaert, ist das
  Netzwerkprotokoll das Werkzeug, nicht die naechste Textsuche.
- **EIN TEST KANN EINEN FEHLER ALS ABSICHT FESTSCHREIBEN.** `tests/auth-gate.test.mjs`
  fuehrte `/en/` und `/fr/` als App-Seiten, die umleiten SOLLEN. Ein gruener Test
  beweist, dass ein Verhalten gewollt war — nicht, dass es richtig ist. Fix deshalb
  erst zurueckgenommen und den Betreiber gefragt (zwei gegensaetzliche Reparaturen
  moeglich: oeffentlich machen ODER aus dem Index nehmen).
- **"INDEXIERE MICH" UND "MELDE DICH AN" SCHLIESSEN SICH AUS.** Die 15 Sprachseiten
  trugen `robots: index,follow` und standen mit hreflang in der Sitemap — und warfen
  jeden Suchbesucher zur Anmeldung. Jetzt in PUBLIC_PATHS, Muster bewusst eng
  (`^/(code)/(index.html)?$`), damit kein kuenftiger Unterpfad mitoeffnet.
- **CSP fehlte auf 18 Seiten** (14 Sprachseiten + Hilfe/Impressum/Datenschutz/
  Maus-Replay), waehrend Startseite und Auth-Seiten sie trugen. Jetzt im
  Sprachseiten-GENERATOR, sonst waere sie beim naechsten Lauf wieder weg.
- **DER FAVICON-LOCK HASHT DEN SPRACHSEITEN-GENERATOR** — jede Aenderung daran
  verletzt ihn, auch ohne Favicon-Bezug. Nachziehen: nur diesen einen Hash, und
  nachweisen, dass Assets, HTML-Kopfbezuege und Web-Manifest unveraendert sind.
- **VERSIONSPINS SIND TEIL DES CACHE-SPRUNGS:** fuenf Testdateien pinnen CACHE_NAME.
  Parallel-Sitzungen vergaben waehrenddessen v210 -> v211 -> v212; vor der eigenen
  Vergabe die LIVE-Datei pruefen, nicht nur `git log`.
- Ergebnis live: 15/15 Sprachen offen, `/`, `/profile`, `/en/konto`, `/ja/chat`
  weiterhin anmeldepflichtig; 16/16 Seiten mit CSP; sw v213; `check:all` gruen
  (1494 Zusicherungen); Start-Lock und Favicon-Lock neu eingefroren.
- OFFEN: `tests/lora-trainer-vertrag.test.mjs` flackert unter Volllast (15 s
  Startbudget fuer python3; standalone 1,2 s). Kein Produktfehler, aber ein
  unzuverlaessiges Release-Tor. Fremder Arbeitsbereich, nicht angefasst.

