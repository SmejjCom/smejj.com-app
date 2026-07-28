> Ausgelagert aus Memory_Bank.md am 2026-07-28 wegen der 800-Zeilen-Regel.
> Wortgleiche Kopie, nichts geloescht.

## 2026-07-28 — Precache vollstaendig, kein Aufruf im Ladepfad (job_letzte_reste_20260728)
- OFFLINE-TOTALAUSFALL BEHOBEN: Acht importierte Module fehlten im
  Service-Worker-Precache — darunter chat-history-context.js, das app.js SELBST
  importiert. Offline lieferte der Fetch-Handler dafuer den Rueckfall "/"
  (index.html), der Browser bekam HTML statt JavaScript und brach das Modul ab.
  Neu im SHELL: account-sessions.js, api-keys-surface.js, chat-history-context.js,
  i18n/ui.js, language-options.js, onboarding-welcome.js, usage-meter.js,
  ai/providers-catalog.js. Alle vorher live auf HTTP 200 geprueft — EIN einziger
  404 im SHELL laesst cache.addAll scheitern und der Service Worker installiert
  sich GAR NICHT.
- NEUE DAUERPRUEFUNG: `npm run check:precache-imports`
  (scripts/check-precache-imports.mjs) verfolgt den Importgraph aller
  Precache-Module und meldet jede Luecke, fail-closed; in check:frontend
  verdrahtet. WICHTIG beim Aufloesen: relative Importe am Ordner der QUELLDATEI
  aufloesen (public/x.js -> /assets/x.js), sonst entstehen Fehltreffer bei
  Unterordnern wie ai/ und storage/. Die Pruefung fand transitiv sofort eine
  weitere Luecke, die von Hand niemand gesehen haette.
- LEHRE (kostete zwei Deploy-Runden): In deferred-start.js rannten
  Paint-Beobachtung und Rueckfallweg per Promise.race GEGENEINANDER — der
  SCHNELLERE gewann. Zwei rAF plus setTimeout sind bei warmem Cache schneller
  als der echte Bildaufbau und haben die Beobachtung ueberholt. Ein Rueckfallweg
  darf NIE gegen das genauere Signal rennen, sondern nur greifen, wenn es dieses
  Signal gar nicht gibt. Behoben in sw v154.
- LEHRE START-LOCK: Bei parallelen Sitzungen NIEMALS gegen den Arbeitsordner
  einfrieren. Beim ersten Versuch landeten unfertige Dateien einer anderen
  Sitzung (app.js, search.js, composer-tools.js) als "eingefrorener Stand" im
  Manifest. Richtig: Manifest in einem isolierten `git worktree` auf dem
  committeten Stand erzeugen und zurueckkopieren. Gleiches gilt fuer die
  Pflicht-Checks, wenn fremde Aenderungen im Ordner liegen.
- ERGEBNIS live verifiziert (sw v154): Erstbesuch 0 von 9 API-Aufrufen vor dem
  Bildaufbau, Wiederbesuch 0 von 9. Service Worker aktiv mit 100 Eintraegen.
  Offline: 74 Module aus dem Cache, 0 Modulfehler, 0 JavaScript-Fehler,
  Eingabefeld und Navigation vorhanden. Die drei offline auffaelligen Antworten
  sind HTTP 401 der API (Authentifizierung), keine Ladefehler.
- Benchmark: docs/benchmarks/webvitals_final_2026-07-28.json — keine Verstoesse.
