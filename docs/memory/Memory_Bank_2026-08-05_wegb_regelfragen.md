## 2026-08-05 — Weg B: Regelfragen-Anreicherung statt Schwellensenkung

Freigabe des Betreibers ("Ja, mach Weg B"). `control-server/src/rag/regelfragen.js`
+ Verdrahtung in `ragContextBlock.reichereFrageAn()`. **MIN_TOP_SCORE bleibt 20.**
- VORGESCHICHTE: die allgemeine Senkung auf 12 wurde gebaut und ZURUECKGENOMMEN.
  Sie brach `tests/rag-infrastruktur.test.mjs` — "Wie viele aktive Nutzerkonten
  hat smejj.com heute?" bekam bei 12 einen Auszug aus FREE_ONLY_MASTER_POLICY ::
  Skalierungsregel (13,3). MERKREGEL: **einen Waechter passend zu machen, damit
  die eigene Aenderung durchgeht, ist Rote Liste** — das schaltet eine
  verifizierte Schutzfunktion ab.
- VERFAHREN (gespiegelt von infrastrukturFrage.js): erkannte Frage wird um die
  NAMEN und ROLLEN ihres Regeldokuments ergaenzt, erreicht die UNVERAENDERTE
  Schwelle aus eigener Kraft. Drei Klassen: schutz, trainingsdaten, memory.
  Aufnahmekriterium ist eine Bauartaussage (MASTER_PROMPT/AI_Guidelines/AGENTS
  benennen ein verbindliches Dokument), NICHT die Eval-Suite — sonst bestaetigte
  die Suite sich selbst.
- WIRKUNG gemessen gegen die Deckenmessung: Trefferquote 27 % -> **32 %**
  (51 von 157), falsch geoeffnet 22 % -> 25 % (34 von 138). **+9 gefunden gegen
  +4 falsch** — deutlich besseres Verhaeltnis als die Schwellensenkung (52:66).
- ZWEI EIGENE FEHLER, die die eigenen Tests fingen: "niemals" stand als WERTUNG
  im Vokabular (haette dem Modell die Antwort in den Mund gelegt), und die
  Change-Lock-Formulierung ("verifizierte Funktion ausbauen") fehlte in der
  Erkennung.
- BUENDEL-FALLE: der Bridge-Bundler flacht alle Module in EINEN Namensraum;
  ein zweites `BEFEHLSFORM` brach `bundle_duplicate_symbol`. Geloest durch
  TEILEN statt Kopieren — eine sicherheitskritische Regex an zwei Stellen
  driftet unbemerkt auseinander.
- NOCH NICHT AUSGELIEFERT: wirkt erst nach Bridge-Buendel + Control-Release.
