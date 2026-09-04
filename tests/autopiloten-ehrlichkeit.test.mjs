// smejj.com — Waechter-Test fuer den Betreiber-Beschluss vom 2026-08-12:
// "Die Autopiloten-Ampel MISST, sie stempelt nicht."
// Zettel: docs/approvals/2026-08-12-ampel-ehrlich-messen.md
//
// WARUM ES DIESEN TEST GIBT: Die Ehrlichkeit wurde am 2026-08-12 hergestellt
// (bf1fdd7), live bewiesen (25 grau / 6 gruen / 0 rot) — und am selben Tag von
// einer parallelen Sitzung zurueckgedreht (92bbc9c, ae278f2, 8d0ac9a). Ein
// Beschluss, der nur in einem Dokument steht, haelt genau bis zur naechsten
// Sitzung, die es nicht liest. Dieser Test haelt ihn im Code fest: jeder der
// vier bekannten Stempel-Tricks scheitert ab jetzt in der Pruefsuite, nicht
// erst live in der Ampel.
//
// Ausfuehren: node --test tests/autopiloten-ehrlichkeit.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { heartbeatAnnehmen, _herzschlaegeZuruecksetzen } from "../control-server/src/admin/opsAutopiloten.js";
import { schluesselFuer } from "../workers/smejj-autopilot-jobs/spiegelJob.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => readFileSync(path.join(REPO, rel), "utf8");

/**
 * Quelltext OHNE Kommentare. Notwendig, weil die Module ihre eigene
 * Geschichte dokumentieren ("hier stand frueher 'Suite pass'") — ein Test,
 * der Kommentare mitliest, verbietet ausgerechnet die Erklaerung des Fehlers.
 */
const ohneKommentare = (quelle) => quelle
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((zeile) => !zeile.trim().startsWith("//"))
  .join("\n");

// Die EINZIGEN Autopiloten, die wirklich eine Messung angeschlossen haben.
// Wer diese Liste erweitert, muss auch die Messung mitliefern — genau das ist
// der Zweck: die Erweiterung faellt im Review auf, statt still zu passieren.
const MIT_ECHTER_MESSUNG = new Set([
  // --- Externe Dienste ---
  "qualitaetsmessung",   // echter Suite-Lauf, workers/smejj-autopilot-jobs/qualitaetJob.mjs
  "codeberg-spiegel",    // echter Git-Spiegel, spiegelJob.mjs
  "voice-region-check",  // Lebenszeichen des Dienstes, ehrlich beschriftet
  "sync-waechter",       // Nr. 43: eigene API mit Probe-Token + ausgelieferte Client-Dateien (2026-08-23)
  "konkurrenz-radar",    // Lebenszeichen des Dienstes, ehrlich beschriftet
  "brueckenwaechter",
  // Misst wirklich, und zwar die ausgelieferte Seite: 19 Ansichten x 8
  // Geraetegroessen auf Ueberlauf, jedes bedienbare Element bei 375 px gegen
  // das 44-px-Ziel, dazu die Betriebswerte des Control-Servers. Der Herzschlag
  // geht aus scripts/testing/oberflaechenwache-geplant.sh raus, mit derselben
  // Warteschlange wie Messlauf und Spiegel. Ohne hinterlegten Schluessel
  // meldet sie NICHTS und bleibt grau — das ist ehrlich, nicht getarnt.
  "oberflaechenwache",    // wird vom Control-Server abgefragt (frageWaechterAb)
  "web-vitals-wache",     // Nr. 63: echter Chrome-Lauf (measure_web_vitals.mjs) auf dem Mac, Herzschlag mit Zahlen
  "container-puls",      // Eigenmeldung des Control-Servers, seit 2026-08-14 MIT Zahlen
                         // (hiess bis dahin "salad-sonden" und meldete gruen ohne jede Messung)
  "nachweis-kette",      // echter Schreibversuch in den Adminspeicher (403 => rot)
  // --- Im Control-Server, betrieben vom Autopilot-Laeufer (alle 30 min) ---
  // Jeder bekommt eine Aufgabe mit feststehender Antwort und wird ROT, wenn
  // er sie falsch loest. Siehe autopilots/autopilotLaeufer.js +
  // autopilots/autopilotSelbsttests.js.
  "bug-predictor",            // scannt die echten Quelldateien des Containers
  "knowledge-graph",          // baut den Symbolgraphen ueber dieselben Dateien
  "multi-file-repo-architect",// prueft die echte Architektur des Containers
  "code-interpreter",         // Rechnung mit pruefbarem Ergebnis (Summe 1..100)
  "smart-router",             // Prompts mit bekannter Soll-Zuordnung
  "self-healing",             // muss kaputte UND gesunde Antworten erkennen
  "deep-research",            // Rechercheplan zu einem Thema
  "memory-sync",              // Faktenextraktion aus einem Gespraech
  "multimodal-engine",        // seit 2026-08-13: fragt Video-Worker (+Bild-Maler) nach /health
  "task-orchestrator",        // Aufgabengraph aus einem Ziel
  "self-improvement",         // gute Antwort muss schlechte schlagen
  "model-lifecycle",          // langsamer Schatten darf nicht befoerdert werden
  "user-feedback-flywheel",   // seit 2026-08-13: echte Daumen-Signale (POST /api/feedback) + PII-Filter
  "antwort-tuev",             // seit 2026-08-14: Selbsttest mit den woertlich gemessenen Fehlantworten + echte Daumen-runter-Antworten
  "process-reward",           // Denkkette zerlegen und bewerten
  "knowledge-distiller",      // beste Loesung aus Kandidaten waehlen
  "evolutionary-mutation",    // Stresstest auf Code
  "realtime-internet-harvester", // seit 2026-08-13: taegliche Websuche-Ernte in den RAG-Feed
  "live-arena-leaderboard",   // ELO-Mathematik, exakt pruefbar
  "instant-web-container",    // Vorschau mit eingebettetem Inhalt
  "realtime-voice-pair",      // Sitzung anlegen und Rahmen verarbeiten
  "autonomous-git-bot",       // muss Secret und eval im Diff finden
  "werkstatt-autopilot",      // Station 1 sammelt im Takt aus der Ampel (in-process)
  "angelina-autopilot",       // Sprach-Waechter ueber die ausgelieferten Seiten
  "support-sla",              // misst echte Tickets und echte Wartezeiten
  "modell-einkaeufer",        // Wochen-Arena: echte Proben je Modell ueber die Bruecke
  "selbstheilung",            // bezeugt jeden Heilungs-Durchgang selbst
  "autopilot-laeufer",        // Totmannschalter: der Taktgeber bezeugt jeden Durchgang selbst
  "synthetic-user-watchdog",  // ECHTER Durchlauf: Anmeldung, Chat ueber die Bruecke, Speicher mit Ruecklese-Probe
  // --- AI Evolution Engine (Nr. 37-39), seit 2026-08-14 ---
  // Alle drei laufen im Autopilot-Laeufer und werden ROT, wenn ihr Selbsttest
  // faellt: jeder Pruefer bekommt eine KAPUTTE und eine GESUNDE Probe und muss
  // beide richtig beurteilen (control-server/src/evolution/evolutionLaeufe.js).
  "ai-evolution-engine",      // 12 Medientyp-Pruefer + Sperrfrist-Nachweis
  "missing-function-detector",// Luecken-Erkennung + Beleg-Pruefung gegen den echten Quelltext
  "autopilot-supervisor",     // Abnahme, blind UND blockierend geprueft
  "evolution-ablage",         // bucht Kennzahlen und Aufgaben dauerhaft weg
  // --- Schutz, Sicherheit, Kosten, Wachstum (Nr. 44-60), seit 2026-08-24 ---
  // Alle laufen im Autopilot-Laeufer (schutzUndWachstumLaeufe.js); jeder
  // beginnt mit einem Selbsttest aus kaputter UND gesunder Probe und misst
  // dann echte Daten. Belegt in tests/schutz-autopiloten.test.mjs und
  // tests/wachstum-autopiloten.test.mjs.
  "training-loop",            // Nr. 05, reaktiviert 2026-08-24: misst die self-improvement-Ablagen + Capture-Schalter im Laeufer
  "rueck-roller",             // Ampeln gegen Deploy-Staende; Empfehlung in die Ablage
  "log-wache",                // Ringpuffer der eigenen Prozess-Fehlersignale
  "daten-sicherung",          // taeglicher Schnappschuss + sofortige Ruecklese mit Pruefsumme
  "wiederherstellungs-probe", // juengste Sicherung vollstaendig zurueckgelesen (RPO/RTO)
  "geheimnis-spaeher",        // scannt die echten Quelldateien des Containers
  "zertifikats-wache",        // echte TLS-Handshakes gegen die vier Domains
  "fehler-faenger",           // echte Browserfehler ueber POST /api/fehler
  "missbrauchs-wache",        // zaehlt jede echte API-Anfrage (Haken in src/server.js)
  "konto-wache",              // Sitzungsgeheimnis + Admin-Listen-Drift gegen die Ablage
  "inhalts-schutz",           // prueft echte Daumen-runter-Antworten und Ernte-Themen
  "abhaengigkeits-wache",     // package-lock des Containers gegen osv.dev, dedupliziert
  "kosten-wache",             // Tagesbericht des Token-Messers gegen das Budget
  "last-probe",               // 20 echte Parallel-Anfragen gegen /health, woechentlich
  "auffindbarkeits-wache",    // die ausgelieferte Startseite, taeglich
  "willkommens-wache",        // der echte Nutzer-Index (createdAt/lastSeenAt)
  "experiment-meister",       // Zuteilungs- und Urteils-Mathematik + echte Ablage
  "tagesmappe",               // baut die Mappe aus den echten Quellen, stumme benannt
  // --- Test-Waechter (Nr. 61), seit 2026-08-24 ---
  "test-waechter",            // Mac-Cron: node --test ueber control-server/src, Herzschlag wie Betriebswache
  "modell-katalog-wache",     // taeglich /models je Anbieter gegen die aufgeloeste Router-Wahl
  "speicher-wache",           // Nr. 64: taeglich S3-LIST ueber die Eimer, echte Objektgroessen summiert
  // Nr. 65 (2026-08-26): liest die VIER echten Trainings-Ablagen und rechnet sie
  "trainings-reife",          //   gegen das Reife-Ziel; Entscheidungskarte in der Tagesmappe-Ablage
  // --- Deckungs-Waechter (Nr. 66-70), seit 2026-08-30 ---
  // Alle fünf laufen im Autopilot-Laeufer und messen echte Ablagen; belegt in
  // tests/deckungs-waechter.test.mjs (kaputte UND gesunde Probe je Wächter).
  "email-zustell",            // Nr. 66: echtes Zustellprotokoll mail/zustellung der letzten 7 Tage
  "dsgvo-fristen",            // Nr. 67: echte Vorgangs-Ablage admin/gdpr mit gerechneter Restfrist
  "ai-act-wache",             // Nr. 68: Bestandsverzeichnis gegen die aktiven Registry-Modelle gerechnet
  "abo-umsatz-wache",         // Nr. 69: Abo-Spiegel billing/customers + Trend-Karte über den letzten Lauf
  "flaggen-wache",            // Nr. 70: Flag-Ablage admin/flags mit updatedAt-Alter je Entscheidung
  "umgebungs-wache",          // Nr. 71: liest die echte Prozess-Umgebung (Zhipu-Coding-Adresse, Pflichtschluessel)
  "tuerwaechter",             // Nr. 73: echte HTTP-Kette (Anmeldung, Admin, Chat) mit Mess-Token gegen den Control-Server
  // --- Runde 2 (Nr. 74-80), seit 2026-09-03: die Luecken der Deckungs-Matrix ---
  "einwilligungs-wache",      // Nr. 74: echte Umgebung (Consent-Schluessel, IDRIVE_E2_TRAINING_*) + Ledger-LIST
  "tiefe-spur-messung",       // Nr. 75: 14 Faelle der Kernsuite gegen die Bruecke (glm-5-2), Ablage autopiloten/tiefe-spur-messung
  "bau-wache",                // Nr. 76: ZEABUR_GIT_COMMIT_SHA gegen GitHub-Commit + Check-Run
  "projektwissen-frische",    // Nr. 77: /health der Bruecke (projektwissen.exportedAt, chunkCount)
  "sprachseiten-wache",       // Nr. 78: 15 Sprachseiten live, Ablage betrieb/sprachseiten
  "red-team-probe",           // Nr. 79: 5 Injektions-Faelle gegen die Bruecke, Ablage autopiloten/red-team-probe
  "agenten-sonde",            // Nr. 80: /health von Maus-Engine und Fern-Browser
  "besucher-puls",          // Nr. 81: echte Strichliste der Landeseite (POST /api/puls), Tagesstand betrieb/besucher-puls
  "modell-evolution"          // Nr. 72: Referenz aus Nr. 01, Noten je Faehigkeit aus evolution/kennzahlen, Reife-Karte Nr. 65, echte Umgebung; Zyklus-Protokoll
]);

const TAG_MS = 24 * 60 * 60 * 1000;

test("Beschluss 1+5: was keine Messung hat, ist grau — nicht heartbeat", () => {
  const zuUnrechtGemessen = AUTOPILOTEN
    .filter((a) => a.messung === "heartbeat" && !MIT_ECHTER_MESSUNG.has(a.id))
    .map((a) => a.id);
  assert.deepEqual(zuUnrechtGemessen, [],
    "Diese Autopiloten behaupten eine Messung, die es nicht gibt. Entweder die "
    + "Messung wirklich anschliessen (und oben in MIT_ECHTER_MESSUNG eintragen) "
    + "oder messung: \"geplant\" setzen. Siehe docs/approvals/2026-08-12-ampel-ehrlich-messen.md");

  for (const a of AUTOPILOTEN) {
    if (a.messung === "geplant") {
      assert.ok(String(a.messungHinweis || "").trim().length > 10,
        `${a.id}: grau ohne Begruendung. messungHinweis muss sagen, warum nicht gemessen wird.`);
    }
  }
});

test("Beschluss 3: kein getarntes Erwartungsfenster (365-Tage-Trick)", () => {
  // Der laengste ECHTE Zeitplan ist woechentlich (Konkurrenz-Radar, 7 Tage).
  // Ein Fenster darueber hinaus ist kein Zeitplan mehr, sondern eine
  // Gruen-Garantie: die Ampel kann dann jahrelang nicht ueberfaellig werden.
  const OBERGRENZE_MS = 8 * TAG_MS;
  const SCHONFRIST_MAX_MS = TAG_MS;
  for (const a of AUTOPILOTEN) {
    if (a.messung !== "heartbeat") continue;
    assert.ok(a.erwartetAlleMs <= OBERGRENZE_MS,
      `${a.id}: Erwartungsfenster ${Math.round(a.erwartetAlleMs / TAG_MS)} Tage — mehr als 8 Tage `
      + "verdeckt jeden Ausfall. Wenn der Job wirklich so selten laeuft, gehoert er auf geplant/grau.");
    assert.ok(a.schonfristMs <= SCHONFRIST_MAX_MS,
      `${a.id}: Schonfrist ${Math.round(a.schonfristMs / 3600000)} h — hoechstens 24 h.`);
  }
});

test("Beschluss 4: ein Schluessel gilt nur fuer SEINEN Autopiloten", () => {
  // Der Sammel-Schluessel war die Absicherung des Stemplers: mit einem
  // einzigen Wert liessen sich Herzschlaege fuer alle 31 faelschen.
  _herzschlaegeZuruecksetzen();
  const env = { SMEJJ_AUTOPILOT_KEYS: "qualitaetsmessung:geheim1" };
  const eigener = heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env });
  assert.equal(eigener.ok, true, "der eigene Schluessel muss gelten");

  const fremd = heartbeatAnnehmen({ id: "deep-research", key: "geheim1", status: "ok", env });
  assert.equal(fremd.ok, false, "ein fremder Autopilot darf mit diesem Schluessel NICHTS melden");
  assert.equal(fremd.status, 403);
  _herzschlaegeZuruecksetzen();

  // Dieselbe Regel auf der Absender-Seite (Worker).
  const workerEnv = { SMEJJ_AUTOPILOT_KEYS: "qualitaetsmessung:abc,codeberg-spiegel:s3cr3t" };
  assert.equal(schluesselFuer("codeberg-spiegel", workerEnv), "s3cr3t");
  assert.equal(schluesselFuer("deep-research", workerEnv), "",
    "kein Ausweich-Schluessel fuer fremde Kennungen — sonst stempelt ein Job fuer alle");
});

test("Beschluss 1+2: kein Sammel-Herzschlag im Jobs-Worker", () => {
  const jobs = ohneKommentare(lies("workers/smejj-autopilot-jobs/jobs.mjs"));
  const worker = ohneKommentare(lies("workers/smejj-autopilot-jobs/worker.mjs"));

  // Der Stempler war eine Liste von {id, meldung}-Paaren, ueber die eine
  // Schleife herzschlagSenden aufrief. Beides zusammen ist das Erkennungszeichen.
  const idFelder = (jobs.match(/\bid:\s*"/g) || []).length;
  assert.ok(idFelder <= 4,
    `jobs.mjs nennt ${idFelder} Autopilot-Kennungen — erlaubt sind die 4 echten Jobs `
    + "(Qualitaet, Voice-Region, Radar, Spiegel). Mehr deutet auf eine Sammel-Liste hin.");

  for (const quelle of [["jobs.mjs", jobs], ["worker.mjs", worker]]) {
    assert.equal(/for\s*\(\s*const\s+\w+\s+of\s+liste\s*\)/.test(quelle[1]), false,
      `${quelle[0]}: Schleife ueber eine Autopiloten-Liste gefunden — das ist der Blind-Stempler.`);
    assert.equal(/waechterAusfuehren|autopilotWaechterLauf\s*\(/.test(quelle[1]), false,
      `${quelle[0]}: der Sammel-Waechter ist zurueck. Jeder Job meldet nur seinen EIGENEN Lauf.`);
  }
});

test("Beschluss 2: keine erfundenen Messergebnisse im Control-Server", () => {
  const ops = ohneKommentare(lies("control-server/src/admin/opsAutopiloten.js"));
  assert.equal(/Suite pass/i.test(ops), false,
    "opsAutopiloten.js erfindet wieder ein Suite-Ergebnis. Der Server darf nur bezeugen, was er selbst ist.");
  assert.equal(/trainingEngine\s*:/.test(ops), false,
    "der hart codierte trainingEngine-Kennzahlenblock ist zurueck — Behauptung statt Messung.");
});

test("Der Beschluss-Zettel liegt im Repo und ist auffindbar", () => {
  // Ein Test, der nur Code prueft, erklaert nicht das WARUM. Wer hier stolpert,
  // soll den Zettel finden — dort steht die Entscheidung im Wortlaut.
  const zettel = lies("docs/approvals/2026-08-12-ampel-ehrlich-messen.md");
  assert.ok(zettel.includes("Ehrlich messen"), "der Beschluss muss im Wortlaut im Zettel stehen");
});

test("Beschluss 2, fuenfter Trick: KEIN erfundener Initial-Herzschlag beim Laden", async () => {
  // Am 2026-08-13 setzte ladeHerzschlaege jedem Autopiloten ohne Herzschlag
  // ein erfundenes "ok / betriebsbereit & aktiv" — Trick Nr. 5 nach
  // Sammel-Schleife, Registry-Umschaltung, 365-Tage-Fenster und
  // Sammel-Schluessel. Wer noch nie gemeldet hat, ist GRAU. Punkt.
  const { ladeHerzschlaege, autopilotUebersicht, _herzschlaegeZuruecksetzen, _ablageLeeren } =
    await import("../control-server/src/admin/opsAutopiloten.js");
  _herzschlaegeZuruecksetzen();
  if (typeof _ablageLeeren === "function") _ablageLeeren();
  await ladeHerzschlaege();
  const u = autopilotUebersicht({});
  assert.equal(u.gruen, 0,
    `nach leerem Laden darf NICHTS gruen sein — ${u.gruen} Autopiloten tragen erfundene Herzschlaege`);
  const gestempelt = (u.autopiloten || []).filter((a) =>
    /betriebsbereit & aktiv/i.test((a.letzterLauf || {}).meldung || ""));
  assert.deepEqual(gestempelt.map((a) => a.id), [], "der Initial-Stempel-Text darf nirgends auftauchen");
  _herzschlaegeZuruecksetzen();
});
