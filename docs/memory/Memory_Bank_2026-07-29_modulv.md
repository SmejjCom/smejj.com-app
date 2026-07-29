# Memory_Bank — 2026-07-29: Modul V (E-Mail-Zustellung)

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel. Der Hauptindex
> traegt einen Zeiger hierher. Capsule: `job_adminmodulv_20260729`.

## [2026-07-29] MODUL V LIVE — E-Mail-Zustellung, so weit es ehrlich geht

Freigabe: "Weiter" auf den Vorschlag, V mit klarer Fehlanzeige zu bauen
(Wof Kadavanich, 2026-07-29). Commits `2d1e65e` und `2c8bbce`, live als
Control-Server **Version 115**, Artefakt
`deployments/control/smejj-control-modul-vb-2026-07-29.tar.gz`.
Rueckweg: `smejj-control-modul-v-...` bzw. `smejj-control-stufe8-2026-07-29.tar.gz`.

Damit sind **25 der 26 Buchstaben** gebaut. Offen bleibt nur noch W (Analytik).

### Es gibt kein Zustellprotokoll

`sendAuthMail` liefert `{sent, reason}` zurueck — **aber niemand schreibt das
weg**. Ob eine einzelne Mail angekommen, abgewiesen worden oder im Spam gelandet
ist, weiss dieses System nicht. Eine Zustellquote muesste erfunden werden.

Gezeigt werden deshalb die zwei Dinge, die wirklich messbar sind:

1. **Ist der Versand eingerichtet?** Ohne vollstaendige SMTP-Angaben verschickt
   smejj.com fail-closed gar nichts — dann kommt bei NIEMANDEM ein Link an.
   Live: eingerichtet ueber smtp.gmail.com:465, Absender smejjcom@gmail.com.
2. **Wie viele Konten haengen unbestaetigt, und wie frisch sind sie?** Wer sich
   registriert und nie bestaetigt, hat den Link ignoriert — oder nie bekommen.

Weder SMTP-Passwort noch SMTP-Benutzer verlassen das Modul; gemeldet wird nur,
OB sie gesetzt sind. Server, Port, Absender und Verschluesselungsart stehen
dagegen drin: keine Geheimnisse, aber noetig beim Suchen.

Kein Testversand — eine Mail zu verschicken ist eine Aussenwirkung und gehoert
nicht in einen Lese-Bereich.

### BEFUND: alle fuenf aktiven Konten sind unbestaetigt

Live gemessen: 5 aktive Konten, **alle fuenf unbestaetigt**, zwei davon aus den
letzten 24 Stunden, der aelteste Fall 15 Tage. Bei jedem einzelnen Konto ist
der Bestaetigungslink nie bestaetigt worden.

Das ist ein Hinweis, kein Beweis — aber wenn NICHT EIN EINZIGES Konto je
bestaetigt wurde, spricht das eher fuer ein Zustellproblem als fuer Zufall.
Der naheliegende Verdacht bei Gmail-SMTP: die Mails landen im Spam oder werden
abgewiesen. Nachweisen laesst sich das nur mit einem Rueckkanal, den es nicht
gibt.

### FALLE: der Satz widersprach der Kachel

Live stand "Davon frisch: **2**" in der Kachel und "keines davon frisch" im
Satz darunter. Die Schwelle (weniger als drei gilt als unauffaellig) hatte
**"wenige" stillschweigend in "keine" verwandelt**.

**Ein Bildschirm, der sich selbst widerspricht, ist schlimmer als einer, der
schweigt: man weiss danach nicht mehr, welcher Zahl man glauben soll.** Der
Satz nennt jetzt die tatsaechliche Zahl, und der Fall "alle Konten betroffen"
bekam eine eigene, deutlichere Formulierung.

### FALLE: der Test mass die Erklaerung statt der Sache

Die Pruefung "keine erfundene Zustellquote" durchsuchte das gesamte JSON nach
dem Wort "Zustellquote" — und fand es im eigenen Hinweistext, der ja gerade
erklaert, dass es keine gibt. Geprueft werden jetzt FELDNAMEN statt Prosa.

Das ist dieselbe Klasse wie das Wortfragment "iv" in "aktiv" aus Stufe 6:
**ein Test, der auf Text statt auf Struktur prueft, schlaegt frueher oder
spaeter aus dem falschen Grund an.**

### Verifikation

- 351 Unit-Tests gruen (11 neu), `check:guidelines` OK (1090 Dateien), voller
  `release:preflight` gruen inklusive Start-Lock, `check:security` und
  `check:release-imports` (167 Dateien transitiv).
- Live geprueft: /api/admin/ops/email liefert 200 mit Anmeldung, 401 ohne;
  die Ansicht zeigt Server, Port, Verschluesselung und Absender, aber keine
  Zugangsdaten.
- Deploy-Vergleich mit dem Live-Artefakt: keine fremde Arbeit enthalten.
- Benchmark: `docs/benchmarks/adminmodulv_2026-07-29.json`.
