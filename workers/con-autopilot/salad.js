// con-Autopilot — Salad-Steuerung (Single Responsibility: EINE Container-Gruppe als Job-Traeger).
//
// Muster wie der fruehere LoRA-Trainer: pytorch-Basisabbild, Code als base64-
// Buendel in einer Umgebungsvariablen, /health zuerst. Die Gruppe heisst
// CON_SALAD_GRUPPE (Standard con-job), wird EINMAL angelegt (replicas 0,
// autostart false, restart never) und je Job nur umkonfiguriert und gestartet.
// Jeder Start traegt: Zeitgrenze (CON_JOB_MAX_MINUTEN im Job + Autopilot-Wache)
// und Selbstabschaltung (SALAD_* im Job). Ohne beides wird nicht gestartet.
import { baueBuendel } from "./tarball.js";

const API = "https://api.salad.com/api/public";

export function saladClient(konfig, { fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  if (!konfig?.ok) throw new Error("Salad nicht konfiguriert: " + (konfig?.fehlend || []).join(", "));
  const basis = `/organizations/${konfig.organisation}/projects/${konfig.projekt}/containers`;
  async function anfrage(method, pfad, body) {
    let r;
    try {
      r = await fetchImpl(API + pfad, {
        method, signal: AbortSignal.timeout(timeoutMs),
        headers: { "Salad-Api-Key": konfig.apiKey, accept: "application/json", ...(body ? { "content-type": body.merge ? "application/merge-patch+json" : "application/json" } : {}) },
        body: body ? JSON.stringify(body.merge ? body.daten : body) : undefined
      });
    } catch (e) {
      return { ok: false, status: 0, grund: "salad_unerreichbar:" + String(e?.message || e).slice(0, 80) };
    }
    const text = await r.text();
    let daten = null;
    try { daten = text ? JSON.parse(text) : null; } catch { daten = { roh: text.slice(0, 300) }; }
    return { ok: r.ok, status: r.status, daten };
  }
  return {
    gruppe: konfig.gruppe,
    lese: () => anfrage("GET", `${basis}/${konfig.gruppe}`),
    erzeuge: (payload) => anfrage("POST", basis, payload),
    aktualisiere: (patch) => anfrage("PATCH", `${basis}/${konfig.gruppe}`, { merge: true, daten: patch }),
    starte: () => anfrage("POST", `${basis}/${konfig.gruppe}/start`),
    stoppe: () => anfrage("POST", `${basis}/${konfig.gruppe}/stop`),
    instanzen: () => anfrage("GET", `${basis}/${konfig.gruppe}/instances`)
  };
}

export const STARTBEFEHL = [
  "bash", "-lc",
  [
    "set -eu",
    "export PATH=\"/opt/conda/bin:$PATH\"",
    "mkdir -p /app /work && cd /app",
    "printf %s \"$CON_JOB_BUNDLE_B64\" | base64 -d | tar xzf -",
    "cd /app/con-job",
    "pip install --no-cache-dir -q boto3 > /tmp/pip-boto3.log 2>&1",
    "exec python3 job.py"
  ].join("\n")
];

/** Grundgeruest der Gruppe (ohne Job-Env). */
export function gruppenPayload(konfig, { name = konfig.gruppe } = {}) {
  return {
    name,
    display_name: "con-Autopilot Job Spiegel Messung Training",
    autostart_policy: false,
    restart_policy: "never",
    replicas: 1,
    container: {
      image: konfig.image,
      image_caching: true,
      command: STARTBEFEHL,
      resources: {
        cpu: konfig.vcpu,
        memory: konfig.ramMb,
        gpu_classes: konfig.gpuKlassen,
        storage_amount: Math.round(konfig.speicherGb * 1024 * 1024 * 1024),
        shm_size: 1024
      },
      priority: konfig.prioritaet,
      environment_variables: { PORT: "8080", CON_JOB_MODUS: "messung" }
    },
    networking: { protocol: "http", port: 8080, auth: true, load_balancer: "round_robin",
      client_request_timeout: 100000, server_response_timeout: 100000, single_connection_limit: false },
    startup_probe: { http: { path: "/health", port: 8080, scheme: "http", headers: [] }, initial_delay_seconds: 20, period_seconds: 15, timeout_seconds: 10, success_threshold: 1, failure_threshold: 20 },
    liveness_probe: { http: { path: "/health", port: 8080, scheme: "http", headers: [] }, initial_delay_seconds: 0, period_seconds: 30, timeout_seconds: 15, success_threshold: 1, failure_threshold: 6 }
  };
}

/** Umgebungsvariablen eines Jobs: Buendel + e2 + Salad-Selbststopp + Job-Parameter. Werte werden nie protokolliert. */
export function jobUmgebung({ konfig, e2, salad, jobId, modus, parameter = {}, buendelB64, maxMinuten }) {
  return {
    PORT: "8080",
    CON_JOB_ID: jobId,
    CON_JOB_MODUS: modus,
    CON_JOB_MAX_MINUTEN: String(maxMinuten),
    CON_JOB_BUNDLE_B64: buendelB64,
    CON_BASIS_REPO: konfig.basis.repo,
    CON_BASIS_PREFIX: konfig.basis.prefix,
    CON_SELBST_STOP: "YES",
    IDRIVE_E2_ENDPOINT: e2.endpoint,
    IDRIVE_E2_REGION: e2.region,
    IDRIVE_E2_BUCKET: e2.bucket,
    IDRIVE_E2_ACCESS_KEY: e2.accessKey,
    IDRIVE_E2_SECRET_KEY: e2.secretKey,
    SALAD_ORGANIZATION_NAME: salad.organisation,
    SALAD_PROJECT_NAME: salad.projekt,
    SALAD_CONTAINER_GROUP_NAME: salad.gruppe,
    SALAD_API_KEY: salad.apiKey,
    ...Object.fromEntries(Object.entries(parameter).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))
  };
}

/**
 * Gruppe sicherstellen (anlegen, wenn sie fehlt) und mit der Job-Umgebung versehen.
 * Liefert {ok, angelegt, gruende}. Kostet nichts: replicas=1 mit autostart=false startet nichts.
 */
export async function bereiteJobVor({ client, konfig, e2, jobId, modus, parameter, maxMinuten, log = () => {} }) {
  // Die Suiten kommen aus dem EINEN Quellverzeichnis, nicht aus einer Kopie im Job-Ordner.
  // Fehlt der Pfad, bricht der Start ab: ein Buendel ohne Latte wuerde einen Messlauf
  // starten, der nichts misst — und dafuer volle Miete kosten.
  if (!konfig.suitesDir) return { ok: false, gruende: ["suites_verzeichnis_fehlt"] };
  const buendel = baueBuendel(konfig.jobDir, { zusatz: { suites: konfig.suitesDir } });
  const env = jobUmgebung({ konfig, e2, salad: konfig.salad, jobId, modus, parameter, buendelB64: buendel.b64, maxMinuten });
  const vorhanden = await client.lese();
  let angelegt = false;
  if (vorhanden.status === 404) {
    const payload = gruppenPayload(konfig.salad);
    payload.container.environment_variables = env;
    const r = await client.erzeuge(payload);
    if (!r.ok) return { ok: false, gruende: [`gruppe_anlegen_${r.status}:${JSON.stringify(r.daten).slice(0, 200)}`] };
    angelegt = true;
    log(`Salad-Gruppe ${konfig.salad.gruppe} angelegt`);
  } else if (!vorhanden.ok) {
    return { ok: false, gruende: [`gruppe_lesen_${vorhanden.status}`] };
  } else {
    const zustand = vorhanden.daten?.current_state?.status;
    if (zustand && zustand !== "stopped" && zustand !== "failed") {
      // VERWAISTER CONTAINER: die Gruppe laeuft, aber der Autopilot fuehrt keinen Job dazu.
      // Am 05.09. blockierte genau das den Kreislauf ueber vier Stunden — und ein Container,
      // den niemand fuehrt, kostet trotzdem Miete. Einmal stoppen und beim naechsten Takt
      // neu ansetzen ist immer richtig: ein Job, der noch laeuft, wird nie hierher geleitet
      // (der Kreislauf beobachtet ihn dann und plant gar nicht erst).
      log(`Gruppe laeuft ohne gefuehrten Job (${zustand}) — verwaister Container, wird gestoppt`);
      const s = await client.stoppe();
      return { ok: false, gruende: [`verwaister_container_gestoppt:${zustand}:http_${s.status}`] };
    }
    // WICHTIG: environment_variables wird als Ganzes ERSETZT (Lehre Salad/Zeabur 2026-08) — darum immer die komplette Liste.
    const r = await client.aktualisiere({ container: { environment_variables: env, command: STARTBEFEHL,
      resources: { cpu: konfig.salad.vcpu, memory: konfig.salad.ramMb, gpu_classes: konfig.salad.gpuKlassen,
        storage_amount: Math.round(konfig.salad.speicherGb * 1024 * 1024 * 1024), shm_size: 1024 }, priority: konfig.salad.prioritaet }, replicas: 1 });
    if (!r.ok) return { ok: false, gruende: [`gruppe_aktualisieren_${r.status}:${JSON.stringify(r.daten).slice(0, 200)}`] };
  }
  return { ok: true, angelegt, buendelSha256: buendel.sha256, buendelDateien: buendel.dateien.length };
}

export async function gruppenZustand(client) {
  const r = await client.lese();
  if (!r.ok) return { ok: false, status: r.status, zustand: r.status === 404 ? "fehlt" : "unbekannt" };
  const d = r.daten || {};
  return { ok: true, zustand: d.current_state?.status || "unbekannt", replicas: d.replicas, instanzen: d.current_state?.instance_status_count || null,
    aktualisiert: d.current_state?.update_time || null, jobId: d.container?.environment_variables?.CON_JOB_ID || null, modus: d.container?.environment_variables?.CON_JOB_MODUS || null };
}
