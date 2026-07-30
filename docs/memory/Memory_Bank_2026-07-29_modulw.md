# Memory_Bank — 2026-07-29: Modul W (Analytik) und das 90-Tage-Aufraeumen

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminmodulw_20260729`.

## [2026-07-29] MODUL W LIVE — damit sind alle 26 Buchstaben gebaut

Freigabe: "Ja" mit dem Auftrag, fachlich sinnvoll selbst zu entscheiden
(Wof Kadavanich, 2026-07-29). Der Betreiber hatte bei Modul W in der
Freigabeliste **kein Kaestchen angekreuzt**; die Entscheidung liegt damit
dokumentiert bei mir und steht unten mit Begruendung.

Commits `54a7793`, `98d0c44`, `b558456`, `1fa5280`; live als Control-Server
**Version 122**, Artefakt
`deployments/control/smejj-control-modul-w-c-2026-07-30.tar.gz`
(sha256 `a4e86d5c…`, 1.900.256 Byte, 857 Dateien).
Rueckweg: Version 121 (`…-modul-w-b-…`, ohne Zwischenspeicher), Version 120
(`…-modul-w-…`, mit dem Eimer-Fehler) und Version 119
(`…-mailprotokoll-…`, sha256 `8c8fdb10…`, Stand vor diesem Job).

### DIE ENTSCHEIDUNG: kein Besucher-Tracking, auch nicht "nur ein bisschen"

"Analytik" heisst ueblicherweise Besucher zaehlen, Seitenaufrufe, Verweildauer,
Herkunft, Geraet, Klickweg. Dafuer braucht es ein Skript, eine Kennung und ein
Einverstaendnis auf jeder Seite. Genau das hat smejj.com bewusst **nicht**: die
Startseite laedt keinen Zaehler, setzt kein Cookie, ruft keinen Dritten.

Ein Analytik-Bildschirm, der dafuer eigens ein Tracking einbaut, macht das
Wichtigste am Produkt kaputt, um eine Kachel zu fuellen. Deshalb misst Modul W
ausschliesslich, was im Betrieb **ohnehin** entsteht und schon auf IDrive e2
liegt:

| Reihe | Quelle | Wie gezaehlt |
| --- | --- | --- |
| Laeufe je Tag | Job-Ablage `jobs/` im Hauptspeicher | fruehester `LastModified` je Auftrags-Kennung |
| Registrierungen je Tag | Nutzer-Index `admin/index/users.json` | `createdAt` |
| Mailversand je Tag | Zustellprotokoll `mail/zustellung/` | ein Schluessel je Mail |
| Verwaltung je Tag | Audit-Log `admin/audit/` | ein Schluessel je Eintrag |

Gezaehlt werden **Schluessel, nie Inhalte**: bei Audit und Mail wird nur
gelistet, nie gelesen. Es kommt kein Inhalt in die Naehe dieser Ansicht.

Kein neues Recht: W laeuft unter `ops.read`, rein lesend, ohne Audit-Eintrag je
Aufruf.

### VIER REGELN, damit keine Zahl mehr behauptet als sie weiss

1. **Eine Null ist ein Messergebnis.** Ist eine Quelle nicht lesbar, steht dort
   `null` und die Reihe sagt "nicht erreichbar" — niemals eine Null, die wie "an
   dem Tag war nichts" aussieht.
2. **Eine abgeschnittene Liste nennt sich Untergrenze.** Wer nur die ersten
   Seiten gesehen hat, kennt keine Summe.
3. **Der Nutzer-Index ist eine Projektion.** Ist er aelter als der juengste Tag
   im Zeitraum, koennen frische Registrierungen fehlen — dann wird das gesagt,
   statt eine zu niedrige Zahl als Tatsache zu zeigen.
4. **Ein unbrauchbarer Zeitstempel wird nicht geraten.** Kapseln ohne
   verwertbares Datum (oder mit einem vor 2020) zaehlen unter "ohne Datum" und
   landen NICHT auf heute. Dieselbe Klasse hat in Modul S einmal Alter von rund
   9700 Tagen erzeugt — der deterministische Release-Bau setzt mtimes auf
   Epoche 0.

Eine unsinnige Zeitraum-Angabe (0, negativ, kein Zahlwert) faellt bewusst auf
den Standard 14 zurueck und wird **nicht auf 1 geklemmt**: eine
Ein-Tages-Ansicht sieht wie eine gueltige Antwort aus. Nach oben wird geklemmt
(90), weil 500 Tage eine echte Frage sind, nur eine zu teure.

### VIER FEHLER, die erst der Live-Lauf gezeigt hat

**1. Der Fehlertext enthielt den kompletten Quelltext von `fetch`.**
Ein vertauschtes Argument (`fetchImpl` landete auf dem Parameter `art`) sorgte
dafuer, dass `${art}_listing_fehlgeschlagen` die ganze Funktion ausdruckte —
sichtbar in der Oberflaeche. Lehre, als Test festgehalten: **ein Fehlergrund,
der angezeigt wird, darf nie einen Wert von aussen einsetzen.** Er ist jetzt
eine gepruefte Kurz-Kennung (`/^[a-z]{1,20}$/`, sonst "quelle").

**2. Derselbe Programmierfehler war als "Speicher nicht erreichbar" getarnt.**
Die Auflistung machte jede Ausnahme stumm zu `!ok`. Zusaetzlich verschluckt
`signedS3List` eine Ausnahme und meldet **Status 0** — dadurch hiess jeder Netz-,
DNS- und Programmierfehler gleich `http_0`. Die echte Ursache steht nur im Body
und wird jetzt von dort geholt und gekuerzt mitgenannt. Ohne diesen Griff sucht
man an der falschen Stelle: ein ReferenceError sah aus wie ein toter Speicher.

**3. "Laeufe: 0" war ein Eimer-Fehler, kein Befund.**
Die Reihe zaehlte zuerst `capsules/app/`. Das ist aber das Prefix, in das der
ENTWICKLUNGSRECHNER seine Dokumentations-Kapseln schiebt
(`upload_capsule_to_idrive.mjs`, lokal ist `IDRIVE_E2_BUCKET=smejj-model-files`).
Der Server liest den Hauptspeicher `smejj-app` — dort ist das Prefix leer.
Live stand 14 Tage "Laeufe: 0", waehrend das Audit-Log 15 Eintraege derselben
Tage auswies. Nachgemessen: 55 Schluessel im Deploy-Eimer, 0 im Hauptspeicher.
**Ein dauerhaft nullwertiger Zaehler ist schlimmer als gar keiner: er sieht wie
ein Befund aus.** Gezaehlt wird jetzt `jobs/` (erzwungen durch
`assertSafeJobPrefix`), wobei ein Zustandsordner wie `open` KEIN Lauf ist —
sonst zaehlt derselbe Auftrag mehrfach. Live danach: 9 Laeufe.

**4. MODUL I hatte denselben Fehler, vorbestehend.**
`opsSpeicher` fuehrte `capsules/app/` als `eimer: "haupt"` und zeigte dort
dauerhaft 0 Objekte — genau der Fall, vor dem der Kommentar in derselben Datei
warnt. Jetzt `eimer: "deploy"` (live 55 Objekte), und `jobs/` heisst dort
"Jobs und Laeufe" (985 Objekte). **Dritter Fall dieser Klasse im Adminbereich:**
Speicher las einen Eimer statt zwei, Wissen hielt Epoche-0-Zeitstempel fuer
Alter, hier suchte eine Zahl am falschen Ort. Alle drei sahen live wie eine
Aussage ueber das System aus.

**Leistung: p95 747 ms gegen ein Budget von 300 ms.** Vier Prefix-Auflistungen
je Aufruf, `jobs/` allein mit 985 Objekten. Behoben mit 60 s Zwischenspeicher je
Zeitraum — dieselbe Loesung wie beim Nutzer-Index. Danach kalt 824 ms, warm p50
214 / **p95 284 ms**. Der Speicher versteckt nichts: `gemessenAm` bleibt der
Zeitpunkt der MESSUNG, `zwischengespeichert` und `alterSekunden` stehen in der
Antwort, und ein Ausfall wird NICHT gemerkt (sonst waere eine Stoerung eine
Minute lang festgeschrieben). Der kalte Aufruf bleibt als offener Punkt stehen.

**Nebenbefund in Modul V berichtigt:** die Ueberschrift stand fest auf "Es gibt
kein Zustellprotokoll". Seit dem 29.07. gibt es eines — damit war das eine
Falschaussage **direkt ueber der Tabelle, die es zeigt**. Sie wird jetzt aus dem
Zustand abgeleitet. Gleiche Klasse wie der Widerspruch "Davon frisch: 2" neben
"keines davon frisch".

## [2026-07-29] DAS 90-TAGE-AUFRAEUMEN LAEUFT JETZT WIRKLICH

`raeumeAuf()` war seit dem Zustellprotokoll fertig — und wurde von **niemandem
aufgerufen**. Damit war die Zusage an den Betreiber ("Aufbewahrung 90 Tage,
danach automatische Loeschung") eine Absicht, kein Verhalten. Eine
Aufbewahrungsfrist, die nur im Code steht und nie ablaeuft, ist schlimmer als
keine: sie wurde zugesagt.

Neu `control-server/src/auth/mailLogJanitor.js`, verdrahtet in `src/server.js`
direkt nach `server.listen`. Drei Entscheidungen:

- **Verzoegerter erster Lauf (5 Minuten).** Ein Container, der mehrfach
  hintereinander neu ausgerollt wird (bei Salad der Normalfall), wuerde sonst
  jedes Mal sofort listen.
- **Der Taktgeber haelt den Prozess nicht wach (`unref`).** Ein Zeitgeber, der
  ein Skript am Beenden hindert, faellt spaeter als haengender Test auf und wird
  dann falsch reparariert.
- **Auch die Null wird gemeldet.** Sonst ist "laeuft und hat nichts zu tun" nicht
  von "laeuft gar nicht" zu unterscheiden — genau der Fehler davor.

Ohne Objektspeicher startet der Taktgeber gar nicht, statt jeden Tag ins Leere zu
greifen. Was geloescht werden darf, entscheidet weiter **allein**
`darfGeloeschtWerden()` — dieses Modul kennt keine Schluessel und bildet keine.

## [2026-07-30] NACHTRAG: Tagesprojektion statt Zaehlstand im Arbeitsspeicher

Capsule `job_analytik_projektion_20260730`, Commits `fcabd1b`, `5d568ef`,
`e4ce5dc`, live als **Version 124**.

Der 60-s-Zwischenspeicher von oben war die falsche Loesung. Er wirkte nur **je
Instanz** — bei 50 Instanzen 50 kalte Aufrufe pro Minute, also ein Engpass, der
mit der Instanzzahl mitwaechst. Genau das verbietet die Skalierungsregel: "kein
Sitzungs-, Job- oder Zaehlstand im Serverspeicher. Alles auf IDrive e2."

Jetzt liegen die drei teuren Reihen als EIN Objekt
`admin/index/analytik-tage.json` (rund 1 KB) auf IDrive e2, mit 20-Sekunden-
Lesedurchgriff je Instanz. Der Durchgriff merkt die **Antwort eines GET**, nicht
eine eigene Rechnung — deshalb halten 50 Instanzen denselben Stand statt eigene
Zahlen zu bilden. Registrierungen und Bestand bleiben live aus dem Nutzer-Index,
der fuer den Bestand ohnehin gelesen wird.

### DIE WICHTIGSTE MESS-LEHRE DIESER SITZUNG

**Die Grundlast reisst das Budget selbst.** `/api/health` — kein Speicherzugriff,
keine Anmeldung, keine Rechenarbeit — kam von diesem Standort aus auf **p95
492 ms**, `/api/admin/ops/modelle` auf **p95 674 ms**. Das 300-ms-p95-Budget ist
von aussen also **nicht pruefbar**; die Strecke Client->Salad dominiert. Wer
absolute Zahlen ohne Grundlast-Vergleich meldet, meldet die Netzstrecke des
Messenden als Eigenschaft des Servers.

Aussagekraeftig ist der **Eigenanteil**: die Differenz zu einem Endpunkt ohne
Speicherzugriff auf demselben Host, im selben Lauf.

| Stand | p50 | Eigenanteil |
| --- | --- | --- |
| v120 ohne alles | 611 ms | — |
| v122 Zaehlstand im Speicher | 214 ms (warm), 824 ms kalt | — |
| v123 Projektion | 293 ms | +79 ms |
| **v124 Projektion + Durchgriff** | **213 ms** | **-5 ms (nicht messbar)** |

Erster Aufruf je Instanz: 676 ms. Einmalig, danach nicht mehr messbar.

### Drei Regeln, damit die Projektion keine zweite Wahrheit wird

1. **Eine gescheiterte Quelle wird als gescheitert gespeichert, nie als 0** —
   sonst friert ein Ausfall als "an dem Tag war nichts" ein.
2. **Das Alter faehrt mit**, auch durch den Lesedurchgriff: gerechnet wird das
   Alter der PROJEKTION, nicht des Durchgriffs.
3. **Ein fehlgeschlagener Neubau ueberschreibt nichts.** Ohne eine einzige
   lesbare Quelle bleibt die alte Projektion stehen.

Dazu: ein Neubau entwertet den Durchgriff, und ein Ausfall wird nicht gemerkt.

### Zwei Nebenfunde

- **Der Lesedurchgriff schlug zwischen unabhaengigen Testfaellen durch.** Ein
  prozessweiter Zwischenspeicher braucht in Tests einen ausdruecklichen
  Ausschalter, sonst prueft der zweite Fall den ersten mit.
- **`check:paths` war rot — fremde Datei, gemeinsamer Branch.**
  `docs/architecture/CODEBERG_SPIEGEL.md` enthielt seit `22eef72` den vollen
  Projektordner in einer Cron-Zeile; `release:preflight` endete damit fuer JEDE
  Sitzung mit Code 1. Behoben (Pfad zur Laufzeit aus `pwd`). Danach erstmals
  Exit-Code 0.

## Was gepruefte Regel bleibt

- **Ein Fehlergrund, der in der Oberflaeche landet, wird gebaut, nicht
  weitergereicht.** Kurze Kennung plus gekuerzte Ursache; nie ein Wert von
  aussen.
- **Ein stiller `catch` verwandelt einen Programmierfehler in eine
  Infrastruktur-Diagnose.** Wenn gefangen wird, muss die Ursache mitfahren.
- **Eine feste Ueberschrift veraltet.** Was sich aendern kann, wird aus dem
  Zustand abgeleitet.
- **Eine zugesagte Aufbewahrungsfrist braucht einen Taktgeber**, sonst ist sie
  eine Absicht.
- **Ein Zwischenspeicher im Arbeitsspeicher loest nichts, was mit der
  Instanzzahl waechst.** Ein abgeleitetes Objekt auf IDrive e2 schon.
- **Eine Antwortzeit ohne Grundlast-Vergleich ist keine Messung.** Erst die
  Differenz zu einem Endpunkt ohne Speicherzugriff auf demselben Host sagt
  etwas ueber den eigenen Anteil.
