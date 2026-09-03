// smejj.com — Modul AP, Registry-Teil 4: Kosten, Leistung, Wachstum und die
// Tagesmappe — Nr. 55-60 (Betreiber-Freigabe 2026-08-24: "Ja, alle 17 bauen")
// und Nr. 65 (Betreiber-Freigabe 2026-08-26: Trainings-Reife-Wache).
//
// Eigene Datei wie Teil 2 und 3 (800-Zeilen-Regel der Hauptliste).

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

export const WACHSTUM_AUTOPILOTEN = Object.freeze([
  {
    id: "kosten-wache",
    name: "Kosten-Wache",
    nummer: "55",
    kurz: "Rechnet den gemessenen Modell-Verbrauch in Geld um und schlägt an, BEVOR ein Tag das Budget reißt — Warnung ab 80 %, rot ab 100 %.",
    funktionen: [
      "Liest den Tagesbericht des Token-Messers (dieselben Zahlen wie der Adminbereich) und vergleicht gegen das Tagesbudget (SMEJJ_KOSTEN_TAGESBUDGET_USD, Standard 25 USD).",
      "Warnung ab 80 % Verbrauch, rot ab gerissenem Budget — mit dem meistgenutzten Modell in der Meldung.",
      "EHRLICH: der Arbeitsspeicher des Token-Messers ist nach jedem Neustart leer — ein niedriger Wert kurz nach einem Deploy ist eine Untergrenze, und die Meldung sagt das dazu."
    ],
    trainiert: "Nichts — sie rechnet Verbrauch in Geld um",
    verbessert: "Ein Kostentag läuft nicht mehr blind: das Budget meldet sich, bevor es gerissen ist",
    neuigkeiten: ["Neu am 2026-08-24 (Lücke aus dem 135-Piloten-Vergleich)"],
    ...LAEUFER
  },
  {
    id: "last-probe",
    name: "Last-Probe",
    nummer: "56",
    kurz: "Misst wöchentlich mit 20 gleichzeitigen Anfragen, wie sich Control und Brücke unter Parallellast verhalten — p95 und Fehlerquote, bevor echte Nutzer sie messen.",
    funktionen: [
      "20 parallele /health-Anfragen je Ziel, von innen (Zeabur-Netz) — das langsame Netz des Betreibers läuft nie in die Zahlen.",
      "Rot bei mehr als 10 % Fehlern oder p95 über 2 s unter Mini-Last; das Ergebnis steht neustart-fest in der Ablage.",
      "BEWUSST KLEIN: eine Probe, kein Lasttest-Gewitter — ein echter Stresstest gehört ins Wartungsfenster auf Betreiber-Anordnung."
    ],
    trainiert: "Nichts — sie misst unter Parallellast",
    verbessert: "Ein Engpass fällt in der Wochenprobe auf, nicht beim ersten Ansturm",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "auffindbarkeits-wache",
    name: "Auffindbarkeits-Wache",
    nummer: "57",
    kurz: "Prüft täglich die AUSGELIEFERTE Startseite auf die sechs SEO-Pflichtangaben — Titel, Beschreibung, Sprache, h1, og:title, Index-Freigabe — plus robots.txt.",
    funktionen: [
      "Gemessen wird gegen https://smejj.com: was Crawler und Nutzer wirklich bekommen, samt Bündel und Service-Worker.",
      "Rot bei fehlendem Titel, fehlender Beschreibung, NOINDEX oder gesperrter robots.txt — die Regressionen, die bei Umbauten still passieren.",
      "KEIN Ranking-Orakel: ob Google die Seite mag, misst niemand von hier — ob sie die Grundlagen trägt, sehr wohl."
    ],
    trainiert: "Nichts — sie prüft Pflichtangaben",
    verbessert: "Ein versehentliches NOINDEX oder ein verlorener Titel steht nach einem Tag in der Ampel statt nach einem Quartal im Traffic",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "willkommens-wache",
    name: "Willkommens-Wache",
    nummer: "58",
    kurz: "Misst am echten Nutzer-Index die zwei Wachstums-Zahlen: Wie viele neue Konten in 7 Tagen — und wie viele ältere kommen wieder?",
    funktionen: [
      "Quelle ist der Nutzer-Index des Adminbereichs: createdAt für Neuzugänge, lastSeenAt für Wiederkehr — nur Kopfdaten, nie Gespräche.",
      "Wiederkehr-Quote = ältere Konten, die in den letzten 7 Tagen eine Sitzung berührt haben, geteilt durch die messbaren älteren Konten.",
      "EHRLICH: Einträge ohne lastSeenAt (alter Index) zählen als 'nicht messbar', nie als 'kommt nicht wieder'."
    ],
    trainiert: "Nichts — sie zählt Ankommen und Wiederkommen",
    verbessert: "Ob smejj wächst und hält, sind zwei gemessene Zahlen im Takt statt ein Bauchgefühl",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "experiment-meister",
    name: "Experiment-Meister",
    nummer: "59",
    kurz: "Der Rahmen für ehrliche A/B-Versuche: deterministische Zuteilung, Mindest-Beobachtungen, Gleichstand gehört dem Amtsinhaber — umgesetzt wird ein Sieger nur vom Betreiber.",
    funktionen: [
      "Zuteilung per Hash (Kennung + Experiment): derselbe Nutzer sieht immer dieselbe Variante — sonst misst man Rauschen.",
      "Urteil erst ab 50 Beobachtungen je Variante; die Herausforderin gewinnt nur mit MEHR Erfolg (Regel des Modell-Einkäufers).",
      "Fertige Urteile landen in der Tagesmappe; kein aktives Experiment ist ein ehrlicher Zustand, kein Fehler."
    ],
    trainiert: "Nichts — er verwaltet Versuche und rechnet Urteile",
    verbessert: "Ob eine neue Funktion etwas BRINGT, wird gemessen statt behauptet",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "tagesmappe",
    name: "Tagesmappe",
    nummer: "60",
    kurz: "EIN Ort für die 10 Minuten des Betreibers: alles, was auf eine Entscheidung wartet, in einer Mappe — Empfehlungen, rote Ampeln, Wartendes, offene Punkte.",
    funktionen: [
      "Vier Abschnitte: ENTSCHEIDEN (Rückroll-, Modellwechsel-, Experiment-Empfehlungen), ROTE AMPELN, WARTEN AUF DICH (Tickets, dringende Aufgaben), OFFENE PUNKTE.",
      "Jede unlesbare Quelle steht als stumme Quelle IN der Mappe — eine Mappe mit verschwiegenen Lücken wäre gefährlicher als keine.",
      "Abrufbar unter GET /api/admin/ops/tagesmappe (Recht ops.read); die Ampel ist grün, wenn die Mappe VOLLSTÄNDIG gebaut wurde — auch mit unbequemem Inhalt.",
      "Die Mappe entscheidet nichts: sie sammelt, der Betreiber klickt."
    ],
    trainiert: "Nichts — sie sammelt aus den echten Ablagen",
    verbessert: "Die tägliche Aufsicht ist ein 10-Minuten-Blick auf eine Mappe statt eine Reise durch sechs Ansichten",
    neuigkeiten: ["Neu am 2026-08-24"],
    ...LAEUFER
  },
  {
    id: "modell-katalog-wache",
    name: "Modell-Katalog-Wache",
    nummer: "62",
    kurz: "Fragt einmal täglich die /models-Endpunkte aller Anbieter mit Schlüssel: existieren die Modelle, die der Router wirklich wählen würde, dort noch — oder zeigt der Katalog auf tote Namen?",
    funktionen: [
      "Prüft je Anbieter die AUFGELÖSTE Wahl des Routers (Katalog + Env-Overrides, alle fünf Profile) — den rohen Katalog zu prüfen wäre die falsche Frage.",
      "Der /models-Endpunkt trennt 'Modell weg' von 'Schlüssel kaputt' in einem Aufruf (Lehre aus dem Groq-Vorfall: zwei tote Llama-Namen sahen aus wie ein kaputter Schlüssel).",
      "Ein Anbieter ohne /models-Endpunkt ist 'nicht prüfbar' und wird BENANNT, macht aber nicht dauerhaft rot — rot ist nur ein nachweislich fehlendes Modell oder eine Lage, in der gar nichts messbar war.",
      "Zwischen zwei Tagesabfragen meldet die Ampel den gemessenen Stand aus der Ablage, nie einen Pauschaltext (Bauart der Abhängigkeits-Wache).",
      "WARUM ES SIE GIBT: Groqs Llama-Einträge starben beim Anbieter; der Katalog zeigte vom 18. bis 24.08. auf tote Namen, und der Router-Test dazu stand unbemerkt rot."
    ],
    trainiert: "Nichts — sie fragt die Modelllisten der Anbieter ab",
    verbessert: "Ein beim Anbieter gestorbenes Modell steht binnen eines Tages in der Ampel statt als 404 beim Nutzer",
    neuigkeiten: ["Neu am 2026-08-24, nach dem Groq-Llama-Vorfall"],
    ...LAEUFER
  },
  {
    id: "trainings-reife",
    name: "Trainings-Reife-Wache",
    nummer: "65",
    kurz: "Rechnet die vier Trainings-Ablagen gegen das Reife-Ziel und legt die Entscheidungskarte in der Tagesmappe ab — damit das ruhende Training (Charta §0) wieder sichtbar näherkommt, statt blind zu sammeln.",
    funktionen: [
      "Misst dieselben vier Ablagen wie der Trainings-Takt (Nr. 05) — DPO-Paare, Destillate, Nutzersignale, Batches — und rechnet sie gegen SMEJJ_TRAINING_REIFE_ZIEL_GESAMT (Standard 5000).",
      "Vier Stufen: 0 = leerer ehrlicher Anfang, 1 = Daten da, 2 = nah dran (ab der Hälfte), 3 = reif. Erst Stufe 2 erzeugt eine Karte unter ENTSCHEIDEN in der Tagesmappe (Nr. 60).",
      "SIE STARTET KEIN TRAINING und schätzt keine Preise: der GPU-Lauf bleibt Rote Liste hinter der schriftlichen Kosten-Freigabe — dieselbe Grenze wie im Trainings-Takt.",
      "Unlesbare Ablagen sind rot; eine veraltete Karte (über 3 Tage) erscheint als stumme Quelle in der Mappe, statt zu schweigen."
    ],
    trainiert: "Nichts — sie rechnet Bestände gegen ein Ziel",
    verbessert: "Die Frage 'wären wir schon trainierbereit?' ist eine gemessene Zahl alle 30 Minuten statt ein Bauchgefühl mit still wachsenden Ablagen",
    neuigkeiten: ["Neu am 2026-08-26 (Lücke aus der A-bis-Z-Deckungsprüfung)"],
    ...LAEUFER
  },
  {
    id: "modell-evolution",
    name: "Modell-Evolutions-Takt",
    nummer: "72",
    kurz: "Der 24/7-Kreislauf der Modellfamilie: alle 30 Minuten MESSEN → SCHWÄCHE FINDEN → TORE PRÜFEN → PROTOKOLL. Jeder Durchgang ist ein nummerierter Zyklus in der Ablage — ob er rund um die Uhr läuft, ist eine ablesbare Zahl.",
    funktionen: [
      "MESSEN: Referenz-Note der Live-Kette aus dem Herzschlag der Qualitätsmessung (Nr. 01), Noten je Fähigkeit (Text, Code, Bild, Recherche, Werkzeug …) aus der Kennzahlen-Ablage der Evolution-Engine (Nr. 37), Datenreife aus der Karte der Reife-Wache (Nr. 65).",
      "SCHWÄCHE FINDEN: die Fähigkeit mit der niedrigsten Note der letzten 7 Tage — nur ab 5 Messungen, sonst ist es Rauschen. Sie steht mit Zahl in der Meldung und im Protokoll.",
      "SIEBEN TORE vor einem Trainingslauf, fail-closed: Daten (Reife Stufe 3), Einwilligung (Capture AN), Kostenfreigabe (Freigabe-ID + Monatsbetrag ≤ 10 USD), Basismodell, GPU-Heimat, Schalter (kein Notaus), Messlatte (Referenz gemessen). Die Meldung nennt das erste zu Tor und den Handgriff, der es öffnet.",
      "PROTOKOLL: je Zyklus ein überschriebener Datensatz plus einer je Tag in autopiloten/modell-evolution — Referenz, Schwäche, Reife, Tore, 'trainingGestartet: false'. Sobald ALLE Tore offen sind, liegt eine Karte unter ENTSCHEIDEN in der Tagesmappe (Nr. 60).",
      "ER STARTET KEIN TRAINING und mietet keine GPU: der Lauf smejj 1.1 bleibt Rote Liste hinter dem Betreiber-Klick (Charta §0, Trainingsplan 02.09.). Nur bessere Versionen werden übernommen — das Versions-Gate (modelPromotion.js) bleibt die zweite, menschliche Schwelle."
    ],
    trainiert: "Nichts — er misst, findet Schwächen und prüft Tore; der GPU-Lauf ist Betreiber-Klick",
    verbessert: "Der Betreiber-Auftrag '24/7 dauerhaft trainieren' war bisher nirgends ein Takt: Training ruhte still, und niemand sagte, welches Tor noch zu ist — jetzt steht es alle 30 Minuten mit Zyklusnummer in der Ampel",
    neuigkeiten: ["Neu am 2026-09-03 (Betreiber-Auftrag: permanentes Modell-Evolutions-System)"],
    ...LAEUFER
  }
]);
