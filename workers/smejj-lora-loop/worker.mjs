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
import {
  bewerteWacht,
  erzeugeWachtGedaechtnis,
  leseSaladKoordinaten,
  leseWachtGrenzen,
  saladBestaetigtAusfall,
  stoppeContainerGruppe
} from "./waechter.js";
import { trainerErreichbar } from "./trainerClient.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TAKT_MS = 30_000;
/**
 * Eigener, langsamerer Takt fuer den Waechter. Er misst nur /health; alle zwei
 * Minuten genuegt, um eine Stundenfrist auf die Minute genau einzuhalten, und
 * belastet den Trainer waehrend eines Laufs nicht unnoetig.
 */
const WACHT_TAKT_MS = 120_000;

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

/**
 * Der Anlaufwaechter: beendet eine Karte, die dauerhaft nichts leistet.
 *
 * Sitzt hier und nicht im Trainer, weil nur dieser Prozess den Salad-Schluessel
 * halten darf — der Trainer laeuft auf einer fremden Community-GPU. Er koennte
 * sich dort ohnehin nur selbst beenden, und restart_policy=always startete ihn
 * sofort wieder: eine Schleife zum selben Preis wie der Stillstand.
 *
 * Laeuft AUCH, wenn das Training abgeschaltet ist. Eine laufende Karte kostet
 * Geld, unabhaengig davon, ob die Schleife sie benutzen darf.
 */
export function starteWachtTakt({
  config,
  env = process.env,
  log = console.log,
  intervalMs = WACHT_TAKT_MS,
  setIntervalImpl = setInterval,
  fetchImpl = undefined,
  unrefTimer = false
} = {}) {
  const grenzen = leseWachtGrenzen(env);
  const koordinaten = leseSaladKoordinaten(env);
  // Vier Takte Toleranz gegen Messluecken (angehaltener Container, Migration).
  const gedaechtnis = erzeugeWachtGedaechtnis(undefined, { maxLueckeMs: intervalMs * 4 });

  if (!grenzen.aktiv) {
    log("[smejj-lora-loop] Anlaufwaechter AUS (SMEJJ_LORA_WAECHTER=AUS) — eine haengende Karte laeuft unbegrenzt weiter.");
    return null;
  }
  if (!config.trainer.basisUrl) {
    log("[smejj-lora-loop] Anlaufwaechter untaetig: keine Trainer-Adresse (SMEJJ_LORA_TRAINER_URL).");
    return null;
  }
  if (!koordinaten.vollstaendig) {
    // Laut und unmissverstaendlich: ein Waechter, der nur zusehen kann,
    // taeuscht Sicherheit vor.
    log(`[smejj-lora-loop] WARNUNG: Anlaufwaechter kann NICHT stoppen — es fehlen ${koordinaten.fehlend.join(", ")}.`
      + " Eine haengende GPU muss dann von Hand beendet werden.");
  }

  log(`[smejj-lora-loop] Anlaufwaechter scharf: stoppt ${koordinaten.gruppe},`
    + ` wenn der Trainer ${Math.round(grenzen.bereitFristMs / 60000)} min lang nicht bereit meldet.`);

  const timer = setIntervalImpl(() => {
    (async () => {
      const erreichbar = await trainerErreichbar({
        basisUrl: config.trainer.basisUrl, apiKey: config.trainer.apiKey, fetchImpl
      });
      // trainerErreichbar sagt nur "antwortet /health mit 2xx". Genau das ist
      // hier gemeint: der Trainer haelt /health absichtlich immer auf 200,
      // solange sein Prozess lebt — ein Fehlschlag heisst also wirklich tot.
      const nichtBereitSeitMs = gedaechtnis.melde(erreichbar);
      // Zweiter, unabhaengiger Beleg — nur wenn er die Entscheidung aendern kann.
      // Ohne ihn wuerde ein Netzausfall AUF DIESER SEITE eine gesunde GPU
      // beenden (am 2026-08-04 einmal live erlebt: "fetch failed", waehrend der
      // Trainer in derselben Sekunde 3x HTTP 200 lieferte).
      const ausfallBestaetigt = (!erreichbar && nichtBereitSeitMs >= grenzen.bereitFristMs)
        ? await saladBestaetigtAusfall({ koordinaten, fetchImpl })
        : true;
      const entscheidung = bewerteWacht(
        { erreichbar, bereit: erreichbar, nichtBereitSeitMs, ausfallBestaetigt }, grenzen
      );
      if (!entscheidung.stoppen) {
        if (entscheidung.grund?.startsWith("unerreichbar_ohne_zweitmeinung")) {
          log(`[smejj-lora-loop] Anlaufwaechter blind: Salad bestaetigt den Ausfall nicht`
            + ` (${entscheidung.grund}) — es wird NICHTS gestoppt.`);
        }
        return;
      }

      const ergebnis = await stoppeContainerGruppe({ koordinaten, fetchImpl });
      log(ergebnis.ok
        ? `[smejj-lora-loop] ANLAUFWAECHTER: ${koordinaten.gruppe} gestoppt (${entscheidung.grund}). Keine weitere GPU-Zeit.`
        : `[smejj-lora-loop] ANLAUFWAECHTER KONNTE NICHT STOPPEN (${entscheidung.grund}): ${ergebnis.fehler}.`
          + " Die Karte laeuft WEITER — von Hand im Salad-Portal beenden.");
      if (ergebnis.ok) gedaechtnis.zuruecksetzen();
    })().catch((error) => log(`[smejj-lora-loop] Waechter-Fehler: ${String(error?.message || error).slice(0, 200)}`));
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
  // Bewusst VOR dem listen und unabhaengig von loopEnabled: eine laufende Karte
  // kostet auch dann Geld, wenn die Schleife selbst abgeschaltet ist.
  starteWachtTakt({ config });
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
