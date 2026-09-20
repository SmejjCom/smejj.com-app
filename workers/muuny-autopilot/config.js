// muuny AI — Konfiguration aus der Umgebung (Single Responsibility: Env -> Konfig, fail-closed).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2KonfigAusEnv } from "./e2.js";
import { leseGrenzen, STANDARD_GPU_KLASSEN } from "./budget.js";
import { lagerPrefix, wert } from "./lager.js";

export const WORKER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(WORKER_DIR, "../..");

export function leseKonfig(env = process.env) {
  const e2 = e2KonfigAusEnv(env);
  const salad = {
    organisation: String(env.SALAD_ORGANIZATION_NAME || "").trim(),
    projekt: String(env.SALAD_PROJECT_NAME || "").trim(),
    apiKey: String(env.SALAD_API_KEY || "").trim(),
    gruppe: String(wert(env, "SALAD_GRUPPE") || "muuny-job").trim(),
    gpuKlassen: String(wert(env, "GPU_KLASSEN") || "").split(",").map((s) => s.trim()).filter(Boolean),
    // "batch" ist die guenstigste Stufe (24-GB-Karten: 0,09-0,16 statt 0,20-0,25 USD/h).
    // Der Preis dafuer ist Wartezeit, bis ein Rechner frei wird — und Warten kostet den
    // Autopiloten nichts, er tickt ohnehin nur alle fuenf Minuten.
    prioritaet: String(wert(env, "SALAD_PRIORITAET") || "batch").trim(),
    image: String(wert(env, "SALAD_IMAGE") || "docker.io/pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime").trim(),
    speicherGb: Number(wert(env, "SALAD_SPEICHER_GB")) > 0 ? Number(wert(env, "SALAD_SPEICHER_GB")) : 150,
    ramMb: Number(wert(env, "SALAD_RAM_MB")) > 0 ? Number(wert(env, "SALAD_RAM_MB")) : 30720,
    vcpu: Number(wert(env, "SALAD_VCPU")) > 0 ? Number(wert(env, "SALAD_VCPU")) : 8
  };
  if (!salad.gpuKlassen.length) salad.gpuKlassen = [...STANDARD_GPU_KLASSEN];
  const saladFehlend = [!salad.organisation && "SALAD_ORGANIZATION_NAME", !salad.projekt && "SALAD_PROJECT_NAME", !salad.apiKey && "SALAD_API_KEY"].filter(Boolean);
  return {
    aktiviert: String(wert(env, "AUTOPILOT_ENABLED") || "").toUpperCase() === "YES",
    port: Number(env.PORT) > 0 ? Number(env.PORT) : 8080,
    host: env.SMEJJ_HOST || "0.0.0.0",
    taktMs: Number(wert(env, "TAKT_MS")) >= 30_000 ? Number(wert(env, "TAKT_MS")) : 5 * 60_000,
    adminKey: String(wert(env, "ADMIN_KEY") || "").trim(),
    basis: {
      repo: String(wert(env, "BASIS_REPO") || "Qwen/Qwen3.8-27B").trim(),
      prefix: String(wert(env, "BASIS_PREFIX") || `${lagerPrefix(env)}base/qwen3.8-27b`).trim()
    },
    messEndpunkt: String(wert(env, "MESS_ENDPUNKT") || "").trim(), // optional: OpenAI-kompatibler Endpunkt (Mac-MLX, Canary)
    messModell: String(wert(env, "MESS_MODELL") || "default").trim(),
    wiederholungen: Math.max(1, Math.min(5, Number(wert(env, "WIEDERHOLUNGEN")) || 1)),
    grenzen: leseGrenzen(env),
    e2,
    salad: { ...salad, ok: saladFehlend.length === 0, fehlend: saladFehlend },
    lagerPrefix: lagerPrefix(env),
    suitesDir: path.join(WORKER_DIR, "suites"),
    jobDir: path.join(WORKER_DIR, "salad-job")
  };
}
