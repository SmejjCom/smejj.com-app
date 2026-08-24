// smejj.com — Modul AP, Registry-Teil 4: Kosten, Leistung, Wachstum und die
// Tagesmappe — Nr. 55-60 (Betreiber-Freigabe 2026-08-24: "Ja, alle 17 bauen").
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
  }
]);
