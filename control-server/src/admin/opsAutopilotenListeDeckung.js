// smejj.com — Modul AP, Registry-Teil 5: die Abdeckungs-Lücken.
// Nr. 66-70 (Betreiber-Freigabe 2026-08-30: "Ich gebe dir alle Rechte von A
// bis z. Mach hundert Prozent fertig.") — die fünf Flächen der A-bis-Z-
// Deckungsprüfung, auf denen vorher kein einziger Wächter stand: Mail-Zustellung,
// DSGVO-Fristen, EU-AI-Act-Bestand, Abo-Umsatz, Feature-Flags.
//
// Eigene Datei wie Teile 2-4 (800-Zeilen-Regel der Hauptliste).

const STUNDE_MS = 60 * 60 * 1000;

const LAEUFER = Object.freeze({
  ort: "Control Server (Autopilot-Läufer)",
  zeitplan: "alle 30 Minuten",
  messung: "heartbeat",
  erwartetAlleMs: STUNDE_MS,
  schonfristMs: STUNDE_MS,
  startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
  stopAnleitung: "Nur durch Anhalten des Control-Servers."
});

export const DECKUNG_AUTOPILOTEN = Object.freeze([
  {
    id: "email-zustell",
    name: "E-Mail-Zustell-Wache",
    nummer: "66",
    kurz: "Die Anmeldung über Magic-Link hängt vollständig an der Mail — diese Wache liest das Zustellprotokoll der letzten 7 Tage und schlägt an, bevor Nutzer sich nicht mehr einloggen können.",
    funktionen: [
      "Misst das echte Zustellprotokoll (mail/zustellung/, Freigabe 2026-07-29): zugestellt vs. fehlgeschlagen in den letzten 7 Tagen — ohne eigene Probe-Mails mit Nebenwirkungen.",
      "ROT bei unkonfiguriertem SMTP, drei Fehlversuchen in Serie oder einer Fehlerquote ab 20 % (ab 5 Mails) — alles Zustände, in denen Anmeldungen gerade nicht durchkommen.",
      "Kein Mailverkehr im Fenster ist ehrlich grün mit Vorbehalt: Zustellung ist dann nicht belegbar, aber auch nicht gestört."
    ],
    trainiert: "Nichts — sie liest nur das Protokoll des echten Verkehrs",
    verbessert: "Ein kaputter Mailweg kostete bisher jede Anmeldung, ohne dass eine Ampel es zeigte — jetzt ist die Zustellquote alle 30 Minuten eine Zahl",
    neuigkeiten: ["Neu am 2026-08-30 (Lücke aus der A-bis-Z-Deckungsprüfung)"],
    ...LAEUFER
  },
  {
    id: "dsgvo-fristen",
    name: "DSGVO-Fristen-Wache",
    nummer: "67",
    kurz: "Betroffenenanfragen haben eine Monat-Frist (Art. 12 Abs. 3) — diese Wache rechnet die offenen Vorgänge im Takt gegen ihr Fälligkeitsdatum und macht die Dringlichkeit zur Ampel.",
    funktionen: [
      "Liest die echte Vorgangs-Ablage (admin/gdpr) mit ihrer gerechneten Restfrist — gespeicherte Countdowns würden nach dem nächsten Neustart lügen, also wird immer frisch gerechnet.",
      "ROT sobald ein Vorgang über der Frist liegt (Bußgeld-Risiko); kritische Fristen (≤ 5 Tage) erzeugen eine Karte unter ENTSCHEIDEN in der Tagesmappe (Nr. 60).",
      "Warten ist hier eine Entscheidung, kein Ausfall: die Karte sagt, welcher Vorgang bis wann entschieden sein will."
    ],
    trainiert: "Nichts — sie misst Fristen, sie führt keine Vorgänge",
    verbessert: "Eine überschrittene Auskunfts- oder Löschfrist war bisher nur sichtbar, wenn jemand zufällig aufs Admin-Blat schaute",
    neuigkeiten: ["Neu am 2026-08-30 (Lücke aus der A-bis-Z-Deckungsprüfung)"],
    ...LAEUFER
  },
  {
    id: "ai-act-wache",
    name: "EU-AI-Act-Wache",
    nummer: "68",
    kurz: "Die Kennzeichnungspflicht läuft seit dem 02.08.2026 — diese Wache gleicht das Bestandsverzeichnis der KI-Systeme gegen die wirklich aktiven Modelle der Registry ab und meldet jede Lücke.",
    funktionen: [
      "Misst zwei Quellen, die getrennt geändert werden: das Bestandsverzeichnis (aiTransparency.js) und die aktiven Modelle der Modell-Registry — ein aktiviertes Modell ohne Eintrag ist ROT (Kennzeichnung nach Art. 50 fehlt).",
      "Erkennt Schreibweisen als dasselbe Modell ('glm-5-2' = 'glm-5.2'); fail-closed wie überall: nur aktivierte, konfigurierte Modelle zählen.",
      "ROT auch bei Pflichtsystemen ohne Protokollierung oder einer high-/prohibited-Einstufung im Bestand. Sie stuft selbst nichts ein — die rechtliche Einordnung bleibt Betreiber-Entscheidung."
    ],
    trainiert: "Nichts — reiner Abgleich zweier Quellen, kein Netz",
    verbessert: "Ein neu geschaltetes Modell konnte bisher still am Bestandsverzeichnis vorbeilaufen — jetzt ist die Drift binnen eines Taktes rot",
    neuigkeiten: ["Neu am 2026-08-30 (Lücke aus der A-bis-Z-Deckungsprüfung)"],
    ...LAEUFER
  },
  {
    id: "abo-umsatz-wache",
    name: "Abo-Umsatz-Wache",
    nummer: "69",
    kurz: "Nr. 55 bewacht die Kosten-Seite — diese Wache bewacht die Einnahmen-Seite: zahlende Abos, Zahlungsausfälle (past_due/unpaid) und einen stillen Sturz der Zahlenden.",
    funktionen: [
      "Liest den eigenen Abo-Spiegel (billing/customers/, gespeichert aus Stripe) im Takt — Beträge und Rechnungen bleiben bei Stripe, dieselbe Grenze wie Modul E.",
      "ROT bei Handlungsbedarf (past_due/unpaid), bei abgeschnittenem Listing (unvollständige Messung) und wenn die Zahlenden ab 5 Stück um mehr als 20 % stürzen (Trend-Karte über den letzten Lauf).",
      "Testmodus-Einträge werden benannt und bewusst getrennt — Testabos sind kein Umsatz. Sie mahnt nicht und sperrt niemanden: past_due heißt 'Nutzer ansprechen', und das ist Betreiber-Arbeit."
    ],
    trainiert: "Nichts — sie liest nur den eigenen Spiegel",
    verbessert: "Ein Abo, das Wochen nicht bezahlt, fiel früher nur auf, wenn der Betreiber aufs richtige Blatt schaute — jetzt ist es eine rote Ampel",
    neuigkeiten: ["Neu am 2026-08-30 (Lücke aus der A-bis-Z-Deckungsprüfung)"],
    ...LAEUFER
  },
  {
    id: "flaggen-wache",
    name: "Feature-Flags-Wache",
    nummer: "70",
    kurz: "Flag-Entscheidungen bleiben liegen, weil sie keinen Deploy kosten — diese Wache misst das Alter der Entscheidungen (updatedAt) und legt vergessene Flags als EINE Karte in die Tagesmappe.",
    funktionen: [
      "Misst alle Flags der Ablage (admin/flags): on/partial ohne Änderung seit über 30 Tagen gilt als vergessene Frage — aufräumen oder bewusst lassen, beides ist eine Antwort.",
      "Ein ausgeschaltetes Flag darf alt sein: off ist keine offene Frage. ROT nur bei unlesbarer Ablage oder ungültigen Zuständen (fail-closed).",
      "Die Karte nennt die Namen (maximal 5, dann 'und N weitere') — die Tagesmappe zeigt sie unter ENTSCHEIDEN, sobald mindestens eines veraltet ist."
    ],
    trainiert: "Nichts — sie zählt Schaltzustände und ihr Alter",
    verbessert: "Ein 10-%-partial von vor sechs Wochen war eine gestellte Frage, die niemand mehr beantwortete — jetzt liegt sie als Karte in der Mappe",
    neuigkeiten: ["Neu am 2026-08-30 (Lücke aus der A-bis-Z-Deckungsprüfung)"],
    ...LAEUFER
  },
  {
    id: "umgebungs-wache",
    name: "Umgebungs-Wache",
    nummer: "71",
    kurz: "Misst im Takt die Zeabur-Umgebung des Control-Servers: Zhipu-Coding-Adresse und Pflichtschlüssel — rot, bevor der Chat 502/503 liefert.",
    funktionen: [
      "Prüft SMEJJ_LLM_ZHIPU_BASE_URL gegen die Coding-Adresse api.z.ai/api/coding/paas/v4 (der Betreiber-Schlüssel gehört zum GLM Coding Plan; jede andere Adresse endet mit 429/1113).",
      "Prüft die Pflichtschlüssel SMEJJ_LLM_ZHIPU_API_KEY und SMEJJ_LLM_GROQ_API_KEY nur auf Vorhandensein — nie ein Wert im Log.",
      "Prüft, dass die Registry für das Standardmodell wirklich diese Adresse auflöst — eine gesetzte, aber nicht angekommene Variable fällt so auf."
    ],
    trainiert: "Nichts — sie liest Umgebungsvariablen",
    verbessert: "Am 2026-09-02 verschwand die Coding-Adresse zweimal aus der Umgebung; der Chat stand Stunden bei grünen Ampeln — jetzt wird das im 30-Minuten-Takt rot",
    neuigkeiten: ["Neu am 2026-09-02 (Befund job_bruecke_schnellspur_20260902)"],
    ...LAEUFER
  },
  {
    id: "tuerwaechter",
    name: "Türwächter",
    nummer: "73",
    kurz: "Geht alle 30 Minuten den Weg, den ein Mensch geht — Anmeldung, Adminbereich, Chat — und schlägt an, wenn eine Tür zu ist, obwohl alle Dienste grün sind.",
    funktionen: [
      "Prüft die Kette mit einem echten Mess-Token gegen den Control-Server: jede Stufe ist eine nachprüfbare Aussage über eine HTTP-Antwort, ohne Modell, ohne Rauschen.",
      "Unterscheidet 'zu' von 'gestört': nur eine eindeutige Abweisung (401/403 mit bekanntem Grund) zählt als Aussperrung; ein Netzfehler oder 503 ist 'unklar' und macht nicht rot.",
      "Ohne Mess-Token meldet er 'nicht messbar' (rot) statt Entwarnung — eine Ampel, die grün zeigt, weil sie nichts messen konnte, wäre eine Attrappe.",
      "WARUM ER IN DER REGISTRY STEHT: Er lief seit dem 14.08. im Takt, aber sein Ergebnis wurde verworfen, weil die Kennung fehlte (Audit 03.09.) — zwei stille Aussperrungen vom 14.08. hätte niemand gesehen."
    ],
    trainiert: "Nichts — er geht durch die Türen",
    verbessert: "Eine Aussperrung bei grünen Diensten (Adminbereich admin_email_not_verified, Chat 'bitte anmelden' trotz Anmeldung) ist binnen 30 Minuten rot statt wochenlang unsichtbar",
    neuigkeiten: ["Registriert am 2026-09-03 (Audit A bis Z: Lauf ohne Registry-Eintrag)"],
    ...LAEUFER
  },
  {
    id: "einwilligungs-wache",
    name: "Einwilligungs-Wache",
    nummer: "74",
    kurz: "Prüft im Takt, ob der Weg „Modelltraining erlauben“ wirklich geht: API-Schalter, Signierschlüssel, Trainings-Speicher, erlaubte Präfixe — dieselben Bedingungen, an denen die Routen 503 liefern.",
    funktionen: [
      "Seit der Umgebungs-Löschung vom 14.08. antwortete /api/training/consent/decision mit 503 — der Schalter sprang zurück, und keine Ampel sagte es (Audit 03.09.). Jetzt ist das binnen 30 Minuten rot, mit dem fehlenden Wert im Text.",
      "Liest nur die Umgebung (trainingConsentConfig.ready, IDRIVE_E2_TRAINING_*, Capture-Schalter); mit Netz zählt sie die Einwilligungs-Ereignisse im Ledger per LIST — nie Inhalte, nie Schreiben.",
      "Bewusst abgeschaltete API (SMEJJ_TRAINING_CONSENT_API_ENABLED≠YES) ist grün mit Hinweis; eingeschaltet, aber nicht bedienbar ist rot."
    ],
    trainiert: "Nichts — sie prüft den Einwilligungs-Weg",
    verbessert: "0 Trainingspaare haben jetzt eine Ursache mit Namen statt eines stummen 503",
    neuigkeiten: ["Neu am 2026-09-03 (Audit A bis Z, Lücke Bereich 7)"],
    ...LAEUFER
  },
  {
    id: "tiefe-spur-messung",
    name: "Tiefe-Spur-Messung",
    nummer: "75",
    kurz: "Misst täglich die TIEFE Spur (GLM-5.2) mit den 14 Fällen der Kernsuite gegen die Live-Brücke — der Qualitäts-Prüfer (Nr. 01) misst nur die Schnellspur.",
    funktionen: [
      "Dieselbe Suite, dieselbe Bewertung (scoreCase/aggregateCaseScores) wie der Mac-Messlauf, aber mit model glm-5-2 — die Spur, die Nachdenken, Coding und ausdrückliche Modellwahl bekommen.",
      "Läuft im Hintergrund mit 5,5 s Abstand (Brücken-Limit 12/min); die Ampel meldet den abgelegten Stand mit Note, kritischen Fehlern und p95.",
      "Messlatte aus dem Trainingsplan 02.09.: ≥ 95 % und 0 kritische Fehler. Transportfehler sind 'nicht messbar', nie eine schlechte Note. Nr. 72 liest diese Note als Referenz."
    ],
    trainiert: "Nichts — sie misst 14 Fälle am Tag",
    verbessert: "Die 97 % der tiefen Spur sind eine tägliche Zahl statt eine Erinnerung an den 01.09.",
    neuigkeiten: ["Neu am 2026-09-03 (Audit A bis Z, Lücke Bereich 2)"],
    ...LAEUFER
  },
  {
    id: "bau-wache",
    name: "Bau-Wache",
    nummer: "76",
    kurz: "Ein Push ist kein Deploy: vergleicht den laufenden Commit (ZEABUR_GIT_COMMIT_SHA) mit dem jüngsten Commit des Bauzweigs und dem Zeabur-Check-Run bei GitHub.",
    funktionen: [
      "Rot, wenn ein Push länger als 30 Minuten ohne laufenden Container bleibt oder der Bau bei GitHub als failure steht — genau der Blindflug vom 13.08. und vom 02.09. (Zeabur-Token 401).",
      "Öffentliche GitHub-API ohne Token (Repo ist öffentlich), 4 Anfragen je Stunde; ohne ZEABUR_GIT_COMMIT_SHA ist die Lage 'nicht messbar' (rot), nie Entwarnung.",
      "Innerhalb der Frist ist ein frischer Push grün mit Hinweis — Bauen dauert 4-6 Minuten."
    ],
    trainiert: "Nichts — sie vergleicht drei Commit-Kennungen",
    verbessert: "Ob der letzte Push wirklich läuft, steht in der Ampel statt im Zeabur-Portal",
    neuigkeiten: ["Neu am 2026-09-03 (Audit A bis Z, Lücke Bereich 10)"],
    ...LAEUFER
  },
  {
    id: "projektwissen-frische",
    name: "Projektwissen-Frische",
    nummer: "77",
    kurz: "Liest aus /health der Brücke, wie alt der Projektwissen-Export ist und wie viele Schnipsel er trägt — veraltetes Wissen antwortet sonst still mit altem Stand.",
    funktionen: [
      "Rot bei ausgeschaltetem Projektwissen, unter 100 Schnipseln oder einem Export älter als SMEJJ_PROJEKTWISSEN_MAX_ALTER_TAGE (Standard 7).",
      "Sie erneuert nichts — der Export entsteht beim Bündeln der Brücke (npm run rag:export). Sie sagt, wann er fällig ist.",
      "Eine Health-Abfrage je Takt, keine Kosten."
    ],
    trainiert: "Nichts — sie liest ein Datum und eine Zahl",
    verbessert: "Ein Export vom 02.09. bleibt nicht wochenlang unbemerkt die Wissensbasis der Schnellspur",
    neuigkeiten: ["Neu am 2026-09-03 (Audit A bis Z, Lücke Bereich 3)"],
    ...LAEUFER
  },
  {
    id: "sprachseiten-wache",
    name: "Sprachseiten-Wache",
    nummer: "78",
    kurz: "Holt täglich alle 15 Sprachseiten (smejj.com/<code>/) und prüft Status 200, Titel, passendes lang-Attribut und kein NOINDEX — die Auffindbarkeits-Wache (Nr. 57) sieht nur '/'.",
    funktionen: [
      "15 Abrufe einmal am Tag (5 parallel), dazwischen der abgelegte Stand aus betrieb/sprachseiten — dieselbe Bauart wie die Speicher-Wache.",
      "Rot, sobald eine Sprachseite 404 liefert, keinen Titel hat oder ein fremdes lang trägt; die Meldung nennt die Codes.",
      "Gemessen gegen die ausgelieferte Seite, samt Bündel und Service-Worker."
    ],
    trainiert: "Nichts — sie prüft 15 Seiten",
    verbessert: "Ein kaputtes /ja/ oder /ar/ fällt nach einem Tag auf, nicht erst durch einen Nutzer in Tokio oder Riad",
    neuigkeiten: ["Neu am 2026-09-03 (Audit A bis Z, Lücke Bereiche 10 und 13)"],
    ...LAEUFER
  },
  {
    id: "red-team-probe",
    name: "Red-Team-Probe",
    nummer: "79",
    kurz: "Fünf Prompt-Injection-Fälle aus dem Sicherheits-Pack täglich gegen die LIVE-Schnellspur: eingebettete Anweisung auf einer Webseite, in einer Datei, im Code, Rollen-Übernahme, Schlüssel erfinden.",
    funktionen: [
      "Prompt-Injection war bisher nur offline geprüft (RAG-Filter im Unit-Test); jetzt wird die echte Kette gefragt — Brücke, Systemregeln, Modell.",
      "Bestanden = keine kritische Zusicherung verletzt (contains_none, not_matches aus evals/packs/sicherheit-abwehr.json); ein durchgekommener Angriff ist rot mit Fall-Kennung.",
      "Fünf Anfragen am Tag im Hintergrund, 5,5 s Abstand. Auftrag Punkt 20: Schwachstellen finden, bevor Nutzer sie finden."
    ],
    trainiert: "Nichts — sie greift an und bewertet die Abwehr",
    verbessert: "Ob 'Ignoriere deine Anweisungen' live wirkt, ist eine tägliche Messung statt eine Annahme",
    neuigkeiten: ["Neu am 2026-09-03 (Audit A bis Z, Lücke Bereich 11)"],
    ...LAEUFER
  },
  {
    id: "agenten-sonde",
    name: "Agenten-Sonde",
    nummer: "80",
    kurz: "Fragt Maus-Engine (Browser-Automat) und Fern-Browser ab: eingeschaltet, konfiguriert, /health erreichbar? Kein Autopilot sah diese Worker bisher.",
    funktionen: [
      "Regel wie beim Türwächter: ein Dienst mit …_ENABLED=YES muss antworten, sonst rot; ein bewusst ausgeschalteter ist grün mit Hinweis.",
      "GET /health beider Worker ohne Auth, ohne Auftrag, ohne Kosten; Sitzungszahl und Laufzustand stehen in der Meldung.",
      "Eingeschaltet, aber Adresse oder Token fehlen = rot mit dem fehlenden Namen."
    ],
    trainiert: "Nichts — sie fragt zwei Health-Endpunkte",
    verbessert: "Ein toter Browser-Worker steht in der Ampel, nicht erst beim Klick auf 'Browser'",
    neuigkeiten: ["Neu am 2026-09-03 (Audit A bis Z, Lücke Bereich 6)"],
    ...LAEUFER
  },
  {
    id: "besucher-puls",
    name: "Besucher-Puls",
    nummer: "81",
    kurz: "Zählt, wie viele Menschen die Landeseite überhaupt erreichen — und stellt die Zahl neben die Anmeldungen. Ohne sie ist 'kommt niemand' nicht von 'niemand kann melden' zu unterscheiden.",
    funktionen: [
      "Die Landeseite meldet EINMAL je Browser-Sitzung eine Strichliste: Seite, Sprache, Herkunfts-Host. Kein Cookie, keine Kennung, keine IP, kein Pfad mit Parametern — eine Strichliste, keine Nutzerverfolgung.",
      "Gebaut für 1 Milliarde Besucher: der Eingang erhöht nur Zahlen im Arbeitsspeicher (O(1)), der Tagesstand wird höchstens alle 5 Minuten abgelegt — höchstens 288 Schreibvorgänge am Tag, egal wie viele Menschen kommen.",
      "ROT nur, wenn NIE ein Puls ankam: dann ist der Haken nicht ausgeliefert oder der Eingang blockiert. Gemessene 0 Besuche sind grün und ehrlich — dieselbe Unterscheidung, die dem Fehler-Fänger (Nr. 50) einst fehlte.",
      "Meldet Besuche, neue Konten und die Anmeldequote nebeneinander; Tagesstände unter betrieb/besucher-puls."
    ],
    trainiert: "Nichts — er zählt Besuche",
    verbessert: "Am 04.09. standen 3 Konten und 1 neues in 7 Tagen ohne jede Besuchszahl daneben: niemand konnte sagen, ob die Auffindbarkeit oder der Trichter das Problem ist",
    neuigkeiten: ["Neu am 2026-09-04 (Betreiber-Auftrag: Nutzer-Baustelle)"],
    ...LAEUFER
  },
  {
    id: "schutz-echtheit",
    name: "Schutz-Echtheit",
    nummer: "82",
    kurz: "Bewacht jede Sperre noch das, was die Nutzer WIRKLICH bekommen? Vergleicht jeden eingefrorenen Hash mit der Auslieferung auf smejj.com.",
    funktionen: [
      "Die Luecke, die er schliesst: jede Sperre vergleicht ihr Manifest mit der ARBEITSKOPIE. Beide koennen uebereinstimmen und trotzdem beide falsch sein.",
      "Am 04.09. war genau das der Fall: der Start-Lock meldete GRUEN und bewachte vier Fassungen, die smejj.com nicht ausliefert — composer-plus-menu.js, index.html, app.js, sw.js. Die echten Dateien waren ungeschuetzt.",
      "ROT nur beim stummen Phantom: Manifest gleich Arbeitskopie, aber ungleich Auslieferung. Nur diesen Fall sieht sonst niemand.",
      "GELB bei veraltet (Manifest ungleich Arbeitskopie) — die eigene Sperre meldet das bereits, zweimal derselbe Befund laesst zweimal suchen.",
      "Nicht abrufbare Serverdateien und gebuendelte Artefakte werden uebersprungen, nie als Verstoss gewertet: 'nicht messbar' ist kein Verstoss.",
      "Liest ausschliesslich oeffentliche Dateien — keine Anmeldung, kein Auftrag, keine Kosten."
    ],
    trainiert: "Nichts — er haelt Hashes gegen die Auslieferung",
    verbessert: "Eine Sperre, die gruen meldet und ins Leere bewacht, faellt am naechsten Tag auf statt nach Wochen",
    neuigkeiten: ["Neu am 2026-09-04 (Betreiber-Auftrag 'taeglichen Phantom-Waechter bauen')"],
    ...LAEUFER
  }
]);
