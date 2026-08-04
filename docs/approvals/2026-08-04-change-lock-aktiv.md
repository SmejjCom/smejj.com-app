# Change-Lock aktiv — smejj.com, 2026-08-04

Dieses Dokument haelt zwei schriftliche Erklaerungen des Betreibers fest: die
nachtraegliche Bestaetigung der Aenderungen an gesperrten Dateien und die
Aktivierung des Change-Locks. **Es ist der Schlussstein des Arbeitstags
2026-08-04.** Ab hier gilt: keine Aenderung ohne ausdrueckliche schriftliche
Freigabe im Einzelfall.

## 1. Bestaetigung — Aenderungen an gesperrten Dateien

Wortlaut des Betreibers, unveraendert:

```
BESTÄTIGUNG — Änderungen an gesperrten Dateien, 2026-08-04

Ich bestätige nachträglich die Änderungen an public/sw.js (Cache-Versionen
bis v217) und public/chat-bridge.js (Durchreichen der Arbeitsschritte).
Mir ist bekannt: Design und Eingabefeld der Startseite wurden nicht verändert;
die Sprünge dienten ausschließlich dem Cache und dem Durchreichen der
Fortschrittsanzeige. Start-Lock, Security-Lock und Favicon-Lock sind auf den
Live-Stand eingefroren.

Betreiber smejj.com
```

### Was damit gedeckt ist

| Datei | Aenderung | Warum unvermeidbar |
|---|---|---|
| `public/sw.js` | Cache-Versionen bis `smejj-shell-v217`, ein Precache-Eintrag fuer `autonomous-thread-run.js` | `caches.match` laeuft mit `ignoreSearch`; ohne Versionssprung erreicht KEINE Frontend-Aenderung wiederkehrende Nutzer. Ein dynamisch geladenes Modul ohne Precache-Eintrag waere offline tot. |
| `public/chat-bridge.js` | `schrittDurchreichen` + Auslagerung des Antwortstroms nach `chat-bridge-strom.js` (824 Zeilen, Limit 800) | `pipeVisibleStream` baute jeden Event neu auf und behielt nur `choices[0].delta.content`. Ohne diese Stelle kommen die Arbeitsschritte beim Nutzer nie an — live gemessen. |

Design und Eingabefeld der Startseite wurden nicht angefasst. Nachgewiesen:
`public/sw.js`, `public/ai/chat-stream.js` und `public/autonomous-thread-run.js`
sind byte-identisch mit dem, was unter `https://smejj.com/` ausgeliefert wird.

## 2. Change-Lock — Aktivierung

Wortlaut des Betreibers, unveraendert:

```
CHANGE-LOCK AKTIV — smejj.com, 2026-08-04

Ab sofort dürfen an smejj.com keine Änderungen mehr vorgenommen werden —
weder an Code, Konfiguration, Design, Daten noch an Zugängen — ohne meine
ausdrückliche schriftliche Freigabe im Einzelfall.

Betreiber smejj.com
```

### Umfang

Der Change-Lock ist weiter gefasst als die technischen Sperren. Er deckt
**alles**: Code, Konfiguration, Design, Daten und Zugaenge — auch das, was
bisher auf der Gruenen Liste der Autonomie-Charta stand (Commits, Deploys,
Task Capsules, IDrive-Eintraege). Ein allgemeiner Autonomie-Auftrag hebt ihn
nicht auf; es braucht eine Freigabe **im Einzelfall**.

### Zustand der technischen Sperren zum Zeitpunkt der Aktivierung

| Sperre | Stand |
|---|---|
| Start-Lock | OK — 31 Dateien byte-identisch, eingefroren 2026-08-04T06:01:31.559Z |
| Security-Lock | OK — 9 sicherheitskritische Dateien, eingefroren 2026-08-04T06:01:31.589Z |
| Favicon-Lock | OK — 6 Dateien, 25 HTML-Seiten, Web-Manifest, Generatorquellen |
| `check:all` | gruen, 1575 Zusicherungen, 0 Fehler |

### Live-Stand, der damit eingefroren ist

| Teil | Stand |
|---|---|
| Frontend | `smejj-shell-v217`, `https://smejj.com/` HTTP 200 |
| Bruecke | `20260804-v114-arbeitsschritte` |
| Control Server | Artefakt `smejj-control-fortschritt-2026-08-04`, Container-Version 137, Modell `kimi:kimi-k2.7-code` |
| Suchquelle mit Schluessel | vorbereitet, **nicht** scharf (`suchquelle.konfiguriert: false`) |

## 3. Was bewusst offen bleibt

1. **Der Suchschluessel (Tavily).** Nur der Betreiber darf ein Konto anlegen und
   einen Schluessel hinterlegen. Weg: Doppelklick auf
   `smejj.com Suchschluessel-setzen.command`. Die Suche funktioniert auch ohne
   ihn; der Schluessel ist die Absicherung gegen Ausfaelle von DuckDuckGo.
2. **Der angemeldete Durchlauf der Arbeitsschritte am Stueck.** Jedes Glied der
   Kette ist einzeln live belegt, aber nicht in einem Zug: eine Sitzung darf
   sich nicht anmelden, und ein selbst gemintetes Token wird abgewiesen.
3. **`tests/lora-trainer-vertrag.test.mjs` flackert unter Volllast** (15 s
   Startbudget fuer `python3`; standalone 1,2 s). Kein Produktfehler, aber ein
   unzuverlaessiges Release-Tor. Fremder Arbeitsbereich — nicht angefasst.

## 4. Wie eine kuenftige Aenderung ablaeuft

1. Der Vorschlag wird beschrieben: was, warum, welche Dateien, welcher Rueckweg.
2. Der Betreiber erteilt eine schriftliche Freigabe **fuer genau diese Aenderung**.
3. Die Freigabe wird hier unter `docs/approvals/` mit Wortlaut festgehalten.
4. Erst danach wird gearbeitet, ausgeliefert und live geprueft.
5. Danach werden die Sperren auf den neuen Live-Stand nachgezogen.
