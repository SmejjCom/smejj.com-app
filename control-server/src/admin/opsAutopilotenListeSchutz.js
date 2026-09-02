// smejj.com — Modul AP, Registry-Teil 3: die Schutz- und Sicherheits-
// Autopiloten Nr. 44-54 (Betreiber-Freigabe 2026-08-24: "Ja, alle 17 bauen"),
// Nr. 61, der Test-Wächter (Mac-LaunchAgent, nicht Läufer), sowie aus der
// Optimierungs-Runde vom selben Tag ("Alle 5 bauen") Nr. 63, die
// Web-Vitals-Wache (Mac-LaunchAgent), und Nr. 64, die Speicher-Wache.
//
// Eigene Datei aus demselben Grund wie Teil 2 (Evolution): die Hauptliste
// steht längst an der 800-Zeilen-Regel. Wer einen Autopiloten sucht, findet
// ihn über AUTOPILOTEN in opsAutopilotenListe.js.
//
// Alle elf laufen im Autopilot-Läufer (alle 30 Minuten) und folgen dem
// Ehrlichkeits-Beschluss: Selbsttest mit kaputter UND gesunder Probe, dann
// echte Messung mit Zahlen — siehe tests/autopiloten-ehrlichkeit.test.mjs
// und tests/schutz-autopiloten.test.mjs.

const STUNDE_MS = 60 * 60 * 1000;
const TAG_MS = 24 * STUNDE_MS;

const LAEUFER = Object.freeze({
  ort: "Control Server (Autopilot-Läufer)",
  zeitplan: "alle 30 Minuten",
  messung: "heartbeat",
  erwartetAlleMs: STUNDE_MS,
  schonfristMs: STUNDE_MS,
  startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
  stopAnleitung: "Nur durch Anhalten des Control-Servers."
});

export const SCHUTZ_AUTOPILOTEN = Object.freeze([
  {
    id: "rueck-roller",
    name: "Rück-Roller",
    nummer: "44",
    kurz: "Erkennt, wenn ein frischer Deploy die Kern-Ampeln umwirft, und legt die fertige Rückroll-Empfehlung vor — Protokoll-Modus, er rollt nie selbst.",
    funktionen: [
      "Stempelt den laufenden Stand (ZEABUR_GIT_COMMIT_SHA) als stabil, sobald ALLE Kern-Ampeln grün sind — neustart-fest in der Ablage.",
      "Werden 2+ Kern-Ampeln rot UND der Stand hat gewechselt, schreibt er eine Rückroll-Empfehlung (von/zu/Grund) und wird ROT — die Alarm-Wache mailt.",
      "PROTOKOLL-MODUS MIT ABSICHT: der Zeabur-Schlüssel liegt beim Betreiber, nicht am Dienst — und ein Automat greift erst ein, nachdem seine Empfehlungen eine Beobachtungsphase lang richtig waren.",
      "Rote Kerne OHNE Standwechsel lösen keine Empfehlung aus: Rückrollen würde denselben Stand noch einmal bauen."
    ],
    trainiert: "Nichts — er misst Ampeln gegen Deploy-Stände",
    verbessert: "Eine Deploy-Havarie hat nach 30 Minuten eine fertige Rückroll-Entscheidung statt einer Fehlersuche um Mitternacht",
    neuigkeiten: ["Neu am 2026-08-24 (Lücke aus dem 135-Piloten-Vergleich)"],
    ...LAEUFER
  },
  {
    id: "log-wache",
    name: "Log-Wache",
    nummer: "45",
    kurz: "Liest die Fehlersignale des eigenen Prozesses und macht ein stilles Sterben sichtbar — unbehandelte Ausnahmen, Speicher, Ports, Verbindungsabrisse.",
    funktionen: [
      "Prozess-Haken (uncaughtException, unhandledRejection, warning) füllen einen Ringpuffer; der Lauf wertet die Zeilen seit dem letzten Takt aus.",
      "Sechs Störmuster mit Klartext-Namen (Speicher erschöpft, Port belegt, Verbindung abgerissen, DNS tot, Datei-Handles, unbehandelte Ausnahme).",
      "Meldet Heap- und RSS-Verbrauch mit — das früheste Signal des Speicher-Todes.",
      "Sind die Haken NICHT registriert, ist die Ampel rot: eine blinde Wache darf nicht grün aussehen."
    ],
    trainiert: "Nichts — sie misst den eigenen Prozess",
    verbessert: "Der Control-Server stirbt nicht mehr still: das Muster steht in der Ampel, bevor der Dienst steht",
    neuigkeiten: ["Neu am 2026-08-24 (Befund: Control stirbt still, Instanz-Restart heilt)"],
    ...LAEUFER
  },
  {
    id: "daten-sicherung",
    name: "Daten-Sicherung",
    nummer: "46",
    kurz: "Sichert einmal täglich die Betriebs-Ablagen (Tickets, Aufgaben, Einwilligungen, Nutzer-Gedächtnis) und liest die Kopie SOFORT mit Prüfsumme zurück.",
    funktionen: [
      "Acht Ablagen mit Deckel je Quelle in EINEN täglichen Schnappschuss (sicherung/taeglich) — mit SHA-256-Prüfsumme über den Inhalt.",
      "Nach dem Schreiben wird ZURÜCKGELESEN und die Prüfsumme verglichen — geschrieben heißt noch nicht lesbar (Lehre des Nachweis-Wächters).",
      "Seit 2026-08-24 zusätzlich im ZWEITEN Eimer: IDrive-e2-Objektreplikation spiegelt die Schnappschüsse (sicherung/-Präfix) und den kompletten Chats-Eimer smejj-app serverseitig nach smejj-sicherung — der Dienst-Schlüssel kann den Sicherungs-Eimer bewusst nicht lesen (Isolation), Kontrolle über die IDrive-Konsole.",
      "Nutzer-Chats bewusst nicht dabei: sie brauchen den zweiten Eimer, keinen Schnappschuss daneben.",
      "AUFBEWAHRUNG 30 Tage (Betreiber-Freigabe 2026-08-24): Schnappschüsse älter als 30 Tage werden aufgeräumt — im Haupteimer durch diesen Lauf (fail-closed: nur exakte sicherung_JJJJ-MM-TT-Kennungen, höchstens 5 je Takt), im Zweit-Eimer durch die IDrive-Lebenszyklus-Regel (Präfix sicherung/)."
    ],
    trainiert: "Nichts — sie sichert und beweist",
    verbessert: "Die Betriebsdaten haben erstmals ein tägliches, rückgelesenes Backup statt gar keines",
    neuigkeiten: ["Neu am 2026-08-24 (Codeberg spiegelt nur den CODE)"],
    ...LAEUFER
  },
  {
    id: "wiederherstellungs-probe",
    name: "Wiederherstellungs-Probe",
    nummer: "47",
    kurz: "Liest im Takt die jüngste Sicherung vollständig zurück und misst die zwei Ernstfall-Zahlen: Alter (Datenverlust-Fenster) und Rücklese-Dauer.",
    funktionen: [
      "Prüfsummen-Vergleich über den kompletten Schnappschuss — eine manipulierte oder halb geschriebene Kopie fällt auf.",
      "Ist die jüngste intakte Sicherung älter als 2 Tage, wird die Ampel rot: so viel wäre im Ernstfall verloren.",
      "Ein Backup ohne geprüfte Rücksicherung ist eine Hoffnung — die Branchen-Regel, aus der es diesen Lauf gibt."
    ],
    trainiert: "Nichts — sie probt den Ernstfall",
    verbessert: "Ob sich die Sicherung wirklich zurückspielen lässt, ist eine gemessene Zahl statt einer Annahme",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "geheimnis-spaeher",
    name: "Geheimnis-Späher",
    nummer: "48",
    kurz: "Scannt im Takt den echten Quelltext des Containers auf Schlüssel, Tokens und private Schlüsselblöcke — JEDER Fund ist sofort rot.",
    funktionen: [
      "Sieben Mustergruppen (OpenAI-artig, AWS, GitHub, Slack, Google, Private-Key-Blöcke, harte Passwörter im Code) über dieselbe Dateiliste wie der Bug-Predictor.",
      "Zeilen mit Entwarnungs-Wörtern (beispiel, probe, example) zählen nicht — Doku und Tests dürfen Muster zeigen; die Grenze steht dokumentiert im Modul.",
      "Die Selbsttest-Proben sind ZUSAMMENGESETZT, damit der Release-Secret-Scanner diese Datei nicht selbst als Fund meldet (Falle vom 2026-08-14)."
    ],
    trainiert: "Nichts — er sucht, was niemand finden soll",
    verbessert: "Ein eingechecktes Geheimnis lebt höchstens 30 Minuten statt bis zum nächsten Sicherheitsvorfall",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "zertifikats-wache",
    name: "Zertifikats-Wache",
    nummer: "49",
    kurz: "Misst per echtem TLS-Handshake die Restlaufzeit der Zertifikate von smejj.com, api.smejj.com und den Zeabur-Diensten — rot unter 21 Tagen.",
    funktionen: [
      "Vier Domains je Lauf; gemessen wird das Zertifikat selbst (valid_to), nicht die HTTP-Antwort dahinter.",
      "Rot bei Restlaufzeit unter 21 Tagen (Let's Encrypt erneuert bei 30 — wer da noch nicht erneuert hat, hat ein Problem) und bei totem Handshake.",
      "GRENZE, ehrlich: das Ablaufdatum der Domain-REGISTRIERUNG ist ohne WHOIS nicht messbar — ein auslaufendes Zertifikat fällt trotzdem vorher auf."
    ],
    trainiert: "Nichts — sie liest Ablaufdaten",
    verbessert: "Ein ablaufendes Zertifikat ist Wochen vorher eine gelbe Zahl statt plötzlich eine rote Browser-Warnseite",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "fehler-faenger",
    name: "Fehler-Fänger",
    nummer: "50",
    kurz: "Sammelt die JavaScript-Fehler echter Nutzer-Browser (POST /api/fehler) und gruppiert sie zu Befunden — rot ab 3 Vorkommen desselben Fehlers.",
    funktionen: [
      "Annahme mit Sitzungspflicht, Bremse (10/min je Absender) und PII-Maskierung VOR dem Speichern — dieselbe Regel wie beim Daten-Schwungrad.",
      "Gruppierung mit zahlenfreier Signatur: 'Zeile 4711' und 'Zeile 4712' sind derselbe Fehler nach einem neuen Bündel.",
      "Unterscheidet ehrlich 'keine Fehler' von 'niemand kann melden': solange sich seit dem Serverstart kein Browser gemeldet hat, sagt die Meldung das ausdrücklich.",
      "WARUM: unsichtbarer Senden-Pfeil, nie geladenes Modul, tote Stopp-Taste — alles stand live bei grünen Server-Ampeln."
    ],
    trainiert: "Nichts — er hört den Browsern zu",
    verbessert: "Ein Frontend-Fehler hat nach Minuten eine Zahl statt nach Wochen einen Zufallsfund",
    neuigkeiten: ["Neu am 2026-08-24; Browser-Haken (public/fehler-faenger.js) seit 2026-08-24 auf der Startseite eingebunden"],
    ...LAEUFER
  },
  {
    id: "missbrauchs-wache",
    name: "Missbrauchs-Wache",
    nummer: "51",
    kurz: "Sieht jede API-Anfrage einmal und erkennt in 10-Minuten-Fenstern, was kein einzelner Rate-Limiter sieht: Dauerfeuer und Anmelde-Stürme.",
    funktionen: [
      "Ein billiger Zähl-Haken im Server-Einstieg: Absender-Schlüssel, Pfadklasse, Zähler — nie Pfade, Körper oder Sitzungen (datensparsam mit Absicht).",
      "Dauerfeuer: 900+ Anfragen je Absender in 10 Minuten. Anmelde-Sturm: 40+ Anmelde-Anfragen — Adress-Rütteln.",
      "Die Wache SPERRT nichts: ein Befund ist der Moment, in dem ein Mensch über eine Sperre entscheidet."
    ],
    trainiert: "Nichts — sie zählt Verkehrsmuster",
    verbessert: "Bots und Missbrauch stehen als Zahl in der Ampel, bevor sie in der Rechnung stehen",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "konto-wache",
    name: "Konto-Wache",
    nummer: "52",
    kurz: "Bewacht die Grundpfeiler von Anmeldung und Berechtigung: Sitzungsgeheimnis, Admin-Eigentümerliste — und meldet jede Änderung der Liste 24 h lang rot.",
    funktionen: [
      "Konfiguration: SMEJJ_SESSION_SECRET vorhanden und mindestens 32 Zeichen; SMEJJ_ADMIN_OWNER_EMAILS gesetzt.",
      "Berechtigungs-Drift: die Eigentümerliste wird gegen die gestempelte Referenz in der Ablage geprüft — NEU/WEG wird benannt, 24 h Alarm, dann gilt der neue Stand.",
      "WARUM: der offene Adminbereich (25.07.) und der Passwort-Reset über window.prompt (04.08.) waren genau diese Klasse Fehler."
    ],
    trainiert: "Nichts — sie prüft Grundpfeiler",
    verbessert: "Ein stiller Admin-Zuwachs oder ein schwaches Sitzungsgeheimnis ist binnen 30 Minuten eine rote Zahl",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "inhalts-schutz",
    name: "Inhalts-Schutz",
    nummer: "53",
    kurz: "Prüft echte Inhaltsströme (gemeldete Antworten, Wissens-Ernte) gegen vier feste Gefahrenklassen — deterministisch, mit Beleg, ohne Modell-Urteil.",
    funktionen: [
      "Vier Klassen: Anleitung Selbstverletzung, Gewalt-Aufruf, Missbrauch Minderjähriger, Anleitung Straftat — konservative Muster, deutsch und englisch.",
      "Geprüft werden die Daumen-runter-Antworten der letzten 7 Tage und das jüngste Ernte-Thema — genau die Ströme, durch die Fremdes hereinkommt.",
      "Ein Fund heißt: ein Mensch schaut hin. Gelöscht wird nichts automatisch.",
      "GRENZE, ehrlich: Wortlisten erkennen Offensichtliches — sie sind die unterste Schutzschicht, die Modell-Anbieter filtern zusätzlich."
    ],
    trainiert: "Nichts — er prüft gegen feste Klassen",
    verbessert: "Gefährliche Inhalte in den eigenen Strömen haben einen Wächter statt eines blinden Flecks",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "abhaengigkeits-wache",
    name: "Abhängigkeits-Wache",
    nummer: "54",
    kurz: "Fragt einmal täglich osv.dev, ob eine der wirklich installierten Abhängigkeiten (package-lock des Containers) eine bekannte Schwachstelle trägt.",
    funktionen: [
      "Liest die package-lock des laufenden Containers und fragt osv.dev in Blöcken — dedupliziert je Schwachstellen-Kennung (die Doppelzähl-Falle des lokalen CVE-Wächters).",
      "Zwischen zwei Tagesabfragen meldet die Ampel den gemessenen Stand aus der Ablage, nie einen Pauschaltext.",
      "Ergänzt den lokalen npm run check:cve: der läuft nur, wenn jemand ihn startet — dieser hier läuft im Takt des Dienstes."
    ],
    trainiert: "Nichts — sie fragt eine Schwachstellen-Datenbank",
    verbessert: "Eine bekannte Lücke in einer Abhängigkeit steht binnen eines Tages in der Ampel statt im nächsten Audit",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "test-waechter",
    name: "Test-Wächter",
    nummer: "61",
    kurz: "Führt täglich ALLE Unit-Tests des Control-Servers aus (control-server/src) und wird ROT, sobald einer scheitert — ein roter Test darf nie wieder tagelang unbemerkt bleiben.",
    funktionen: [
      "Läuft täglich um 5:45 Uhr Mac-Zeit auf dem Rechner des Betreibers (LaunchAgent com.smejj.test-waechter → ~/.local/share/smejj-tests/wache.sh; Arbeitskopie außerhalb von Google Drive, gleiche Bauart wie die Betriebswache — nur launchd statt crontab, weil das crontab-Schreiben eine Admin-Freigabe verlangt, die ein Hintergrundlauf nicht klicken kann).",
      "Sucht die Testdateien SELBST (rekursiv per fs statt Shell-Glob — die npm-sh findet mit ** nur Tiefe 2) und übergibt sie node --test als ausdrückliche Liste; unter 60 gefundenen Dateien wird er ROT, statt still weniger zu prüfen.",
      "Wächter-TÜV vor jeder Messung: eine kaputte und eine gesunde Probe — erkennt er Rot nicht, prüft er gar nicht erst.",
      "WARUM ES IHN GIBT: modelRouter.test.js stand vom 18. bis 24.08. rot, ohne dass ein Pflicht-Check ihn je ausführte — test:unit existierte, hing aber in keinem Prüfpfad.",
      "Derselbe Lauf ist als npm run check:unit-server Teil von check:all und damit von release:preflight — Release und Nachtlauf messen dieselbe Frage.",
      "Fail-closed: kein node, keine erreichbare Arbeitskopie, zu wenige Testdateien = Fehler. 'Konnte nicht prüfen' ist nicht 'grün'."
    ],
    trainiert: "Nichts — er misst. Exit-Code und Dateizahl von node --test über control-server/src.",
    verbessert: "Ein roter Unit-Test fällt binnen eines Tages auf statt erst beim nächsten Release",
    neuigkeiten: ["Neu am 2026-08-24, nachdem der Groq-Routertest sechs Tage unbemerkt rot stand"],
    ort: "Mac des Betreibers (LaunchAgent com.smejj.test-waechter → ~/.local/share/smejj-tests/wache.sh)",
    zeitplan: "täglich 5:45 Uhr Mac-Zeit",
    messung: "heartbeat",
    // Täglich plus großzügige Schonfrist wie bei der Betriebswache: der Mac
    // kann nachts aus sein; erst zwei Nächte ohne Meldung sind ein Ausfall.
    erwartetAlleMs: TAG_MS,
    schonfristMs: TAG_MS,
    startAnleitung: "Auf dem Mac: /bin/bash ~/.local/share/smejj-tests/wache.sh (der Zeitplan steht im LaunchAgent ~/Library/LaunchAgents/com.smejj.test-waechter.plist).",
    stopAnleitung: "Auf dem Mac: launchctl bootout gui/$(id -u)/com.smejj.test-waechter und die plist aus ~/Library/LaunchAgents entfernen."
  },
  {
    id: "web-vitals-wache",
    name: "Web-Vitals-Wache",
    nummer: "63",
    kurz: "Misst täglich die ausgelieferte Startseite in einem echten Chrome gegen die verbindlichen Performance-Budgets (LCP < 1,5 s, CLS < 0,1, Seitengewicht < 300 KB; TTFB wird gemeldet, ist aber Netzwert und reisst kein Budget) — der Performance-Lock bekommt damit seinen Wächter.",
    funktionen: [
      "Läuft täglich um 6:15 Uhr Mac-Zeit auf dem Rechner des Betreibers (LaunchAgent com.smejj.web-vitals → ~/.local/share/smejj-webvitals/wache.sh; Arbeitskopie außerhalb von Google Drive, exakt die Bauart des Test-Wächters Nr. 61).",
      "Misst mit scripts/testing/measure_web_vitals.mjs in einem ECHTEN Chrome über CDP — curl misst am Service Worker vorbei und lieferte am 27.07. schon einmal 1,38 s statt der echten 40 ms.",
      "Mehrere Läufe je Messung, gemeldet wird der Median — ein einzelner Netz-Schluckauf soll keine rote Ampel machen, ein echter Einbruch schon.",
      "Der Herzschlag trägt die gemessenen Zahlen (LCP, TTFB, CLS, Gewicht) in der Meldung; Ausbleiben ist der Alarm (Totmannschalter wie bei Nr. 61).",
      "WARUM ES SIE GIBT: Die Performance-Budgets standen seit Wochen im Master-Prompt, aber kein Automat prüfte sie — eine schleichend langsamer werdende Startseite wäre erst beim Nutzer aufgefallen.",
      "Fail-closed: kein Chrome, keine Arbeitskopie, Messung bricht ab = Fehler-Herzschlag. 'Konnte nicht messen' ist nicht 'grün'."
    ],
    trainiert: "Nichts — sie misst die ausgelieferte Seite",
    verbessert: "Ein gerissenes Performance-Budget steht binnen eines Tages in der Ampel statt erst im Nutzer-Gefühl",
    neuigkeiten: ["Neu am 2026-08-24 (Optimierungs-Runde: 'Alle 5 bauen')"],
    ort: "Mac des Betreibers (LaunchAgent com.smejj.web-vitals → ~/.local/share/smejj-webvitals/wache.sh)",
    zeitplan: "täglich 6:15 Uhr Mac-Zeit",
    messung: "heartbeat",
    // Täglich plus großzügige Schonfrist wie bei Nr. 42/61: der Mac kann
    // nachts aus sein; erst zwei Nächte ohne Meldung sind ein Ausfall.
    erwartetAlleMs: TAG_MS,
    schonfristMs: TAG_MS,
    startAnleitung: "Auf dem Mac: /bin/bash ~/.local/share/smejj-webvitals/wache.sh (der Zeitplan steht im LaunchAgent ~/Library/LaunchAgents/com.smejj.web-vitals.plist).",
    stopAnleitung: "Auf dem Mac: launchctl bootout gui/$(id -u)/com.smejj.web-vitals und die plist aus ~/Library/LaunchAgents entfernen."
  },
  {
    id: "speicher-wache",
    name: "Speicher-Füllstand-Wache",
    nummer: "64",
    kurz: "Misst täglich, wie voll das IDrive-e2-Paket ist (Stand beim Bau: 1,25 von 2 TB), warnt ab 80 % und wird ab 90 % rot — bevor ein Modell-Upload das Paket sprengt und stille Mehrkosten entstehen.",
    funktionen: [
      "Listet die erreichbaren Eimer (smejj-model-files, smejj-app) per S3-LIST und SUMMIERT die echten Objektgrößen — keine Schätzung, keine Konsolen-Zahl aus zweiter Hand.",
      "Der Sicherungs-Eimer smejj-sicherung ist für den Dienst-Schlüssel bewusst unlesbar (Isolation, Betreiber-Entscheidung 24.08.) — die Meldung BENENNT das, statt ihn stumm wegzulassen.",
      "Grenzen als Paket-Anteil: ab 80 % steht die Warnung in der Meldung, ab 90 % wird die Ampel rot — dann entscheidet der Betreiber (aufräumen oder Paket vergrößern), nie ein Automat.",
      "Zwischen zwei Tagesmessungen meldet die Ampel den gemessenen Stand aus der Ablage (Bauart der Abhängigkeits-Wache); die Paketgröße ist per SMEJJ_SPEICHER_PAKET_GB anpassbar, Standard 2 TB.",
      "WARUM ES SIE GIBT: Die Kosten-Wache (Nr. 45) sieht Modell-Ausgaben, aber niemand sah den Speicher — 63 % Füllstand wuchsen unbeobachtet."
    ],
    trainiert: "Nichts — sie misst die Eimer",
    verbessert: "Ein volllaufendes Speicherpaket wird Tage vorher sichtbar statt als überraschende Rechnung",
    neuigkeiten: ["Neu am 2026-08-24 (Optimierungs-Runde: 'Alle 5 bauen')"],
    ...LAEUFER
  }
]);
