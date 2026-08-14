// smejj.com — Modul AP, Registry-Teil 2: die Autopiloten der AI Evolution
// Engine (Nr. 37-39).
//
// Sie wohnen in einer eigenen Datei, weil opsAutopilotenListe.js mit ihnen
// zusammen 811 Zeilen hatte — elf über der 800-Zeilen-Regel, die der
// Richtlinien-Wächter (npm run check:guidelines) durchsetzt. Dieselbe
// Trennung, aus der opsAutopilotenListe.js selbst einmal entstanden ist.

const STUNDE_MS = 60 * 60 * 1000;

export const EVOLUTION_AUTOPILOTEN = Object.freeze([
  {
    id: "ai-evolution-engine",
    name: "37. AI Evolution Engine (Sofort Verbessern)",
    kurz: "Die Schicht ÜBER allen KI-Aktionen: jedes Ergebnis — Text, Code, Bild, Video, Audio, Dokument, Recherche, Werkzeug, Agent — bekommt eine Note und, wenn nötig, eine fertige Verbesserungs-Aufgabe.",
    funktionen: [
      "EIN Einstieg für jede KI-Funktion: erfasseAktion({art, prompt, ergebnis}). Eine neue Funktion braucht zwei Zeilen — Prüfer anmelden, Aktion melden — und hängt im Kreislauf.",
      "Bewertet je Medientyp über die Quality-Engine: 12 angemeldete Prüfer, jeder mit einer KAPUTTEN und einer GESUNDEN Selbsttest-Probe. Fällt ein Prüfer durch, wird diese Ampel rot.",
      "UNGEPRÜFT IST NICHT GUT: Für eine Art ohne Prüfer kommt »nicht gemessen« zurück, nie 100 Punkte. Die Meldung nennt den Abdeckungsgrad — wie viel vom KI-Betrieb überhaupt jemand ansieht.",
      "Bremsen sind eingebaut: deterministische Aufgaben-IDs (derselbe Befund = dieselbe ID), 6 Stunden Sperrfrist je Aufgabe, höchstens 20 Aufgaben je Durchgang — und was gekappt wurde, steht im Bericht.",
      "Risikostufen: Sicherheitsfunde (Geheimnis im Code, gefährliche Muster) bekommen »Freigabe: Betreiber« und werden nie automatisch umgesetzt."
    ],
    trainiert: "Nichts — sie misst. Echte KI-Ergebnisse gegen nachprüfbare Regeln je Medientyp.",
    verbessert: "Qualität wurde bisher NUR am Text gemessen; Bild, Video, Code und Agentenläufe liefen ungeprüft durch",
    neuigkeiten: ["Neu am 2026-08-14 (Betreiber-Auftrag: AI Evolution Engine)"],
    ort: "Control Server (control-server/src/evolution)",
    zeitplan: "alle 30 Minuten (Selbsttest); im Betrieb bei jeder gemeldeten KI-Aktion",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
    stopAnleitung: "Über den Autopilot-Läufer im Control-Server steuerbar."
  },
  {
    id: "missing-function-detector",
    name: "38. Missing Function Detector (Konkurrenzlücken)",
    kurz: "Was können die anderen, das smejj nicht kann — und lohnt es sich? Macht aus Radar-Berichten priorisierte Aufgaben statt Lesestoff.",
    funktionen: [
      "Hält das smejj-Fähigkeitsregister gegen den Konkurrenz-Stand (ChatGPT, Gemini, Claude, Kimi, Perplexity, Grok) und trennt drei Dinge: Lücken, Gleichstand und eigene Vorteile.",
      "EINE FÄHIGKEIT OHNE BELEG IST KEINE FÄHIGKEIT: Jeder Eintrag nennt die Datei, in der die Funktion steckt. Verschwindet die Datei aus dem Quelltext, wird diese Ampel ROT — eine Fähigkeit hat sich still verabschiedet.",
      "Jede Lücke wird zur vollständigen Aufgabe: Funktion, Konkurrenzvergleich, Nutzen, Score, Priorität, zuständiger Autopilot, Testanforderung, Status.",
      "Der Konkurrenz-Stand ist HANDGEPFLEGT und trägt sein Datum — er wird nirgends als Messung ausgegeben. Sobald der Konkurrenz-Radar (Nr. 04) strukturierte Listen liefert, wird er als Quelle durchgereicht.",
      "Neue Produktfunktionen bekommen immer »Freigabe: Betreiber« — die Maschine sortiert vor, gebaut wird auf Entscheidung."
    ],
    trainiert: "Nichts — er vergleicht. Fähigkeitsregister gegen Konkurrenz-Stand.",
    verbessert: "Der Konkurrenz-Radar lief seit Wochen, aber aus keinem Bericht wurde je eine Aufgabe",
    neuigkeiten: ["Neu am 2026-08-14 (Betreiber-Auftrag: AI Evolution Engine)"],
    ort: "Control Server (control-server/src/evolution)",
    zeitplan: "alle 30 Minuten",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
    stopAnleitung: "Über den Autopilot-Läufer im Control-Server steuerbar."
  },
  {
    id: "autopilot-supervisor",
    name: "39. Autopilot-Supervisor (unabhängige Abnahme)",
    kurz: "Kein Autopilot darf sich selbst abnehmen. Neun Kriterien, jedes mit Beleg — eine Behauptung ist kein Beweis.",
    funktionen: [
      "Prüft jede »erledigt«-Meldung gegen neun Kriterien: richtige Aufgabe, Änderung belegt, richtige Stelle getroffen, Tests vorhanden, Tests grün, keine Regression, Leistung, wirklich live, Aufgabe vollständig.",
      "FAIL-CLOSED: Fehlt ein Beleg, ist die Aufgabe NICHT erledigt. Nicht »unklar, also durchwinken«. Ein Prüfer, der im Zweifel zustimmt, ist dasselbe wie kein Prüfer — nur teurer.",
      "Der Selbsttest prüft BEIDE Richtungen: eine leere Erfolgsmeldung muss durchfallen, eine vollständig belegte muss durchgehen. Ein Supervisor, der alles blockiert, wäre genauso kaputt wie einer, der alles durchwinkt.",
      "Nach drei erfolglosen Abgaben geht die Aufgabe an den Betreiber — dieselbe Bremse wie bei der Selbstheilung (Nr. 33).",
      "Zusätzlich liest er die frische Ampel und meldet grüne Autopiloten, deren Erfolgsmeldung keine einzige Zahl enthält — genau das Muster der 29 Attrappen vom 2026-08-12."
    ],
    trainiert: "Nichts — er kontrolliert. Belege gegen Behauptungen.",
    verbessert: "Bis heute konnte jeder Autopilot »Aufgabe erledigt« sagen, ohne dass jemand nachsah",
    neuigkeiten: ["Neu am 2026-08-14 (Betreiber-Auftrag: AI Evolution Engine)"],
    ort: "Control Server (control-server/src/evolution)",
    zeitplan: "alle 30 Minuten",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
    stopAnleitung: "Über den Autopilot-Läufer im Control-Server steuerbar."
  }
]);
