# Memory_Bank — 2026-07-28: Adminbereich Stufe 6 (Sicherheit)

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminstufe6_20260728`.

## [2026-07-28] ADMINBEREICH STUFE 6 LIVE — Schluessel, Sicherheitslage, Admin-Verwaltung

Freigabe: "Ja" auf die Fortsetzung der vereinbarten Reihenfolge (Wof Kadavanich,
2026-07-28). Commits `d60bbd6` und der Testwert-Fix, live als Control-Server
**Version 108**, Artefakt `deployments/control/smejj-control-stufe6-2026-07-28.tar.gz`.
Rueckweg: `smejj-control-stufe5c-...` (Stand vor diesem Job).

Damit sind **19 der 26 A-Z-Module** gebaut. Offen bleiben Geld (E, F) und
Produkt (S, T, V, W, X, Y).

### J · Der Wert eines Schluessels verlaesst das Modul nie

Die Huelle auf IDrive e2 traegt Konto-Kennung und Anbieter im Klartext; ob der
Schluessel gilt und woran man ihn erkennt, liegt im verschluesselten Teil.
Dafuer wird entschluesselt — das tut der Control-Server bei jeder Chat-Anfrage
ohnehin, neu ist nur die Anzeige.

**Entscheidend ist, was danach passiert: es wird NICHT das entschluesselte
Objekt durchgereicht, sondern ein neues gebaut, Feld fuer Feld. Kein Spread.**
Ein Spread nimmt kuenftige Felder stillschweigend mit — und das kuenftige Feld
ist irgendwann der Schluessel selbst.

Faellt die Entschluesselung aus, bleibt die Zeile stehen, mit "unbekannt" statt
"aus". Weniger zu wissen ist besser als zu raten.

### L · Eine Linse, kein zweiter Speicher

Sicherheitsereignisse kommen aus dem Audit-Log, auffaellige Konten aus dem
Verzeichnis. Ein eigener Sicherheits-Speicher waere ein zweiter Stand, der vom
ersten abweichen kann — **bei einer Pruefung sind zwei Staende schlimmer als
einer.**

Zusagen wie "die Konto-Enumeration ist geschlossen" stehen bewusst NICHT drin:
das waere eine Behauptung aus dem Gedaechtnis, kein Befund. Der Grund einer
Aktion wird ebenfalls nicht dupliziert — er steht im Audit-Log, wo er gegen
Aenderung gesichert ist.

### Z · VIER AUGEN BRAUCHEN ZWEI MENSCHEN

Der wichtigste Befund des Moduls ist keine Liste, sondern eine Rechnung.
Loeschen und Rollenvergabe sind fuer JEDE Rolle "dual". Gibt es nur eine Person
mit dem Recht, ist die Aktion **nicht unsicher, sondern unmoeglich** — der
Antragsteller darf die eigene Anfrage nicht freigeben (Regel aus Stufe 3).

Das faellt sonst erst in dem Moment auf, in dem man die Absicherung braucht.
Geprueft wird gegen die Rechtematrix, nicht gegen eine fest verdrahtete Liste:
kommt ein weiteres dual-Recht dazu, waechst die Pruefung mit.

Ein gesperrtes Konto zaehlt nicht als zweites Augenpaar. Eine Rolle ohne
dual-Recht (Support, Auditor) hilft nicht — wer nicht loeschen darf, darf auch
nicht freigeben.

Dazu: zweiter Faktor je Zugang, wobei **"nicht ermittelbar" nicht dasselbe ist
wie "keiner"** — dieselbe Regel wie bei "ungeprueft" in Stufe 5. Und der
Notzugang ueber `SMEJJ_ADMIN_OWNER_EMAILS`, benannt statt verschwiegen: diese
Adressen gelten auch dann als Owner, wenn im Verzeichnis nichts steht. Sie sind
der Weg zurueck und muessen deshalb selbst besonders geschuetzt sein.

### Rechte: eines neu, zwei wiederverwendet

`apikeys.read` (Owner, Admin, Auditor) ist neu — ein Auditor muss nachweisen
koennen, dass ein Schluessel widerrufen wurde, ohne widerrufen zu duerfen.
Support und readonly bleiben draussen: wer Schluessel eines fremden Kontos
sieht, sieht mehr als sein Auftrag verlangt.

L und Z kommen mit `audit.read` und `users.read` aus. **Nicht fuer jedes Modul
ein eigenes Recht** — eine Matrix, die fuer jede Kleinigkeit einen Eintrag
bekommt, wird unuebersichtlich, und Unuebersichtlichkeit ist das Gegenteil von
Sicherheit.

### Die eine Schreibaktion

Schluessel widerrufen, mit Pflichtgrund ab 10 Zeichen und Audit-Eintrag.
Bewusst "allow" statt "dual": es loescht nichts und aendert kein Konto, es macht
einen Schluessel unbrauchbar. Im Zweifel ist das die richtige Reaktion und muss
schnell gehen; rueckgaengig macht sie die Nutzerin selbst mit einem neuen
Schluessel.

### FALLE: der Testwert sah aus wie ein echter Schluessel

`check:security` durchsucht das Repository nach schluesselartigen Zeichenfolgen
und meldete den `sk-...`-Kanarienvogel im Test. **Der Waechter hatte recht: ein
Muster, das echte Schluessel findet, muss auch dort anschlagen.** Also wich der
Test aus, nicht der Waechter — als Kanarienvogel taugt jede eindeutige
Zeichenfolge.

### FALLE: ein Test, der auf Wortfragmente hereinfaellt

Die Pruefung "kein Initialisierungsvektor nach aussen" suchte nach der
Zeichenfolge `"iv"` — die steckt als Teilwort in **akt-iv** und faerbte den Test
grundlos rot. Geprueft wird jetzt gegen die WERTE der Huelle. Ein Test, der auf
Wortfragmente hereinfaellt, verliert seine Aussagekraft.

### FALLE: `subjectId` ist keine E-Mail

Die Huelle traegt die Konto-KENNUNG (`authenticatedUserId`), nicht die Adresse —
`safeSubjectId` laesst kein `@` zu. Eine Liste aus "u_a1b2c3" ist fuer einen
Menschen unbrauchbar; ein Aufruf des Nutzer-Index (30 s zwischengespeichert)
macht daraus einen lesbaren Namen. Bleibt der Index stumm, steht die Kennung da.

### Verifikation

- 279 Unit-Tests gruen (22 neu), `check:guidelines` OK (1053 Dateien), voller
  `release:preflight` gruen inklusive Start-Lock, `check:security` und
  `check:release-imports` (158 Dateien transitiv).
- Lokal alle drei Ansichten durchgeklickt, keine Konsolenfehler; ohne Anmeldung
  401 auf allen drei Endpunkten.
- Deploy-Vergleich mit dem Live-Artefakt: keine fremde Arbeit enthalten.
- Benchmark: `docs/benchmarks/adminstufe6_2026-07-28.json`.
