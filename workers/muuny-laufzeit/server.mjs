// muuny Laufzeit — Start: Motor wach halten, Freigabe beobachten, Anfragen beantworten.
//
// Umgebung (alle Werte ausser dem Schluessel haben sichere Standards):
//   MUUNY_LAUFZEIT_SCHLUESSEL   Pflicht. Ohne ihn antwortet nur /health.
//   IDRIVE_E2_*                 Zugang zum Lager (Freigabe, Grundmodell, Adapter)
//   MUUNY_LAGER_PREFIX          Standard "muuny"
//   MUUNY_LLAMA_BINAER          Standard /opt/llama/llama-server
//   MUUNY_LLAMA_THREADS         Standard 4 — auf einem geteilten Rechner bewusst klein
//   MUUNY_KONTEXT               Standard 4096
//   MUUNY_CACHE                 Standard /var/cache/muuny
//   PORT                        Standard 8090
//   MUUNY_RADAR_URL             optional: muuny ai radar fuer gepruefte Recherche im Prompt
import http from "node:http";
import { e2AusUmgebung } from "../smejj-hausmodell/e2.js";
import { Warteschlange } from "../smejj-hausmodell/warteschlange.js";
import { lagerPrefix } from "../muuny-autopilot/lager.js";
import { FreigabeWaechter, PRUEF_INTERVALL_MS } from "./freigabe.js";
import { baueBehandlung, radarWissen } from "./laufzeit.js";
import { WacherMotor } from "./motor.js";

const env = process.env;
const log = (...a) => console.log(new Date().toISOString(), "[muuny-laufzeit]", ...a);
const p = lagerPrefix(env);

const schlange = new Warteschlange({ deckel: 1, maxWartend: 8, wartefristMs: 120_000, protokoll: { log } });
const istBeschaeftigt = () => schlange.laufend > 0 || schlange.wartend.length > 0;
const motor = new WacherMotor({
  binaer: env.MUUNY_LLAMA_BINAER || "/opt/llama/llama-server",
  threads: Number(env.MUUNY_LLAMA_THREADS) > 0 ? Number(env.MUUNY_LLAMA_THREADS) : 4,
  kontext: Number(env.MUUNY_KONTEXT) > 0 ? Number(env.MUUNY_KONTEXT) : 4096,
  protokoll: { log, warn: log }
});
const waechter = new FreigabeWaechter({
  e2: e2AusUmgebung(env), freigabeSchluessel: `${p}freigabe.json`, grundmodellSchluessel: `${p}grundmodell/gguf.json`,
  cacheVerzeichnis: env.MUUNY_CACHE || "/var/cache/muuny", motor, istBeschaeftigt, protokoll: { log, warn: log }
});

// Optional: gepruefte Recherche von muuny ai radar (MUUNY_RADAR_URL + MUUNY_DIENST_SCHLUESSEL).
const wissen = radarWissen({ url: String(env.MUUNY_RADAR_URL || "").trim(), dienstSchluessel: String(env.MUUNY_DIENST_SCHLUESSEL || "").trim() });
const behandle = baueBehandlung({ schluessel: String(env.MUUNY_LAUFZEIT_SCHLUESSEL || "").trim(), motor, waechter, schlange, wissen });
const server = http.createServer((req, res) => behandle(req, res).catch((f) => {
  log("Fehler", f?.message);
  if (!res.headersSent) { res.writeHead(500, { "content-type": "application/json" }); res.end('{"error":{"message":"intern"}}'); }
  else res.end();
}));

const hafen = Number(env.PORT) > 0 ? Number(env.PORT) : 8090;
server.listen(hafen, "0.0.0.0", async () => {
  log(`lauscht auf ${hafen}`);
  // Beim Start laden — nicht erst bei der ersten Frage.
  const r = await waechter.pruefe().catch((f) => ({ grund: f.message }));
  log("Start:", JSON.stringify(r));
  setInterval(() => waechter.pruefe().then((x) => x.geaendert && log("Freigabe:", JSON.stringify(x))).catch(() => {}), PRUEF_INTERVALL_MS).unref();
  // Wach halten: jede Minute pruefen, Neustart nur ueber den Waechter (sha256 vor der Benutzung).
  motor.wachHalten({ intervallMs: 60_000, istBeschaeftigt, neustart: () => waechter.neustart() });
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => { await motor.stoppe(); process.exit(0); });
}
