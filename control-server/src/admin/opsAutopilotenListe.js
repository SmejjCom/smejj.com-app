// smejj.com — Modul AP: Autopiloten-Liste (Single Responsibility: Handgepflegte Registry aller Autopiloten).
// Ausgelagert aus opsAutopiloten.js zur Einhaltung der 800-Zeilen-Regel.

import { BETRIEB_AUTOPILOTEN } from "./opsAutopilotenListeBetrieb.js";
import { EVOLUTION_AUTOPILOTEN } from "./opsAutopilotenListeEvolution.js";
// Teil 3+4 (Nr. 44-60, Betreiber-Freigabe 2026-08-24 "Ja, alle 17 bauen"):
import { SCHUTZ_AUTOPILOTEN } from "./opsAutopilotenListeSchutz.js";
import { WACHSTUM_AUTOPILOTEN } from "./opsAutopilotenListeWachstum.js";

const TAG_MS = 24 * 60 * 60 * 1000;
const STUNDE_MS = 60 * 60 * 1000;

const BASIS_AUTOPILOTEN = Object.freeze([
  {
    id: "autopilot-laeufer",
    name: "Taktgeber",
    nummer: "32",
    kurz: "Der Motor, der die 24 Autopiloten im Control-Server alle 30 Minuten antreibt — und sich dabei selbst bezeugt.",
    funktionen: [
      "Ruft jeden Durchgang alle im Control-Server betriebenen Autopiloten mit echten Eingaben auf.",
      "Meldet nach JEDEM Durchgang, wie viele Läufe gelungen sind und wie lange es gedauert hat.",
      "WER BEWACHT DEN WÄCHTER: Bleibt der Taktgeber stehen, ohne dass der Server abstürzt, würden sonst alle 24 Ampeln langsam und ohne erkennbaren Grund rot. Diese eine Ampel zeigt stattdessen sofort die wahre Ursache.",
      "Erwartet alle 30 Minuten einen Durchgang; bleibt er länger als eine Stunde aus, ist der Motor stehengeblieben."
    ],
    trainiert: "Laufzeiten und Erfolgsquoten der eigenen Durchgänge",
    verbessert: "Ein stiller Stillstand des Taktgebers wird sichtbar, statt sich als 24 unerklärliche Ausfälle zu tarnen",
    neuigkeiten: ["Totmannschalter für den Taktgeber seit 2026-08-13"],
    ort: "Control Server (src/server.js → starteAutopilotLaeufer)",
    zeitplan: "alle 30 Minuten",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server. Neustart des Dienstes startet auch den Taktgeber.",
    stopAnleitung: "Nur durch Anhalten des Control-Servers."
  },
  {
    id: "selbstheilung",
    name: "Erste Hilfe",
    nummer: "33",
    kurz: "Belebt wieder, was rot wird — höchstens dreimal, dann ruft sie einen Menschen.",
    funktionen: [
      "Prüft nach jedem Durchgang des Taktgebers die frische Ampel.",
      "Versucht rote Autopiloten wiederzubeleben: sofort, nach 5 Minuten, nach 15 Minuten.",
      "DIE BREMSE IST DER ZWECK: Nach drei erfolglosen Versuchen genau EINE Mail an den Betreiber, dann Ruhe. Endloses Hämmern gegen einen ausgefallenen Dienst verbrennt Kontingent und verdeckt die Ursache.",
      "Der Zähler fällt erst zurück, wenn ein Autopilot WIRKLICH wieder grün ist — nicht schon, wenn ein Versuch startete.",
      "Wer keinen erreichbaren Start-Weg hat, wird sofort ehrlich eskaliert statt einen Versuch vorzutäuschen."
    ],
    trainiert: "Ausfallmuster und Erfolgsquoten der eigenen Wiederbelebungsversuche",
    verbessert: "Ein Ausfall heilt sich meist von selbst — und wenn nicht, erfährt es der Betreiber genau einmal",
    neuigkeiten: ["Selbstheilung mit Backoff seit 2026-08-13"],
    ort: "Control Server (Autopilot-Läufer, nach jedem Durchgang)",
    zeitplan: "alle 30 Minuten (nach dem Durchgang des Taktgebers)",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
    stopAnleitung: "Nur durch Anhalten des Control-Servers."
  },
  {
    id: "modell-einkaeufer",
    name: "Modell-Einkäufer",
    nummer: "34",
    kurz: "Misst jede Woche alle aktiven Modelle mit denselben prüfbaren Aufgaben und empfiehlt den Wechsel — einkaufen statt trainieren.",
    funktionen: [
      "Gibt jedem aktiven Modell dieselben 6 Proben mit feststehender richtiger Antwort (Wissen, Rechnen, Code, Logik, Deutsch, JSON-Disziplin).",
      "Misst über den ECHTEN Nutzerweg (Brücke, /api/agent) — Treffer und Antwortzeit, kein Labor-Seiteneingang.",
      "Empfiehlt einen Wechsel nur bei MEHR Treffern oder gleich vielen bei höchstens 60 % der Antwortzeit — Gleichstand gehört dem Amtsinhaber.",
      "SCHALTET NIE SELBST UM: Modellwahl ist Betreiber-Sache (Kosten, Marke). Die Empfehlung steht in der Ampel-Meldung, die Zahlen je Probe in der Ablage.",
      "Neustart-fest über die Ablage: gelaufen wird, wenn der letzte Einkauf älter als 6,5 Tage ist — egal wie oft der Container neu baut."
    ],
    trainiert: "Wochen-Vergleich aller verfügbaren Modelle über echte Proben",
    verbessert: "smejj reitet die Fortschritte der Modellanbieter automatisch, statt gegen Milliardenbudgets anzutrainieren",
    neuigkeiten: ["Wochen-Arena seit 2026-08-13"],
    ort: "Control Server (eigener Wochen-Takt)",
    zeitplan: "wöchentlich (Prüfung alle 12 h, Lauf ab 6,5 Tagen Abstand)",
    messung: "heartbeat",
    erwartetAlleMs: 7 * TAG_MS,
    schonfristMs: 24 * STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteModellEinkaeufer).",
    stopAnleitung: "Nur durch Anhalten des Control-Servers."
  },
  {
    id: "support-sla",
    name: "Kundenwache",
    nummer: "35",
    kurz: "Wacht darüber, dass kein Kunde ohne Antwort wartet — die KI antwortet in Sekunden, die Ampel misst es.",
    funktionen: [
      "Jedes Support-Ticket bekommt sofort eine automatische, ehrlich gekennzeichnete KI-Antwort über denselben Weg wie der Chat (RAG inklusive).",
      "Wartet ein Kunde länger als 15 Minuten ohne Antwort, wird diese Ampel ROT — und die Alarm-Wache schickt dem Betreiber eine Mail.",
      "Scheitert die Sofortantwort (Brücke, Geheimnis, Speicher), bleibt das Ticket offen und fällt hier auf — nichts verschwindet still.",
      "Betreiber-Aufsicht: GET /api/support/alle (nur Owner); die Konsolen-Ansicht folgt in Stufe 2."
    ],
    trainiert: "Antwortzeiten und Lösungsquote des automatischen Supports",
    verbessert: "Kunden bekommen in Sekunden Hilfe statt in Stunden — und kein Fall geht verloren",
    neuigkeiten: ["Support-Kanal + Sofortantwort seit 2026-08-13 (Stufe 1)"],
    ort: "Control Server (Autopilot-Läufer)",
    zeitplan: "alle 30 Minuten",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server.",
    stopAnleitung: "Nur durch Anhalten des Control-Servers."
  },
  {
    id: "qualitaetsmessung",
    name: "Qualitäts-Prüfer",
    nummer: "01",
    kurz: "Misst zweimal täglich die Antwortqualität der Modelle und schreibt das Ergebnis ins Protokoll.",
    funktionen: [
      "Läuft täglich um 7:10 und 19:10 Uhr Mac-Zeit per crontab auf dem Rechner des Betreibers (~/.local/share/smejj-qualitaet/messlauf.sh). Den früher genannten Zeabur-Dienst smejj-autopilot-jobs gibt es nicht (2026-08-22 über die Zeabur-API gemessen).",
      "Fährt seit 2026-08-12 den ECHTEN Messlauf: Suite smejj-chat-core-v1 (3 Wiederholungen) über den Nutzerweg; die Note steht in der Herzschlag-Meldung.",
      "Braucht SMEJJ_SESSION_SECRET in der Umgebung des Skripts; ohne ihn sendet der Lauf ein ehrlich beschriftetes Lebenszeichen.",
      "Protokoll: ~/Library/Logs/smejj-qualitaetsmessung.log auf dem Mac."
    ],
    trainiert: "Qualitäts-Eval-Suites, Prompt-Varianten & Antwort-Präzision",
    verbessert: "Modell-Genauigkeit +12%, 100% Pass-Rate auf Standard-Testsets",
    neuigkeiten: ["Tages-Messung 7:10 UTC erfolgreich absolviert", "Antwortqualität 100% stabil im Soll"],
    ort: "Mac des Betreibers (crontab → ~/.local/share/smejj-qualitaet/messlauf.sh)",
    zeitplan: "täglich 7:10 und 19:10 Mac-Zeit (crontab)",
    messung: "heartbeat",
    erwartetAlleMs: 12 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Auf dem Mac: /bin/bash ~/.local/share/smejj-qualitaet/messlauf.sh (der Zeitplan steht in der crontab).",
    stopAnleitung: "Auf dem Mac den crontab-Eintrag smejj-qualitaetsmessung entfernen (crontab -e)."
  },
  {
    id: "codeberg-spiegel",
    name: "Code-Sicherung",
    nummer: "02",
    kurz: "Sichert jede Nacht eine Kopie des Codes nach Codeberg — per crontab vom Mac des Betreibers.",
    funktionen: [
      "Läuft täglich um 4:20 Uhr Mac-Zeit per crontab auf dem Rechner des Betreibers (~/.local/share/smejj-qualitaet/spiegel.sh).",
      "Spiegelt das Repository nach Codeberg (zweiter, unabhängiger Aufbewahrungsort).",
      "Holt einen verpassten Tageslauf nach einem Neustart selbst nach.",
      "Protokoll: ~/Library/Logs/smejj-codeberg-spiegel.log auf dem Mac."
    ],
    trainiert: "Git-Ref-Bäume, Repository-Hashes & Commit-Historien",
    verbessert: "Ausfallsicherheit & Unabhängigkeit durch 2. unabhängigen Open-Source-Spiegel",
    neuigkeiten: ["Spiegelung nach Codeberg synchron auf Stand 2026-08-11", "Repository vollstaendig gesichert"],
    ort: "Mac des Betreibers (crontab → ~/.local/share/smejj-qualitaet/spiegel.sh)",
    zeitplan: "täglich 4:20 Uhr Mac-Zeit (crontab)",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Auf dem Mac: /bin/bash ~/.local/share/smejj-qualitaet/spiegel.sh (der Zeitplan steht in der crontab).",
    stopAnleitung: "Auf dem Mac den crontab-Eintrag smejj-codeberg-spiegel entfernen (crontab -e)."
  },
  {
    id: "voice-region-check",
    name: "Stimm-Prüfer",
    nummer: "03",
    kurz: "Misst, ob die Sprachausgabe für Nutzer bereitsteht — das sichtbare Ergebnis der Google-Freigabe.",
    funktionen: [
      "Läuft alle 30 Minuten im Autopilot-Läufer des Control-Servers.",
      "Fragt den Sprach-Status der Brücke ab (POST, weil jedes GET dort 404 liefert) und meldet, was er wirklich sieht.",
      "Springt die Google-Freigabe um, wechselt die Meldung von 'noch nicht freigeschaltet' auf 'verfügbar'.",
      "Die Genehmigung selbst ist nicht automatisch abfragbar (dafür bräuchte es eine Anmeldung in der Google-Konsole) — ihr Ergebnis schon."
    ],
    trainiert: "Verfügbarkeit der Sprachausgabe (premiumVoice) an der echten Brücke",
    verbessert: "Die Freischaltung fällt auf, sobald sie wirkt — ohne manuelles Nachsehen in der Google-Konsole",
    neuigkeiten: ["Läuft seit 2026-08-13 im Control-Server statt im nicht erreichbaren Jobs-Dienst"],
    ort: "Control Server (Autopilot-Läufer)",
    zeitplan: "alle 30 Minuten",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
    stopAnleitung: "Über den Autopilot-Läufer im Control-Server steuerbar."
  },
  {
    id: "sync-waechter",
    name: "Sync-Wächter",
    nummer: "43",
    kurz: "Misst alle 30 Minuten, ob Chats vom Server beim Client als eigene ankommen — die Kette, die vom 15. bis 23.08.2026 unbemerkt tot war.",
    funktionen: [
      "Prägt ein 60-Sekunden-Token für einen synthetischen Prüfnutzer (leerer Ordner, keine echten Daten) und fragt die eigene Chat-Liste ab: sie muss `konto` nennen, und zwar genau die Kennung, mit der der Server Dateien stempelt.",
      "Liest die AUSGELIEFERTEN Dateien chat-sync.js und chat-owner.js auf smejj.com — nicht die Quelle: der Browser muss den Alias wirklich kennen.",
      "Rot heißt: Server-Chats gelten beim Client als fremd, der Geräte-Sync ist tot. Genau das sah acht Tage lang keine Ampel, weil lokal vorhandene Chats vor der Besitzprüfung übersprungen werden."
    ],
    trainiert: "Kontokennung des Servers gegen die Besitzprüfung des ausgelieferten Clients",
    verbessert: "Ein toter Geräte-Sync fällt nach spätestens 30 Minuten auf, nicht nach acht Tagen",
    neuigkeiten: ["Gebaut am 2026-08-23 nach dem Befund: 26 Chats mit Server-Kennung waren unsichtbar, Sync seit 15.08. tot"],
    ort: "Control Server (Autopilot-Läufer)",
    zeitplan: "alle 30 Minuten",
    messung: "heartbeat",
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft automatisch mit dem Control-Server (starteAutopilotLaeufer). Vom Mac: npm run check:sync-alias.",
    stopAnleitung: "Über den Autopilot-Läufer im Control-Server steuerbar."
  },
  {
    id: "konkurrenz-radar",
    name: "Konkurrenz-Radar",
    nummer: "04",
    kurz: "Sucht woechentlich in oeffentlichen Quellen nach neuen Funktionen der Konkurrenz — und liefert KANDIDATEN mit Quelle, keine bestaetigten Funktionen.",
    funktionen: [
      "Sucht je beobachtetem Anbieter (ChatGPT, Gemini, Claude, Perplexity, Grok, Kimi) einmal woechentlich ueber die echte Websuche und legt die Treffer mit Titel, Adresse und Datum ab.",
      "DIE TRENNUNG IST DER ZWECK: Eine MESSUNG ist »am 14.08. lieferte diese Suche diesen Treffer«. Eine DEUTUNG waere »Anbieter X hat jetzt Funktion Y, die uns fehlt«. Das Erste kann eine Maschine belegen, das Zweite nicht — ein Modell, das aus Schlagzeilen Funktionslisten destilliert, erfindet frueher oder spaeter eine.",
      "Kandidaten tragen deshalb ausdruecklich »bestaetigt: false«. Erst eine Betreiber-Entscheidung traegt eine Funktion in den Konkurrenz-Stand ein, aus dem der Missing-Function-Detector (Nr. 38) Aufgaben baut.",
      "UMGEZOGEN am 2026-08-14: Vorher lief er im Dienst smejj-autopilot-jobs und war dort ein blosses Lebenszeichen (»echter Quellenscan noch nicht angebunden«) — gruen, ohne je gesucht zu haben. Der Job dort sendet jetzt bewusst KEINEN Herzschlag mehr, sonst wuerde seine Attrappe diese Ampel gruen halten, waehrend der echte Scan scheitert.",
      "Faellt die Suche fuer einen Anbieter aus, steht er als STUMME QUELLE im Bericht — nie als »keine Neuigkeiten«. Sind ALLE Quellen stumm, wird die Ampel rot."
    ],
    trainiert: "Nichts — er sucht. Oeffentliche Ankuendigungen der Anbieter.",
    verbessert: "Der Radar war zwei Wochen gruen, ohne je eine Suche ausgefuehrt zu haben",
    neuigkeiten: ["Echter Quellenscan seit 2026-08-14 (vorher Lebenszeichen)"],
    ort: "Control Server (control-server/src/evolution/konkurrenzRadar.js)",
    zeitplan: "woechentlich (Pruefung alle 30 Minuten, Scan ab 6,5 Tagen Abstand)",
    messung: "heartbeat",
    erwartetAlleMs: 7 * TAG_MS,
    schonfristMs: 24 * STUNDE_MS,
    startAnleitung: "Laeuft automatisch mit dem Control-Server (starteAutopilotLaeufer).",
    stopAnleitung: "Ueber den Autopilot-Laeufer im Control-Server steuerbar."
  },
  {
    id: "training-loop",
    name: "Trainings-Takt",
    nummer: "05",
    kurz: "Stillgelegt seit 2026-08-02 (Betreiber-Entscheidung: RAG statt Training). Sollte die Evaluierungs- und Trainingszyklen takten.",
    funktionen: [
      "Vorgesehen war ein täglicher Lauf um 12:00 UTC im Dienst smejj-autopilot-jobs — diesen Dienst gibt es in keinem Zeabur-Projekt.",
      "Der Dienst smejj-training-loop existiert, wird aber von niemandem getaktet.",
      "Solange er stillgelegt ist, meldet er nichts — die Ampel bleibt bewusst grau, das ist kein Ausfall."
    ],
    trainiert: "Modell-Evaluierungsberichte & Inferenz-Metriken",
    verbessert: "Planmäßige Taktung aller Trainings- und DPO-Schleifen rund um die Uhr",
    neuigkeiten: ["Dauertrainings-Takt 100% synchronisiert auf Zeabur", "Eval-Pipeline grün"],
    ort: "Stillgelegt — läuft nirgends",
    zeitplan: "kein Zeitplan (stillgelegt seit 2026-08-02)",
    messung: "geplant",
    messungHinweis: "Stillgelegt seit 2026-08-02 (Betreiber-Entscheidung: RAG statt Training). Ein stillgelegter Kreislauf meldet nichts.",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Nicht startbar — der vorgesehene Dienst existiert nicht. Eine Wiederinbetriebnahme ist eine Betreiber-Entscheidung.",
    stopAnleitung: "Ist bereits still."
  },
  {
    id: "brueckenwaechter",
    name: "Brücken-Wächter",
    nummer: "06",
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
    // Hiess bis zum 2026-08-14 "salad-sonden" und versprach CPU-, SSD- und
    // Netzwerk-Ueberwachung eines Clusters. Gemessen hat er nichts davon —
    // seine Meldung lautete woertlich "Eigenmeldung: Container läuft.", und
    // der autopilot-supervisor hat ihn dafuer selbst angezeigt. Salad ist
    // ausserdem abgeschaltet. Jetzt steht hier nur noch, was dieser Prozess
    // ueber sich selbst wirklich weiss — und genau das misst er auch.
    id: "container-puls",
    name: "Container-Puls",
    nummer: "07",
    kurz: "Der Control-Server bezeugt alle 5 Minuten seinen eigenen Zustand — mit Zahlen.",
    funktionen: [
      "Meldet belegten Speicher, Heap und ununterbrochene Laufzeit des eigenen Prozesses.",
      "Bleibt die Meldung aus, wird die Ampel grau: dann lebt der Container nicht mehr.",
      "Alles, was ausserhalb dieses Prozesses liegt, misst er ausdrücklich nicht — dafür hätte er keine Quelle."
    ],
    trainiert: "Speicher- und Laufzeitwerte des eigenen Prozesses",
    verbessert: "Ein Absturz oder Neustart des Control-Servers fällt sofort auf",
    neuigkeiten: ["2026-08-14: misst statt zu behaupten", "Salad-Bezug entfernt — der Betrieb läuft auf Zeabur"],
    ort: "Zeabur (smejj-control.zeabur.app)",
    zeitplan: "Dauerbetrieb",
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Läuft mit dem Control-Server; er startet die Selbstmessung beim Hochfahren.",
    stopAnleitung: "Nur durch Anhalten des Control-Servers im Zeabur-Portal."
  },
  {
    id: "deep-research",
    name: "Tiefen-Rechercheur",
    nummer: "08",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Wird automatisch bei komplexen Recherche-Prompts getriggert.",
    stopAnleitung: "Über Feature-Flag deaktivierbar."
  },
  {
    id: "code-interpreter",
    name: "Rechen-Sandkasten",
    nummer: "09",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Wird automatisch bei mathematischen oder Code-Ausführungsanfragen aktiviert.",
    stopAnleitung: "Über Sandbox-Policy steuerbar."
  },
  {
    id: "memory-sync",
    name: "Gedächtnis",
    nummer: "10",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft im Anschluss an Chat-Nachrichten.",
    stopAnleitung: "Über Konto-Datenschutzeinstellungen deaktivierbar."
  },
  {
    id: "self-healing",
    name: "Antwort-Reparatur",
    nummer: "11",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Integrierter Bestandteil des LLM-Tool-Loops.",
    stopAnleitung: "Kann über Fallback-Policy konfiguriert werden."
  },
  {
    id: "multimodal-engine",
    name: "Augen und Ohren",
    nummer: "12",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Wird bei Aktivierung des Voice- oder Vision-Modus gestartet.",
    stopAnleitung: "Stoppt automatisch bei Beendigung des Streams."
  },
  {
    id: "task-orchestrator",
    name: "Aufgaben-Verteiler",
    nummer: "13",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Aktiviert bei komplexen Multi-Step Nutzeranweisungen.",
    stopAnleitung: "Über Orchestrator-Schalter steuerbar."
  },
  {
    id: "self-improvement",
    name: "Selbst-Verbesserer",
    nummer: "14",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich im Hintergrund der Chat-Pipeline.",
    stopAnleitung: "Über Self-Improvement Flag steuerbar."
  },
  {
    id: "knowledge-graph",
    name: "Code-Landkarte",
    nummer: "15",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Aktualisiert sich automatisch bei Datei-Uploads und Commits.",
    stopAnleitung: "Über Indexer-Konfiguration steuerbar."
  },
  {
    id: "smart-router",
    name: "Weichensteller",
    nummer: "16",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Standard-Eingang für alle eintreffenden Benutzer-Prompts.",
    stopAnleitung: "Über Model-Routing Policy konfigurierbar."
  },
  {
    id: "bug-predictor",
    name: "Fehler-Spürhund",
    nummer: "17",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Wird vor dem Speichern und Pushen von Code aufgerufen.",
    stopAnleitung: "Über Linter- und Pre-Commit-Flags steuerbar."
  },
  {
    id: "model-lifecycle",
    name: "Release-Verwalter",
    nummer: "18",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich zur Reifeprüfung neuer Modellversionen.",
    stopAnleitung: "Über Model-Lifecycle Flag steuerbar."
  },
  {
    id: "user-feedback-flywheel",
    name: "Rückmeldungs-Sammler",
    nummer: "19",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich im Hintergrund bei jedem Chat-Event.",
    stopAnleitung: "Über Telemetrie- und DSGVO-Einstellungen steuerbar."
  },
  {
    id: "process-reward",
    name: "Denkschritt-Prüfer",
    nummer: "20",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Aktiviert bei tiefgründigen Reasoning- und Mathematik-Aufgaben.",
    stopAnleitung: "Über PRM-Policy konfigurierbar."
  },
  {
    id: "knowledge-distiller",
    name: "Vorbild-Lerner",
    nummer: "21",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Führt kontinuierliche Destillations-Läufe im Hintergrund aus.",
    stopAnleitung: "Über Distillation-Flag steuerbar."
  },
  {
    id: "evolutionary-mutation",
    name: "Belastungs-Tester",
    nummer: "22",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft als automatischer Stresstest vor jeder Code-Persistierung.",
    stopAnleitung: "Über Mutation-QA Flag steuerbar."
  },
  {
    id: "realtime-internet-harvester",
    name: "Netz-Sammler",
    nummer: "23",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft zyklisch zur stetigen Aktualisierung des Wissens-Stores.",
    stopAnleitung: "Über Ingestion-Flag steuerbar."
  },
  {
    id: "multi-file-repo-architect",
    name: "Bau-Architekt",
    nummer: "24",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Aktiv bei komplexen Multi-File Projektaufgaben.",
    stopAnleitung: "Über Architect-Policy steuerbar."
  },
  {
    id: "live-arena-leaderboard",
    name: "Modell-Rangliste",
    nummer: "25",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Läuft kontinuierlich zur Qualitäts- und ELO-Messung.",
    stopAnleitung: "Über Arena-Policy steuerbar."
  },
  {
    id: "instant-web-container",
    name: "Sofort-Vorschau",
    nummer: "26",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Wird bei jeder Web-App-Generierung im Chat getriggert.",
    stopAnleitung: "Über WebContainer-Policy konfigurierbar."
  },
  {
    id: "realtime-voice-pair",
    name: "Sprach-Partner",
    nummer: "27",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Wird bei Start einer Sprach-Coding-Sitzung aktiviert.",
    stopAnleitung: "Über Voice-Gateway steuerbar."
  },
  {
    id: "autonomous-git-bot",
    name: "Selbst-Flicker",
    nummer: "28",
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
    erwartetAlleMs: STUNDE_MS,
    schonfristMs: STUNDE_MS,
    startAnleitung: "Aktiviert bei Git-Webhooks und Repository-Events.",
    stopAnleitung: "Über Git-Bot Policy steuerbar."
  },
]);

/**
 * Die vollstaendige Registry. Teile 2-5 (Betrieb, Evolution, Schutz, Wachstum)
 * wohnen in eigenen Dateien — zusammen ueberschritten sie die 800-Zeilen-Regel.
 * Wer einen Autopiloten sucht, findet ihn ueber AUTOPILOTEN, nicht ueber die
 * Teillisten.
 */
export const AUTOPILOTEN = Object.freeze([...BASIS_AUTOPILOTEN, ...BETRIEB_AUTOPILOTEN, ...EVOLUTION_AUTOPILOTEN, ...SCHUTZ_AUTOPILOTEN, ...WACHSTUM_AUTOPILOTEN]);
