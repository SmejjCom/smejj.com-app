# Memory_Bank — 2026-07-28: Adminbereich Stufe 3

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminstufe3_20260728`.

## [2026-07-28] ADMINBEREICH STUFE 3 LIVE — schreibend, mit Vier-Augen und Einwilligung

Freigabe: "Ja, mach hintereinander komplett fertig. Lass nicht offen mach 100 %
fertig." (Wof Kadavanich, 2026-07-28). Commits `e0a83bb`, `ef12ce8` und der
Statuscode-Fix dazwischen. Live als Control-Server **Version 101**, Artefakt
`deployments/control/smejj-control-stufe3c-2026-07-28.tar.gz`, Rueckweg
`smejj-control-stufe3b-...` bzw. `smejj-control-k3-effort-...`.

### Was jetzt geht

Sperren, entsperren, Sitzungen widerrufen, E-Mail bestaetigen, Login-Sperre
aufheben, Rolle vergeben, Konto loeschen — dazu Support-Impersonation mit
Einwilligung. Erste Stufe, in der der Adminbereich Konten veraendern kann.

### Die Entscheidungen, die den Unterschied machen

- **LOESCHEN UND ROLLENVERGABE SIND FUER JEDE ROLLE "dual" — auch fuer den Owner.**
  Loeschen ist unumkehrbar; Rollenvergabe ist Rechteausweitung, und wer sie
  allein kann, kann sich selbst alles geben. Es gibt keine Rolle, die eines von
  beiden im Alleingang darf.
- **Der Antragsteller darf weder freigeben noch ablehnen.** Sonst waeren vier
  Augen nur zwei mit Umweg. Der Vergleich normalisiert die Adresse, damit eine
  andere Schreibweise nicht durchrutscht.
- **Freigabe und Ausfuehrung sind EIN Schritt.** Waeren sie getrennt, bliebe ein
  zweiter Knopf uebrig, den wieder eine einzelne Person drueckt.
- **Ein Antrag verfaellt nach 24 Stunden.** Eine offene Freigabe, die wochenlang
  herumliegt, ist eine Hintertuer.
- **Wer die Sache selbst nicht darf, darf sie auch nicht durchwinken** — sonst
  koennte jemand ohne Loeschrecht eine Loeschung bestaetigen.
- **Sperren widerruft alle Sitzungen.** Ein gesperrtes Konto mit laufender
  Sitzung waere nicht gesperrt.
- **Loeschen laesst eine Huelle mit `status: "deleted"` stehen.** Waere der
  Datensatz ganz weg, koennte dieselbe Adresse sofort neu registriert werden und
  die Audit-Spur zeigte ins Leere. Es bleiben Konto-ID und Zeitpunkt — kein Name,
  kein Passwort-Hash, keine Sitzung.
- **Der letzte Owner ist geschuetzt**, und niemand sperrt, entmachtet oder
  loescht sich selbst, waehrend er die Konsole bedient.

### Impersonation: Einwilligung statt Vollmacht

- Die betroffene Person willigt in IHRER EIGENEN Sitzung ein — nicht per
  E-Mail-Link, den man abfangen koennte.
- Hoechstens 30 Minuten, nur der beantragte Umfang, jederzeit von beiden Seiten
  beendbar. **Chat-Inhalte sind nie im Standardumfang.**
- Break-Glass laeuft ohne Einwilligung, aber nur 10 Minuten, verlangt mindestens
  20 Zeichen Begruendung und ist im Datensatz als Alarm markiert.
- Der Datensatz ist eine **Erlaubnis, kein Schluessel**: es wird kein Token der
  anderen Person erzeugt oder gelesen.

### FALLE, die eine ganze Runde gekostet hat

**Die Einwilligung lag zuerst unter `/api/admin/...` — also hinter dem
Admin-Gate.** Damit war genau derjenige ausgesperrt, dessen Zustimmung gebraucht
wird: die betroffene Person hat keine Adminrolle. Der Integrationstest hat es
aufgedeckt (403 statt 200).

Regel daraus: **Wenn eine Aktion von der betroffenen Person ausgeht, gehoert sie
nicht in den Adminbereich.** Sie liegt jetzt unter
`/api/account/impersonation/{id}/consent`, wo "angemeldet" reicht; wer welchen
Vorgang beruehren darf, entscheidet die E-Mail, nicht die Rolle. Nebeneffekt,
der beabsichtigt ist: jede Person sieht dort, wer wann mit welcher Begruendung
in ihr Konto geschaut hat.

### FALLE Nummer zwei: Schleifen gegen den Objektspeicher

Nach dem Deploy stieg `/api/admin/audit` von 538 auf **1115 ms Median — bei elf
Eintraegen**. Ursache: je Eintrag ein GET, streng nacheinander. Bei fuenfzig
Eintraegen waeren es fuenfzig Rundreisen hintereinander gewesen.

`control-server/src/shared/parallelFetch.js` holt jetzt hoechstens acht Objekte
gleichzeitig. Acht, nicht alle: der Control-Server hat zwei vCPU, zweihundert
gleichzeitige Verbindungen waeren Selbstueberlastung. Betroffen waren vier
Stellen mit demselben Muster — Audit, Freigaben, Impersonation und der
Index-Neubau. **Merke: jede Schleife, die pro Eintrag ein Objekt aus IDrive e2
holt, ist ein Latenzproblem in Wartestellung.**

### Kleinigkeit mit Signalwirkung

Selbst-Freigabe lieferte 403, Selbst-Ablehnung aber 409 — dieselbe Regel mit
zwei Signalen. 409 heisst "spaeter nochmal versuchen", hier gilt aber "nie".
Beide liefern jetzt 403.

### Live-Abnahme (Testkonto `…@example.invalid`, niemals ein echtes)

- Ohne Grund: 400. Sperren: 200 mit vorher/nachher, sofort zurueckgenommen.
- Loeschen beantragt: **202, Konto unveraendert**. Selbst freigeben: 403.
  Selbst ablehnen: 403. Konto danach immer noch unveraendert.
- Impersonation: ohne Grund abgewiesen, auf sich selbst abgewiesen, Break-Glass
  mit kurzer Begruendung abgewiesen, echter Antrag wartet auf Einwilligung,
  Adminweg zur Einwilligung versperrt, fremde Einwilligung abgewiesen.
- **Es wurde nichts geloescht.** Der offene Loesch-Antrag verfaellt nach 24
  Stunden — und niemand ausser einer zweiten Person koennte ihn freigeben.
- Audit: elf Eintraege, Kette lueckenlos, jeder mit Akteur, Ziel und Grund.

### Non-Regression und Parallel-Session

Kimi K3 und die Denktiefe der Parallel-Session blieben unangetastet. Das war
nicht selbstverstaendlich: das live laufende Artefakt trug deren **unverbuchte**
Arbeit. Statt zu raten, wurde das Live-Artefakt aus IDrive e2 heruntergeladen
und Datei fuer Datei gegen den eigenen Commit verglichen — Ergebnis: keine Datei
war "nur live", `modelRouter.js` war byte-identisch. Erst danach wurde gebaut.

**Merke: bevor man einen Control-Server-Release aktiviert, waehrend eine andere
Sitzung im selben Repository arbeitet, das laufende Artefakt herunterladen und
vergleichen.** `previousArtifactKey` in der Antwort des Release-Skripts zeigt
zusaetzlich, was man gerade ersetzt.

Benchmark: `docs/benchmarks/adminstufe3_2026-07-28.json`. 162 Tests gruen.
