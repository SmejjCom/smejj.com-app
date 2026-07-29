# Memory_Bank — 2026-07-29: Modul W (Analytik) und das 90-Tage-Aufraeumen

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminmodulw_20260729`.

## [2026-07-29] MODUL W LIVE — damit sind alle 26 Buchstaben gebaut

Freigabe: "Ja" mit dem Auftrag, fachlich sinnvoll selbst zu entscheiden
(Wof Kadavanich, 2026-07-29). Der Betreiber hatte bei Modul W in der
Freigabeliste **kein Kaestchen angekreuzt**; die Entscheidung liegt damit
dokumentiert bei mir und steht unten mit Begruendung.

Commit `54a7793`, live als Control-Server **Version 120**, Artefakt
`deployments/control/smejj-control-modul-w-2026-07-29.tar.gz`
(sha256 `3b15d302…`, 1.895.268 Byte, 856 Dateien).
Rueckweg: `deployments/control/smejj-control-mailprotokoll-2026-07-29.tar.gz`
(sha256 `8c8fdb10…`, Version 119).

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
| Laeufe je Tag | Task Capsules `capsules/app/` | frueheste `LastModified` je Auftrag |
| Registrierungen je Tag | Nutzer-Index `admin/index/users.json` | `createdAt` |
| Mailversand je Tag | Zustellprotokoll `mail/zustellung/` | ein Schluessel je Mail |
| Verwaltung je Tag | Audit-Log `admin/audit/` | ein Schluessel je Eintrag |

Gezaehlt werden **Schluessel, nie Inhalte**: bei Audit und Mail wird nur
gelistet, nie gelesen. Das ist billig (live 231–313 ms fuer 14 Tage) und es kommt
kein Inhalt in die Naehe dieser Ansicht.

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

### ZWEI FEHLER, die erst der Live-Lauf gezeigt hat

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
