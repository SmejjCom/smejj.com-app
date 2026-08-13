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
  "konkurrenz-radar",    // Lebenszeichen des Dienstes, ehrlich beschriftet
  "brueckenwaechter",    // wird vom Control-Server abgefragt (frageWaechterAb)
  "salad-sonden",        // Eigenmeldung des Control-Servers
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
  "multimodal-engine",        // gueltige/ungueltige Eingaben unterscheiden
  "task-orchestrator",        // Aufgabengraph aus einem Ziel
  "self-improvement",         // gute Antwort muss schlechte schlagen
  "model-lifecycle",          // langsamer Schatten darf nicht befoerdert werden
  "user-feedback-flywheel",   // PII-Maskierung (E-Mail, Schluessel)
  "process-reward",           // Denkkette zerlegen und bewerten
  "knowledge-distiller",      // beste Loesung aus Kandidaten waehlen
  "evolutionary-mutation",    // Stresstest auf Code
  "realtime-internet-harvester", // Fakten aus Rohtext ziehen
  "live-arena-leaderboard",   // ELO-Mathematik, exakt pruefbar
  "instant-web-container",    // Vorschau mit eingebettetem Inhalt
  "realtime-voice-pair",      // Sitzung anlegen und Rahmen verarbeiten
  "autonomous-git-bot",       // muss Secret und eval im Diff finden
  "werkstatt-autopilot",      // Station 1 sammelt im Takt aus der Ampel (in-process)
  "angelina-autopilot",       // Sprach-Waechter ueber die ausgelieferten Seiten
  "synthetic-user-watchdog"   // ECHTER Durchlauf: Anmeldung, Chat ueber die Bruecke, Speicher mit Ruecklese-Probe
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
