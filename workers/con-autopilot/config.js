// con-Autopilot — Konfiguration aus der Umgebung (Single Responsibility: Env -> Konfig, fail-closed).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2KonfigAusEnv } from "./e2.js";
import { leseGrenzen, STANDARD_GPU_KLASSEN } from "./budget.js";

export const WORKER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(WORKER_DIR, "../..");

export function leseKonfig(env = process.env) {
  const e2 = e2KonfigAusEnv(env);
  const salad = {
    organisation: String(env.SALAD_ORGANIZATION_NAME || "").trim(),
    projekt: String(env.SALAD_PROJECT_NAME || "").trim(),
    apiKey: String(env.SALAD_API_KEY || "").trim(),
    gruppe: String(env.CON_SALAD_GRUPPE || "con-job").trim(),
    gpuKlassen: String(env.CON_GPU_KLASSEN || "").split(",").map((s) => s.trim()).filter(Boolean),
    prioritaet: String(env.CON_SALAD_PRIORITAET || "medium").trim(),
    image: String(env.CON_SALAD_IMAGE || "docker.io/pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime").trim(),
    speicherGb: Number(env.CON_SALAD_SPEICHER_GB) > 0 ? Number(env.CON_SALAD_SPEICHER_GB) : 150,
    ramMb: Number(env.CON_SALAD_RAM_MB) > 0 ? Number(env.CON_SALAD_RAM_MB) : 30720,
    vcpu: Number(env.CON_SALAD_VCPU) > 0 ? Number(env.CON_SALAD_VCPU) : 8
  };
  if (!salad.gpuKlassen.length) salad.gpuKlassen = [...STANDARD_GPU_KLASSEN];
  const saladFehlend = [!salad.organisation && "SALAD_ORGANIZATION_NAME", !salad.projekt && "SALAD_PROJECT_NAME", !salad.apiKey && "SALAD_API_KEY"].filter(Boolean);
  return {
    aktiviert: String(env.CON_AUTOPILOT_ENABLED || "").toUpperCase() === "YES",
    port: Number(env.PORT) > 0 ? Number(env.PORT) : 8080,
    host: env.SMEJJ_HOST || "0.0.0.0",
    taktMs: Number(env.CON_TAKT_MS) >= 30_000 ? Number(env.CON_TAKT_MS) : 5 * 60_000,
    adminKey: String(env.CON_ADMIN_KEY || "").trim(),
    basis: {
      repo: String(env.CON_BASIS_REPO || "Qwen/Qwen3.8-27B").trim(),
      prefix: String(env.CON_BASIS_PREFIX || "con/base/qwen3.8-27b").trim()
    },
    messEndpunkt: String(env.CON_MESS_ENDPUNKT || "").trim(), // optional: OpenAI-kompatibler Endpunkt (Mac-MLX, Canary)
    messModell: String(env.CON_MESS_MODELL || "default").trim(),
    wiederholungen: Math.max(1, Math.min(5, Number(env.CON_WIEDERHOLUNGEN) || 1)),
    grenzen: leseGrenzen(env),
    e2,
    salad: { ...salad, ok: saladFehlend.length === 0, fehlend: saladFehlend },
    suitesDir: path.join(WORKER_DIR, "suites"),
    jobDir: path.join(WORKER_DIR, "salad-job")
  };
}
