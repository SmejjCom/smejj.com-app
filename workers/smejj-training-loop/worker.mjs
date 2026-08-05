// smejj.com Training-Loop-Worker — dauerhafter Prozess (Zeabur), der den
// Eval-Zyklus (scripts/evaluation/run_model_eval.mjs) und den Trainings-
// Warteschlangen-Zyklus (src/training/pipeline.js) auf eigenen Intervallen
// laufen laesst. Single Responsibility: HTTP-Health-Vertrag + Scheduler-Start.
//
// Fail-closed in zwei Stufen: ohne SMEJJ_TRAINING_LOOP_ENABLED=YES beantwortet
// der Server /health, tickt aber nie (sicher deploybar im Aus-Zustand). Der
// Trainingszyklus selbst bleibt zusaetzlich hinter SMEJJ_TRAINING_CAPTURE_ENABLED
// (src/training/constants.js#isCaptureEnabled) — der bestehenden, projektweiten
// Sperre fuer jede Trainingsdaten-Erfassung.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLoopConfig } from "./config.js";
import { createLoop } from "./loop.js";
import { baueLoraAnbau, beantworteLoraRoute, starteLoraTakt } from "./loraAnbau.js";
import { createBrueckenWaechter } from "./brueckenWaechter.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TICK_POLL_MS = 30_000;
// 60 s: haeufig genug, dass ein Ausfall nach spaetestens drei Minuten als solcher
// gilt (Schwelle 3), sparsam genug, dass die Bruecke davon nichts merkt.
const WAECHTER_TAKT_MS = 60_000;

export function createServer({ config, loop, readyCheck = () => true, loraAnbau = null, waechter = null }) {
  return http.createServer(async (req, res) => {
    // Der Anbau beantwortet nur /lora/*. Alles andere laeuft unveraendert
    // durch die bestehenden Zweige — der Eval-Zyklus merkt nichts davon.
    if (beantworteLoraRoute(req, res, loraAnbau)) return;

    if (req.method === "GET" && req.url === "/health") {
      const ready = readyCheck();
      const status = loop.getStatus();
      // Der Waechter-Stand gehoert in EINEN Blick: Wer /health aufruft, will
      // wissen, ob etwas kaputt ist — und die Bruecke ist das Wichtigste am
      // ganzen System. Bewusst nur die Kurzfassung, der Verlauf steht unter
      // /bruecke (siehe unten: /health muss knapp und billig bleiben).
      const bruecke = waechter
        ? (({ erreichbar, letzteVersion, letzterErfolgAm, laufenderAusfall, fehlerInFolge }) =>
            ({ erreichbar, letzteVersion, letzterErfolgAm, laufenderAusfall, fehlerInFolge }))(waechter.stand())
        : null;
      const body = JSON.stringify({
        ok: ready,
        loopEnabled: config.loopEnabled,
        evalCycleEnabled: config.evalCycleEnabled,
        trainingCycleEnabled: config.trainingCycleEnabled,
        bruecke,
        ...status
      });
      res.writeHead(ready ? 200 : 503, { "content-type": "application/json; charset=utf-8" });
      res.end(body);
      return;
    }
    // Verlauf der Messungen. Getrennt von /health, weil /health knapp und
    // billig bleiben muss (der Takt-Waechter fragt es haeufig ab), der Verlauf
    // aber wachsen darf. Enthaelt ausschliesslich Kennzahlen — keine Prompts,
    // keine Modellantworten, keine Zugangsdaten.
    if (req.method === "GET" && req.url === "/verlauf") {
      const verlauf = typeof loop.getVerlauf === "function" ? loop.getVerlauf() : [];
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, anzahl: verlauf.length, verlauf }));
      return;
    }
    // Voller Stand des Bruecken-Waechters samt Vorfallsliste (neueste zuerst).
    // Getrennt von /health aus demselben Grund wie /verlauf: /health wird
    // haeufig abgefragt und muss knapp bleiben.
    if (req.method === "GET" && req.url === "/bruecke") {
      res.writeHead(waechter ? 200 : 503, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(waechter
        ? { ok: true, ...waechter.stand() }
        : { ok: false, error: "waechter_nicht_aktiv" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });
}

/**
 * Startet den Takt-Geber.
 *
 * `unrefTimer` ist absichtlich standardmaessig AUS: dieser Timer IST der Dienst.
 * Wird er unref'ed, haelt er die Ereignisschleife nicht mehr — der Prozess
 * koennte sich beenden, sobald sonst nichts mehr offen ist, und der
 * Dauerbetrieb endet lautlos. Nur Tests setzen ihn auf true, damit der
 * Testlauf nicht am Timer haengenbleibt.
 */
export function startTicking(loop, {
  intervalMs = TICK_POLL_MS,
  config,
  log = console.log,
  setIntervalImpl = setInterval,
  unrefTimer = false
} = {}) {
  if (!config.loopEnabled) {
    log("[smejj-training-loop] SMEJJ_TRAINING_LOOP_ENABLED != YES — Server laeuft, Loop bleibt aus (fail-closed).");
    return null;
  }
  const timer = setIntervalImpl(() => {
    loop.tick().catch((error) => log(`[smejj-training-loop] tick failed: ${String(error?.message || error).slice(0, 200)}`));
  }, intervalMs);
  if (unrefTimer && typeof timer?.unref === "function") timer.unref();
  return timer;
}

/**
 * Eigener Takt fuer den Bruecken-Waechter.
 *
 * BEWUSST GETRENNT vom Loop-Tick: Der Loop-Tick ist durch `inFlight` gesperrt,
 * solange ein Eval-Zyklus laeuft — und der dauert ~90 s, im Ausnahmefall bis zu
 * `tickMaxMs` (15 min). Haenge man den Waechter dort ein, wuerde er ausgerechnet
 * waehrend der langen Laeufe blind. Ein Ausfall der Bruecke faellt aber nicht
 * hoeflich in die Pausen.
 *
 * Der Waechter selbst wirft nie (siehe brueckenWaechter.js), der `catch` hier
 * ist die zweite Linie.
 */
export function starteWaechterTakt(waechter, { intervalMs, log = console.log, setIntervalImpl = setInterval, unrefTimer = false } = {}) {
  if (!waechter) return null;
  const einPrueflauf = () => waechter.pruefe()
    .catch((fehler) => log(`[bruecken-waechter] Prueflauf fehlgeschlagen: ${String(fehler?.message || fehler).slice(0, 200)}`));
  // SOFORT einmal pruefen, nicht erst nach einem vollen Takt. Sonst steht nach
  // jedem Neustart des Loops eine Minute lang `erreichbar: null` — und
  // ausgerechnet direkt nach einem Neustart will man es wissen.
  einPrueflauf();
  const timer = setIntervalImpl(einPrueflauf, intervalMs);
  if (unrefTimer && typeof timer?.unref === "function") timer.unref();
  return timer;
}

async function main() {
  const config = loadLoopConfig(process.env);
  const loop = createLoop({ config, repoRoot: REPO_ROOT });
  // Additiv: scheitert der Anbau, ist loraAnbau null und der Dienst laeuft
  // exakt wie vorher weiter.
  const loraAnbau = await baueLoraAnbau({ repoRoot: REPO_ROOT });
  // Der Waechter braucht keine Zugangsdaten und keine Ablage — er fragt nur
  // dieselbe oeffentliche Adresse ab, die auch ein Nutzer benutzt.
  const waechter = createBrueckenWaechter({
    url: process.env.SMEJJ_BRUECKE_HEALTH_URL || undefined,
    meldeUrl: process.env.SMEJJ_BRUECKE_MELDE_URL || "",
    schwelle: Number(process.env.SMEJJ_BRUECKE_SCHWELLE) || undefined
  });
  const server = createServer({ config, loop, loraAnbau, waechter });
  startTicking(loop, { config });
  starteWaechterTakt(waechter, { intervalMs: WAECHTER_TAKT_MS });
  starteLoraTakt(loraAnbau);
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  console.log(`[smejj-training-loop] listening on ${config.host}:${config.port} (loopEnabled=${config.loopEnabled})`);
  if (loraAnbau) {
    console.log(`[smejj-lora-loop] Anbau geladen (loopEnabled=${loraAnbau.config.loopEnabled}).`
      + (loraAnbau.hindernisse.length ? ` Trainiert NICHT weil: ${loraAnbau.hindernisse.join(", ")}` : " Training frei."));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[smejj-training-loop] fatal: ${String(error?.stack || error)}`);
    process.exitCode = 1;
  });
}
