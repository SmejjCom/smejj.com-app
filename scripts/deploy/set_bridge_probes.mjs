#!/usr/bin/env node
// smejj.com — Sonden der Chat-Bruecke von TCP auf HTTP umstellen.
//
// WARUM das noetig ist (gemessen am 2026-08-05, nicht vermutet):
// Beide Sonden der Container Group pruefen nur TCP auf Port 8080. Eine
// TCP-Sonde beantwortet die Frage "lauscht da jemand?" — nie die Frage
// "kommen echte Antworten heraus?". An diesem Tag meldete Salad ueber
// 25 Minuten `state=running ready=true`, waehrend das Tor durchgehend
// HTTP 503 lieferte und der Chat tot war. Gegenprobe: dasselbe Buendel
// lokal gestartet lief einwandfrei — es lag NICHT am Code.
//
// Mit einer HTTP-Sonde gegen /health ersetzt Salad eine Instanz, die nicht
// mehr antwortet, von selbst. Ohne sie faellt ein toter Chat nur dem
// Betreiber auf.
//
// DREI FALLEN, alle im Projekt schon einmal teuer gewesen:
//
//   1. Ein PATCH MIT `container`-Schluessel ERSETZT die gesamte Umgebung —
//      13 Variablen und den Startbefehl. Hier wird darum ausschliesslich
//      `startup_probe`/`liveness_probe` gesendet, nie `container`.
//      (docs/memory: Salad-PATCH ersetzt die Umgebung, 2026-08-01)
//   2. `merge-patch+json` FUEGT ZUSAMMEN. Ohne `tcp: null` blieben beide
//      Sondenarten nebeneinander stehen.
//   3. Die Grenzen der API sind hart: initial_delay max 1200 s,
//      failure_threshold max 20, period max 120 s. Hoehere Werte -> HTTP 400.
//
// Aufruf:
//   CONFIRM_BRIDGE_PROBES=YES node scripts/deploy/set_bridge_probes.mjs
//
// Rueckweg (stellt die TCP-Sonden wieder her):
//   CONFIRM_BRIDGE_PROBES=YES node scripts/deploy/set_bridge_probes.mjs --zurueck
//
// Fail-closed: ohne Bestaetigung, ohne Zugangsdaten oder bei jedem Fehler
// wird nichts angefasst.
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const GRUPPE = process.env.SMEJJ_CHAT_BRIDGE_GROUP || "smejj-chat-bridge-v88b-live";
const PORT = 8080;

// Grosszuegig gewaehlt: Die Sonde soll einen TOTEN Dienst finden, nicht einen
// langsamen toeten. Der Container laedt sein Buendel beim Start aus dem Netz.
const HTTP_SONDEN = {
  startup_probe: {
    http: { path: "/health", port: PORT, scheme: "http", headers: [] },
    tcp: null,
    initial_delay_seconds: 10,
    period_seconds: 10,
    failure_threshold: 20, // ~200 s Zeit fuers Herunterladen des Buendels
    success_threshold: 1,
    timeout_seconds: 10
  },
  liveness_probe: {
    http: { path: "/health", port: PORT, scheme: "http", headers: [] },
    tcp: null,
    initial_delay_seconds: 60,
    period_seconds: 30,
    failure_threshold: 5, // erst nach ~2,5 min Ausfall ersetzen
    success_threshold: 1,
    timeout_seconds: 15
  }
};

/** Der Stand von vorher, fuer den Rueckweg. */
const TCP_SONDEN = {
  startup_probe: {
    tcp: { port: PORT },
    http: null,
    initial_delay_seconds: 0,
    period_seconds: 3,
    failure_threshold: 15,
    success_threshold: 2,
    timeout_seconds: 10
  },
  liveness_probe: {
    tcp: { port: PORT },
    http: null,
    initial_delay_seconds: 0,
    period_seconds: 10,
    failure_threshold: 3,
    success_threshold: 1,
    timeout_seconds: 30
  }
};

function abbruch(text) {
  console.error(text);
  process.exit(1);
}

function pflicht(name) {
  const wert = process.env[name];
  if (!wert) abbruch(`${name} fehlt in ~/.config/smejj.com/env.local — nichts geaendert.`);
  return wert;
}

async function main() {
  if (process.env.CONFIRM_BRIDGE_PROBES !== "YES") {
    abbruch("Sicherung: CONFIRM_BRIDGE_PROBES=YES erforderlich (Eingriff in die Live-Gruppe).");
  }
  const zurueck = process.argv.includes("--zurueck");
  loadSecureLocalEnv();
  const schluessel = pflicht("SALAD_API_KEY");
  const org = pflicht("SALAD_ORGANIZATION_NAME");
  const projekt = pflicht("SALAD_PROJECT_NAME");
  const basis = `https://api.salad.com/api/public/organizations/${org}/projects/${projekt}/containers/${GRUPPE}`;
  const kopf = { "Salad-Api-Key": schluessel, Accept: "application/json" };

  const vorher = await fetch(basis, { headers: kopf }).then((r) => r.json());
  const envVorher = Object.keys(vorher.container?.environment_variables || {});
  const befehlVorher = Boolean(vorher.container?.command?.length);
  console.log(`Gruppe ${GRUPPE}`);
  console.log(`  Umgebungsvariablen vorher: ${envVorher.length}`);
  console.log(`  startup_probe  vorher: ${JSON.stringify(vorher.startup_probe)}`);
  console.log(`  liveness_probe vorher: ${JSON.stringify(vorher.liveness_probe)}`);
  if (!envVorher.length || !befehlVorher) {
    abbruch("Die Gruppe hat keine Umgebung oder keinen Startbefehl — hier wird nichts angefasst.");
  }

  // EIN VERSUCH, EINE VARIABLE.
  //
  // Der erste Anlauf am 2026-08-05 stellte BEIDE Sonden zugleich um; danach
  // flatterte der Container, und die Ursache war nicht zuzuordnen — zumal eine
  // Parallel-Sitzung im selben Fenster auslieferte.
  //
  // `--nur-lebend` aendert deshalb ausschliesslich die Lebendsonde und laesst
  // die bewaehrte TCP-Startsonde in Ruhe. Dazu eine sehr geduldige Schwelle:
  // 20 Fehlversuche x 30 s = 10 Minuten, bevor Salad eingreift. Kommt die
  // Sonde gar nicht durch, bleiben also zehn Minuten zum Zusehen und
  // Zuruecknehmen, bevor irgendjemand etwas merkt.
  const NUR_LEBENDSONDE = {
    liveness_probe: {
      http: { path: "/health", port: PORT, scheme: "http", headers: [] },
      tcp: null,
      initial_delay_seconds: 120,
      period_seconds: 30,
      failure_threshold: 20,
      success_threshold: 1,
      timeout_seconds: 15
    }
  };
  const nurLebend = process.argv.includes("--nur-lebend");
  const rumpf = zurueck ? TCP_SONDEN : (nurLebend ? NUR_LEBENDSONDE : HTTP_SONDEN);
  console.log(`\nSetze ${zurueck ? "TCP" : (nurLebend ? "HTTP-Lebendsonde (Startsonde bleibt TCP)" : "HTTP")}-Sonden ...`);
  const antwort = await fetch(basis, {
    method: "PATCH",
    headers: { ...kopf, "Content-Type": "application/merge-patch+json" },
    body: JSON.stringify(rumpf)
  });
  if (!antwort.ok) abbruch(`Salad PATCH -> HTTP ${antwort.status}: ${(await antwort.text()).slice(0, 300)}`);

  const nachher = await fetch(basis, { headers: kopf }).then((r) => r.json());
  const envNachher = Object.keys(nachher.container?.environment_variables || {});
  console.log("\n--- Nachher ---");
  console.log(`  Umgebungsvariablen: ${envNachher.length} (vorher ${envVorher.length})`);
  console.log(`  Startbefehl vorhanden: ${Boolean(nachher.container?.command?.length)}`);
  console.log(`  startup_probe : ${JSON.stringify(nachher.startup_probe)}`);
  console.log(`  liveness_probe: ${JSON.stringify(nachher.liveness_probe)}`);

  // Die eigentliche Probe aufs Exempel: Die Umgebung MUSS unveraendert sein.
  const verloren = envVorher.filter((name) => !envNachher.includes(name));
  if (verloren.length) {
    abbruch(`\nALARM: ${verloren.length} Umgebungsvariablen verloren (${verloren.join(", ")}). `
      + "Sofort wiederherstellen — siehe scripts/deploy/create_lora_trainer_group.mjs als Muster.");
  }
  if (!nachher.container?.command?.length) abbruch("\nALARM: Der Startbefehl ist weg.");
  console.log("\nUmgebung und Startbefehl unveraendert. Die Sonden greifen beim naechsten Start.");
}

main().catch((fehler) => abbruch(`Unerwarteter Fehler: ${fehler?.message || fehler}`));
