# Memory_Bank — 2026-07-28: EU AI Act und Adminbereich Stufe 2

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_aiact_adminstufe2_20260728`.

## [2026-07-28] EU AI ACT NACHGEWIESEN + ADMINBEREICH STUFE 2 LIVE

Freigabe: "Ja. Mach du komplett fertig, las nicht offen." (Wof Kadavanich,
2026-07-28) auf die Empfehlung, erst den AI Act und dann Stufe 2 zu machen.
Commit `c450fbf`, live als Control-Server-**Version 94**, Artefakt
`deployments/control/smejj-control-stufe2-2026-07-28.tar.gz`, Rueckweg
`deployments/control/smejj-control-admin-stage1c-2026-07-28.tar.gz`.
Oberflaeche: `https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/admin`.

### EU AI Act (Frist 2026-08-02)

- AUSGANGSLAGE WAR NULL: die Suche nach "ai act" im ganzen Repository lieferte
  keinen einzigen Treffer. Jetzt:
  `docs/compliance/EU_AI_ACT_BESTANDSVERZEICHNIS.md` (sieben Systeme, Anhang III
  Punkt fuer Punkt geprueft, Art. 5 durchgegangen) und
  `docs/compliance/RISIKOEINSTUFUNG_MAUS_ENGINE.md`.
- MAUS-ENGINE: **kein Hochrisiko** — kein Anhang-III-Fall, sie handelt im Auftrag
  und im Kontext derselben Person, die sie startet. **Aber verschaerfte
  Transparenz.** Die Begruendung, die man sich merken sollte: sie handelt, statt
  zu antworten — ein Klick ist irreversibel, ein Satz nicht — und sie arbeitet
  ohne Zwischenbestaetigung zwischen Auftrag und Ergebnis.
- DOKUMENT UND LAUFZEIT DUERFEN NICHT AUSEINANDERLAUFEN:
  `control-server/src/compliance/aiTransparency.js` ist die maschinenlesbare
  Fassung derselben Aussage. Tests erzwingen, dass kein System als Hochrisiko
  eingestuft ist und dass jedes System mit begrenztem Risiko Transparenzpflicht
  UND Protokollierung traegt. `Object.freeze` verhindert, dass jemand die
  Einstufung zur Laufzeit dreht.
- TRANSPARENZ-ENDPUNKT OHNE ANMELDUNG: `/api/compliance/ai-systems`. Eine
  Informationspflicht hinter einem Login waere keine. Nur GET, POST -> 405.
- KENNZEICHNUNG: Maus-Engine-Antworten tragen `x-smejj-ai-generated`,
  `x-smejj-ai-system`, `x-smejj-ai-risk` und `x-smejj-ai-notice` sowie das Feld
  `transparenzhinweis` — auch die Fehlerantworten, damit der Hinweis nicht
  ausgerechnet dann fehlt, wenn etwas schiefgeht. Live auf einer 400 belegt.

### Adminbereich Stufe 2

- **Die Oberflaeche liegt im Control-Server unter `/admin`, nicht unter
  `public/`.** Wichtigste Entscheidung des Jobs: kein DNS-Eintrag, kein
  Frontend-Deploy, kein Service-Worker, kein Cache-Bump, keine Datei im
  Start-Lock. Belegt durch unveraenderte Web Vitals (LCP p75 568 ms kalt /
  308 ms warm) und null Dateien unter `public/`. Static-First bleibt unberuehrt:
  faellt der Control-Server aus, ist auch die Admin-API weg — die Konsole waere
  ohnehin nutzlos, die Startseite laedt weiter.
- FALLE GENERISCHER AUTH-FILTER: `/admin` stand zuerst in
  `requiresAuthenticatedControlAccess`. Dadurch bekam ein Mensch am Browser
  `{"error":"authentication_required"}` als rohes JSON, bevor die Route lief.
  **Regel: Routen, die HTML an Menschen ausliefern, gehoeren nicht in den
  JSON-Filter.** Die Konsole loest ihre Sitzung selbst auf und prueft den
  Widerruf mit.
- FALLE FEHLERSEITE OHNE STIL: das Stylesheet lag hinter demselben Gate wie
  alles andere — die Erklaerung, warum jemand abgewiesen wird, waere
  unformatiert gewesen. `console.css` wird vor der Rollenpruefung ausgeliefert;
  es traegt keine Daten.
- LESEZUGRIFFE AUF NUTZERAKTEN WERDEN PROTOKOLLIERT (`user.record.read`), mit
  Pflichtgrund. Fail-closed in die andere Richtung als sonst: schlaegt der
  NACHWEIS fehl, gibt es keine Daten — ein Zugriff ohne Spur waere schlimmer als
  kein Zugriff. Das war der bewusst offene Punkt aus Stufe 1.
- AUFFRISCHUNG OHNE ZEITGEBER: ein Timer liefe auch dann, wenn niemand hinsieht,
  und kostet je Lauf ein LIST plus ein GET je Konto. Stattdessen stoesst die
  erste Anfrage mit veraltetem Index den Neubau im Hintergrund an und bekommt
  sofort den alten Stand mit Vermerk. Live beobachtet: 52 Min alt -> Antwort
  sofort -> danach 26 s alt.
- AUDIT-ZEITRAUM: mit `from`/`to` wird NICHT auf das gesamte Log zurueckgefallen.
  Sonst waere eine leere Antwort auf einen Zeitraum ploetzlich eine Antwort ueber
  alles — bei einem Nachweis-Register nicht hinnehmbar. Monatsspanne hart auf 24
  gedeckelt, die Deckelung ist im Ergebnis sichtbar.
- FALLE PFAD-TRAVERSAL-TEST: `/admin/../package.json` wird von der URL-Klasse zu
  `/package.json` normalisiert, bevor die Route den Pfad sieht. Der Test darf
  deshalb nicht "404" erwarten, sondern nur "die Konsole gibt keine Datei
  heraus". Die Auslieferung nutzt eine feste Dateiliste statt Pfadaufloesung.

### Parallel-Sessions und das Deployen

Die Parallel-Session machte zweimal den Preflight im Hauptbaum rot: `public/sw.js`
gegen den Start-Lock und acht Tests in `tests/model-registry.test.mjs`. Nachweis,
dass es nicht am eigenen Stand lag: derselbe Fehlschlag im Worktree bei `491ef9b`,
also VOR dem eigenen Commit.

**Konsequenz fuers Deployen, ab jetzt Standard: das Release-Artefakt aus einem
isolierten Worktree des eigenen Commits bauen, nicht aus dem Hauptbaum.** Sonst
geht fremder, unverbuchter Arbeitsstand mit live. Belegt: `firstTokenProbe.js`
(fremde WIP-Datei) ist nicht im Manifest des ausgelieferten Artefakts.

### Offen und bewusst so

Der zusaetzliche In-App-Banner waehrend eines Maus-Engine-Laufs beruehrt
`public/index.html` und `public/browser-pane.js` (Design-Lock) und braucht eine
schriftliche Freigabe. Der Hinweis geht bereits serverseitig mit jeder Antwort
mit — die Informationspflicht ist erfuellt, der Banner waere die Verstaerkung.

Benchmark: `docs/benchmarks/aiact_adminstufe2_2026-07-28.json`. 99 Unit-Tests
gruen (26 neue). Alle Performance-Budgets eingehalten.
