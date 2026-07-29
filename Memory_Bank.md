# Memory_Bank.md — Verifiziertes Gedaechtnis von smejj.com
Nur verifizierte, erfolgreiche Loesungen und Architekturentscheidungen. Kein Eintrag ohne bestandene Verification Pipeline. Fehlgeschlagene Builds und Halluzinationen werden niemals aufgenommen.
## Eintragsformat
Jeder Eintrag nennt Datum, Typ, Capsule, Entscheidung, Begruendung und Verifikation.
---
## Architekturentscheidungen

### [2026-07-29] CODEBLOCK MIT EINEM KLICK KOPIEREN (job_chat_code_copy_20260729)

Live smejj.com, **sw v192** (Frontend `4697269`, App-Repo `5af5738`). Volltext:
[docs/memory/Memory_Bank_2026-07-29_chat_code_copy.md](docs/memory/Memory_Bank_2026-07-29_chat_code_copy.md).
- **REGEL: kein Textknoten in einem Bedienelement INNERHALB einer Nachricht** —
  `chat-store.js` speichert `entry.textContent`, daraus baut
  `chat-history-context.js` den Modellkontext. Beschriftung aus CSS `::after`.
- Nur per Browsertest gefunden: Touch-Ziel 31x23 statt 42 px (`min-height: 0`
  hebelt die Projektregel aus), 17 px Ueberlappung durch hoehere Spezifitaet
  von `.entry.assistant .chat-code`.
- **Deploy auf LIVE-Basis:** live v191, Repo v186 — lokale `sw.js` hochladen
  haette fuenf Fremdversionen zurueckgerollt. Erstbesuch-Gewicht 288/300 KB.

### [2026-07-29] WEBSUCHE: ZWEI WEICHEN, EINE WAHRHEIT (job_websuche_selbstkorrektur_20260729)

Commits `c476fd6`..`677dc53`, Control-Server **Version 118**, Bridge **v104**.
Volltext/Messwerte: `docs/task-capsules/2026/07/job_websuche_selbstkorrektur_20260729/CAPSULE.md`.

- **Befund:** "Schlagzeile" loeste keine Suche aus, "Schlagzeilen" schon;
  Umlaut-Ausloeser waren transliteriert notiert und trafen nie. **Fix:
  Normalisierung + Wortstaemme statt Vollformen.**
- **DIE WICHTIGSTE ERKENNTNIS: es gibt ZWEI Such-Weichen.** Die in
  `public/chat-bridge.js` entscheidet Schnellspur **oder** Control-Server. Sagt
  sie nein, erreicht die Frage den Control-Server **nie** — ein Fix nur dort ist
  wirkungslos (live belegt: `x-smejj-bridge: chat-fast-lane`). Das korrigiert
  `job_toolcalling_20260728` ("Bridge muss gar nicht angefasst werden").
  `tests/websuche-absicht-gleichlauf.test.mjs` haelt beide Seiten jetzt gleich.
- **BRIDGE-DEPLOY BRAUCHT KEINEN ZEABUR-TOKEN.** Startbefehl ist ein `curl` auf
  `smejj-app-frontend/main/assets/chat-bridge.js`: dorthin pushen (HTTPS, nicht
  SSH), dann Portal-Restart. Fallen: raw.githubusercontent cacht ~5 Min (aus dem
  Container pruefen); Seitenleisten-Klick traf die Maus-Engine (Namen lesen).
- **FALLE Salad-API:** PATCH braucht `{container:{environment_variables:…}}`;
  flach gesendet: **200 und nichts geaendert** (stiller No-Op). Zurueklesen.
- **ZWEI FOLGEFEHLER, erst im Live-Test sichtbar:** (a) Gesperrte Suchmaschinen
  liefern nicht nichts, sondern **Themenfremdes**; weil `length > 0` galt, ging
  das als Live-Kontext ans Modell → `resultsLookRelevant()`. (b)
  `streamWithTools` holte die Schlussantwort der letzten Runde, streamte sie
  aber nie. **Ein Test, der nur auf [DONE] prueft, prueft nicht das Ergebnis.**
- **OFFEN (echter Blocker):** DuckDuckGo (HTTP 202 `anomaly`) und Bing
  (Bot-Pruefung) sperren die Server-IP — Antworten ehrlich, aber ohne Recherche.
  Empfehlung: **eigener SearXNG-Dienst auf dem bezahlten Zeabur-Server** (0 USD
  zusaetzlich, `SMEJJ_SEARXNG_URL` existiert; Freigabe noetig wie beim Umzug).

### [2026-07-29] CONTROL-SERVER AUF ZEABUR + MAUS-URSACHEN (job_maus_token_zeabur_20260729)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-29_maus_token_zeabur.md](docs/memory/Memory_Bank_2026-07-29_maus_token_zeabur.md).
Commits `6c322d2`, `a77febc`, `9bfd907`. Kurzfassung:

- **Control-Server laeuft auf Zeabur** (`smejj-control`, "Running 1/1",
  0,00 USD zusaetzlich, Freigabe als Ausnahme 2 in der Kostenpolitik).
  Beleg im Container: `HEALTH ok= true app= smejj.com Code`.
  Dienstname MUSS `smejj-control` heissen, sonst greift das Dockerfile nicht;
  die Build-Plan-Vorschau zeigt trotzdem weiter zbpack — das taeuscht.
- **Die Maus-Engine ist intakt** (echter Lauf, 4 Schritte, Artefakte
  zurueckgelesen). Es fehlen nur zwei Werte beim Betreiber: gleicher
  `SMEJJ_MAUS_ENGINE_TOKEN` auf beiden Seiten, und der Artefakt-Eimer.
- **"Verschiedene Konten" war eine Fehldiagnose** — es sind verschiedene
  EIMER (Engine schreibt `smejj-model-files`, Control liest `smejj-app`).
  Ein Fingerabdruck-Unterschied heisst "nicht gleich", nicht "anderes Konto".
- **Fehlermeldung entluegt:** HTTP-Status wird geprueft, Infrastruktur-
  Abbrueche sind mit `infra:true` MARKIERT statt geraten.
- **Ein `git push` baut ALLE Dienste am Branch neu**; die Kopfzeile im Portal
  hinkt nach. Bereitstellung und Protokoll lesen, nicht die Kopfzeile.
- Werkzeug: `node scripts/diagnose/maus-abgleich.mjs` (nur lesend, zeigt nie
  einen Geheimwert).
- **Frontend halb umgestellt (Start-Lock-Freigabe 2026-07-29).** Bewusst in
  zwei Haelften: CSP `connect-src` ist live (sw v191, additiv, ohne Wirkung),
  `config.js` bleibt auf Salad. Ein Dreh an `DEFAULT_API_ORIGIN` HAETTE DIE APP
  SOFORT GETOETET, weil der Zeabur-Dienst noch keine Zugangsdaten hat — eine
  Freigabe zu haben heisst nicht, dass der Moment richtig ist.
- Testweg ohne Risiko: `config.js` kennt die Uebersteuerung
  `localStorage["smejj.apiOrigin.v1"]`. Damit laesst sich der neue Server im
  eigenen Browser durchtesten; genau dafuer muss die CSP vorher stimmen.
- OFFEN: Env-Werte im Zeabur-Dienst, danach `config.js` drehen.

### [2026-07-29] MODUL V LIVE — E-Mail-Zustellung (job_adminmodulv_20260729)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-29_modulv.md](docs/memory/Memory_Bank_2026-07-29_modulv.md).
Commits `2d1e65e`, `2c8bbce`, Control-Server **Version 115**. Damit sind **25 der
26 Buchstaben** gebaut; offen bleibt nur noch W (Analytik). Kurzfassung:

- **Es gibt kein Zustellprotokoll.** `sendAuthMail` liefert `{sent, reason}`,
  aber niemand schreibt es weg. Eine Zustellquote muesste erfunden werden und
  fehlt deshalb. Gezeigt wird, ob der Versand eingerichtet ist und wie viele
  Konten unbestaetigt haengen — **ein Hinweis, kein Beweis.**
- **BEFUND: alle fuenf aktiven Konten sind unbestaetigt**, zwei davon aus den
  letzten 24 Stunden, der aelteste Fall 15 Tage. Wenn NICHT EIN EINZIGES Konto
  je bestaetigt wurde, spricht das eher fuer ein Zustellproblem als fuer
  Zufall (Versand laeuft ueber smtp.gmail.com).
- FALLE: **der Satz widersprach der Kachel** — "Davon frisch: 2" neben
  "keines davon frisch". Eine Schwelle hatte "wenige" in "keine" verwandelt.
  **Ein Bildschirm, der sich selbst widerspricht, ist schlimmer als einer, der
  schweigt.**
- FALLE: der Test durchsuchte Prosa statt Feldnamen und stolperte ueber den
  eigenen Hinweistext. Gleiche Klasse wie "iv" in "aktiv" aus Stufe 6.

### [2026-07-29] ADMINBEREICH STUFE 8 LIVE — Produkt (job_adminstufe8_20260729)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-29_adminstufe8.md](docs/memory/Memory_Bank_2026-07-29_adminstufe8.md).
Commit `45a8e6d`, Control-Server **Version 113**. Damit sind **24 der 26
Buchstaben** gebaut; offen bleiben V (E-Mail, eingeschraenkt) und W (Analytik,
ohne eigene Erfassung nicht baubar). Kurzfassung:

- **S Wissen:** das Dokumentenalter ist im Artefakt NICHT messbar — der
  Release-Bau ist deterministisch und setzt ueberall denselben Zeitstempel.
  Das Modul erkennt das und meldet "nicht messbar" statt rund 9.700 Tagen.
  **Vor dem Deploy gefunden, im entpackten Live-Artefakt geprueft.**
- **T Sprachen:** FALLE — wortgleiche Werte als "unuebersetzt" zu zaehlen
  meldete live ALLE 14 Sprachen als lueckenhaft. "Free-safe", "System",
  "Maximal" heissen in vielen Sprachen genau so. **Eine Heuristik, die
  "gleich" mit "falsch" verwechselt, erzeugt Fehlalarm in genau den Faellen,
  die richtig sind.** Nach dem Fix: 14 von 14 ohne Luecke.
- **X Experimente:** kein eigener Speicher (ein Experiment IST ein Flag im
  Zustand "teilweise") und keine erfundenen Ergebnisse — die Messung dafuer
  gibt es nicht. Gezeigt wird die Laufzeit: ein Experiment, das niemand
  beendet, ist ein Dauerzustand.
- **Y Aufgaben:** nichts verschwindet spurlos; Abschluss und Verwerfen
  brauchen einen Nachweis ab 5 Zeichen.
- FALLE: `recordStore.lies()` liefert den Datensatz DIREKT, nicht
  `{ok, datensatz}`. **Bei einem gemeinsamen Baustein die vorhandene
  Verwendung nachlesen, nicht die Signatur raten.**

### [2026-07-29] KONTINGENT-WAECHTER IDRIVE E2 (job_kontingent_20260729)

Commit `607c3ed`, Control-Server **Version 112**.

**IDrive e2 blockiert nicht, wenn das Paket voll ist.** Es nimmt weiter an und
rechnet 0,006 USD je GB und Monat ab (Preis-FAQ, nachgesehen 2026-07-28). Das
war der einzige Auto-Billing-Fallback im Betrieb — und er war scharf. Gemessen:
1,23 TB von 2 TB belegt, rund 790 GB frei; ein weiteres grosses Modell passt
nicht mehr hinein.

- **Anzeige** in Modul U: Belegung gegen Paket, Ampel bei 80/95/100 Prozent,
  Mehrkosten in USD je Monat sobald ueberschritten.
- **Sperre** `scripts/deploy/idrive-quota-guard.mjs`, fest im Modell-Upload:
  gerechnet wird VOR dem ersten Byte. Live geprueft — 1 GiB Freigabe (Exit 0),
  800 GiB Sperre (Exit 1) mit dem Betrag im Klartext.
- **Eine Bewertung fuer beides.** Anzeige und Sperre nutzen dieselbe Funktion;
  zwei Rechenwege waeren zwei Wahrheiten.
- **Fail-closed**: ohne Messung kein Upload. Und eine unvollstaendige Messung
  ist ein **Mindestwert** — nahe der Grenze winkt sie nicht durch. Ein
  Zugangsschluessel sieht nicht zwingend alle Eimer; eine zu niedrige Summe
  beruhigt genau dann, wenn es eng wird.
- **Keine 0,00 USD**, solange nichts ueberschritten ist: das Feld bleibt leer.
  Eine 0,00 saehe aus wie eine Zusage.

Dazu in der Kostenpolitik festgehalten, warum GitHub strukturell kostenlos
bleibt: **nicht ein Budget-Limit, sondern das fehlende Zahlungsmittel.** GitHub
sperrt bei erschoepftem Kontingent, statt zu berechnen; Budgets fuer
Privatkonten warnen laut Doku nur per E-Mail. Vier Regeln: kein Zahlungsmittel
hinterlegen, Actions-Repos oeffentlich, GHCR-Pakete oeffentlich, kein LFS/Codespaces.

### [2026-07-28] ADMINBEREICH STUFE 7 LIVE — Geld (job_adminstufe7_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_adminstufe7.md](docs/memory/Memory_Bank_2026-07-28_adminstufe7.md).
Commit `ad34cc5`, Control-Server **Version 110**. Damit sind 21 der 26 A-Z-Module
gebaut; offen bleibt nur noch Produkt. Kurzfassung:

- **E Abrechnung:** ein Zahlungsausfall ist eine Aufgabe, kein Logeintrag — er
  steht oben und sagt, was zu tun ist. Der Kunden-Datensatz kennt nur sha256 der
  Adresse; bleibt die Zuordnung offen, steht die Kennung da, **nie eine geratene
  Adresse**. Betraege und Zahlungsmittel bleiben bei Stripe.
- **F Kosten:** **das Modul sagt ausdruecklich, was es nicht weiss.** Es gibt
  keine Token-Erfassung je Konto und keine Preisliste je Modell. Statt
  "0,00 USD" steht eine benannte Fehlanzeige. **Eine Luecke gehoert benannt,
  nicht mit einer Null gefuellt: wer die Luecke sieht, kann sie schliessen; wer
  eine Null sieht, haelt sie fuer ein Ergebnis.** Getrennt gefuehrt werden
  GEMESSEN, UEBERNOMMEN (Zitat mit Quelle) und NICHT ERFASST.
- FALLE: ein **automatischer Umlaut-Umbau ueber Fliesstext** erzeugte halb
  konvertierten Text und brach drei Tests — vollstaendig zurueckgenommen.
  **Eine automatische Ersetzung ueber Fliesstext ist keine Refaktorierung.**

### [2026-07-28] ADMINBEREICH STUFE 6 LIVE — Sicherheit (job_adminstufe6_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_adminstufe6.md](docs/memory/Memory_Bank_2026-07-28_adminstufe6.md).
Commits `d60bbd6`, `5a12496`, Control-Server **Version 109**. Damit sind 19 der
26 A-Z-Module gebaut. Kurzfassung:

- **J Schluessel:** der Wert verlaesst das Modul nie. Nach dem Entschluesseln
  wird ein neues Objekt Feld fuer Feld gebaut — **kein Spread**, denn ein Spread
  nimmt kuenftige Felder mit, und das kuenftige Feld ist irgendwann der
  Schluessel selbst.
- **L Sicherheit:** eine Linse auf Audit-Log und Verzeichnis, **kein zweiter
  Speicher** — bei einer Pruefung sind zwei Staende schlimmer als einer.
- **Z Admin-Verwaltung:** **Vier Augen brauchen zwei Menschen.** Gibt es nur
  einen Berechtigten, ist Loeschen nicht unsicher, sondern unmoeglich.
- FALLE, live gefunden: **ein Notzugang ist ein Zugang.** Die Ansicht meldete
  "0 Zugaenge", waehrend ein Owner sie ansah — dessen Rolle kommt aus
  SMEJJ_ADMIN_OWNER_EMAILS, nicht aus einem Rollenfeld. Eine
  Sicherheitsuebersicht, die wirksame Zugaenge uebersieht, ist schlimmer als
  keine: sie behauptet Leere, wo Macht liegt.
- FALLE: `check:security` meldete den `sk-...`-Testwert. **Der Waechter hatte
  recht** — der Test wich aus, nicht der Waechter.

### [2026-07-28] ADMINBEREICH STUFE 5 LIVE — Betrieb sichtbar (job_adminstufe5_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_adminstufe5.md](docs/memory/Memory_Bank_2026-07-28_adminstufe5.md).
Commit `056c73c`, Control-Server **Version 105**. Damit sind 16 der 26
A-Z-Module gebaut. Kurzfassung:

- Fuenf rein lesende Ansichten (Modelle, Jobs, Worker, Deploy, Speicher) auf
  einer neuen Berechtigung `ops.read` — als einzige fuer JEDE Adminrolle
  erlaubt, **weil dort kein Inhalt steht**. Beides haengt zusammen.
- **Der Auftragstext eines Jobs (`task`) ist Inhalt, kein Betriebszustand.**
  Eine Betriebsansicht, die ihn nebenbei zeigt, haette die Inhaltsregel aus
  Stufe 3 still ausgehebelt. Ebenso draussen: Kontextpfade, Repository-Adresse
  und der Fehlerwortlaut aus `health.reason` der Modell-Registry.
  **Regel: Was durchgereicht wird, entscheidet ueber die Berechtigung — nicht
  umgekehrt. Feld fuer Feld pruefen, bevor eine Ansicht breit freigegeben wird.**
- "Eingeschaltet", "eingerichtet" und "erreichbar" sind drei Fragen und stehen
  in drei Spalten; der Fall eingeschaltet+eingerichtet+schweigt steht oben.
- Ausgefallene Quellen zeigen "nicht erreichbar", nie eine Null. Deploy sagt
  "unbekannt" statt "abweichend", wenn eine Seite fehlt.
- FALLE: **Der Betrieb nutzt ZWEI Eimer** (`IDRIVE_E2_BUCKET` = smejj-app,
  `IDRIVE_E2_DEPLOY_BUCKET` = smejj-model-files). Die Speicher-Ansicht haette
  live fuer die Release-Artefakte eine Null gezeigt. Aufgefallen nur, weil
  lokal "Nutzerkonten: 0" stand, obwohl live Konten existieren — **eine Null,
  die nicht zur bekannten Wirklichkeit passt, ist eine Spur, kein Messergebnis.**

### [2026-07-28] ADMINBEREICH STUFE 4 LIVE — Moderation, DSGVO, Ankuendigungen, Flags (job_adminstufe4_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_adminstufe4.md](docs/memory/Memory_Bank_2026-07-28_adminstufe4.md).
Commits `098d456`/`1d525b7`/`89e8313`, Control-Server **Version 104**. Kurzfassung:

- **Moderation sperrt nie automatisch.** Ein Signal ist ein Verdacht, kein
  Urteil: die Erkennung schlaegt vor, ein Mensch entscheidet und begruendet.
- **Die DSGVO-Frist laeuft ab Eingang, nicht ab Erfassung.** Nachtragen erlaubt,
  Zukunftsdatum nicht; Restzeit wird gerechnet, nie gespeichert; Verlaengern
  genau einmal um zwei Monate mit Begruendung; Abschluss nur mit Nachweis.
- **Zuruecknehmen loescht nicht** — was angezeigt wurde, bleibt dokumentiert.
- **Flags ordnen stabil zu** (sha256 aus Flag-Name und Konto-ID), nicht zufaellig:
  sonst springt die Oberflaeche bei jedem Neuladen.
- FALLE: Der eigene Schreibvorgang war eine Minute lang unsichtbar — nicht der
  Schreibvorgang war schuld, sondern der **nachhinkende LIST-Index von IDrive
  e2**. **Wer schreibt und danach auflistet, darf nicht annehmen, dass die Liste
  den eigenen Schreibvorgang schon kennt.**
- FALLE: Reine Kalendertage (UTC-Mitternacht) in Ortszeit gerendert ergaben in
  der DSGVO-Akte den **Vortag** samt erfundener Uhrzeit. Seither `datum()`
  neben `zeit()`.
- Latenz: LIST plus ein Abruf je Datensatz kostete 285-449 ms (Budget 300,
  Netz-Grundlast 151). Die gelesene Liste wird 20 s wiederverwendet, beim
  Schreiben sofort verworfen, und zwar ROH — Fristen werden bei jedem Aufruf
  neu gerechnet. Ergebnis 218-264 ms. **Das Audit-Log bleibt bewusst ohne
  Zwischenspeicher**: es ist die Nachweisgrundlage, kein heisser Pfad.
- FALLE: Ein Benchmark mit mehr Aufrufen als die Ratenbegrenzung erlaubt misst
  429er statt Arbeit. Und bei 15 Messwerten ist "p95" der Hoechstwert.
- **In einem gemeinsam genutzten Arbeitsbaum ist "uncommittet" kein Schutz:**
  die Parallel-Session hat meine ungetesteten Dateien mitgebaut und live
  gestellt. Gebaut wird aus einem isolierten Worktree auf eigenem Commit, die
  live laufenden Fremddateien vorher aus dem Artefakt uebernommen.

### [2026-07-28] ADMINBEREICH STUFE 3 LIVE — schreibend, mit Vier-Augen und Einwilligung (job_adminstufe3_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_adminstufe3.md](docs/memory/Memory_Bank_2026-07-28_adminstufe3.md).
Commits `e0a83bb`/`ef12ce8`, Control-Server **Version 101**. Kurzfassung:

- **Loeschen und Rollenvergabe sind fuer JEDE Rolle Vier-Augen — auch fuer den
  Owner.** Der Antragsteller darf weder freigeben noch ablehnen; Freigabe und
  Ausfuehrung sind ein Schritt; ein Antrag verfaellt nach 24 Stunden.
- **Impersonation nur mit Einwilligung der betroffenen Person in IHRER eigenen
  Sitzung.** Chat-Inhalte nie im Standardumfang. Break-Glass nur 10 Minuten, mit
  Pflichtbegruendung und als Alarm markiert.
- FALLE: Die Einwilligung lag zuerst hinter dem Admin-Gate — damit war genau
  derjenige ausgesperrt, dessen Zustimmung gebraucht wird. **Aktionen, die von
  der betroffenen Person ausgehen, gehoeren nicht in den Adminbereich**
  (jetzt `/api/account/impersonation/...`).
- FALLE: Jede Schleife, die pro Eintrag ein Objekt aus IDrive e2 holt, ist ein
  Latenzproblem in Wartestellung. Audit stieg auf 1115 ms bei elf Eintraegen;
  `shared/parallelFetch.js` (hoechstens acht gleichzeitig) bringt es auf 460 ms.
- **Vor dem Aktivieren eines Releases das laufende Artefakt aus IDrive e2
  herunterladen und dateiweise vergleichen**, solange eine andere Sitzung im
  selben Repository arbeitet. So blieb Kimi K3 der Parallel-Session unangetastet.

### [2026-07-28] KIMI K3 LIVE — reines API-Modell, bewusst OHNE e2-Vault (job_kimi_k3_api_20260728)

Freigabe: "oK, baue Kimi K3 mit API ein" + "Komplett live schalten"
(Wof Kadavanich, 2026-07-28). Commits `1f00d50`, `ac409eb`, `bc1159f`.
Live als smejj-control Version 98, Artefakt
`deployments/control/smejj-control-k3-effort-2026-07-28.tar.gz`
(sha `62bdc2dc…`), Rueckweg `smejj-control-stufe2-2026-07-28.tar.gz`.
Kapsel: `docs/task-capsules/2026/07/job_kimi_k3_api_20260728/CAPSULE.md`.

- GEGEN DEN REFLEX "GEWICHTE IN DEN VAULT". K2.7 und GLM-5.2 liegen als
  Gewichte in IDrive e2. Fuer K3 waere das Geldverbrennen: 2,8 T Parameter,
  ~594 GB bis 1,4 TB, laeuft weder auf einer GPU noch auf einem 8-GPU-Knoten.
  e2 ist Speicher, kein Rechner. Darum `storage: null` und nur API.
- DAS ERBE STATT DES ZWEITEN KEYS. K2.7 und K3 liegen auf demselben
  Moonshot-Konto, und `SMEJJ_LLM_KIMI_API_KEY` war live bereits gesetzt.
  Neu: `runtime.keyFallbackEnvPrefix` — ohne eigenen K3-Key erbt K3 den
  K2.7-Key. Einseitig (ein K3-Key konfiguriert K2.7 nicht), eigener Key hat
  Vorrang. Wirkung: die Aktivierung schrumpfte auf EIN Flag, und niemand
  musste ein Secret ein zweites Mal von Hand eintippen.
- FAIL-CLOSED BLEIBT. Ohne `SMEJJ_KIMI_K3_ENABLED=YES` ist K3 auch mit
  gueltigem geerbtem Key inaktiv; der Router nimmt GLM-5.2. Auto-Modus waehlt
  K3 nie — nur ausdrueckliche Wahl. K3 ist kostenpflichtig (3 $/15 $ pro Mio.
  Token), Auto-Recharge im Moonshot-Konto steht auf Off.
- NEBENBEFUND BEHOBEN: `handleWorkerPreflight` stuerzte bei Modellen ohne
  e2-Vault ab (`definition.storage.vaultStatusId` auf null) — betraf schon
  vorher `smejj fast 1.0`. Jetzt 409 `model_not_vault_backed`.
- KORREKTUR EINER ANNAHME: `SMEJJ_MULTI_MODEL_ROUTER_ENABLED` steht in
  `.env.example` auf NO, live aber laengst auf YES (`multiModelRouterEnabled:
  true`). Der `.env.example`-Wert ist keine Auskunft ueber den Live-Stand —
  vor jeder Aussage die Bridge selbst fragen.
- DENKTIEFE STATT DENKEN-AUS: K3 laesst sich das Denken NICHT abschalten (anders
  als GLM), nur die Tiefe steuern — `reasoning_effort: low|high|max`, Standard
  `max`. Neu `src/ai/reasoningEffortPolicy.js` als Schwestermodul zu
  `chatThinkingPolicy.js`: Coding und Reasoning behalten die volle Tiefe, alles
  andere bekommt `low`. Der Parameter geht NUR an K3 — andere Backends koennten
  unbekannte Felder ablehnen.
- METHODIK-LEHRE (eigener Fehler, dokumentiert): Ich habe zuerst Prompt UND
  Denktiefe gleichzeitig geaendert und daraus fast geschlossen, der Parameter
  wirke nicht. Erst der saubere A/B — identischer Prompt, identischer Weg,
  7 Laeufe je Seite, Umschaltung ueber `SMEJJ_LLM_KIMI_K3_REASONING_EFFORT` —
  gab die Antwort: erstes sichtbares Zeichen 13 856 ms (`max`) gegen 8 606 ms
  (`low`), also 38 % schneller. Eine Messung mit zwei geaenderten Variablen ist
  keine Messung.
- TEMPO-EINORDNUNG: K3 mit `low` ist rund 48 % schneller als GLM-5.2 auf
  demselben Weg (8,6 s gegen 16,6 s). Das 1,0-s-Budget erreicht weiterhin NUR
  die Groq-Schnellspur (703 ms). Das Budget sollte kuenftig zwischen Schnellspur
  und Deep Lane trennen — sonst misst es Aepfel an Birnen. Details:
  `docs/benchmarks/BEFUND_KIMI_K3_TEMPO_2026-07-28.md`.
- DER PICKER IM EINGABEFELD IST FEST VERDRAHTET — nicht registry-gesteuert.
  Menueeintraege in `public/index.html`, Zuordnung in `MODEL_MODES` in
  `public/app.js`. Ein neues Modell erscheint dort NICHT automatisch, auch wenn
  die Server-Registry es laengst kennt. `#systemModelSelect` im
  Einstellungs-Panel ist ein ANDERES Element und baut sich sehr wohl aus der
  Registry — wer nur das prueft, haelt ein Modell faelschlich fuer waehlbar.
  Genau dieser Fehler ist mir hier passiert: DOM-Abfrage ist kein Klickpfad.
  Behoben mit Freigabe (drei Start-Lock-Dateien, sw v180, Lock neu eingefroren,
  Frontend-Commit `7da4c2d`, live SHA-gleich). Klickpfad belegt: Menue → "Kimi
  K3" → Frage → "Ich bin Kimi, ein Assistent von Moonshot AI, und helfe hier
  fuer smejj.com."
- EVAL ENTSCHEIDET, NICHT DAS BAUCHGEFUEHL: Suite smejj-chat-core, 14 Faelle,
  Control-Weg. K3 **97,1 %**, GLM-5.2 **97,1 %** — gleichauf auf die
  Nachkommastelle, beide scheitern am selben Halluzinations-Fall. K3 ist auf
  der Suite sogar langsamer (p95 37,6 s gegen 22,8 s), weil Coding-Faelle bei
  K3 die volle Denktiefe behalten. Ergebnis: **K3 bringt keinen
  Qualitaetsvorteil**, GLM-5.2 bleibt Standard; K3 ist Zweitquelle und
  Langkontext-Option. Ohne diesen Lauf haette "K3 ist neuer" als Argument
  gereicht — genau davor schuetzt das Eval-Set.
- "REASONING-AUFWAND" WAR EIN PLACEBO. Der Wert aus Einstellungen -> Modelle
  landete nur als Satz im Prompt. Seit 2026-07-28 steuert er bei K3 den echten
  API-Parameter. WICHTIG fuer kuenftige Sitzungen: `public/app.js` sendet die
  Einstellungen laengst als `preferences` an /api/agent — es las sie nur
  niemand serverseitig. Deshalb war KEINE gesperrte Datei noetig. Vor dem
  Anfassen des Start-Locks immer pruefen, ob der Weg schon existiert.
  Standard von `high` auf `medium` gedreht, sonst haette die Verdrahtung das
  gemessene Tempo zerstoert (Performance-Lock).
- EIN SKRIPT-TAG IST EIN EIGENER EINSTIEGSPUNKT. `check:precache-imports`
  verfolgte nur Modul-IMPORTE ab den SHELL-Eintraegen und meldete "Precache
  vollstaendig", waehrend `maus-panel.js` fehlte — index.html laedt es per
  `<script src>`, und dorthin fuehrt kein Import-Pfad. Offline war der
  Maus-Knopf tot. Pruefer erweitert (liest jetzt die Skript-Tags), Gegenprobe
  gemacht: ohne den Eintrag schlaegt er fehl. Live belegt (sw v186): Cache mit
  120 Eintraegen inklusive maus-panel.js. Lehre: Ein gruener Pruefer beweist
  nur, was er prueft — bei "unmoeglichen" Befunden zuerst den Pruefer selbst
  gegen einen bekannten Fehler testen.
- SALAD-PREISE FUER smejj fast 1.0 (aus der API, 2026-07-28, 1 Replika, RTX
  3090/4090/3090 Ti/A5000): Dauerbetrieb 24/7 66-219 $/Monat, bedarfsweise
  4 h/Tag 11-37 $/Monat. Empfehlung: Priority `batch`, bedarfsweise -> ~11 $.
  Start bleibt Rote Liste (neue laufende Kosten) und braucht Dienst UND Betrag
  ausdruecklich — ein pauschales "alle Rechte" ist laut AI_Guidelines KEINE
  Budget-Freigabe.
- GESCHACHTELTE MODUL-QUERIES MUESSEN VON OBEN GEBUMPT WERDEN. Der Standardwert
  aus settings-runtime.js kam dreimal nicht im Browser an (v183, v184), obwohl
  die Datei live byte-identisch war und check:all gruen. Ursachen, erst im
  Live-Test sichtbar: (1) settings-surface.js importierte settings-runtime.js
  unter ZWEI Adressen (mit und ohne `?v=3`) — in ES-Modulen sind das zwei
  getrennte Instanzen; (2) die eigentliche Wurzel war premium-surfaces.js mit
  `settings-surface.js?v=3`, das die ganze Kette alt hielt. Gefunden ueber
  `performance.getEntriesByType("resource")` im echten Browser: dort standen
  `?v=3` UND `?v=4` nebeneinander. Kein Test findet das — lokal gibt es keinen
  HTTP-Cache mit alten Eintraegen. Regel: beim Aendern eines Moduls mit
  Cache-Query IMMER den obersten Importeur mitbumpen und im Browser gegen
  performance.getEntriesByType pruefen.
- BUDGET, DAS IMMER ROT IST, IST KEIN BUDGET. Die Eval-Suite riss bei JEDEM
  Modell dieselben zwei Schwellen. Jetzt getrennt: Produktziel 1,0 s gilt der
  Schnellspur (erfuellt, 0,70 s), die Suite bekommt eine Regressionsschwelle
  (40 s / 45 s) ueber der gemessenen Wirklichkeit. Das Produktziel wurde NICHT
  abgesenkt — es wurde dem richtigen Weg zugeordnet.
- WEB VITALS LIVE nach dem Deploy (7 Laeufe, smejj.com): TTFB-Median 42 ms,
  LCP-Median 172 ms, CLS 0, INP 40 ms — kein Budget gerissen, gegenueber dem
  letzten Stand eher schneller. Erwartungsgemaess: der Control Server steht
  nicht im Pfad des Seitenaufrufs.
- VERIFIKATION: model-registry 25/25, alle Einzelchecks gruen ausser
  `check:start-lock` (public/sw.js v178 aus einer Parallel-Session, dort nicht
  neu eingefroren — in public/ wurde hier nichts angefasst). Live: Control
  direkt und ueber die Bridge `x-smejj-model-backend: kimi:kimi-k3`,
  `model-fallback: false`, Antwort "Ich bin Kimi, ein Modell von Moonshot AI.";
  auf smejj.com "Kimi K3 · 1M · flagship · Bereit". Nicht-Regression belegt:
  Standardanfrage unveraendert Groq-Schnellspur, K2.7 unveraendert.

### [2026-07-28] EU AI ACT NACHGEWIESEN + ADMINBEREICH STUFE 2 LIVE (job_aiact_adminstufe2_20260728)

Volltext wegen der 800-Zeilen-Regel ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_aiact_adminstufe2.md](docs/memory/Memory_Bank_2026-07-28_aiact_adminstufe2.md).
Commit `c450fbf`, Control-Server **Version 94**, Konsole unter `/admin`. Kurzfassung:

- AI-Act-Ausgangslage war NULL (kein Treffer im ganzen Repository). Jetzt Bestands-
  verzeichnis, Risikoeinstufung Maus-Engine (**kein Hochrisiko, aber verschaerfte
  Transparenz**) und `/api/compliance/ai-systems` ohne Anmeldung.
- **Die Admin-Oberflaeche liegt im Control-Server, nicht unter `public/`** — kein DNS,
  kein Frontend-Deploy, kein Service-Worker, kein Start-Lock-Risiko.
- FALLE: Routen, die HTML an Menschen ausliefern, gehoeren NICHT in
  `requiresAuthenticatedControlAccess` — sonst kommt rohes JSON statt einer Erklaerung.
- Lesezugriffe auf Nutzerakten sind jetzt protokollpflichtig (`user.record.read`);
  ohne Nachweis keine Daten. Der offene Punkt aus Stufe 1 ist geschlossen.
- **Artefakt IMMER aus einem isolierten Worktree des eigenen Commits bauen**, nie aus
  dem Hauptbaum — sonst geht fremder, unverbuchter Arbeitsstand mit live.

### [2026-07-28] Hilfeseite ausgelagert

Volltext in [docs/memory/MEMORY_ARCHIV_2026-07-I.md](docs/memory/MEMORY_ARCHIV_2026-07-I.md).
Kern: Hilfetexte wurden gegen den QUELLTEXT geprueft, nicht gegen die
Erinnerung — mehrere beschriebene Schritte gab es so gar nicht.

### [2026-07-28] Adminbereich Stufe 1 ausgelagert

Volltext in [docs/memory/Memory_Bank_2026-07-28_adminstufe1.md](docs/memory/Memory_Bank_2026-07-28_adminstufe1.md).
Kern: Rollenmodell, Audit-Kette und Nutzer-Index — das Fundament, auf dem
alle spaeteren Stufen stehen. Rein lesend, fail-closed.

### [2026-07-28] Statusseite ausgelagert

Volltext in [docs/memory/MEMORY_ARCHIV_2026-07-H.md](docs/memory/MEMORY_ARCHIV_2026-07-H.md).
Kern: `/status.html` fragt die drei Dienste direkt aus dem Browser ab, ohne
Status-Server. FALLE: Gelten Header-CSP und Meta-CSP zugleich, zaehlt die
SCHNITTMENGE — `connect-src 'self'` im Header blockierte alle Abfragen.

### [2026-07-28] QA-Restpunkte ausgelagert

Volltext in [docs/memory/MEMORY_ARCHIV_2026-07-J.md](docs/memory/MEMORY_ARCHIV_2026-07-J.md).
Kern: Service-Worker cache-first, CSP, Offline, Zoom, Salad-Kosten und die
geschlossene Konto-Enumeration — alle sechs mit Live-Nachweis.

### Ausgelagerte Eintraege 2026-07-27/28 (wortgleich, nichts geloescht)

Am 2026-07-29 zu einem Block zusammengefasst (800-Zeilen-Regel). Alle Verweise gelten unveraendert.

- Rechtstexte EN, job_rechtstexte_en_20260728 → [docs/memory/Memory_Bank_rechtstexte_en_2026-07-28.md](docs/memory/Memory_Bank_rechtstexte_en_2026-07-28.md)
- "QA-WELLEN 1-3 VOLLSTAENDIG BEHOBEN", job_qa_wellen_1_3_20260728 → [docs/memory/Memory_Bank_2026-07-28_qa_wellen.md](docs/memory/Memory_Bank_2026-07-28_qa_wellen.md)
- Salad-Abloesung (sw v145/v146, Zeabur traegt Chat und Stimme) → [docs/memory/Memory_Bank_2026-07-27.md](docs/memory/Memory_Bank_2026-07-27.md)

### [2026-07-26] Aeltere Eintraege ausgelagert

Die Eintraege vom 2026-07-26 (Premium-Stimme auf Zeabur, Merge-Grenze,
iMild-PR, Maus-Pruefbericht und -Selbsttests, Stufe C, Zeabur-Server,
Sprachwelle Stufe 1e/2a, Stufe A+B) stehen vollstaendig in
`docs/memory/MEMORY_ARCHIV_2026-07-F.md`. Nichts geloescht — nur verschoben,
damit Memory_Bank.md unter der 800-Zeilen-Regel bleibt.

### [2026-07-21] Aeltere Architekturentscheidungen ausgelagert

Die sieben Eintraege vom 2026-07-21 (Magic-Link live, Auth-Extra-Deploy, Konto
und Einstellungen im Codex-Stil, Auth-Redesign, Repo-Reparatur, Browser-Button)
stehen wortgleich in
[docs/memory/Memory_Bank_2026-07-21.md](docs/memory/Memory_Bank_2026-07-21.md).
Ausgelagert am 2026-07-28 wegen der 800-Zeilen-Regel. Nichts geloescht.
Wird hier wieder Platz knapp, wandert der naechstaeltere Block nach demselben
Muster ins Archiv.

## Ausgelagerte Tages-Eintraege

Die fuenf Tages-Eintraege vom 2026-07-27 (Startseite antwortet im Faden,
Seiteninhalt im Modellkontext, Web-Vitals-Messwerkzeug, Startseite Ladezeit,
letzte Startaufrufe) stehen wortgleich in
[docs/memory/Memory_Bank_2026-07-27.md](docs/memory/Memory_Bank_2026-07-27.md).
Ausgelagert am 2026-07-28, weil diese Datei die 800-Zeilen-Regel erreicht hatte.
Nichts wurde geloescht. Wird hier wieder Platz knapp, wandert der jeweils
aelteste Tagesblock nach demselben Muster ins Archiv.

### [2026-07-28] Precache-Vollstaendigkeits-Eintrag ausgelagert

Der Eintrag "Precache vollstaendig, kein Aufruf im Ladepfad
(job_letzte_reste_20260728)" steht wortgleich in
[docs/memory/Memory_Bank_2026-07-28_letzte_reste.md](docs/memory/Memory_Bank_2026-07-28_letzte_reste.md).
Ausgelagert wegen der 800-Zeilen-Regel. Nichts geloescht.

> Aeltere Eintraege (bis 2026-07-16) stehen in `docs/memory/Memory_Bank_Archiv_2026-07-16.md`.

## 2026-07-28 — Echtes Tool-Calling live (job_toolcalling_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_toolcalling.md](docs/memory/Memory_Bank_2026-07-28_toolcalling.md).

## 2026-07-28 — app.js aufgeteilt, Altlast beendet (job_appjs_aufteilung_20260728)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-07-28_appjs_aufteilung.md](docs/memory/Memory_Bank_2026-07-28_appjs_aufteilung.md).

## 2026-07-28 — Fassungen ueberleben das Neuladen, Touch-Ziele halten (job_nachrichten_aktionen_20260728, Welle 2)
- ERLEDIGT, live (sw v171): zwei Luecken der ersten Welle geschlossen.
- FASSUNGEN PERSISTENT: chat-store.js speichert versions + active je Nachricht und
  gibt beides beim Wiederherstellen zurueck. Vorher war "Version 2 von 3" nach einem
  Reload weg, weil die Fassungen nur im Arbeitsspeicher lagen. Obergrenze acht je
  Nachricht — jede traegt Rohtext UND gerendertes HTML, ohne Grenze waechst
  IndexedDB bei haeufigem "Neu generieren" unbegrenzt. clampVersionIndex verschiebt
  den Zeiger mit, wenn gekuerzt wurde; sonst zeigte der Waehler auf eine Fassung,
  die es nicht gibt. Live belegt: nach dem Reload "Version 2 von 2", Wechsel zeigt
  die andere echte Antwort, Kopieren liefert je Fassung ihr Roh-Markdown.
- FALLE FLEXBOX UND TOUCH-ZIELE: Auf 375 px ergaben fuenf Aktionen, zwei
  Versionspfeile und das Label "Version 2 von 3" rund 366 px in einer 359 px
  breiten Zeile. Flexbox schrumpfte die Knoepfe von 42 auf 37 px — das Touch-Ziel
  war weg, ohne dass etwas ueberlief oder umbrach, also unsichtbar im Test.
  Regel daraus: bei Icon-Leisten immer `flex: 0 0 auto` auf dem Knopf und
  `flex-wrap: wrap` auf der Leiste. Ein Ziel, das sich der Zeile anpasst, ist keins.
- MESSFALLE: `resize_window` auf 375 px macht aus einem Desktop-Browser KEIN
  Touch-Geraet — `pointer: fine` bleibt wahr, der coarse-Zweig wird nie ausgeloest.
  Wer Touch-Layout pruefen will, muss die Maße erzwingen (inline per el.style, denn
  eingefuegte <style>-Bloecke blockiert die CSP des eigenen Servers).
- OFFEN und bewusst so: die Bewertung (Daumen) wird gespeichert und nach dem Reload
  wieder angezeigt, aber von keiner Auswertung gelesen. Eine Rueckmeldestrecke
  braeuchte Serverlast und eine Trainingsdaten-Freigabe (Policy fail-closed).
- BENCHMARK: docs/benchmarks/webvitals_versionen_2026-07-28.json — kaltes LCP
  328/332/128 ms bei TTFB 124/112/23 ms (LCP folgt dem TTFB, Lauf 3 unter der
  Referenz von 172 ms), CLS 0, INP p75 48 ms. Kerndateien der Startseite 58 KB
  komprimiert gegen ein Budget von 300 KB; die drei Chat-Module davon 13,3 KB,
  geladen als type=module am Seitenende.

## 2026-07-28 — Verhalten pruefbar, Touch-Ziele echt gemessen (job_nachrichten_aktionen_20260728, Welle 3)
- ERLEDIGT, live (sw v174): Tests 34 -> 45; Loeschen/Rueckgaengig, Bearbeiten,
  Neu generieren, Menue-Tastatur und Versionswechsel sind jetzt automatisch geprueft
  statt nur von Hand im Browser.
- MUSTER FUER NICHT IMPORTIERBARE MODULE: Wer /assets/-Pfade absolut importiert
  (Pflicht hier, sonst zweite Modulinstanzen), ist in node nicht importierbar. Loesung:
  die ENTSCHEIDUNG in ein importierbares Modul legen (planRegenerate, planEdit,
  planRemoval, restoreNodes, planSettle, nextMenuIndex in chat-messages.js), das
  ANWENDEN im DOM-Modul lassen. Das Fake-DOM der Tests haengt Knoten wirklich ein und
  aus, damit die Reihenfolge nach Rueckgaengig gegen den Ausgangszustand vergleichbar ist.
- DABEI GEFUNDEN: Pfeil-auf ohne fokussierten Menuepunkt landete auf dem VORLETZTEN
  Punkt, weil indexOf -1 liefert und -1 + -1 modulo 4 = 2 ergibt. Behoben.
- TOUCH-MESSFALLE (wichtig fuer jede kuenftige Mobil-Pruefung): resize_window auf
  375 px macht aus einem Desktop-Browser KEIN Touch-Geraet. `pointer: fine` bleibt
  wahr, der coarse-Zweig wird nie ausgeloest — deshalb war der 37-px-Fehler unsichtbar.
  Richtig geht es ueber das DevTools-Protokoll: Emulation.setEmulatedMedia mit
  pointer/any-pointer = coarse plus setDeviceMetricsOverride mit mobile: true.
  Werkzeug dafuer: `npm run measure:touch` (scripts/testing/measure_touch_targets.mjs).
- JEDER WAECHTER BRAUCHT EINE GEGENPROBE: `npm run measure:touch:selbsttest` nimmt
  flex-wrap und flex: 0 0 auto zur Laufzeit heraus und ERWARTET Verstoesse. Er
  reproduziert exakt die 37x42 px und erkennt sie. Ohne diese Probe waere unklar, ob
  die Messung ueberhaupt scharf ist — ein Check, der immer gruen ist, ist kein Check.
- KEIN iOS-SIMULATOR auf diesem Rechner: nur Xcode Command Line Tools, simctl fehlt
  (`xcode-select -p` zeigt /Library/Developer/CommandLineTools). Xcode nachinstallieren
  waere ein Eingriff in den Rechner des Betreibers — bewusst unterlassen.
- BENCHMARK: docs/benchmarks/webvitals_planer_2026-07-28.json — kaltes LCP
  200/236/200 ms bei TTFB 55/55/49 ms, die ruhigste Reihe dieser Sitzung; CLS 0,
  INP p75 48-80 ms. Touch-Ziele: docs/benchmarks/touchziele_2026-07-28.json.

## 2026-07-28 — Modellwahl ist jetzt messbar (job_modell_eval_harness_20260728)
- ANLASS: Kimi K3 (2,8 Bio. Parameter, 1,4 TB, ~64 GPUs zum Betrieb) ist erschienen.
  ENTSCHEIDUNG: kein Download, kein Neubezug von K2.7. Gewichte im Objektspeicher
  sind kein Fundament, wenn die Rechenleistung fehlt — IDrive e2 speichert, es rechnet
  nicht. "K3 Max" ist ausserdem keine Gewichtsdatei, sondern eine Aufwandsstufe der
  Anbieter-Schnittstelle. Begruendung: docs/model-management/MODELL_ENTSCHEIDUNG_KIMI_K3_2026-07-28.md
- STATTDESSEN GEBAUT: evals/suites/smejj-chat-core-v1.json (14 echte Faelle) plus
  src/evaluation/evalSuite.js, evalScoring.js, evalReport.js, evalTransport.js und
  scripts/evaluation/run_model_eval.mjs. `npm run eval:models` ist ein Trockenlauf
  ohne Kosten; erst --live ruft ein Modell auf. 25 Tests in tests/model-eval.test.mjs.
- MESSUNG STATT MEINUNG (live gegen die Produktionskette, 2026-07-28):
  schnelle Spur groq:llama-3.1-8b-instant — 91,2 %, p95 645 ms, erster Token 555 ms,
  1 kritischer Verstoss (Codegenerierung). GLM-5.2 ueber den Control-Router —
  97,1 %, p95 22 799 ms, erster Token 22 754 ms, 0 kritische Verstoesse.
  Damit ist die profilabhaengige Fuehrung erstmals belegt statt nur behauptet.
- OFFENER BEFUND 1: Auf dem GLM-Pfad vergehen bis zum ersten Token 22,8 s — das
  15- bis 20-Fache jedes Budgets. Gemessener Ist-Zustand, keine Regression.
- OFFENER BEFUND 2: Die schnelle Spur besteht code-esm-failclosed nicht. Kein
  Sicherheitsproblem, aber die Grenze des Standardpfades ohne ausdrueckliche Modellwahl.
- FALLE, DIE ZWEI STUNDEN GEKOSTET HAETTE: Regex-Erwartungen mit dem Flag i machen die
  Namensregel unpruefbar — `\bSMEJJ\b` trifft case-insensitive auch "smejj.com". Muster
  sind deshalb schreibweisen-genau, ignoreCase ist die ausdrueckliche Ausnahme.
- ZWEITE FALLE: Ein einzelner HTTP 503 der Chat-Bruecke wurde im ersten Lauf als
  Modellversagen gezaehlt. Ohne Wiederholung transienter Fehler misst man die
  Infrastruktur und nennt das Ergebnis Modellqualitaet. Jetzt isTransientError + --retries.
- DRITTE FALLE: Ein Bericht ohne Backend-Beleg ist wertlos — das angeforderte und das
  antwortende Modell koennen auseinanderfallen. run.backendsSeen/resolvedModelIds
  belegen es. Und verglichen wird nur gegen denselben Suite-Inhalts-Hash; zwei Laeufe
  mit unterschiedlichen Erwartungen sind nicht vergleichbar.
- VERBINDLICHE REGEL (evals/README.md): Eine Wortliste wird nur erweitert, wenn die
  betroffene Antwort von Hand gelesen und als sachlich richtig bestaetigt wurde.
  Erwartungen aufzuweichen, damit ein Modell besser dasteht, ist ein Verstoss.
- Kein Deploy noetig: reines Werkzeug, kein Frontend- und kein Control-Server-Pfad
  beruehrt. check:all 27/27 gruen. Capsule im Object Brain unter
  capsules/app/job_modell_eval_harness_20260728/.
## 2026-07-28 — Befund 1 aufgeklaert: 6,2 s Warten auf Text, den niemand sieht (job_erster_token_glm_20260728)
- WERKZEUG: `npm run measure:firsttoken` trennt Antwortkopf, erstes Ereignis, erstes
  SICHTBARES Zeichen und Ende. Vorher war das eine Zahl — eine Beobachtung, keine
  Diagnose. Die Luecke zwischen Ereignis und Zeichen ist der behebbare Anteil.
- A/B AM SELBEN SERVER, GLEICHES MODELL, VOR jeder Codeaenderung: /api/chat (Denken an)
  erstes sichtbares Zeichen 12 106 ms bei 6 187 ms unsichtbarer Wartezeit; /api/agent
  (Denken aus) 7 270 ms bei 0 ms. Ursache bewiesen statt vermutet. Rest: 5-7 s
  Startzeit des Anbieters, nur per Modellwahl aenderbar. Die Bruecke zeigte 16,6 s,
  weil der Antwortkopf erst mit dem ersten SICHTBAREN Byte durchgereicht wird.
- URSACHE WAR EINE LUECKE, KEIN DEFEKT: /api/agent schaltet das Reasoning fuer
  Nicht-Coding seit 2026-07-27 ab, /api/chat fehlte genau diese verifizierte Regel.
  BEHOBEN in src/ai/chatThinkingPolicy.js, an EINER Stelle. Bewusst eng: Coding
  behaelt das Reasoning, Modellwahl und Routing-Profil bleiben unveraendert (ein
  Entwurf, der zusaetzlich das Profil setzte, wurde als Regressionsrisiko verworfen).
  Erwartung 12,1 s -> 7,3 s; die schnelle Spur ist mit 703 ms nicht betroffen.
- NICHT AUSGEROLLT — BEWUSST: Ein Control-Release packt src/ und control-server/ aus
  der ARBEITSKOPIE; eine parallele Sitzung arbeitete zeitgleich an diesem Pfad. Weg
  zum Nachholen: docs/benchmarks/BEFUND_ERSTER_TOKEN_GLM_2026-07-28.md. check:all
  26/26 gruen, Rollback rollback/chat-thinking-2026-07-28. ACHTUNG: Memory_Bank.md
  ist an der 800-Zeilen-Grenze; der naechste Eintrag braucht vorher eine Aufteilung.

## 2026-07-28 — Quellen pro Antwort (job_nachrichten_aktionen_20260728, Welle 4)
- ERLEDIGT, live (sw v178): "Quellen anzeigen" im Nachrichten-Menue — der letzte
  Punkt, den ChatGPT hatte und smejj.com nicht. Erscheint NUR bei echtem Grounding.
- WAS FEHLTE: browser-context.js holt bei Auftraegen mit Web-Adresse die Seite und
  webt sie in die FRAGE — die Herkunft wurde danach verworfen. Jetzt merkt es sich je
  Auftragstext Adresse, Titel, HTTP-Status und Zeitpunkt (lokal, Obergrenze 30, kein
  zusaetzlicher Netzverkehr). chat-actions.js ordnet ueber die Frage DIREKT VOR der
  Antwort zu — nicht ueber "die letzte Quelle", die bei schnellem Nachfassen zur
  falschen Antwort gehoeren koennte. Ein gescheiterter Abruf wird nicht gemerkt.
- FALLE ZWEI MODULINSTANZEN (haette live NIE funktioniert, lokal gefunden):
  chat-actions.js importierte browser-context.js mit "?v=1", app.js ohne Query.
  Getrennte Modulinstanzen mit eigenem Gedaechtnis — geschrieben wurde in das eine,
  gelesen aus dem anderen. REGEL: Wer Zustand mit app.js teilt, muss DENSELBEN
  Spezifizierer benutzen wie app.js. Ein Test vergleicht beide jetzt automatisch.
- FALLE FALSCHE BEHAUPTUNG (live gefunden, deshalb v178): Gegroundet wird die FRAGE.
  Scheitert der Antwortstrom danach, stand neben der Fehlermeldung "1 Quelle". Statt
  Fehlertexte zu erraten (bruechig, sie stehen in app.js) sagt die Liste jetzt, was
  stimmt: "1 Seite fuer diese Frage geladen". Richtig in beiden Faellen.
- HTTP 404 wird ehrlich als Fehler gezeigt, nicht verschwiegen. Links oeffnen mit
  rel="noopener noreferrer". Quellen ueberleben ein Neuladen (im Verlauf gespeichert).
- BEOBACHTUNG fuer spaeter: Fragen MIT Web-Adresse erzwingen ueber modelForTask die
  Tiefspur (GLM-5.2 via Control Server). Waehrend des Tests scheiterte dieser Strom
  wiederholt ("Verbindung zum Server unterbrochen"), waehrend Fragen ohne Adresse
  normal beantwortet wurden. Das Grounding selbst lief fehlerfrei — der Befund liegt
  im Backend und ist noch offen.
- BENCHMARK: docs/benchmarks/webvitals_quellen_2026-07-28.json — kaltes LCP
  136/164/188 ms bei TTFB 27/32/53 ms, schnellste Reihe der Sitzung; CLS 0.

## 2026-07-28 — Fragen mit Web-Adresse antworten wieder (job_spurwahl_zeitbudget_20260728)
- ERLEDIGT, live (sw v179): Fragen mit Adresse endeten regelmaessig in "Verbindung
  zum Server unterbrochen". Kein Ausfall — ein Zeitbudget-Konflikt.
- GEMESSEN statt geraten (Direktaufruf der Live-Bridge, Origin-Kopf noetig, sonst
  403 "Origin not allowed"): Schnellspur 0,75 s bis zum ersten Byte, Tiefspur
  7,77 s (kurze Frage) bzw. 4,92 s (gegroundet). Limit in fetch-retry.js: 6,5 s.
  Die Tiefspur lag also regelmaessig JENSEITS des Limits.
- KERNEINSICHT: modelForTask erzwang die Tiefspur fuer jede Frage mit Adresse,
  weil die Schnellspur den Seiteninhalt frueher raten musste. Seit Stufe 2 webt
  browser-context.js den echten Seitentext IN die Frage — Werkzeuge braucht dafuer
  niemand mehr. Nachgemessen: Schnellspur mit eingebettetem Inhalt antwortete
  inhaltlich richtig ("Example Domain") in 0,49-1,01 s statt 4,9 s.
- REGEL JETZT: Tiefspur nur noch, wenn groundingFor(task) LEER ist — die Seite
  also nicht geladen werden konnte und nur echtes Tool-Calling noch hilft. Eine
  Fehlerseite (HTTP 404) zaehlt als geladen; ein erneuter Abruf per Werkzeug
  braechte nur wieder 404.
- ZWEITER TEIL: fetch-retry.js gibt der Tiefspur ein eigenes Erstbyte-Budget
  (15 s statt 6,5 s), erkannt am Modellnamen im Anfragekoerper. Damit scheitert
  auch der Ausnahmefall nicht mehr an einem Limit, das fuer die Schnellspur
  gedacht war. Eine ausdrueckliche Vorgabe des Aufrufers schlaegt die Automatik.
- LIVE BELEGT: "Der Titel auf https://example.com lautet Example Domain." Erster
  Token 639 / 813 / 477 ms (gemessen per MutationObserver im Browser, inklusive
  Seitenabruf) gegen ein Budget von 1000 ms — erstmals eingehalten. Auch der
  Ausnahmefall (nicht ladbare Adresse) antwortet in 477 ms ohne Fehler.
- MESSFALLE fuer kuenftige Bridge-Tests: /api/agent antwortet ohne
  `Origin: https://smejj.com` mit 403. Wer das vergisst, haelt einen
  CORS-Schutz faelschlich fuer einen Ausfall.
- BENCHMARK: docs/benchmarks/spurwahl_2026-07-28.json — dazu Web-Vitals
  144/292/184 ms kaltes LCP, CLS 0, Touch-Ziele unveraendert eingehalten.

## 2026-07-28 — Training-Loop-Worker gebaut, Deploy BLOCKIERT (job_smejj_training_loop_20260728)
- Code fertig: workers/smejj-training-loop/ (Eval-Zyklus + Trainings-Warteschlangen-
  Zyklus, mehrstufig fail-closed, Checkpoint+Benchmarks auf IDrive e2, nie eigene
  Eignungs-/Einwilligungsentscheidung). 13/13 Tests gruen, check:guidelines und
  check:architecture gruen. Docker-Daemon lokal aus — Image-COPY-Satz stattdessen
  per Dateikopie simuliert, /health lief korrekt.
- NICHT deployt: FREE_ONLY_MASTER_POLICY.md deckt die Zeabur-Ausnahme NUR fuer den
  bestehenden Maus-Engine-Server ab ("jede Erweiterung... braucht erneut eine
  schriftliche Freigabe mit Dienst und Betrag"). Ausserdem fehlt lokal ein
  ZEABUR_API_TOKEN und eine Service-ID fuer einen neuen Dienst.
- NAECHSTER SCHRITT braucht den Betreiber: schriftliche Freigabe (Dienstname
  "smejj-training-loop", Kosten) + Dienst im Zeabur-Portal anlegen + Token/IDs
  liefern. Details: task-capsules/2026/07/job_smejj_training_loop_20260728/.
- ACHTUNG: Memory_Bank.md ist jetzt wirklich an der 800-Zeilen-Grenze — der
  naechste Eintrag MUSS vorher eine Aufteilung vornehmen (siehe Eintrag darueber).

## 2026-07-28 — Chat-Aktionen: Restpunkte endgueltig geschlossen (job_chat_aktionen_restpunkte_20260728)
- SCHEINBARER RUECKFALL WAR KEINER: lokaler Git-Stand wirkte kurz wie ein
  Rueckfall auf einen alten Commit. `git merge-base --is-ancestor` bestaetigte:
  alle fraglichen Commits sind Vorfahren von HEAD, nichts verloren — HEAD war
  nur durch Folgearbeit (Spurwahl-Fix, Kimi K3, Admin-Stufen, Maus-Panel)
  weitergewandert. LEHRE: bei Zweifel am Stand immer `merge-base --is-ancestor`
  statt `git log` allein, bevor man etwas fuer verloren haelt.
- Spurwahl-/Zeitbudget-Fix (job_spurwahl_zeitbudget_20260728) war zu Beginn
  dieser Capsule bereits live (sw v186) — hier nur nachgemessen: echter
  Klickpfad im Browser fragt "https://example.com", Schnellspur antwortet
  richtig ("Example Domain"), Quellenanzeige zeigt HTTP 200 und Zeitstempel.
  Alle Dateien SHA-256-identisch zum lokalen Stand.
- ZWEI RESTPUNKTE endgueltig als Entscheidung dokumentiert, nicht mehr als
  offen: Daumen-Bewertung bleibt dauerhaft lokal-only
  (docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md, neuer Anhang);
  physisches Testgeraet durch echte pointer:coarse-Emulation mit Selbsttest
  ersetzt, alte "Open"-Liste in docs/testing/IOS_ANDROID_TEST_REPORT.md
  abgeschlossen. Beide Male: dokumentierte Grenze/Entscheidung statt TODO.
- control-server/src/admin/* war beim Pruefen dirty (opsDeploy/opsJobs/
  opsModelle/opsSpeicher/opsWorker) — aktive Arbeit einer PARALLELEN Session
  an einer Admin-Ops-Konsole, bewusst nicht angefasst.

## 2026-07-28 — Maus-Wiedergabe im Browser-Panel sichtbar (job_maus_sichtbarkeit_20260728)
- Freigabe "Maus-Sichtbarkeit" (Wof Kadavanich) fuer genau index.html +
  browser-pane.js umgesetzt: neuer #mausButton bettet die bestehende
  public/maus-replay.html direkt (nicht ueber den HTML-umschreibenden
  Server-Proxy) als Iframe im rechten Panel ein. Logik in neuer, ungesperrter
  Datei public/maus-panel.js (SRP) — browser-pane.js blieb bei 795/800 Zeilen
  (nur 8x `export` auf bestehende Bausteine, 0 Netto-Zeilen).
- Erste Live-Pruefung im echten Chrome deckte einen Folgefehler auf: neuer
  Knopf lag deckungsgleich auf #browserButton (`.browser-button` setzt
  `position:fixed; right:0` fest, ohne Ruecksicht auf Geschwister). Fix per
  Inline-`style="right: 36px"` in index.html (CSP erlaubt unsafe-inline
  styles) — keine CSS-Datei angefasst, noch innerhalb derselben Freigabe.
  Live per Bounding-Rect (`ueberlappt:false`) und echtem Klick-Test
  (Iframe auf /maus-replay.html bestaetigt geladen) verifiziert.
- Deploy: Arbeits-Repo 8bbc517+2f25c84, Live-Frontend chirurgisch auf dem
  jeweils aktuellen Live-Stand gepatcht (nicht blind ueberschrieben, andere
  Sessions hatten zwischenzeitlich weiterdeployt) — Commit 4519a3b,
  CACHE_NAME smejj-shell-v183.
- Gelernt: Bildschirmfoto-Pixel und CSS-Pixel-Koordinatenraum stimmen in
  diesem Chrome-Setup NICHT 1:1 ueberein (devicePixelRatio 2, aber
  Screenshot-Breite passte weder zu innerWidth noch zu innerWidth*dpr) —
  Klicks auf UI-Elemente im echten Chrome zuverlässig per `element.click()`
  in javascript_exec statt per rohen Screenshot-Koordinaten ausloesen.
- Weiterhin offen, operator-only: IDrive-e2-Zugangsdaten-Abgleich zwischen
  Maus-Engine (Zeabur) und Control-Server (Salad) — ohne den bleibt die
  Wiedergabe selbst fail-closed bei "Artefakt nicht ladbar" (erwartet, siehe
  job_maus_engine_abnahme_20260728).

## 2026-07-28 — Training-Loop-Dienst LIVE (job_smejj_training_loop_20260728)
- ERLEDIGT: fuenfter Zeabur-Dienst `smejj-training-loop`
  (service-6a68f0449949111176cec372) auf dem BESTEHENDEN 6-$-Server. Keine neue
  Kostenposition, kein neuer Anbieter. Zugang ueber die Zeabur-GitHub-App; den
  GitHub-Sicherheitscode gab der Betreiber selbst ein — Anmeldecodes gibt der
  Agent nie ein.
- VIER FALLEN, je ein Ship-Loop-Durchlauf, alle am Live-Protokoll gemessen:
  (1) Ohne Konfiguration startet Zeabur `pnpm start` = src/server.js, also den
  CONTROL SERVER statt des Workers. (2) zbpack `install_command` ueberschreiben
  verhindert den Quellcode-Kopiervorgang ("Cannot find module /src/workers/...").
  (3) `pnpm build:i18n` bricht im Bau mit MODULE_NOT_FOUND ab. (4) WURZEL:
  `.dockerignore` schloss `scripts` komplett und `workers/*` per Erlaubnisliste
  aus — neue Worker dort EINTRAGEN, sonst "failed to calculate checksum";
  `scripts` -> `scripts/*`, damit Ausnahmen ueberhaupt greifen.
- LOESUNG: `Dockerfile.<dienstname>` im Repo-Wurzelverzeichnis — Zeabur waehlt es
  gezielt fuer diesen einen Dienst, andere Dienste bleiben unberuehrt.
- NON-REGRESSION: maus-engine, chat-bridge, voice-piper unveraendert "Running 1/1".
  `smejj-remote-browser` = "Image Pull Failed", VORBESTEHEND (andere Sitzung).
- SEIT 2026-07-29 SCHARF UND MESSEND. /health: loopEnabled=true, state=running.
  Autonomer Lauf im Protokoll: 07:30:27 "listening (loopEnabled=true)" ->
  07:32:24 "eval cycle done: blocked" + "Punktzahl 85.3 % (Budget 80 %) |
  12 bestanden, 2 nicht bestanden". GENAU EIN Lauf, keine Doppellaeufe. 6-h-Takt.
- FALLE: Zeaburs "Restart" laedt die Umgebung NICHT neu (gleicher Container, alte
  Variablen). Nur ein echter Neubau per Commit-Webhook zieht neue Variablen.
- URTEIL "blocked" IST KORREKT: entsteht nur durch criticalFailures > 0
  (evalReport.js:38). Vollauf: 91,2 %, 13/14 Faelle 100 %, p95 1022 ms. Einziger
  Ausfall code-esm-failclosed, von der SCHNELLSPUR (groq:llama-3.1-8b-instant)
  beantwortet, die "export function parseBudget" nicht liefert. Suite bewusst
  NICHT gelockert — Schoenrechnen waere der eigentliche Fehler. Konsequenz waere
  Routing (Coding in die Tiefspur) = eigener Auftrag.
- OHNE IDRIVE trotzdem nuetzlich: Kennzahlen gehen ins Protokoll, mit Hinweis
  "IDRIVE_E2_* pruefen". Zugangsdaten traegt der Betreiber direkt beim Dienst ein
  ("smejj.com Zeabur-Schluessel.command" -> Edit Raw Variables).

## 2026-07-29 — Live-Bild der Maus: Kern gebaut, Deploy blockiert (job_maus_livebild_20260729)
- Weg A gewaehlt: Chrome filmt sich per CDP selbst (`Page.startScreencast`) statt
  wiederholtem `page.screenshot()` — letzteres blockiert den Renderer und wuerde
  den Lauf ausbremsen. Neu `workers/maus-engine/screencast.mjs` (ohne
  Playwright-Bezug, CDP-Sitzung wird hineingereicht -> ohne Browser testbar).
- **Wichtigste Erkenntnis, per Test abgesichert:** JEDES Einzelbild muss mit
  `Page.screencastFrameAck` bestaetigt werden, auch ein gedrosselt verworfenes.
  Ohne Ack stellt Chrome den Strom nach wenigen Bildern ein — das ist die
  klassische Ursache fuer "Live-Bild bleibt nach zwei Sekunden stehen".
- Uebertragung bewusst OHNE WebSocket und ohne neuen Dienst: EIN Objekt
  `live/frame.jpg`, laufend ueberschrieben; die Anzeige signiert die Adresse
  einmal (300 s) und pollt danach direkt gegen IDrive e2. Ergebnis: konstanter
  Speicher statt ein Objekt je Bild, und der Control Server sieht einen Aufruf
  alle paar Minuten statt einen je Bild.
- Fail-closed: ohne `SMEJJ_MAUS_LIVE_FPS` ist alles AUS; Obergrenze hart 10/s.
  Fail-safe: Veroeffentlichungsfehler beruehren den Lauf nie.
- 20 Tests gruen; check:guidelines/start-lock/architecture/frontend gruen.
- **NICHT live.** Engine-Deploy braucht ein neues ghcr.io-Abbild; gemessen:
  Docker-Daemon aus, und `~/.docker/config.json` kennt nur Docker Hub, kein
  ghcr.io. Verbleibende Verdrahtung (`onPageReady` im Interpreter) bewusst NICHT
  blind eingebaut — sie liesse sich ohne lauffaehige Engine kein einziges Mal
  ausfuehren. Details: task-capsules/2026/07/job_maus_livebild_20260729/.
