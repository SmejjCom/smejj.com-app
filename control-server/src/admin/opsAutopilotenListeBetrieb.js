// smejj.com — Modul AP, Registry-Teil 5: die Betriebs-Autopiloten vom Ende
// der Basisliste (Probe-Nutzer, Werkstatt, Angelina, Antwort-TÜV,
// Betriebswache). Wortgleich aus opsAutopilotenListe.js ausgelagert am
// 2026-08-24 — die Hauptliste stand mit 849 Zeilen über der 800-Zeilen-Regel.
// Wer einen Autopiloten sucht, findet ihn über AUTOPILOTEN in
// opsAutopilotenListe.js; die Reihenfolge dort bleibt unverändert.

const TAG_MS = 24 * 60 * 60 * 1000;
const STUNDE_MS = 60 * 60 * 1000;

export const BETRIEB_AUTOPILOTEN = Object.freeze([
  {
    id: "synthetic-user-watchdog",
    name: "Probe-Nutzer",
    nummer: "29",
    kurz: "Simuliert rund um die Uhr echte Nutzer-Abläufe (Login, Chat, Inferenz, S3-Speicher) und schlägt bei Fehlern sofort Alarm.",
    funktionen: [
      "Führt alle 30 Minuten einen ECHTEN End-to-End-Durchlauf aus: Anmeldung, Chat über die Brücke, Speicher.",
      "Anmeldung: stellt ein Token aus und prüft beide Richtungen — gültig wird angenommen, verfälscht wird abgelehnt.",
      "Chat: echter Aufruf über dieselbe Adresse wie die App, misst die Antwortzeit; ein leerer 200er gilt als Ausfall.",
      "Speicher: schreibt einen Datensatz und liest ihn zurück — erst der Vergleich ist der Nachweis."
    ],
    trainiert: "Synthetic User Journeys (Auth -> Chat -> TTFT -> IDrive e2 S3 Storage)",
    verbessert: "24/7 End-to-End Qualitätsgarantie & automatische Ausfallerkennung in unter 60 Sekunden",
    neuigkeiten: ["Synthetic User Watchdog aktiv (alle 5 Min)", "100% E2E Flow grün verifiziert"],
    ort: "Control Server (E2E Watchdog)",
    zeitplan: "alle 30 Minuten (Autopilot-Läufer im Control-Server)",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich als permanenter E2E-Endnutzer-Wächter.",
    stopAnleitung: "Über Watchdog-Policy konfigurierbar."
  },
  {
    id: "werkstatt-autopilot",
    name: "Werkstatt",
    nummer: "30",
    kurz: "Entwicklungs-Kreislauf in 4 Stationen: Sammeln (Radar/Bugs/Feedback), Bauen (Claude Cloud auf feature/-Branch), Prüfen (Lock-Hashes & Fail-Closed), 1-Klick PR-Freigabe.",
    funktionen: [
      "Station 1: Sammelt echte Quellen (Radar, Watchdog-Fehler, Nutzermeldungen) in priorisierte Backlog-Datei.",
      "Station 2: Headless Claude-Code Routine programmiert 1 Aufgabe pro Nacht auf neuem feature/-Branch.",
      "Station 3: Führt volle Prüfsuite & Lock-Manifest-Verifikation aus (Start-Lock & Security-Lock cryptographisch geschützt).",
      "Station 4: Sendet 1-Klick PR-Freigabekarte per GitHub PR / Claude App (keine scharfen Deploy-Keys auf dem Webserver)."
    ],
    trainiert: "Self-Evolution Backlog, Lock-Safe Patch Generator & Automated Preflight Pipelines",
    verbessert: "Sichere Selbst-Programmierung von smejj.com ohne Risiko für Live-Betrieb oder Locks",
    neuigkeiten: ["Werkstatt-Autopilot v2 spezifiziert", "4-Stationen Loop bereit"],
    ort: "Control Server (Station 1) + Mac/Cloud (Station 3)",
    zeitplan: "alle 30 Minuten (Sammeln); Bauen/Freigabe auf Abruf",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft als geplante Claude-Code-Cloud-Routine auf dediziertem feature/-Branch.",
    stopAnleitung: "Über GitHub Actions / Claude Cloud-Workflow steuerbar."
  },
  {
    id: "angelina-autopilot",
    name: "Sprach-Wächter",
    nummer: "31",
    kurz: "Findet deutsche Texte auf den ausgelieferten Seiten, die der Nutzer zu sehen bekommt und die falsch geschrieben sind.",
    funktionen: [
      "Läuft alle 30 Minuten im Autopilot-Läufer und liest die ausgelieferten HTML-Seiten.",
      "Sucht Ersatzschreibung statt Umlaut in SICHTBAREM Text (zwischen den Tags) — Attribute, Skripte und Pfade bleiben außen vor.",
      "Nennt Fundzahl und ein Beispiel in der Meldung; findet er keine Seiten, wird er rot.",
      "EHRLICH: Bis 2026-08-13 gab es zu diesem Autopiloten überhaupt keinen Code — die Registry beschrieb eine Engine, die nie existierte."
    ],
    trainiert: "Sichtbare deutsche Oberflächentexte der ausgelieferten Seiten",
    verbessert: "Schreibfehler in der Oberfläche fallen auf, bevor Nutzer sie sehen (erster Lauf: 19 Funde, u.a. 'Willkommen zurueck' auf der Startseite)",
    neuigkeiten: ["Seit 2026-08-13 echter Sprach-Wächter statt Registry-Eintrag ohne Modul"],
    ort: "Control Server (Autopilot-Läufer)",
    zeitplan: "alle 30 Minuten",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
    stopAnleitung: "Über den Autopilot-Läufer im Control-Server steuerbar."
  },
  {
    id: "antwort-tuev",
    name: "Antwort-TÜV",
    nummer: "36",
    kurz: "Prüft per Daumen-runter gemeldete Chat-Antworten gegen die live gemessenen Fehlerklassen — deterministische Regeln mit Beleg, kein Modell-Urteil.",
    funktionen: [
      "Selbsttest zuerst: die wörtlich am 2026-08-13 gemessenen Fehlantworten (Abbruch mitten im Wort, Nur-Ankündigung, Fähigkeits-Verneinung) müssen erkannt, eine gesunde Antwort freigesprochen werden — sonst rot.",
      "Prüft danach bis zu 20 gemeldete Antworten der letzten 7 Tage aus dem Feedback-Schwungrad (bereits PII-bereinigt; es werden nie stillschweigend fremde Verläufe gelesen).",
      "Sieben Fehlerklassen: abbruch, nur-ankuendigung, faehigkeits-verneinung, denk-tags, latex-roh, kaputte-tabelle, link-versprochen-keiner-da — jeder Fund trägt seinen Beleg.",
      "Fundzahl und ein Beispiel stehen in der Meldung; die Befunde sind Rohstoff für das Werkstatt-Backlog (Stufe 2 des Antwort-TÜV-Plans vom 2026-08-14)."
    ],
    trainiert: "Nichts — er misst. Gemeldete Antworten (Daumen runter) gegen nachprüfbare Regeln.",
    verbessert: "Antwortfehler, die bisher nur der Betreiber per Screenshot fand, fallen maschinell auf — im Takt, nicht per Zufall",
    neuigkeiten: ["Neu am 2026-08-14 als Stufe 2 des Antwort-TÜV-Plans (Betreiber-Auftrag: Verläufe füttern die Werkstatt)"],
    ort: "Control Server (Autopilot-Läufer)",
    zeitplan: "alle 30 Minuten",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
    stopAnleitung: "Über den Autopilot-Läufer im Control-Server steuerbar."
  },
  {
    id: "oberflaechenwache",
    name: "Betriebswache",
    nummer: "42", // nicht 40: die trug schon das Aufgaben-Gedächtnis (41 = Nachweis-Wächter)
    kurz: "Responsive, Touch und Betriebswerte: misst jede Nacht die AUSGELIEFERTE Oberfläche auf acht Bildschirmgrößen — läuft überall Inhalt über den Rand, und ist jeder Knopf mit dem Finger zu treffen?",
    funktionen: [
      "Läuft täglich um 5:30 Uhr Mac-Zeit auf dem Rechner des Betreibers (crontab, Skript außerhalb von Google Drive — macOS lässt Hintergrunddienste dort nicht lesen).",
      "Prüfung 1 — Responsive: 19 Ansichten × 8 Gerätegrößen (320/375/430 mit Finger, 768/1024 Tablet, 1280/1440/1920 mit Maus) = 152 Messpunkte. Gemessen wird mit echten Inhalten (lange Adresse ohne Leerzeichen, Code-Block, Tabelle) — eine leere Ansicht läuft nie über.",
      "Prüfung 2 — Touch: jedes bedienbare Element bei 375 px gegen das 44-px-Ziel, mit echten Tippunkten statt Elementmaßen. Damit unterscheidet sie 'zu klein' von 'verdeckt' und von 'sieht klein aus, ist aber groß zu treffen'.",
      "Gemessen wird gegen https://smejj.com, nicht gegen einen lokalen Server: was zählt, ist was der Nutzer wirklich bekommt — samt Bündel, /assets/-Kopie und Service-Worker-Vorrat.",
      "WARUM ES SIE GIBT: Das V11-Design hatte 32 Touch-Ziele wieder unter 44 px gedrückt und vier Ansichten liefen auf Tablet und kleinem Handy über den Rand. Beides stand monatelang live, ohne dass irgendetwas anschlug.",
      "Prüfung 3 — Betriebswerte: fehlt im Zeabur-Env des Control-Servers ein Wert, ohne den nachweislich etwas stillsteht? Genau diese Lücke kostete vom 15. bis 22.08. die ganze Ampel: SMEJJ_AUTOPILOT_KEYS war weg, kein Autopilot konnte melden, und der Prüfer dafür existierte — er wurde nur nirgends aufgerufen.",
      "Fail-closed: kein Chrome, kein node, kein Netz = Fehler. 'Konnte nicht messen' ist nicht 'in Ordnung'.",
      "Protokoll: ~/Library/Logs/smejj-oberflaechenwache.log, Urteil in ~/.local/share/smejj-oberflaeche/letzter-lauf.json."
    ],
    trainiert: "Nichts — sie misst. Layoutmaße und Trefferflächen der ausgelieferten Seite.",
    verbessert: "Ein Rückschritt an der Oberfläche fällt binnen eines Tages auf, statt monatelang live zu stehen",
    neuigkeiten: ["Neu am 2026-08-22, nachdem 32 abgesenkte Touch-Ziele und vier überlaufende Ansichten von Hand gefunden werden mussten"],
    ort: "Mac des Betreibers (crontab → ~/.local/share/smejj-oberflaeche/wache.sh)",
    zeitplan: "täglich 5:30 Uhr Mac-Zeit",
    messung: "heartbeat",
    // Täglich plus großzügige Schonfrist: der Mac kann nachts aus sein, und ein
    // verschlafener Lauf ist kein Ausfall. Erst wenn zwei Nächte ohne Meldung
    // vergehen, stimmt etwas nicht.
    erwartetAlleMs: TAG_MS,
    schonfristMs: TAG_MS,
    startAnleitung: "Auf dem Mac: /bin/bash ~/.local/share/smejj-oberflaeche/wache.sh (der Zeitplan steht in der crontab).",
    stopAnleitung: "Auf dem Mac den crontab-Eintrag smejj-oberflaechenwache entfernen."
  }
]);
