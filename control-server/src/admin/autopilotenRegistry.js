// smejj.com — Autopiloten-Registry (ausgelagert aus opsAutopiloten.js, 2026-08-10).
//
// Die Registry ist bewusst HANDGEPFLEGT und im Code, nicht in einer Datenbank:
// die Liste der Automatiken aendert sich nur mit einem Deploy, und genau dann
// soll auch diese Liste im Review auffallen. Eine selbstregistrierende Liste
// wuerde vergessene Autopiloten unsichtbar machen — das Gegenteil ihres Zwecks.
//
// Ausgelagert, weil opsAutopiloten.js die 800-Zeilen-Regel riss (862): die
// Registry ist reiner Datenbestand, die Messlogik (Ampel, Herzschlaege,
// Vorfaelle, Alarm, Wochenbericht) bleibt drueben. Der Schnitt folgt der
// Selbstbeschreibung im Kopf der Datei: "Registry + Ampel" sind ZWEI Dinge.
//
// Wer hier eine Automatik eintraegt: erwartetAlleMs ist der Takt, schonfristMs
// die Toleranz obendrauf; ohne echten Herzschlag bleibt die Ampel GRAU.

export const TAG_MS = 24 * 60 * 60 * 1000;
export const STUNDE_MS = 60 * 60 * 1000;

// Was eine Automatik koennen muss, um hier zu stehen: einen Namen, einen Ort,
// einen Zeitplan — und eine ehrliche Aussage, ob sie schon Herzschlaege sendet.
export const AUTOPILOTEN = Object.freeze([
  {
    id: "qualitaetsmessung",
    name: "Qualitätsmessung",
    kurz: "Misst zweimal täglich die Antwortqualität der Modelle und schreibt das Ergebnis ins Protokoll.",
    funktionen: [
      "Läuft täglich um 7:10 und 19:10 Uhr auf dem Mac (cron).",
      "Führt den Messlauf gegen die Prüfsuite aus.",
      "Schreibt das Protokoll nach ~/Library/Logs/smejj-qualitaetsmessung.log."
    ],
    ort: "Mac (cron)",
    zeitplan: "täglich 7:10 und 19:10 Uhr",
    messung: "heartbeat",
    erwartetAlleMs: 12 * STUNDE_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Am Mac im Terminal ausführen: bash \"$HOME/.local/share/smejj-qualitaet/messlauf.sh\"",
    stopAnleitung: "Am Mac: crontab -e öffnen und die Zeile mit \"smejj-qualitaetsmessung\" mit einem # davor stilllegen."
  },
  {
    id: "codeberg-spiegel",
    name: "Codeberg-Spiegel",
    kurz: "Sichert jede Nacht um 4:20 Uhr eine Kopie des Codes nach Codeberg.",
    funktionen: [
      "Läuft täglich um 4:20 Uhr auf dem Mac (cron).",
      "Spiegelt das Repository nach Codeberg (zweiter, unabhängiger Aufbewahrungsort).",
      "Schreibt das Protokoll nach ~/Library/Logs/smejj-codeberg-spiegel.log."
    ],
    ort: "Mac (cron)",
    zeitplan: "täglich 4:20 Uhr",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "Am Mac im Terminal ausführen: bash \"$HOME/.local/share/smejj-qualitaet/spiegel.sh\"",
    stopAnleitung: "Am Mac: crontab -e öffnen und die Zeile mit \"smejj-codeberg-spiegel\" mit einem # davor stilllegen."
  },
  {
    id: "voice-region-check",
    name: "Voice-Region-Prüfung",
    kurz: "Prüft täglich, ob Google die Regionsänderung für die Voice-Freischaltung genehmigt hat.",
    funktionen: [
      "Läuft täglich um 9:04 Uhr als geplanter Claude-Task auf dem Mac.",
      "Prüft den Stand der Regionsänderung für 7alanbest@gmail.com.",
      "Meldet sich, sobald Google genehmigt hat."
    ],
    ort: "Mac (Claude-Task)",
    zeitplan: "täglich 9:04 Uhr",
    messung: "heartbeat",
    erwartetAlleMs: TAG_MS,
    schonfristMs: 6 * STUNDE_MS,
    startAnleitung: "In Claude Code sagen: »Führe den Task voice-region-daily-check jetzt aus.«",
    stopAnleitung: "In Claude Code sagen: »Schalte den Task voice-region-daily-check aus.«"
  },
  {
    id: "konkurrenz-radar",
    name: "Konkurrenz-Radar",
    kurz: "Durchsucht jeden Montag die öffentlichen Quellen der Konkurrenz nach neuen Funktionen und schlägt Verbesserungen vor.",
    funktionen: [
      "Läuft jeden Montag um 6:00 UTC als Cloud-Routine (ohne Repo-Zugriff).",
      "Prüft Release Notes und Tech-Presse von ChatGPT, Gemini, Kimi, Claude, Perplexity, Copilot und Grok.",
      "Erstellt nur bei echten Funden einen Bericht — jeder Vorschlag wartet auf deine Ja/Nein-Entscheidung.",
      "Baut nichts automatisch ein."
    ],
    ort: "Anthropic-Cloud",
    zeitplan: "montags 6:00 UTC",
    // Seit Stufe 2 (2026-08-07) meldet sich die Cloud-Routine am Ende jedes
    // Laufs selbst — auch ein "keine neuen Funde"-Lauf ist ein Erfolg.
    messung: "heartbeat",
    erwartetAlleMs: 7 * TAG_MS,
    schonfristMs: 12 * STUNDE_MS,
    startAnleitung: "Auf claude.ai/code/routines die Routine »Konkurrenz-Radar (woechentlich)« öffnen und einmalig starten.",
    stopAnleitung: "Auf claude.ai/code/routines die Routine »Konkurrenz-Radar (woechentlich)« ausschalten."
  },
  {
    id: "training-loop",
    name: "Training-Loop",
    kurz: "STILLGELEGT seit 2. August 2026. Der Dienst ist im Zeabur-Portal angehalten und läuft nicht — das Modelltraining wurde am 6. August endgültig eingestellt.",
    funktionen: [
      "Taktete früher rund um die Uhr die Eval- und Trainings-Zyklen.",
      "Am 2026-08-02 im Zeabur-Portal angehalten (Service is suspended); am 2026-08-07 dort nachgemessen.",
      "Bis dahin stand in den Projektnotizen weiter »läuft 24/7« — fünf Tage lang glaubte niemand etwas anderes.",
      "Ein Neustart würde wieder Modellaufrufe kosten und ist ohne Training zwecklos."
    ],
    ort: "Zeabur",
    zeitplan: "stillgelegt",
    // Ein angehaltener Dienst KANN keinen Herzschlag senden. Ihn auf Herzschlag
    // zu stellen hiesse, ihn dauerhaft rot zu faerben — Alarm fuer einen
    // gewollten Zustand. Grau mit klarer Begruendung ist die ehrliche Anzeige.
    messung: "keine",
    messungHinweis: "Stillgelegt — kein Alarm, sondern ein gewollter Zustand. Diese Zeile bleibt stehen, damit niemand den Dienst für laufend hält.",
    erwartetAlleMs: null,
    schonfristMs: null,
    startAnleitung: "Nur mit Absicht: Zeabur-Portal → Projekt »untitled« → smejj-training-loop → Restart. Kostet wieder Modellaufrufe.",
    stopAnleitung: "Bereits angehalten — nichts zu tun."
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
    // 5-Minuten-Takt, 10 Minuten erwartet, 20 Minuten Schonfrist: ein
    // verpasster Herzschlag ist noch kein Alarm, zwei schon.
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Zeabur-Portal → Projekt »untitled« → smejj-brueckenwaechter → Restart. Läuft ohne Modellkosten auf dem bereits bezahlten Server.",
    stopAnleitung: "Zeabur-Portal → smejj-brueckenwaechter → Suspend. Danach beobachtet niemand mehr, ob die Brücke lebt."
  },
  {
    id: "salad-sonden",
    name: "Salad-Sonden",
    kurz: "Gesundheitssonden am Salad-Container, die einen abgestürzten Dienst automatisch neu starten sollen.",
    funktionen: [
      "Salad prüft den Container in festen Abständen und startet ihn bei Ausfall neu.",
      "MERKREGEL aus der Messung: nur eine HTTP-Sonde auf /health fängt den 503-Ausfall — eine reine TCP-Sonde ist blind.",
      "Gemessen über die Eigenmeldung des Control-Servers alle 5 Minuten: lebt der Container, kommt die Meldung — bleibt sie aus, haben die Sonden ihren Dienst versagt."
    ],
    ort: "Salad",
    zeitplan: "Dauerbetrieb",
    // Eigenmeldung statt Fremdschluessel: der Server bezeugt sein eigenes
    // Leben. Faellt der Container, reisst die Meldekette ab — und genau dieses
    // Ausbleiben zeigt die Ampel nach der Schonfrist als Ausfall.
    messung: "heartbeat",
    erwartetAlleMs: 10 * 60 * 1000,
    schonfristMs: 20 * 60 * 1000,
    startAnleitung: "Im Salad-Portal am Container die Health Probes prüfen (HTTP auf /health, failure_threshold maximal 20).",
    stopAnleitung: "Im Salad-Portal die Health Probes entfernen — davon wird abgeraten, dann startet nichts mehr automatisch neu."
  }
]);
