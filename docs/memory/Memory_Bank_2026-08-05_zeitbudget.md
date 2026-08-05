# Memory_Bank — Volltext: Zeitbudget, die Route entscheidet (job_zeitbudget_route_20260805)

Gleich als Volltext hier abgelegt (800-Zeilen-Regel), im Index steht ein Zeiger.
Task Capsule: `task-capsules/2026/08/job_zeitbudget_route_20260805/capsule.md`.

- ERLEDIGT + LIVE ABGENOMMEN (sw v224, Frontend `77c7951`, App `ce9ed39`).
  Befund: "Verbindung zum Server unterbrochen" bei Werkzeug-Antworten, obwohl
  der Server weiterarbeitete; der zweite Versuch derselben Frage klappte.

- ERSTE HYPOTHESE WIDERLEGT, nicht geraten. Vermutung war, `streamViaControl`
  schicke die Antwort-Kopfzeilen erst NACH der Werkzeugarbeit (writeHead erst
  nach `await fetch`). Gemessen am Control Server: erstes Byte **1,355 s**,
  Gesamtantwort 23,851 s. Die Kopfzeilen sind schnell da. Ein Umbau der
  Streaming-Kernlogik haette nichts behoben — die Messung hat ihn verhindert.

- WURZEL, im Browser gemessen (Zeit bis zu den ANTWORT-KOPFZEILEN, gueltiger
  Token): einfache Frage **852 ms**, `/api/agent`-Frage **4704 ms** gegen ein
  Budget von 6500 ms. Nur 1,8 s Luft, bei einer Kettenlatenz die an diesem Tag
  zwischen 258 und 864 ms schwankte.
  `firstByteBudgetFor` entschied ausschliesslich am MODELLNAMEN im Rumpf
  (`/glm|kimi|cline/`). Der sagt, WELCHES Modell antwortet — nicht, ob vorher
  gesucht und eine Seite geholt wird. Das entscheidet die ROUTE.

- LOESUNG: `DEEP_LANE_ROUTE = /\/api\/agent(?:[/?#]|$)/`. `/api/agent` bekommt
  15 s, `/api/chat` bleibt bei 6,5 s — der schnelle Wechsel auf die Reserve ist
  gewollt, eine tote Replika soll niemanden warten lassen. Der dritte Parameter
  von `firstByteBudgetFor` ist rueckwaertskompatibel: ohne Adresse gilt
  unveraendert der Modellname.

- MERKREGEL 1 (Testfalle): Ein Beweistest mit NUR EINEM Ziel ist hier wertlos.
  Bei einem Ziel ist der erste Versuch zugleich der letzte und war ueber
  `letzterBudgetMs` schon immer geduldig — der Test bestand auch gegen den alten
  Code. Erst mit ZWEI Endpunkten (`buildChatTargets`, wie die App wirklich
  fragt) zeigt sich der Unterschied. Gegenbeweis danach: 3 von 18 rot.

- MERKREGEL 2 (teuer, zweimal passiert): `grep -oE 'smejj-shell-v[0-9]+' | head -1`
  traf **Zeile 569, einen Kommentar**, statt der Konstante auf Zeile 582. Ich
  habe die Versions-Tests daraufhin erst richtig gesetzt, dann falsch
  "korrigiert", dann zurueck. **Nach der KONSTANTE suchen** (`CACHE_NAME = "…"`),
  nie nach einer Zeichenkette, die auch im Fliesstext vorkommt.

- MERKREGEL 3 (Nachmessen nach Deploy): Direkt nach der Auslieferung lieferte
  das GELADENE Modul noch 6500 ms, obwohl die ausgelieferte Datei den Fix trug.
  Der Browser haelt die alte Fassung in seiner Modul-Registry. Erst ein weiteres
  Neuladen zeigte 15000 ms; zur Kontrolle ein Import mit `?frisch=`-Anhang.

- AUSLIEFERUNG IN ZWEI SCHRITTEN, weil `ai/fetch-retry.js` cache-first im
  Precache liegt: die Datei allein (`a3acc2c`) erreichte nur NEUE Besucher, erst
  der `CACHE_NAME`-Sprung v223 -> v224 (`77c7951`) die Bestandsnutzer.
  Die Versionsnotiz in `sw.js` musste DREIMAL gekuerzt werden: Grundstand 795
  Zeilen, die 800er-Grenze laesst vier Zeilen Platz.

- LIVE BELEGT: Cache nur noch `smejj-shell-v224`; geladenes Modul liefert
  `/api/agent` 15000, `/api/chat` 6500, ohne Adresse 6500. Echter Klickpfad:
  die zuvor abbrechende Frage antwortet "laeuft auf GitHub Pages (Free only) …
  IDrive e2 als Vault/Hauptspeicher".

- OFFEN (kein Fehler, eine Eigenschaft): Der Werkzeug-Pfad braucht 4,7 s bis zum
  ersten Byte und rund 24 s bis zur fertigen Antwort. Das Budget faengt das ab,
  macht es aber nicht schneller. Naechster Hebel waere ein sichtbares
  Arbeitssignal waehrend der Werkzeugphase — nicht mehr Timeout.
