# smejj.com Remote-Browser-Worker

Stateless Playwright/Chromium worker for pages that cannot run inside an iframe or
the safe HTML proxy.

## Contract

- `GET /health` returns worker health.
- `POST /render` with `Authorization: Bearer <SMEJJ_REMOTE_BROWSER_TOKEN>` renders:

```json
{
  "url": "https://example.com",
  "viewport": { "width": 1365, "height": 900 }
}
```

Response:

```json
{
  "ok": true,
  "finalUrl": "https://example.com/",
  "title": "Example Domain",
  "status": 200,
  "screenshot": "data:image/png;base64,..."
}
```

## Salad notes

Run as a separate CPU container group behind Salad Gateway auth. The Control
Server remains the only public API surface for smejj.com and calls this worker
only when:

- `SMEJJ_REMOTE_BROWSER_ENABLED=YES`
- `SMEJJ_REMOTE_BROWSER_WORKER_URL` is set
- `SMEJJ_REMOTE_BROWSER_TOKEN` is set
- the existing worker budget gate approves the request

The worker stores no state. Browser recordings, screenshots and task evidence
belong in IDrive e2 task capsules when a higher-level job uses them.

## Warum der Code so ist

Diese Begründungen standen als Kommentare in `session-engine.js`. Die Datei war
am 11.09. auf 846 Zeilen gewachsen — über die Hausgrenze von 800
(`check:guidelines`). Aufteilen in mehrere Module wäre riskant gewesen:
`worker.js` lädt `session-engine.js` notfalls **als einzelne Datei** aus einem
Laufzeit-Bündel nach, und ein relativer Import in eine zweite Datei fände auf
diesem Weg nichts. Deshalb sind hier nur Kommentare ausgelagert (13.09.) —
der Code ist unverändert, im Code steht an jeder Stelle ein Verweis hierher.

### 1. Wenn alle Sitzungsplaetze belegt sind

VOLL? Dann die AELTESTE verdraengen statt abzulehnen.

BEFUND 2026-08-20, unmittelbar nach der Verlaengerung der Lebensdauer:
Der Betreiber bekam beim Anmelden kein Passwortfeld. Ursache war nicht
die Anmeldeseite, sondern dieses Limit — /api/browser/session
antwortete 429, der Client fiel auf den Standbild-Worker zurueck, und
in einem Standbild gibt es nichts zu tippen.

Verursacht hatte es die eigene Verbesserung: solange Sitzungen nach
90 s starben, raeumten sie sich von selbst weg. Mit 30 Minuten
blockierten zwei vergessene Sitzungen beide Plaetze eine halbe Stunde.
Eine laengere Lebensdauer VERLANGT deshalb eine Verdraengung — sonst
macht sie das System unbenutzbarer statt besser.

Ein Browser sagt auch nie "zu viele Tabs": er raeumt still auf.

### 2. Warum Chromium nicht mehr headless startet

WARUM NICHT MEHR HEADLESS (recherchiert und gemessen 2026-08-20):
Google blockiert Anmeldungen aus automatisierten Browsern seit Januar
2021 ausdruecklich — der Betreiber bekam deshalb "kein Passwortfeld".
Headless ist dabei das lauteste Signal, und `navigator.webdriver`
meldet zusaetzlich von selbst "ich bin automatisiert".

Zwei Gegenmassnahmen, beide billig:
  * headful auf einem VIRTUELLEN Bildschirm (Xvfb liegt im
    Playwright-Image bereit, der Container startet unter xvfb-run) —
    kein Desktop noetig, aber ein echter Fensterbaum.
  * --disable-blink-features=AutomationControlled setzt
    navigator.webdriver auf false, und zwar in der Engine, nicht per
    nachgeschobenem Skript.

EHRLICHE GRENZE: Das ist keine Tarnkappe. Google arbeitet aktiv
dagegen und wird Anmeldungen weiter erschweren — fuer Google-Dienste
ist OAuth der richtige Weg, nicht das Nachbauen einer Passworteingabe.
Fuer Amazon, Alibaba und die meisten Seiten reicht es.

--single-process ist BEWUSST WEG: mit echtem Fensterbaum ist er
instabil (Renderer und Browser im selben Prozess), und genau dort
laufen die Seiten, die uns interessieren.

### 3. Mit Konto-Profil oder ohne

Mit Konto-Profil: dauerhafter Kontext, die Anmeldung ueberlebt die
Sitzung. Ohne: fluechtiges Fenster wie bisher (fail-closed).
NOTAUSGANG: headful braucht einen laufenden X-Server. Ist er nicht da
(falsch gestarteter Container, fremde Umgebung, kuenftiger Umbau),
scheitert der Start mit "launched a headed browser without having a
XServer running" — und der ganze Browser waere TOT.

Ein Fern-Browser, der gar nicht startet, ist schlimmer als einer, den
Google erkennt. Deshalb wird bei einem Fehlschlag still auf headless
zurueckgefallen: schlechter getarnt, aber benutzbar. Lokal war headful
nicht pruefbar (amd64-Chrome unter Emulation auf einem ARM-Mac), und
ungeprueft deployen heisst hier: den Dienst aufs Spiel setzen.

### 4. Wenn der Browser wegbricht

EIN STERBENDER BROWSER DARF NICHT DEN DIENST MITNEHMEN.

Gemessen 2026-08-21: stuerzt Chrome ab (headful war der Ausloeser,
der Fall gilt aber immer), meldet Playwright den Fehler asynchron —
weit ausserhalb jedes try/catch. Der Crash-Guard des Workers macht
daraus pflichtgemaess einen Exit 1, und der GANZE Fern-Browser ist
weg, samt aller anderen Sitzungen. Der Container war danach tot.

Ein abgestuerzter Browser ist ein normaler Betriebsfall, kein
Programmfehler: wir raeumen die betroffene Sitzung auf und lassen den
Dienst laufen. Die naechste Anfrage baut einfach neu auf.

### 5. Der erzwungene Klick

ZWEITER VERSUCH MIT NACHDRUCK — benannt, nicht heimlich.

Live 10.09. (de.wikipedia.org): Der Suchknopf ist ein
`<button type="submit">`, das Wikipedia absichtlich unsichtbar macht
(OOUI legt ein Symbol darueber). Playwright wartet dann auf
Bedienbarkeit, die nie eintritt — fuenf Schritte hintereinander
"element_nicht_bedienbar", der Auftrag scheiterte an einem Knopf,
den jeder Mensch benutzen kann.

Erzwungen wird NUR das, was die Maus ohnehin gewaehlt hat: ein
EINDEUTIG aufgeloestes Element (Mehrdeutiges fliegt vorher raus).
Es bleibt bei EINEM Nachdruck, und die Antwort sagt es (erzwungen),
damit im Verlauf steht, was wirklich geschah.

### 6. Der Klick aus der Seite heraus

LETZTE STUFE: DER KLICK AUS DER SEITE HERAUS.

Playwright weigert sich auch mit `force`, wenn das Element gar
keine sichtbare Flaeche hat ("Element is not visible") — genau der
Fall bei Wikipedias Suchknopf, der unter einem Symbol liegt. Live
11.09. endeten so ZWOELF Schritte eines Laufes, jeder nach zehn
Sekunden Warten. Die Chrome-Bruecke macht seit dem 20.08. das
Naheliegende: sie ruft `element.click()` in der Seite auf. Der
ferne Browser tut das ab jetzt auch — dieselbe Maus, dasselbe
Verhalten. Geklickt wird weiterhin NUR das eine, eindeutig
aufgeloeste Element, das die Maus selbst gewaehlt hat.

