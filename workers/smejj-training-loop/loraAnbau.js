// smejj.com — Anbau der Dauertrainings-Schleife an den bestehenden Dienst
// (Single Responsibility: die LoRA-Schleife anhaengen, ohne den Eval-Zyklus zu gefaehrden).
//
// WARUM ANBAU UND KEIN EIGENER DIENST:
// Ein neuer Zeabur-Dienst waere eine neue laufende Kostenposition und damit ein
// Punkt der Roten Liste — freigegeben wurde die GPU (180 USD/Monat, Deckel
// 50 USD), nicht ein zweiter Container. Der bestehende Dienst
// 'smejj-training-loop' laeuft ohnehin 24/7, tut die gleiche Art Arbeit
// (unbeaufsichtigter Takt) und ist die meiste Zeit untaetig. Die
// Orchestrierung kostet dort nichts: die Rechenarbeit macht die GPU, dieser
// Prozess wartet nur.
//
// NON-REGRESSION IST HIER DIE HAUPTSACHE:
// Der Eval-Zyklus laeuft live seit dem 2026-07-29. Er darf durch diesen Anbau
// unter keinen Umstaenden ausfallen. Drei Vorkehrungen:
//   1. Der Anbau wird in einem try/catch ERZEUGT. Scheitert er (fehlende Datei,
//      kaputte Umgebung), laeuft der Dienst ohne ihn weiter, statt zu sterben.
//   2. Sein Takt laeuft in einem EIGENEN Intervall mit eigenem catch. Ein
//      Fehler dort erreicht den Eval-Takt nicht.
//   3. Ohne SMEJJ_LORA_LOOP_ENABLED=YES wird gar kein Takt gestartet. Das ist
//      der Auslieferungszustand: der Anbau ist dann totes Gewicht, kein Risiko.

const LORA_TAKT_MS = 30_000;

/**
 * Erzeugt die LoRA-Schleife. Gibt `null` zurueck, wenn sie nicht gebaut werden
 * kann — der Aufrufer laeuft dann einfach ohne sie weiter.
 */
export async function baueLoraAnbau({ env = process.env, repoRoot, log = console.log } = {}) {
  try {
    const [{ ladeLoopKonfiguration, startHindernisse }, { erzeugeLoop }, evalAdapter] = await Promise.all([
      import("../smejj-lora-loop/config.js"),
      import("../smejj-lora-loop/loop.js"),
      import("../smejj-lora-loop/evalAdapter.js")
    ]);

    const config = ladeLoopKonfiguration(env);
    const loop = erzeugeLoop({
      config,
      env,
      log,
      deps: {
        messe: evalAdapter.baueMesser({ config, repoRoot, log }),
        pruefeDaten: evalAdapter.baueDatenPruefung({
          config,
          leseManifest: evalAdapter.baueManifestLeser({ env })
        })
      }
    });

    return { config, loop, hindernisse: startHindernisse(config) };
  } catch (error) {
    log(`[smejj-training-loop] LoRA-Anbau nicht geladen (${String(error?.message || error).slice(0, 160)}) — Eval-Zyklus laeuft unveraendert weiter.`);
    return null;
  }
}

/**
 * Startet den eigenen Takt des Anbaus. Ohne SMEJJ_LORA_LOOP_ENABLED=YES
 * passiert nichts.
 */
export function starteLoraTakt(anbau, {
  intervalMs = LORA_TAKT_MS,
  log = console.log,
  setIntervalImpl = setInterval,
  unrefTimer = false
} = {}) {
  if (!anbau?.config?.loopEnabled) return null;
  const timer = setIntervalImpl(() => {
    // Eigenes catch: ein Fehler der LoRA-Schleife darf den Prozess und damit
    // den Eval-Zyklus nicht beenden.
    anbau.loop.tick().catch((error) => {
      log(`[smejj-lora-loop] tick fehlgeschlagen: ${String(error?.message || error).slice(0, 200)}`);
    });
  }, intervalMs);
  if (unrefTimer && typeof timer?.unref === "function") timer.unref();
  return timer;
}

/**
 * Beantwortet die LoRA-Routen. Gibt `false` zurueck, wenn die Anfrage nicht an
 * den Anbau gerichtet war — dann macht der Aufrufer normal weiter.
 */
export function beantworteLoraRoute(req, res, anbau) {
  const url = String(req.url || "");
  if (req.method !== "GET" || !url.startsWith("/lora/")) return false;

  const antworte = (koerper) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(koerper));
  };

  if (!anbau) {
    antworte({ ok: false, error: "lora_anbau_nicht_geladen" });
    return true;
  }

  if (url === "/lora/health") {
    antworte({
      ok: true,
      loopEnabled: anbau.config.loopEnabled,
      trainingEnabled: anbau.config.trainingEnabled,
      notaus: anbau.config.grenzen.notaus,
      traineertNichtWeil: anbau.hindernisse,
      ...anbau.loop.getStatus()
    });
    return true;
  }

  if (url === "/lora/verlauf") {
    const verlauf = anbau.loop.getVerlauf();
    antworte({ ok: true, anzahl: verlauf.length, verlauf });
    return true;
  }

  if (url === "/lora/kosten") {
    const zustand = anbau.loop.getZustand();
    const grenzen = anbau.config.grenzen;
    antworte({
      ok: true,
      gpuKlasse: grenzen.gpuKlasse || null,
      preisProStundeUsd: grenzen.preisProStundeUsd || null,
      maxGesamtUsd: grenzen.maxGesamtUsd || null,
      verbrauchtUsd: zustand.verbrauchtUsd,
      restUsd: grenzen.maxGesamtUsd ? Number((grenzen.maxGesamtUsd - zustand.verbrauchtUsd).toFixed(4)) : null,
      zyklenGestartet: zustand.zyklenGestartet,
      zyklenAbgebrochen: zustand.zyklenAbgebrochen,
      freigabeId: grenzen.freigabeId || null
    });
    return true;
  }

  antworte({ ok: false, error: "not_found" });
  return true;
}
