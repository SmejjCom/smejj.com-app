# Task Capsule — cline-raus-auto-neu_20260910

Datum: 2026-09-10
Auftrag: Betreiber (Wof Kadavanich) — A-bis-Z-Ueberarbeitung in 20 Punkten.
Diese Kapsel deckt Punkt 1 (Cline vollstaendig entfernen) und Punkt 2
(Auto-Modellrouting).
Status: beide live verifiziert (smejj.com auf smejj-shell-v832,
api.smejj.com meldet `auto: {active: true, status: "ready"}`)

## Punkt 1 — Cline vollstaendig entfernen

Betreiber im Wortlaut: "Cline muss vollstaendig aus der App entfernt werden ...
Im Modellbereich duerfen nur noch diese Bereiche existieren: Unsere Modelle
(smejj 1.3, 1.2, 1.1, zukuenftige smejj-Versionen automatisch ergaenzen) / Auto.
Die neueste und staerkste smejj-Version muss immer ganz oben stehen."

### Der Kern war nicht das Aufraeumen, sondern dass "Auto" darueber lief

Die Auto-Zeile schrieb `smejj.model.selected.v2 = "Cline"` und setzte per
`POST /api/providers/cline/select` eine fremde Modell-ID. Drei belegte Folgen:

1. Ohne fremden Schluessel endete JEDE Auto-Anfrage in einer Sackgasse
   ("Automatische Modellwahl hat nicht geklappt", Betreiber-Screenshots 07.09.)
   — Auto war genau dann kaputt, wenn man es am meisten braucht.
2. Der Vorab-Rundlauf kostete 1,07 s von 1,87 s bis zum ersten Wort (05.09.).
3. Eigene, kostenlose und lokale Modelle konnten nie gewinnen: sie standen
   nicht in der Liste.

### Entfernt

| Datei / Stelle | Umfang |
|---|---|
| `public/cline-model-menu.js` + `.css` | 342 + 85 Zeilen |
| `public/provider-settings.js` + `.css` | 234 + 13 Zeilen |
| `runClineChat()` in `ai/chatClient.js` | 92 Zeilen |
| Fremdkatalog in `code-modell-menue.js` | 126 Zeilen |
| `public/ai/modellRouter.js` (zweiter Router) | 91 Zeilen |
| Eintraege in `app.js`, `index.html`, `sw.js`, `providers-catalog.js`, `settings-surface.js`, `hilfe.html` | — |

Die Precache-Zeilen MUSSTEN mit: `cache.addAll` bricht beim ersten 404 ab —
waeren sie geblieben, haette sich der Service Worker nicht mehr installiert und
die App waere fuer wiederkehrende Nutzer tot (dieselbe Falle wie bei
app-helfer.js am 09.09.).

Wer "Cline" noch im Browserspeicher hat, wird still auf Auto gesetzt
(`migriereAlteWahl`). Live nachgemessen: `smejj.cline.model.v1` ist nach dem
Laden `null`, `smejj.model.selected.v2` steht auf `"Auto"`.

### Die Liste steht jetzt als Daten

`SMEJJ_STAFFEL` im Menue, sortiert mit `nachVersionAbsteigend()` — nach ZAHL,
damit 1.10 spaeter ueber 1.9 steht und nicht darunter. Eine neue Version ist
eine Zeile. Vorher wurde die Liste bei jedem Oeffnen frisch geholt und konnte
halb ankommen; genau diesen Ausfall meldete der Betreiber am 23.08.

## Punkt 2 — Auto waehlt wirklich aus

Vorher: zwei if-Zeilen (Coding -> Kimi, Fast -> smejj-fast-1) und ein Schalter,
der per Vorgabe AUS stand. "auto" kam an, wurde erkannt — und nahm dann still
das Standardmodell.

Jetzt `bewerteFuerAuto()` als reine Funktion, Kriterien in dieser Reihenfolge:

1. **Eignung ist ein Ausschluss, kein Abzug.** Nur Profil `fast` darf ein
   Modell unter 100.000 Tokens nehmen. Ein zu kleines Kontextfenster spart
   nichts, es schneidet den Auftrag ab.
2. **Kosten sind eine harte Grenze.** Ein Modell, das echtes Guthaben zieht,
   waehlt die Automatik NIE von sich aus; von Hand bleibt es waehlbar. Ein
   Punktabzug haette das nicht getragen: beim Ausfall des kostenlosen Modells
   haette die Automatik still Geld ausgegeben.
3. **Danach Punkte.** Eigene Modelle +30 (Projektziel), kostenlos +25, Tempo je
   nach Profil, ausgefallen -100 — letzte Wahl statt Ausschluss, damit die
   Ersatzkette nicht leer laeuft.

### Drei Fehler dabei gefunden und behoben

* Das Profil `reasoning` fiel durch alle Zweige und wurde wie eine kurze
  Alltagsfrage behandelt — ausgerechnet bei der Aufgabe, die Nachdenken heisst,
  gewann das schnellste kleine Modell. Aufgefallen an einem Bestandstest.
* `web` fehlte ebenfalls; `ROUTING_PROFILES` kennt fuenf Profile, nicht drei.
* `BRAND_ALIASES` kannte nur "smejj 1.0" — 1.1 bis 1.3 wurden als unbekannte
  Anbieterwahl behandelt statt als Markenname der Plattform.

### Eine alte Inkonsequenz mitgeraeumt

Der Bestand verbot Kimi K3 die automatische Wahl ("kostenpflichtig, niemals
ohne ausdrueckliches Flag + Key"), erlaubte Kimi K2.7 bei Coding aber genau das
— beim selben Anbieter, fuer dasselbe Geld. Jetzt gilt fuer beide dieselbe
Regel.

## Sperren

Der Modell-Menue-Lock schuetzte woertlich die Cline-Liste (Auftrag 23.08.:
"Genau diese Liste ich will haben"). Der neue Auftrag hebt den alten auf; der
Schutz wurde auf die neue Liste umgestellt, nicht abgeschafft.
`tests/modellmenue-lock.test.mjs` bewacht ihre Struktur mit TUEV-Proben (jede
Pruefung hat eine gesunde UND eine kaputte Probe).
`tests/cline-provider-frontend.test.mjs` wurde zu
`cline-entfernt-frontend.test.mjs`: sie bewacht ab jetzt die ABWESENHEIT.

## Messung

| Probe | Ergebnis |
|---|---|
| Volle Suite im Bauzweig | 3577 von 3580 gruen (3 Sperren-Proben, mit Stempel gruen) |
| `tests/auto-modellwahl.test.mjs` | 10 von 10 |
| Live: `/assets/cline-model-menu.js` | HTTP 404 |
| Live: Precache-Liste | 0 Treffer auf entfernte Dateien |
| Live: Service Worker | v832 installiert sich sauber (Cache angelegt) |
| Live: Modellknopf | "Auto" |
| Live: `/api/health` auto | `{active: true, status: "ready"}` |

## Was NICHT erledigt ist

* **Backend-Cline.** `control-server/src/providers/clineClient.js`,
  `providerRoutes.js`, `src/agent/providers/clineProvider.js` und ihre Aufrufer
  in `agentRoutes.js` und `workerModelRoutes.js`. `agentRoutes.js` ist der Kern
  des Chat-Wegs — dort falsch zu schneiden legt den Chat lahm. Braucht eine
  eigene, gemessene Etappe.
* **Ende-zu-Ende-Test von Auto.** Eine echte Chat-Antwort ueber Auto braucht
  eine Anmeldung; Zugangsdaten gebe ich nicht ein.
* **Mehr Modelle zur Wahl.** Live ist nur glm-5-2 vollstaendig konfiguriert.
  Das ist eine Frage von Schluesseln und Adressen, nicht von Code.
* **Punkte 3 bis 20** des Auftrags (Chat, Code, Sprachwelle, Video, Responsive,
  A-bis-Z-Rundgang, Performance, Sicherheit).

## Lehren

* **Ein Lock kann eine Betreiber-Entscheidung von gestern gegen die von heute
  verteidigen.** Wer einen Lock findet, der dem aktuellen Auftrag widerspricht,
  muss ihn umstellen — nicht abschaffen und nicht umgehen.
* **Cherry-Pick in den Bauzweig ist Pflichtprogramm.** Die Kaskade baut aus
  `feature/auth-redesign-github-magiclink`; ein Umbau nur im QA-Zweig laesst
  `check:precache-imports` scheitern. Und der Bauzweig hatte eigene neuere
  Arbeit — Konflikte einzeln loesen, nicht pauschal ueberschreiben.
* **`git add <ordner>` sammelt fremde Arbeit ein.** Ein `git add tests` hat eine
  unfertige Testdatei einer Parallelsitzung mitgenommen
  (`hausmodell-adapter.test.mjs`, rot weil ihre Quelle noch fehlt). Sie wurde
  aus dem Bauzweig-Pick wieder entfernt; im QA-Zweig blieb sie stehen, weil
  Loeschen der anderen Sitzung ihre Arbeit genommen haette.
