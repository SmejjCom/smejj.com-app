# Memory_Bank — Adminbereich Stufe 3 bis 8, Modul V und W, Kontingent-Waechter

Wortgleich ausgelagert am 2026-08-04 aus `Memory_Bank.md` (die Datei stand bei
800 von 800 Zeilen). Nichts gekuerzt, nichts geloescht — der Inhalt steht hier
vollstaendig, die Hauptdatei traegt den Verweis.

Zeitraum 2026-07-28 bis 2026-07-29. Alle Eintraege sind live verifiziert.

---

### [2026-07-29] MODUL W LIVE — ALLE 26 BUCHSTABEN GEBAUT (job_adminmodulw_20260729)

Volltext: [docs/memory/Memory_Bank_2026-07-29_modulw.md](docs/memory/Memory_Bank_2026-07-29_modulw.md).
Commit `54a7793`, Control-Server **Version 120**. Kurzfassung:

- **Selbst entschieden (kein Kaestchen angekreuzt): kein Besucher-Tracking.**
  Gemessen wird nur, was ohnehin entsteht (Kapseln, Nutzer-Index,
  Zustellprotokoll, Audit-Log) — gezaehlt werden SCHLUESSEL, nie Inhalte.
  **"—" heisst nicht lesbar, 0 heisst gemessen und leer.** Nie vermischt.
- FALLE: ein vertauschtes Argument schrieb **den ganzen Quelltext von `fetch` in
  den Fehlergrund**. Ein angezeigter Grund wird gebaut, nie von aussen gesetzt.
  Ein stiller `catch` tarnte denselben Programmierfehler als "Speicher nicht
  erreichbar"; `signedS3List` meldet jeden Fehler als `http_0` (Ursache nur im Body).
- **Das 90-Tage-Aufraeumen laeuft jetzt wirklich** (`mailLogJanitor.js`) — eine
  zugesagte Aufbewahrungsfrist ohne Taktgeber ist bloss eine Absicht.

### [2026-07-29] MODUL V LIVE — E-Mail-Zustellung (job_adminmodulv_20260729)

Volltext: [docs/memory/Memory_Bank_2026-07-29_modulv.md](docs/memory/Memory_Bank_2026-07-29_modulv.md).
Commits `2d1e65e`, `2c8bbce`, Version **115** (Zustellprotokoll v119). Kurzfassung:

- **BEFUND: alle fuenf aktiven Konten sind unbestaetigt**, aeltester Fall 15 Tage.
  Wenn NICHT EIN EINZIGES je bestaetigt wurde, spricht das eher fuer ein
  Zustellproblem als fuer Zufall (Versand ueber smtp.gmail.com). FALLE: **der
  Satz widersprach der Kachel** ("Davon frisch: 2" neben "keines davon frisch").
- FALLE: der Test durchsuchte Prosa statt Feldnamen und stolperte ueber den
  eigenen Hinweistext. Gleiche Klasse wie "iv" in "aktiv" aus Stufe 6.

### [2026-07-29] ADMINBEREICH STUFE 8 LIVE — Produkt (job_adminstufe8_20260729)

Volltext: [docs/memory/Memory_Bank_2026-07-29_adminstufe8.md](docs/memory/Memory_Bank_2026-07-29_adminstufe8.md).
Commit `45a8e6d`, Control-Server **Version 113**. Kurzfassung:

- **S Wissen:** das Dokumentenalter ist im Artefakt NICHT messbar (der
  Release-Bau setzt ueberall denselben Zeitstempel). Das Modul meldet "nicht
  messbar" statt rund 9.700 Tagen — vor dem Deploy im Artefakt geprueft.
- **T Sprachen:** FALLE — wortgleiche Werte als "unuebersetzt" zu zaehlen meldete
  live ALLE 14 Sprachen als lueckenhaft ("System", "Maximal" heissen vielfach
  genau so). **Eine Heuristik, die "gleich" mit "falsch" verwechselt, erzeugt
  Fehlalarm in genau den Faellen, die richtig sind.** Nach dem Fix: 14 von 14.
- **X Experimente:** kein eigener Speicher, keine erfundenen Ergebnisse; gezeigt
  wird die Laufzeit — ein Experiment, das niemand beendet, ist ein Dauerzustand.
- **Y Aufgaben:** nichts verschwindet spurlos; Abschluss und Verwerfen brauchen
  einen Nachweis ab 5 Zeichen.
- FALLE: `recordStore.lies()` liefert den Datensatz DIREKT, nicht
  `{ok, datensatz}`. **Bei einem gemeinsamen Baustein die vorhandene Verwendung
  nachlesen, nicht die Signatur raten.**

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
