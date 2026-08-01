// smejj.com Dauertrainings-Schleife — Prozess (Single Responsibility: HTTP + Start).
//
// Laeuft auf einer billigen CPU-Instanz und steuert die teure GPU von aussen.
// Im Aus-Zustand (Standardumgebung) antwortet nur /health und es entsteht
// keine Sekunde GPU-Zeit.
//
// Endpunkte:
//   GET /health   — laeuft der Dienst, und WARUM trainiert er gerade nicht
//   GET /verlauf  — Kennzahlen je Zyklus (keine Prompts, keine Antworten)
//   GET /kosten   — Verbrauch, Restbudget, Hochrechnung
//
// Kein Endpunkt schaltet etwas ein. Das ist Absicht: das Einschalten kostet
// Geld und passiert ueber Umgebungsvariablen, die der Betreiber setzt — nicht
// ueber einen Aufruf, den irgendwer absetzen kann.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ladeLoopKonfiguration, startHindernisse } from "./config.js";
import { erzeugeLoop } from "./loop.js";
import { baueDatenPruefung, baueMesser } from "./evalAdapter.js";
import { geschaetzteZykluskostenUsd, monatskostenUsd, reichweiteTage } from "./budget.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TAKT_MS = 30_000;

export function erzeugeServer({ config, loop }) {
  return http.createServer((req, res) => {
    const antworte = (status, koerper) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(koerper));
    };

    if (req.method === "GET" && req.url === "/health") {
      const hindernisse = startHindernisse(config);
      return antworte(200, {
        ok: true,
        loopEnabled: config.loopEnabled,
        trainingEnabled: config.trainingEnabled,
        notaus: config.grenzen.notaus,
        // Die eigentliche Frage, die dieser Endpunkt beantworten soll.
        traineertNichtWeil: hindernisse,
        ...loop.getStatus()
      });
    }

    if (req.method === "GET" && req.url === "/verlauf") {
      const verlauf = loop.getVerlauf();
      return antworte(200, { ok: true, anzahl: verlauf.length, verlauf });
    }

    if (req.method === "GET" && req.url === "/kosten") {
      const zustand = loop.getZustand();
      const grenzen = config.grenzen;
      return antworte(200, {
        ok: true,
        gpuKlasse: grenzen.gpuKlasse || null,
        preisProStundeUsd: grenzen.preisProStundeUsd || null,
        monatskostenUsdBeiDauerbetrieb: monatskostenUsd(grenzen.gpuKlasse),
        maxGesamtUsd: grenzen.maxGesamtUsd || null,
        verbrauchtUsd: zustand.verbrauchtUsd,
        restUsd: grenzen.maxGesamtUsd
          ? Number((grenzen.maxGesamtUsd - zustand.verbrauchtUsd).toFixed(4))
          : null,
        geschaetzteZykluskostenUsd: geschaetzteZykluskostenUsd(grenzen),
        zyklenGestartet: zustand.zyklenGestartet,
        zyklenAbgebrochen: zustand.zyklenAbgebrochen,
        freigabeId: grenzen.freigabeId || null
      });
    }

    antworte(404, { ok: false, error: "not_found" });
  });
}

/**
 * `unrefTimer` ist absichtlich standardmaessig AUS: dieser Timer IST der Dienst.
 * Wird er unref'ed, koennte sich der Prozess beenden, sobald sonst nichts mehr
 * offen ist — der Dauerbetrieb endete dann lautlos. Nur Tests setzen ihn.
 */
export function starteTakt(loop, { intervalMs = TAKT_MS, config, log = console.log, setIntervalImpl = setInterval, unrefTimer = false } = {}) {
  if (!config.loopEnabled) {
    log("[smejj-lora-loop] SMEJJ_LORA_LOOP_ENABLED != YES — Server laeuft, Schleife bleibt aus (fail-closed).");
    return null;
  }
  const timer = setIntervalImpl(() => {
    loop.tick().catch((error) => log(`[smejj-lora-loop] tick fehlgeschlagen: ${String(error?.message || error).slice(0, 200)}`));
  }, intervalMs);
  if (unrefTimer && typeof timer?.unref === "function") timer.unref();
  return timer;
}

async function main() {
  const config = ladeLoopKonfiguration(process.env);
  const loop = erzeugeLoop({
    config,
    deps: {
      messe: baueMesser({ config, repoRoot: REPO_ROOT, log: console.log }),
      pruefeDaten: baueDatenPruefung({ config, leseManifest: null })
    }
  });
  const server = erzeugeServer({ config, loop });
  starteTakt(loop, { config });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(config.port, config.host, resolve);
  });

  const hindernisse = startHindernisse(config);
  console.log(`[smejj-lora-loop] hoert auf ${config.host}:${config.port}`);
  if (hindernisse.length) {
    console.log(`[smejj-lora-loop] Es wird NICHT trainiert. Gruende: ${hindernisse.join(", ")}`);
  } else {
    console.log(`[smejj-lora-loop] Training frei: GPU ${config.grenzen.gpuKlasse},`
      + ` ${monatskostenUsd(config.grenzen.gpuKlasse)} USD/Monat bei Dauerbetrieb,`
      + ` Deckel ${config.grenzen.maxGesamtUsd} USD,`
      + ` Freigabe ${config.grenzen.freigabeId}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[smejj-lora-loop] fatal: ${String(error?.stack || error)}`);
    process.exitCode = 1;
  });
}

export { monatskostenUsd, reichweiteTage };
