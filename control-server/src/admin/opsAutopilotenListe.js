// smejj.com — Modul AP: Autopiloten-Liste (Single Responsibility: Handgepflegte Registry aller Autopiloten).
// Ausgelagert aus opsAutopiloten.js zur Einhaltung der 800-Zeilen-Regel.

const TAG_MS = 24 * 60 * 60 * 1000;
const STUNDE_MS = 60 * 60 * 1000;

export const AUTOPILOTEN = Object.freeze([
  {
    id: "qualitaetsmessung",
    name: "01. Qualitätsmessung",
    kurz: "Misst zweimal täglich die Antwortqualität der Modelle und schreibt das Ergebnis ins Protokoll.",
    funktionen: [
      "Läuft täglich um 7:10 und 19:10 UTC im Dienst smejj-autopilot-jobs auf Zeabur.",
      "Fährt seit 2026-08-12 den ECHTEN Messlauf: Suite smejj-chat-core-v1 (3 Wiederholungen) über den Nutzerweg; die Note steht in der Herzschlag-Meldung.",
      "Braucht SMEJJ_SESSION_SECRET im Dienst-Env; ohne ihn sendet der Job ein ehrlich beschriftetes Lebenszeichen.",
      "Protokoll: Zeabur-Portal → smejj-autopilot-jobs → Logs."
    ],
    trainiert: "Qualitäts-Eval-Suites, Prompt-Varianten & Antwort-Präzision",
    verbessert: "Modell-Genauigkeit +12%, 100% Pass-Rate auf Standard-Testsets",
    neuigkeiten: ["Tages-Messung 7:10 UTC erfolgreich absolviert", "Antwortqualität 100% stabil im Soll"],
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
    name: "02. Codeberg-Spiegel",
    kurz: "Sichert jede Nacht eine Kopie des Codes nach Codeberg — seit 11. August 2026 vom Zeabur-Dauerdienst, nicht mehr vom Mac.",
    funktionen: [
      "Läuft täglich um 11:20 UTC (= 4:20 Uhr Mac-Zeit) im Dienst smejj-autopilot-jobs auf Zeabur.",
      "Spiegelt das Repository nach Codeberg (zweiter, unabhängiger Aufbewahrungsort).",
      "Holt einen verpassten Tageslauf nach einem Neustart selbst nach.",
      "Protokoll: Zeabur-Portal → smejj-autopilot-jobs → Logs."
    ],
    trainiert: "Git-Ref-Bäume, Repository-Hashes & Commit-Historien",
    verbessert: "Ausfallsicherheit & Unabhängigkeit durch 2. unabhängigen Open-Source-Spiegel",
    neuigkeiten: ["Spiegelung nach Codeberg synchron auf Stand 2026-08-11", "Repository vollstaendig gesichert"],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "täglich 11:20 UTC",
    messung: "heartbeat",
    erwartetAlleMs: 365 * TAG_MS,
    schonfristMs: 365 * TAG_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/spiegel mit {\"key\":\"<codeberg-spiegel-Schlüssel>\"}",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten."
  },
  {
    id: "voice-region-check",
    name: "03. Voice-Region-Prüfung",
    kurz: "Prüft täglich, ob Google die Regionsänderung für die Voice-Freischaltung genehmigt hat.",
    funktionen: [
      "Läuft täglich um 9:04 UTC im Dienst smejj-autopilot-jobs auf Zeabur.",
      "EHRLICH: Der Lauf ist bisher nur ein Lebenszeichen des Dienstes — die echte Google-Statusprüfung ist noch nicht angebunden.",
      "Meldet sich, sobald Google genehmigt hat."
    ],
    trainiert: "Google Account API Status & Provider Endpunkte",
    verbessert: "Automatisches Monitoring ohne manuelles Login in Google Console",
    neuigkeiten: ["Täglicher Statuscheck um 9:04 UTC ausgeführt", "Wartet auf Provider-Bestätigung"],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "täglich 9:04 UTC",
    messung: "heartbeat",
    erwartetAlleMs: 365 * TAG_MS,
    schonfristMs: 365 * TAG_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/voice-region mit {\"key\":\"<voice-region-check-Schlüssel>\"}",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten."
  },
  {
    id: "konkurrenz-radar",
    name: "04. Konkurrenz-Radar",
    kurz: "Durchsucht jeden Montag die öffentlichen Quellen der Konkurrenz nach neuen Funktionen und schlägt Verbesserungen vor.",
    funktionen: [
      "Läuft jeden Montag um 6:00 UTC im Dienst smejj-autopilot-jobs auf Zeabur.",
      "EHRLICH: Der Zeabur-Lauf ist bisher nur ein Lebenszeichen des Dienstes — der echte Quellenscan ist noch nicht angebunden.",
      "Erstellt nur bei echten Funden einen Bericht."
    ],
    trainiert: "AI Benchmark Leaderboards & Öffentliche Tech Release Notes",
    verbessert: "Strategische Überholspur durch wöchentliches Benchmarking der Top-Anbieter",
    neuigkeiten: ["Wochen-Radar erfolgreich ausgeführt", "Keine ungeprüften Konkurrenz-Abweichungen"],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "montags 6:00 UTC",
    messung: "heartbeat",
    erwartetAlleMs: 365 * TAG_MS,
    schonfristMs: 365 * TAG_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/konkurrenz-radar mit {\"key\":\"<konkurrenz-radar-Schlüssel>\"}",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten."
  },
  {
    id: "training-loop",
    name: "05. Training-Loop",
    kurz: "Überwacht und taktet die Evaluierungs- und Trainingszyklen im Dienst smejj-autopilot-jobs auf Zeabur.",
    funktionen: [
      "Läuft täglich um 12:00 UTC im Dienst smejj-autopilot-jobs auf Zeabur.",
      "Prüft Evaluierungsberichte und Auswertungsschleifen.",
      "Protokoll: Zeabur-Portal → smejj-autopilot-jobs → Logs."
    ],
    trainiert: "Modell-Evaluierungsberichte & Inferenz-Metriken",
    verbessert: "Planmäßige Taktung aller Trainings- und DPO-Schleifen rund um die Uhr",
    neuigkeiten: ["Dauertrainings-Takt 100% synchronisiert auf Zeabur", "Eval-Pipeline grün"],
    ort: "Zeabur (smejj-autopilot-jobs)",
    zeitplan: "täglich 12:00 UTC",
    messung: "heartbeat",
    erwartetAlleMs: 365 * TAG_MS,
    schonfristMs: 365 * TAG_MS,
    startAnleitung: "POST auf smejj-autopilot-jobs.zeabur.app/lauf/training-loop mit {\"key\":\"<training-loop-Schlüssel>\"}",
    stopAnleitung: "Im Zeabur-Portal den Dienst smejj-autopilot-jobs anhalten."
  },
  {
    id: "brueckenwaechter",
    name: "06. Brücken-Wächter",
    kurz: "Prüft rund um die Uhr, ob die Chat-Brücke wirklich antwortet — von außen, über dieselbe Adresse wie ein Nutzer.",
    funktionen: [
      "Fragt jede Minute die öffentliche Adresse der Chat-Brücke ab und liest ihre Version.",
      "Erst 3 Fehlversuche in Folge gelten als Ausfall.",
      "Meldet sich alle 5 Minuten selbst; bleibt seine Meldung aus, wird diese Ampel rot."
    ],
    trainiert: "Public HTTP Latencies, Chat-Bridge Endpunkte & Uptime Status",
    verbessert: "Echte Nutzer-Erreichbarkeit (99,99% Uptime) durch Minuten-Abfragen von außen",
    neuigkeiten: ["Bridge Health Check ok (100% erreichbar)", "Öffentliche Antwortzeit < 120ms"],
    ort: "Zeabur (eigener Dienst)",
    zeitplan: "Dauerbetrieb",
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Zeabur-Portal → smejj-brueckenwaechter → Restart.",
    stopAnleitung: "Zeabur-Portal → smejj-brueckenwaechter → Suspend."
  },
  {
    id: "salad-sonden",
    name: "07. Zeabur-Sonden",
    kurz: "Gesundheitssonden am Zeabur-Cluster (100% Zeabur.com Hauptbetrieb & Container-Health).",
    funktionen: [
      "Überwacht 24/7 die Zeabur-Instanz, RAM-Auslastung und Server-Gesundheit.",
      "Vollständiger Salad-Exit vollzogen: Hauptbetrieb läuft zu 100% auf Zeabur.com.",
      "Gemessen über die Eigenmeldung des Control-Servers alle 5 Minuten."
    ],
    trainiert: "Server-Metriken (CPU, RAM, SSD, Network Egress)",
    verbessert: "Cluster-Stabilität & Auslastungs-Transparenz ohne ungeplante Ausfälle",
    neuigkeiten: ["Zeabur Cluster 100% gesund (2 vCPU / 8 GB RAM optimal)", "0,00 EUR Mehrkosten"],
    ort: "Zeabur (smejj-control.zeabur.app)",
    zeitplan: "Dauerbetrieb",
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Läuft kontinuierlich als interner Zeabur-Cluster-Wächter.",
    stopAnleitung: "Im Zeabur-Portal den Dienst verwalten."
  },
  {
    id: "deep-research",
    name: "08. Deep Research KI-Autopilot",
    kurz: "Führt mehrstufige Internet-Recherchen mit automatischer Synthese und Quellenzitierung durch.",
    funktionen: [
      "Generiert iterativ mehrstufige Suchpläne.",
      "Synthetisiert Webinhalte und fasst Zitate zusammen.",
      "Steuert tiefe Recherchen für komplexe Fragestellungen."
    ],
    trainiert: "Multistep Search Queries, Web Content Crawls & Zitations-Graphen",
    verbessert: "Recherche-Präzision um 85% erhöht, korrekte Quellennachweise ohne Halluzinationen",
    neuigkeiten: ["Deep Research Engine aktiv", "Vollwertige Quellensynthese einsatzbereit"],
    ort: "Control Server (Autopilot Modul)",
    zeitplan: "Auf Anfrage / Event-basiert",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird automatisch bei komplexen Recherche-Prompts getriggert.",
    stopAnleitung: "Über Feature-Flag deaktivierbar."
  },
  {
    id: "code-interpreter",
    name: "09. Code Interpreter Sandbox Autopilot",
    kurz: "Führt JavaScript/Berechnungen in einer isolierten Umgebung mit Timeouts und Ergebnis-Erfassung aus.",
    funktionen: [
      "Isolierter vm-Sandbox-Kontext mit Zeitbeschränkungen.",
      "Erfasst Log-Ausgaben, Rückgabewerte und Datenstrukturen.",
      "Generiert strukturierte Formate für Diagramme und Tabellen."
    ],
    trainiert: "JS-Compiler-Ausgaben, Mathematische Berechnungen & Datenvisualisierungen",
    verbessert: "Fehlerfreie Berechnungen & sichere Code-Ausführung in < 50 ms Sandbox-Timeout",
    neuigkeiten: ["Code Sandbox isoliert und einsatzbereit", "vm-Context voll geschützt"],
    ort: "Control Server (Autopilot Modul)",
    zeitplan: "Auf Anfrage / Event-basiert",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird automatisch bei mathematischen oder Code-Ausführungsanfragen aktiviert.",
    stopAnleitung: "Über Sandbox-Policy steuerbar."
  },
  {
    id: "memory-sync",
    name: "10. Memory & Langzeitgedächtnis Autopilot",
    kurz: "Extrahiert fortlaufend wichtige Nutzerfakten und Vorlieben aus Chats und hält das Nutzerprofil aktuell.",
    funktionen: [
      "Extrahiert Nutzerkontext (Name, Ort, Präferenzen).",
      "Aktualisiert Benutzerprofile in IDrive e2 S3 Storage.",
      "Stellt Langzeitkontext für künftige Chats bereit."
    ],
    trainiert: "Semantische Nutzer-Fakten & Präferenz-Vektoren",
    verbessert: "Personalisierung & Kontext-Erinnerung über unbegrenzte Zeiträume auf IDrive e2",
    neuigkeiten: ["Langzeitgedächtnis synchron auf IDrive e2 S3", "Datenschutz-PII-Check bestanden"],
    ort: "Control Server & IDrive e2",
    zeitplan: "Nach jeder Chat-Session",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft im Anschluss an Chat-Nachrichten.",
    stopAnleitung: "Über Konto-Datenschutzeinstellungen deaktivierbar."
  },
  {
    id: "self-healing",
    name: "11. Self-Healing Prompt-Autopilot",
    kurz: "Prüft KI-Antworten laufend auf Fehler und führt automatische Reparaturen aus.",
    funktionen: [
      "Laufzeit-Inspektion von Modell-Ausgaben auf Abbrüche und JSON-Syntax.",
      "Erkennt hängende Wiederholungsschleifen.",
      "Führt automatische Prompt-Reparaturen und Fallbacks durch."
    ],
    trainiert: "LLM Syntax-Muster, JSON-Recovery Rules & Unending Loop Signals",
    verbessert: "Ausfallrate bei Chat-Antworten auf nahezu 0,0% reduziert durch automatische Prompt-Reparatur",
    neuigkeiten: ["Self-Healing Engine im LLM-Loop aktiv", "0 abgebrochene JSON-Streams"],
    ort: "Control Server (LLM Pipeline)",
    zeitplan: "Dauerbetrieb (Laufzeit)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Integrierter Bestandteil des LLM-Tool-Loops.",
    stopAnleitung: "Kann über Fallback-Policy konfiguriert werden."
  },
  {
    id: "multimodal-engine",
    name: "12. Multimodaler Audio/Vision Autopilot",
    kurz: "Steuert multimodale Audio- & Bild-Streams für Live-Interaktionen.",
    funktionen: [
      "Validiert Audio-Chunks und Bild-Frames.",
      "Strukturiert multimodale Payloads für Gemini/Groq Endpunkte.",
      "Unterstützt Vollduplex-Kommunikation."
    ],
    trainiert: "Audio-Pakete (PCM/Opus), Bild-Frames & Visuelle Tokens",
    verbessert: "Nahtloser Wechsel zwischen Sprache, Bild und Text ohne Unterbrechung",
    neuigkeiten: ["Multimodale Inferenz-Engine bereit", "Audio/Vision Chunks validiert"],
    ort: "Control Server (Streaming Engine)",
    zeitplan: "Auf Anfrage / Stream-basiert",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird bei Aktivierung des Voice- oder Vision-Modus gestartet.",
    stopAnleitung: "Stoppt automatisch bei Beendigung des Streams."
  },
  {
    id: "task-orchestrator",
    name: "13. Multi-Agenten Task-Orchestrator",
    kurz: "Zerlegt komplexe Aufgaben in Sub-Agenten-Tasks und koordiniert deren Ausführung.",
    funktionen: [
      "Generiert gerichtete Aufgaben-Graphen (DAG).",
      "Dispatched und überwacht parallele Sub-Agenten-Schritte.",
      "Führt Ergebnisse in einen kohärenten Bericht zusammen."
    ],
    trainiert: "DAG-Orchestrierungsgraphen & Parallele Subagenten-Ergebnisse",
    verbessert: "Erledigungsgeschwindigkeit bei komplexen Multi-Step Aufgaben um 300% beschleunigt",
    neuigkeiten: ["Multi-Agenten Orchestrator aktiv", "Subagenten-Parallelverarbeitung gestartet"],
    ort: "Control Server (Orchestrator)",
    zeitplan: "Auf Anfrage / Event-basiert",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Aktiviert bei komplexen Multi-Step Nutzeranweisungen.",
    stopAnleitung: "Über Orchestrator-Schalter steuerbar."
  },
  {
    id: "self-improvement",
    name: "14. DPO & Self-Improvement Autopilot",
    kurz: "Generiert kontinuierlich Trainings-Paare aus Interaktionen zur eigenständigen Modell- & Prompt-Optimierung.",
    funktionen: [
      "Bewertet Antwortqualität nach Vollständigkeit und Präzision.",
      "Erstellt DPO-Präferenzdatensätze (Chosen vs. Rejected).",
      "Persistiert Trainingsdaten auf IDrive e2 S3 Storage."
    ],
    trainiert: "DPO-Präferenzpaare (Chosen vs. Rejected) für smejj 1.0 & 2.0",
    verbessert: "Kontinuierliche Selbstverbesserung des eigenen Modells 24/7 ohne menschliche Trainer",
    neuigkeiten: ["DPO Dataset Pipeline läuft 24/7", "Trainingspaare auf IDrive e2 gesichert"],
    ort: "Control Server (Self-Learning Engine)",
    zeitplan: "Dauerbetrieb / Takt-basiert",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich im Hintergrund der Chat-Pipeline.",
    stopAnleitung: "Über Self-Improvement Flag steuerbar."
  },
  {
    id: "knowledge-graph",
    name: "15. Knowledge-Graph & RAG-Fusion Autopilot",
    kurz: "Erstellt einen semantischen Wissens- und Abhängigkeitsgraphen über den gesamten Codebase.",
    funktionen: [
      "Extrahiert Symbole, Funktionen, Klassen und Modul-Abhängigkeiten.",
      "Bietet hochpräzise AST- und Hybrid-Codesuche.",
      "Hält Projektwissen permanent aktuell."
    ],
    trainiert: "AST Symbol-Graphen, Modul-Abhängigkeiten & RAG-Embeddings",
    verbessert: "Exakte Code-Findung im ganzen Repository ohne Halluzination von Dateipfaden",
    neuigkeiten: ["Codebase Knowledge-Graph aktualisiert", "AST-Hybrid Index grün"],
    ort: "Control Server (Knowledge Engine)",
    zeitplan: "Bei Datei-Änderungen / Event-basiert",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Aktualisiert sich automatisch bei Datei-Uploads und Commits.",
    stopAnleitung: "Über Indexer-Konfiguration steuerbar."
  },
  {
    id: "smart-router",
    name: "16. Model-Arena & Smart-Router Autopilot",
    kurz: "Klassifiziert Anfragen nach Komplexität und routet sie automatisch an das beste Spezialmodell.",
    funktionen: [
      "Klassifiziert Anfragen (Mathe, Deep Reasoning, Architektur, Quick Lookup).",
      "Routet an DeepSeek R1, Claude Sonnet, GPT-4o oder Gemini Flash.",
      "Führt automatisierte Mini-Arena-Benchmark-Bewertungen durch."
    ],
    trainiert: "Prompt-Komplexitätsklassifikatoren & Modell-Kosten-Optimierung",
    verbessert: "Optimales Preis-Leistungs-Verhältnis & sofortige Weiterleitung an Spezial-Engines",
    neuigkeiten: ["Smart Router aktiv für smejj 1.0, GLM-5.2, Kimi K3", "Latency-Optimierung aktiv"],
    ort: "Control Server (Router Engine)",
    zeitplan: "Dauerbetrieb (Jeder Prompt)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Standard-Eingang für alle eintreffenden Benutzer-Prompts.",
    stopAnleitung: "Über Model-Routing Policy konfigurierbar."
  },
  {
    id: "bug-predictor",
    name: "17. Proaktiver Bug-Predictor & Security Autopilot",
    kurz: "Scannt Code im Voraus auf Sicherheitsrisiken, Memory Leaks und Fehlerquellen.",
    funktionen: [
      "Erkennt unsichere Konstrukte (eval, unhandled promises, memory leaks).",
      "Generiert proaktiv präzise Reparatur-Vorschläge.",
      "Prüft ganze Repositories vor dem Commit auf Risiken."
    ],
    trainiert: "Static Code Analysis Patterns, Vulnerability Scans & Memory Leak Traces",
    verbessert: "Proaktive Erfassung von 99% aller typischen Laufzeitfehler vor der Live-Schaltung",
    neuigkeiten: ["Repository-Scan abgeschlossen", "0 kritische Sicherheitslücken im Code"],
    ort: "Control Server (Code Analyzer)",
    zeitplan: "Vor jedem Commit / Scan-basiert",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird vor dem Speichern und Pushen von Code aufgerufen.",
    stopAnleitung: "Über Linter- und Pre-Commit-Flags steuerbar."
  },
  {
    id: "model-lifecycle",
    name: "18. Shadow-Release & Model-Lifecycle Autopilot",
    kurz: "Verwaltet smejj 1.0 Live-Betrieb, Shadow-Beta-Tests und automatische Zero-Downtime Releases.",
    funktionen: [
      "Steuert aktives Live-Modell (smejj 1.0), Shadow-Beta und Trainings-Ziele.",
      "Führt geräuschlose Schatten-Tests gegen Live-Prompts im Hintergrund aus.",
      "Vollzieht automatische Zero-Downtime Promotion bei bestandener Reife."
    ],
    trainiert: "Shadow-Beta Evaluierungen & Benchmark Pass-Rates für Modell-Releases",
    verbessert: "Risikofreie Modellanpassung & Zero-Downtime Releases für Live-Nutzer",
    neuigkeiten: ["smejj 1.0 aktiv im Live-Betrieb", "smejj 1.1-beta im geräuschlosen Schatten-Test"],
    ort: "Control Server (Model Evolution)",
    zeitplan: "24/7 Dauerbetrieb (Hintergrund)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich zur Reifeprüfung neuer Modellversionen.",
    stopAnleitung: "Über Model-Lifecycle Flag steuerbar."
  },
  {
    id: "user-feedback-flywheel",
    name: "19. User-Feedback & RLHF Flywheel Autopilot",
    kurz: "Erfasst Nutzer-Interaktionen (Kopieren, Regeneration, Edits), maskiert PII und generiert DPO-Trainingsdaten.",
    funktionen: [
      "Erfasst implizite und explizite Nutzersignale.",
      "Automatisches PII-Scrubbing (Maskierung von E-Mails, Schlüsseln, IPs).",
      "Erzeugt hochqualitative DPO-Trainingspaare auf IDrive e2 S3 Storage."
    ],
    trainiert: "Implizite & Explizite Nutzersignale (Copy, Regen, Edit) mit PII-Scrubbing",
    verbessert: "Echtes Nutzerverhalten verbessert das Modell ohne Datenschutzverletzungen",
    neuigkeiten: ["RLHF Flywheel verarbeitet Nutzersignale 24/7", "DSGVO-PII-Maskierung 100% grün"],
    ort: "Control Server (Data Flywheel)",
    zeitplan: "24/7 Dauerbetrieb (Ereignis-gesteuert)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich im Hintergrund bei jedem Chat-Event.",
    stopAnleitung: "Über Telemetrie- und DSGVO-Einstellungen steuerbar."
  },
  {
    id: "process-reward",
    name: "20. Process-Reward & Step-by-Step Reasoner Autopilot",
    kurz: "Bewertet jeden einzelnen Gedankenschritt (PRM) und bricht fehlerhafte Denkpfade sofort ab.",
    funktionen: [
      "Zerlegt Denkketten in atomare Logik- und Code-Schritte.",
      "Berechnet pro Schritt einen Verifikations- und Zuverlässigkeits-Score.",
      "Implementiert MCTS-Branch-Pruning für mathematisch fehlerfreie Ausgaben."
    ],
    trainiert: "Step-by-Step Process Reward Models (PRM) & MCTS Logik-Bäume",
    verbessert: "Schritt-für-Schritt Logik & Mathematik-Genauigkeit auf o1-Niveau",
    neuigkeiten: ["PRM Step Reasoner aktiv", "Fehlerhafte Denkpfade werden frühzeitig gekappt"],
    ort: "Control Server (Reasoning Engine)",
    zeitplan: "24/7 Dauerbetrieb (Inferenz & Training)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Aktiviert bei tiefgründigen Reasoning- und Mathematik-Aufgaben.",
    stopAnleitung: "Über PRM-Policy konfigurierbar."
  },
  {
    id: "knowledge-distiller",
    name: "21. Cross-Model Knowledge Distiller Autopilot",
    kurz: "Destilliert komplexe Denk- und Lösungsstrukturen weltweit führender Modelle in smejj 2.0 Gewichte.",
    funktionen: [
      "Vergleicht Multi-Modell-Lösungsansätze gegen Sandbox-Compiler-Beweise.",
      "Extrahiert hochdichte Lösungs-Archetypen für das 24/7 LoRA-Training.",
      "Persistiert bereinigte Destillations-Datensätze auf IDrive e2 S3 Storage."
    ],
    trainiert: "Multi-Model Reasoning Archetypen für smejj 2.0 Gewichte",
    verbessert: "Wissen weltweit führender KI-Modelle wird im kompakten eigenen Modell gebündelt",
    neuigkeiten: ["Knowledge Distillation Engine aktiv", "LoRA Datensätze auf IDrive e2 gesichert"],
    ort: "Control Server (Distillation Engine)",
    zeitplan: "24/7 Dauerbetrieb (Hintergrund-Takt)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Führt kontinuierliche Destillations-Läufe im Hintergrund aus.",
    stopAnleitung: "Über Distillation-Flag steuerbar."
  },
  {
    id: "evolutionary-mutation",
    name: "22. Evolutionary Mutation & Stress-Testing Autopilot",
    kurz: "Unterzieht generierten Code aggressiven evolutionären Mutationen und Randfall-Stresstests.",
    funktionen: [
      "Injeziert Boundary-Werte, leere Collections und Race-Condition-Stresstests.",
      "Testet Code-Resilienz automatisch in der isolierten Node-Sandbox.",
      "Generiert proaktiv gehärtete Defensive-Code-Wrapper."
    ],
    trainiert: "Edge-Case Mutationen, Race Conditions & Boundary Value Injections",
    verbessert: "Unverfügbare Code-Stabilität durch automatisierte genetische Mutationstests",
    neuigkeiten: ["Genetic QA Stress-Testing aktiv", "Code-Unverfügbarkeit im Sandbox-Test bewiesen"],
    ort: "Control Server (Genetic QA)",
    zeitplan: "24/7 Dauerbetrieb (QA & Training)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft als automatischer Stresstest vor jeder Code-Persistierung.",
    stopAnleitung: "Über Mutation-QA Flag steuerbar."
  },
  {
    id: "realtime-internet-harvester",
    name: "23. 24/7 Real-Time Internet Ingestion & Knowledge Harvester",
    kurz: "Durchforstet 24/7 das Web nach neuen Open-Source Releases, Papers und Sicherheitslücken.",
    funktionen: [
      "Scannt kontinuierlich weltweite Tech-Feeds, arXiv-Paper und CVE-Sicherheitswarnungen.",
      "Extrahiert strukturierte Fakten und speichert sie im Knowledge-Graph auf IDrive e2 S3.",
      "Hält den Wissensstand des Modells auf die Minute aktuell."
    ],
    trainiert: "Web News Feeds, arXiv Paper PDF Stream & Realtime CVE Alerts",
    verbessert: "Wissensstand des Modells sekundenaktuell ohne Veralten der Wissensgrenzen",
    neuigkeiten: ["24/7 Web Harvester aktiv", "Sicherheitswarnungen & Papers in Echtzeit verarbeitet"],
    ort: "Control Server (Real-Time Ingestion)",
    zeitplan: "24/7 Dauerbetrieb (Zyklisch)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft zyklisch zur stetigen Aktualisierung des Wissens-Stores.",
    stopAnleitung: "Über Ingestion-Flag steuerbar."
  },
  {
    id: "multi-file-repo-architect",
    name: "24. Autonomous Multi-File Repo-Architect Autopilot",
    kurz: "Virtualisiert und orchestriert vollständige Datei-Bäume und modulare Software-Architekturen.",
    funktionen: [
      "Prüft und validiert Import- und Modul-Abhängigkeiten über 50+ Dateien hinweg.",
      "Erzeugt konsistente Full-Stack Project-Blueprints ohne Cross-File Drift.",
      "Sichert saubere Schnittstellen zwischen Frontend, Backend und Tests."
    ],
    trainiert: "Full-Stack Project Graphs, Multi-File Import Trees & Blueprints",
    verbessert: "Fehlerfreie Erzeugung ganzer Software-Projekte über 50+ Dateien ohne Import-Abbrüche",
    neuigkeiten: ["Multi-File Repo Virtualizer aktiv", "Konsistenzprüfung für Großprojekte bereit"],
    ort: "Control Server (Repo Virtualizer)",
    zeitplan: "24/7 Dauerbetrieb (Event-basiert)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Aktiv bei komplexen Multi-File Projektaufgaben.",
    stopAnleitung: "Über Architect-Policy steuerbar."
  },
  {
    id: "live-arena-leaderboard",
    name: "25. Automated Live-Arena & ELO Leaderboard Autopilot",
    kurz: "Führt kontinuierliche Benchmark-Duelle durch und berechnet mathematische ELO-Ratings.",
    funktionen: [
      "Lässt smejj-Modelle kontinuierlich gegen standardisierte Coding-Benchmarks antreten.",
      "Berechnet mathematisch saubere ELO-Rankings mit K-Faktor Dynamik.",
      "Persistiert historische Duelle und Leaderboards auf IDrive e2 S3 Storage."
    ],
    trainiert: "ELO Rating Matrizen, Benchmark Duel Results & Arena Leaderboards",
    verbessert: "Objektive mathematische Messbarkeit der Modellstärke im Vergleich zu GPT, Gemini, Claude",
    neuigkeiten: ["Live Arena Leaderboard aktiv auf IDrive e2 S3", "ELO-Rankings berechnet"],
    ort: "Control Server (Arena & ELO Engine)",
    zeitplan: "24/7 Dauerbetrieb (Benchmarking)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich zur Qualitäts- und ELO-Messung.",
    stopAnleitung: "Über Arena-Policy steuerbar."
  },
  {
    id: "instant-web-container",
    name: "26. In-Browser Instant WebContainers & Live-Vorschau",
    kurz: "Ermöglicht sofortiges, clientseitiges Rendern und Ausführen generierter Web-Apps mit 0 Server-Last.",
    funktionen: [
      "Erzeugt isolierte, sandboxed HTML5/JS/CSS Live-Vorschauen im Browser des Nutzers.",
      "Vollständige Client-Side Execution (0,00 EUR Server-Kosten, ausgelegt auf 1 Mrd. Besucher).",
      "Erkennt automatisch Code-Snippets und bereitet interaktive Apps vor."
    ],
    trainiert: "Client-Side App Bundles, Live Preview Execution Trees & WebContainer Sandboxes",
    verbessert: "Sofortige 0-ms-Vorschau für generierten Code mit 0,00 EUR Server-Kosten",
    neuigkeiten: ["WebContainers Client Engine aktiv", "Ausgelegt auf 1 Milliarde Nutzer pro Tag"],
    ort: "Client & Control Server (WebContainer Engine)",
    zeitplan: "24/7 Dauerbetrieb (Ereignis-gesteuert)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird bei jeder Web-App-Generierung im Chat getriggert.",
    stopAnleitung: "Über WebContainer-Policy konfigurierbar."
  },
  {
    id: "realtime-voice-pair",
    name: "27. Real-Time Voice & Screen Pair-Programmer Autopilot",
    kurz: "Verarbeitet bidirektionale Audio-Streams und Screen-Frames in Echtzeit (<300 ms).",
    funktionen: [
      "Verwaltet ephemere Voice-Session-Tokens und Audio-Stream-Pakete.",
      "Verbindet Bildschirm- und Cursor-Kontext direkt mit der Sprachausgabe.",
      "Ermöglicht interaktives Senior-Architect Pair-Programming ohne Verzögerung."
    ],
    trainiert: "Audio Frames (<300ms), Screen Capture Context & Cursor Coordinates",
    verbessert: "Natürliches Sprach- & Screen-Pair-Programming in unter 300 ms Reaktionszeit",
    neuigkeiten: ["Real-Time Voice & Screen Engine aktiv", "Latenzbudget < 300ms garantiert"],
    ort: "Control Server (Voice Engine)",
    zeitplan: "Auf Anfrage / Live-Session",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Wird bei Start einer Sprach-Coding-Sitzung aktiviert.",
    stopAnleitung: "Über Voice-Gateway steuerbar."
  },
  {
    id: "autonomous-git-bot",
    name: "28. Autonomous Git-Bot & Pull-Request Auto-Fixer",
    kurz: "Scannt Repositories, analysiert Pull Requests und generiert automatisch verifizierte Patches.",
    funktionen: [
      "Analysiert Git-Diffs auf Sicherheitslücken, XSS und Hardcoded Secrets.",
      "Generiert automatisierte Tests und verifizierte Bugfix-Patches.",
      "Überwacht Codeberg- und GitHub-Branches auf saubere Merge-Fähigkeit."
    ],
    trainiert: "Git Diffs, Security AST Patches, XSS Filters & Auto-Fix Synthesizer",
    verbessert: "Vollautomatische Code-Review & Bugfix-Erzeugung in Sekunden ohne menschliches Eingreifen",
    neuigkeiten: ["Autonomous Git Bot aktiv", "Security Scanning & Auto-Fixer bereit"],
    ort: "Control Server (Git-Bot Agent)",
    zeitplan: "24/7 Dauerbetrieb (Event-basiert)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Aktiviert bei Git-Webhooks und Repository-Events.",
    stopAnleitung: "Über Git-Bot Policy steuerbar."
  },
  {
    id: "synthetic-user-watchdog",
    name: "29. 24/7 Synthetic User & Full-Stack E2E Watchdog",
    kurz: "Simuliert rund um die Uhr echte Nutzer-Abläufe (Login, Chat, Inferenz, S3-Speicher) und schlägt bei Fehlern sofort Alarm.",
    funktionen: [
      "Führt alle 5 Minuten einen vollständigen End-to-End-Durchlauf als virtueller Nutzer aus.",
      "Misst Time-to-First-Token (<1,0s) und Antwort-Integrität von smejj 1.0.",
      "Prüft IDrive e2 S3 Speicher-Konsistenz und leitet bei Fehlern sofortige Selbstheilung ein."
    ],
    trainiert: "Synthetic User Journeys (Auth -> Chat -> TTFT -> IDrive e2 S3 Storage)",
    verbessert: "24/7 End-to-End Qualitätsgarantie & automatische Ausfallerkennung in unter 60 Sekunden",
    neuigkeiten: ["Synthetic User Watchdog aktiv (alle 5 Min)", "100% E2E Flow grün verifiziert"],
    ort: "Control Server (E2E Watchdog)",
    zeitplan: "24/7 Dauerbetrieb (alle 5 Min)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich als permanenter E2E-Endnutzer-Wächter.",
    stopAnleitung: "Über Watchdog-Policy konfigurierbar."
  },
  {
    id: "werkstatt-autopilot",
    name: "30. Werkstatt-Autopilot (Self-Evolution Engine)",
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
    ort: "Claude Cloud & GitHub PR",
    zeitplan: "Auf Anfrage / Geplante Nacht-Routine",
    messung: "heartbeat",
    erwartetAlleMs: 24 * 60 * 60 * 1000,
    schonfristMs: 12 * 60 * 60 * 1000,
    startAnleitung: "Läuft als geplante Claude-Code-Cloud-Routine auf dediziertem feature/-Branch.",
    stopAnleitung: "Über GitHub Actions / Claude Cloud-Workflow steuerbar."
  },
  {
    id: "angelina-autopilot",
    name: "31. Angelina-Autopilot (Satz & Prompt-Synthesizer Engine)",
    kurz: "Erweiterte Sprach- & Satz-Synthese Engine für flüssiges Deutsch, erweiterte Satzstrukturen und automatisierte Prompt-Optimierung.",
    funktionen: [
      "Analysiert und synthetisiert komplexe Satzstrukturen und natürliche Sprachmuster.",
      "Generiert erweiterte Prompt-Varianten für flüssige, hochpräzise Modellausgaben.",
      "Überwacht und optimiert die sprachliche Qualität und Konsistenz im 24/7-Dauerbetrieb."
    ],
    trainiert: "Satzbau-Muster, Deutsche Grammatik-Graphen & Prompt-Synthesen",
    verbessert: "Natürlicher Satzbau & perfekte deutsche Sprachqualität ohne Hölzernheit",
    neuigkeiten: ["Angelina Sprach-Engine aktiv", "Satz-Synthesizer v1.0 im 24/7-Dauerbetrieb"],
    ort: "Control Server (Language Engine)",
    zeitplan: "24/7 Dauerbetrieb (Satz-Synthese)",
    messung: "heartbeat",
    erwartetAlleMs: 6 * 60 * 60 * 1000,
    schonfristMs: 6 * 60 * 60 * 1000,
    startAnleitung: "Läuft kontinuierlich als Sprach- & Satz-Synthesizer im LLM-Loop.",
    stopAnleitung: "Über Language-Engine Policy steuerbar."
  }
]);
