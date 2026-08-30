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
  }
]);
