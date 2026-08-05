## 2026-08-04 — Suchquelle mit Schluessel (Tavily, BYOK)

Betreiber-Freigabe: „Ja, mach die Suchquelle mit Schlüssel." Nachweis in
`docs/approvals/2026-08-04-suchquelle-mit-schluessel.md`, Policy-Ausnahme 3.

- **ANBIETERWAHL IST EINE MESSUNG, KEINE ERINNERUNG.** Am selben Tag geprueft:
  Brave hat sein Gratiskontingent im **Februar 2026 abgeschafft** (Karte pflicht,
  metered), Google Custom Search ist **fuer Neukunden geschlossen** und wird zum
  2027-01-01 abgeschaltet. Beides waere aus dem Gedaechtnis heraus falsch gewaehlt
  worden. Geblieben: **Tavily, 1000 Credits/Monat, KEINE Karte noetig.**
- **DIE KOSTENGARANTIE IST DIE FEHLENDE KARTE, NICHT DER CODE.** Ohne hinterlegte
  Zahlungsart kann beim Anbieter nichts abgerechnet werden. Der Monatsdeckel im
  Code (`SMEJJ_SEARCH_API_MONTHLY_MAX`, 900 von 1000, greift VOR dem Aufruf) ist
  bewusst die ZWEITE Linie — sein Zaehler liegt im Speicher und faellt beim
  Neustart zurueck. `search_depth: "basic"` kostet 1 Credit statt 2.
- **Tavily erwartet den ausgeschriebenen Landesnamen** (`"united states"`), NICHT
  das Kuerzel — ein Kuerzel wird still ignoriert, der Markt waere wirkungslos.
- Fail-closed: ohne Schluessel kein einziger Netzaufruf dorthin, alter Weg
  unveraendert. Live belegt (Control 136): `suchquelle.konfiguriert: false`,
  Suche laeuft weiter ueber DuckDuckGo.
- **DIE DUCKDUCKGO-SPERRE WAR ZEITWEILIG.** Am selben Tag lieferten dieselben
  Fragen erst 0 Treffer (HTTP 202 Sperrseite), Stunden spaeter wieder 8 gute.
  Merkregel: Eine Sperre EINMAL messen reicht nicht — vor „der Dienst ist tot"
  zeitversetzt nachmessen. Die Schluesselquelle ist damit kein Ersatz, sondern
  eine Absicherung gegen die Laune einer fremden Suchmaschine.
- Ergebnis der Suchkette nach allen Korrekturen, live: `office space for sale
  San Jose` -> loopnet.com, crexi.com, realmo.com. `Schlagzeilen Berlin heute`
  -> rbb24, BZ, Tagesspiegel. `Öffnungszeiten Zoo Berlin` -> zoo-berlin.de.
- Der Schluessel selbst ist Betreibersache: `smejj.com Suchschluessel-setzen.command`
  (zeigt ihn nie an, prueft das Format, schreibt genau einen Wert).
