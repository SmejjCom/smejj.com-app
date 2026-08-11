// smejj.com — Modul AP: Autopiloten-Liste (Single Responsibility: Handgepflegte Registry aller Autopiloten).
// Ausgelagert aus opsAutopiloten.js zur Einhaltung der 800-Zeilen-Regel.

const TAG_MS = 24 * 60 * 60 * 1000;
const STUNDE_MS = 60 * 60 * 1000;

export const AUTOPILOTEN = Object.freeze([
  {
    id: "qualitaetsmessung",
    name: "Qualitätsmessung",
    kurz: "Misst zweimal täglich die Antwortqualität der Modelle und schreibt das Ergebnis ins Protokoll.",
    funktionen: [
      "Läuft täglich um 7:10 und 19:10 UTC im Dienst smejj-autopilot-jobs auf Zeabur.",
      "Führt den Messlauf gegen die Prüfsuite aus.",
      "Protokoll: Zeabur-Portal → smejj-autopilot-jobs → Logs."
    ],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "täglich 7:10 und 19:10 UTC",
    messung: "heartbeat",
    erwartetAlleMs: 12 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/qualitaet mit {\"key\":\"<qualitaetsmessung-Schlüssel>\"}",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten."
  },
  {
    id: "codeberg-spiegel",
    name: "Codeberg-Spiegel",
    kurz: "Sichert jede Nacht eine Kopie des Codes nach Codeberg — seit 11. August 2026 vom Zeabur-Dauerdienst, nicht mehr vom Mac.",
    funktionen: [
      "Läuft täglich um 11:20 UTC (= 4:20 Uhr Mac-Zeit) im Dienst smejj-autopilot-jobs auf Zeabur.",
      "Spiegelt das Repository nach Codeberg (zweiter, unabhängiger Aufbewahrungsort).",
      "Holt einen verpassten Tageslauf nach einem Neustart selbst nach — der Mac konnte das im Schlaf nicht.",
      "Protokoll: Zeabur-Portal → smejj-autopilot-jobs → Logs; Zustand unter smejj-autopilot-jobs.zeabur.app/health."
    ],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "täglich 11:20 UTC",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/spiegel mit {\"key\":\"<codeberg-spiegel-Schlüssel>\"} — oder im Zeabur-Portal den Dienst neu starten (holt den Tageslauf nach).",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten — davon wird abgeraten, dann spiegelt nichts mehr."
  },
  {
    id: "voice-region-check",
    name: "Voice-Region-Prüfung",
    kurz: "Prüft täglich, ob Google die Regionsänderung für die Voice-Freischaltung genehmigt hat.",
    funktionen: [
      "Läuft täglich um 9:04 UTC im Dienst smejj-autopilot-jobs auf Zeabur.",
      "Prüft den Stand der Regionsänderung für 7alanbest@gmail.com.",
      "Meldet sich, sobald Google genehmigt hat."
    ],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "täglich 9:04 UTC",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/voice-region mit {\"key\":\"<voice-region-check-Schlüssel>\"}",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten."
  },
  {
    id: "konkurrenz-radar",
    name: "Konkurrenz-Radar",
    kurz: "Durchsucht jeden Montag die öffentlichen Quellen der Konkurrenz nach neuen Funktionen und schlägt Verbesserungen vor.",
    funktionen: [
      "Läuft jeden Montag um 6:00 UTC im Dienst smejj-autopilot-jobs auf Zeabur.",
      "Prüft Release Notes und Tech-Presse von ChatGPT, Gemini, Kimi, Claude, Perplexity, Copilot und Grok.",
      "Erstellt nur bei echten Funden einen Bericht — jeder Vorschlag wartet auf deine Ja/Nein-Entscheidung.",
      "Baut nichts automatisch ein."
    ],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "montags 6:00 UTC",
    messung: "heartbeat",
    erwartetAlleMs: 7 * TAG_MS,
    schonfristMs: 12 * STUNDE_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/konkurrenz-radar mit {\"key\":\"<konkurrenz-radar-Schlüssel>\"}",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten."
  },
  {
    id: "training-loop",
    name: "Training-Loop",
    kurz: "Überwacht und taktet die Evaluierungs- und Trainingszyklen im Dienst smejj-autopilot-jobs auf Zeabur.",
    funktionen: [
      "Läuft täglich um 12:00 UTC im Dienst smejj-autopilot-jobs auf Zeabur.",
      "Prüft Evaluierungsberichte und Auswertungsschleifen.",
      "Protokoll: Zeabur-Portal → smejj-autopilot-jobs → Logs."
    ],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "täglich 12:00 UTC",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/training-loop mit {\"key\":\"<training-loop-Schlüssel>\"}",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten."
  },
  {
    id: "brueckenwaechter",
    name: "Brücken-Wächter",
    kurz: "Prüft rund um die Uhr, ob die Chat-Brücke wirklich antwortet — von außen, über dieselbe Adresse wie ein Nutzer.",
    funktionen: [
      "Fragt jede Minute die öffentliche Adresse der Chat-Brücke ab und liest ihre Version.",
      "Erst 3 Fehlversuche in Folge gelten als Ausfall — eine Schwalbe ist kein Befund.",
      "Meldet sich alle 5 Minuten selbst; bleibt seine Meldung aus, wird diese Ampel rot.",
      "Seit 2026-08-07 ein EIGENER Dienst: vorher wohnte er im Training-Loop und wurde mit dessen Stilllegung fünf Tage lang unbemerkt still.",
      "Selbst nachschauen: smejj-brueckenwaechter.zeabur.app/bruecke zeigt Prüfungen, Fehler und vergangene Ausfälle; /health zeigt den Wächter selbst.",
      "Diese Ampel fragt ihn alle 5 Minuten ab (statt auf eine Meldung zu warten) — antwortet er nicht mehr, wird sie rot."
    ],
    ort: "Zeabur (eigener Dienst)",
    zeitplan: "Dauerbetrieb",
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Zeabur-Portal → Projekt »untitled« → smejj-brueckenwaechter → Restart. Läuft ohne Modellkosten auf dem bereits bezahlten Server.",
    stopAnleitung: "Zeabur-Portal → smejj-brueckenwaechter → Suspend. Danach beobachtet niemand mehr, ob die Brücke lebt."
  },
  {
    id: "salad-sonden",
    name: "Salad-Sonden",
    kurz: "Gesundheitssonden am Container (Salad-Exit schrittweise, Zukunft 100% Zeabur).",
    funktionen: [
      "Salad-Container schrittweise auslaufend, Dienste auf Zeabur migriert.",
      "Gemessen über die Eigenmeldung des Control-Servers alle 5 Minuten."
    ],
    ort: "Salad (Salad-Exit)",
    zeitplan: "Dauerbetrieb",
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Salad-Exit erfolgt — Dienste laufen auf Zeabur.",
    stopAnleitung: "Im Salad-Portal Container löschen/anhalten."
  },
  {
    id: "deep-research",
    name: "Deep Research KI-Autopilot",
    kurz: "Führt mehrstufige Internet-Recherchen mit automatischer Synthese und Quellenzitierung durch.",
    funktionen: [
      "Generiert iterativ mehrstufige Suchpläne.",
      "Synthetisiert Webinhalte und fasst Zitate zusammen.",
      "Steuert tiefe Recherchen für komplexe Fragestellungen."
    ],
    ort: "Control Server (Autopilot Modul)",
    zeitplan: "Auf Anfrage / Event-basiert",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird automatisch bei komplexen Recherche-Prompts getriggert.",
    stopAnleitung: "Über Feature-Flag deaktivierbar."
  },
  {
    id: "code-interpreter",
    name: "Code Interpreter Sandbox Autopilot",
    kurz: "Führt JavaScript/Berechnungen in einer isolierten Umgebung mit Timeouts und Ergebnis-Erfassung aus.",
    funktionen: [
      "Isolierter vm-Sandbox-Kontext mit Zeitbeschränkungen.",
      "Erfasst Log-Ausgaben, Rückgabewerte und Datenstrukturen.",
      "Generiert strukturierte Formate für Diagramme und Tabellen."
    ],
    ort: "Control Server (Autopilot Modul)",
    zeitplan: "Auf Anfrage / Event-basiert",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird automatisch bei mathematischen oder Code-Ausführungsanfragen aktiviert.",
    stopAnleitung: "Über Sandbox-Policy steuerbar."
  },
  {
    id: "memory-sync",
    name: "Memory & Langzeitgedächtnis Autopilot",
    kurz: "Extrahiert fortlaufend wichtige Nutzerfakten und Vorlieben aus Chats und hält das Nutzerprofil aktuell.",
    funktionen: [
      "Extrahiert Nutzerkontext (Name, Ort, Präferenzen).",
      "Aktualisiert Benutzerprofile in IDrive e2 S3 Storage.",
      "Stellt Langzeitkontext für künftige Chats bereit."
    ],
    ort: "Control Server & IDrive e2",
    zeitplan: "Nach jeder Chat-Session",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft im Anschluss an Chat-Nachrichten.",
    stopAnleitung: "Über Konto-Datenschutzeinstellungen deaktivierbar."
  },
  {
    id: "self-healing",
    name: "Self-Healing Prompt-Autopilot",
    kurz: "Prüft KI-Antworten laufend auf Fehler und führt automatische Reparaturen aus.",
    funktionen: [
      "Laufzeit-Inspektion von Modell-Ausgaben auf Abbrüche und JSON-Syntax.",
      "Erkennt hängende Wiederholungsschleifen.",
      "Führt automatische Prompt-Reparaturen und Fallbacks durch."
    ],
    ort: "Control Server (LLM Pipeline)",
    zeitplan: "Dauerbetrieb (Laufzeit)",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: 30 * 60 * 1000,
    startAnleitung: "Integrierter Bestandteil des LLM-Tool-Loops.",
    stopAnleitung: "Kann über Fallback-Policy konfiguriert werden."
  },
  {
    id: "multimodal-engine",
    name: "Multimodaler Audio/Vision Autopilot",
    kurz: "Steuert multimodale Audio- & Bild-Streams für Live-Interaktionen.",
    funktionen: [
      "Validiert Audio-Chunks und Bild-Frames.",
      "Strukturiert multimodale Payloads für Gemini/Groq Endpunkte.",
      "Unterstützt Vollduplex-Kommunikation."
    ],
    ort: "Control Server (Streaming Engine)",
    zeitplan: "Auf Anfrage / Stream-basiert",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird bei Aktivierung des Voice- oder Vision-Modus gestartet.",
    stopAnleitung: "Stoppt automatisch bei Beendigung des Streams."
  },
  {
    id: "task-orchestrator",
    name: "Multi-Agenten Task-Orchestrator",
    kurz: "Zerlegt komplexe Aufgaben in Sub-Agenten-Tasks und koordiniert deren Ausführung.",
    funktionen: [
      "Generiert gerichtete Aufgaben-Graphen (DAG).",
      "Dispatched und überwacht parallele Sub-Agenten-Schritte.",
      "Führt Ergebnisse in einen kohärenten Bericht zusammen."
    ],
    ort: "Control Server (Orchestrator)",
    zeitplan: "Auf Anfrage / Event-basiert",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Aktiviert bei komplexen Multi-Step Nutzeranweisungen.",
    stopAnleitung: "Über Orchestrator-Schalter steuerbar."
  }
]);
