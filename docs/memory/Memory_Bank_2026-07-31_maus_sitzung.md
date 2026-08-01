# Memory_Bank-Volltext — Maus: eigener Browser, Sitzung bleibt stehen (2026-07-31)

Capsule: `docs/task-capsules/2026/07/job_maus_eigener_browser_20260731/CAPSULE.md`
HEAD vor der Aenderung: `e603802`.

## Die Sitzung: WO der Zustand liegen darf

Ein Browser laesst sich nicht auf einen Objektspeicher legen — er lebt
zwangslaeufig im Prozess. Die Zustandslos-Pflicht ist trotzdem erfuellbar,
indem man trennt:

- **im Prozess:** der lebende Browser (`session-registry.mjs`)
- **auf IDrive e2:** die WAHRHEIT darueber, ob eine Sitzung gilt und wer sie
  haelt (`session-lease.mjs`)

Jede Instanz liest den Lease, bevor sie eine Sitzung anfasst. Fremd gehaltene
Sitzung => HTTP 409, **nie** still ein zweiter Browser. Ein abgelaufener Lease
gilt als frei — das ist der Selbstheilungspfad nach Scale-to-zero oder Neustart.
Zwei Grenzen, beide noetig: Leerlauf 10 min (haelt nichts unnoetig offen) und
Hartlimit 60 min ab Erstellung (verhindert die ewig verlaengerte Sitzung).

## Warum KEIN zweiter Sitzungs-Motor entstand

`workers/remote-browser/session-engine.js` gab es schon. Er gehoert aber zum
Live-Browser-Dienst: andere Aktionssprache (click/type/scroll mit
Prozentkoordinaten), anderer Worker, anderes Dockerfile, Zustand rein im
Serverspeicher. Die Maus arbeitet nach `schemas/maus-action-plan.schema.json`
durch den Interpreter mit Allowlist, Budget und Vault. Zusammenlegen haette eine
der beiden Aktionssprachen gebrochen. Uebernommen wurde sein **Muster**
(Idle-Timeout + Hartlimit + Obergrenze), nicht sein Code. Die Begruendung steht
im Dateikopf, damit sie nicht in einem halben Jahr neu erarbeitet wird.

## Zwei Dinge, die man beim Weiterlaufen leicht uebersieht

1. **Budget je Auftrag zuruecksetzen.** `state.executedActions` gehoert zum
   Auftrag, nicht zur Sitzung. Ohne Ruecksetzung ist der zweite Auftrag einer
   langen Sitzung schon beim Start "verbraucht".
2. **exit-after-run darf nicht mehr blind feuern.** Solange eine Sitzung lebt,
   waere das genau der Kaltstart, den der Sitzungs-Modus abschafft.

## Messung (echter Browser, kein Modell, keine Kosten)

`scripts/diagnose/maus-sitzung-beweis.mjs`, Ziel `https://smejj.com/`:

| Messpunkt | Ergebnis |
| --- | --- |
| Auftrag 1 (oeffnen + navigieren) | ok, 3/3 Schritte, 3,3 s |
| Auftrag 2 (bewusst OHNE navigate) | ok, 3/3 Schritte, **0,0 s** |
| aktive Seite in beiden Auftraegen | `https://smejj.com/auth/login/` |
| Browserstarts fuer zwei Auftraege | **1** (vorher 2) |

## Live zuschauen: die eigentliche Luecke war die planId

`live-publisher.mjs` schrieb schon pro Schritt mit, `maus-replay.js` konnte
schon live — aber der Live-Pfad in der Capsule lautet
`capsules/maus-engine/<capsuleRef>/result/<planId>/live/status.json`, und der
Control-Server kannte die `planId` erst am ENDE des Laufs. Genau dazwischen lag
"der Lauf laeuft, aber niemand kann zuschauen".

Loesung: `planAndExecute` meldet ueber `onPlan` einen gueltigen Plan, BEVOR er
ausgefuehrt wird; der Control-Server veroeffentlicht die planId daraufhin sofort.
`?runId=...&live=1` reicht der Wiedergabe seitdem allein.

Der Rueckruf ist fail-safe gekapselt — dieselbe Regel wie beim Live-Publisher:
**die Anzeige ist Beiwerk, der Lauf ist die Wahrheit.**

## Startseiten-Budget: dynamisch importieren statt eager

`public/maus-auftrag.js` schliesst die Luecke "im Frontend gab es keinen Weg,
einen Lauf zu STARTEN". Es wird bewusst per dynamischem Import in
`maus-panel.js` geladen, nicht als Abhaengigkeit oben. Die gelockte Startseite
wird dadurch fuer Besuche ohne Auftrag um kein Byte schwerer. Gemessener
Mehraufwand der Startseite insgesamt: **+711 Byte gzip** (0,24 %).

## Chrome-Adapter: die Naht entscheidet ueber die Sicherheit

Der zweite Adapter setzt an derselben Naht an wie Playwright — an der
`browserFactory`. Dadurch gelten Interpreter, Domain-Allowlist, Schritt- und
Zeitbudget, Datei-Grenzen und Secret-Vault **bauartbedingt** fuer beide Wege.
Es gibt keinen Weg am Tor vorbei, weil es keinen zweiten Interpreter gibt. Per
Test belegt: ein Ziel ausserhalb der Allowlist erreicht die Erweiterung nie.

**Nie `--remote-debugging-port`.** Der Port kennt keine Herkunftspruefung und
gibt in einem Zug alle angemeldeten Konten des Betreibers frei.

Vier Schranken, alle muessen zustimmen: Allowlist des Plans, freigegebene
Herkunft, Chromes eigener Berechtigungsdialog, Ablauf nach 30 Minuten.
Gesperrt bleiben: Passwortfelder, Secrets, Cookies, `storageState`, Dateien,
`evaluate`, xpath, `http://`.

## Angemeldet bleiben

Der Cookie-Krug haengt jetzt an der SITZUNG statt nur an einzelnen
Plan-Schritten: beim Sitzungsende auf e2 gesichert, beim naechsten Start in den
frischen Kontext gelegt. Eine einmal im Beisein des Betreibers gemachte
Anmeldung ueberlebt damit das Sitzungsende — ohne Passwort in Plan, Prompt oder
Log.

## Fallen dieser Sitzung

1. **ESM ignoriert `NODE_PATH`.** Der Beweislauf meldete "Playwright ist nicht
   installiert", obwohl es installiert war. Ein Werkzeug muss den ECHTEN
   Ladefehler mitmelden, nicht nur "fehlt".
2. **Ein zu freundliches Testdouble misst sich selbst.** Der Chrome-Mock meldete
   auf jede Abfrage einen Treffer; dadurch "fand" die Cookie-Banner-Heuristik
   einen Banner, den es nicht gab. Testdoubles muessen "nicht da" koennen.
3. **Das Tor greift frueher als vermutet.** Ein Ziel ausserhalb der Allowlist
   scheitert schon im Plan-Validator, nicht erst im Lauf.

## Was noch nicht wirkt — und warum

- **Teil 0 (Token + Eimer)** unveraendert offen, am 2026-07-31 nachgemessen:
  `maus-abgleich.mjs` Exit 2, Engine nimmt den lokalen Token (422) und lehnt den
  des Control-Servers ab (401), Artefakte in `smejj-model-files`, Control liest
  `smejj-app`. Rote Liste, Betreiber.
- **Maus-Engine** laeuft aus `ghcr.io/...:v1`; ein `git push` baut sie nicht neu.
  Teil 1 und 4 wirken erst nach einem neuen Abbild.
- **Control-Server**-Release endet im gesperrten Env-Schreibzugriff (Teil 2).
- **Frontend** waere ausrollbar, wurde aber bewusst zurueckgehalten: ohne Teil 0
  laesst sich die Kette live nicht nachweisen. Beim Deploy `CACHE_NAME` in
  `sw.js` auf LIVE-Basis bumpen UND `maus-panel.js?v=3` in `index.html` erhoehen.
- **Teil 5 (signierte Upload-Adressen)** bewusst nicht gebaut — der Auftrag
  selbst sagt: erst wenn der Ausrollweg offen ist.
