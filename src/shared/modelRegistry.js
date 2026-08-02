import { GLM_5_2_FP8_STATUS, KIMI_K2_7_STATUS } from "./platform.js";

export const DEFAULT_MODEL_ID = "glm-5-2";
export const AUTO_MODEL_ID = "auto";

// MARKENNAMEN ZEIGEN AUF DEN KONFIGURIERTEN STANDARD, NICHT AUF EINEN ANBIETER
// (Live-Befund 2026-08-02). "smejj 1.0" ist der Name, den die Startseite bei
// JEDER Anfrage mitschickt (public/app.js) und den der Modellwaehler anzeigt.
// Er stand als Alias bei glm-5-2 — damit war jede Anfrage eine AUSDRUECKLICHE
// Wahl von GLM, und SMEJJ_MODEL_DEFAULT konnte nie greifen. Der Betreiber
// stellte den Standard auf kimi-k2-7, /api/health meldete ihn auch, und
// trotzdem antwortete weiter GLM.
// Das Frontend meint es laengst richtig: public/premium-surfaces.js prueft
// `selectedName === "smejj 1.0" && model.id === registry.defaultModelId` —
// die Marke bezeichnet dort schon das Standardmodell. Nur die Alias-Tabelle
// widersprach. Ein Markenname ist keine Anbieterwahl.
export const BRAND_ALIASES = Object.freeze(new Set(["smejj 1.0", "smejj code"]));

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const DISABLED_VALUES = new Set(["0", "false", "no", "off"]);

export const MODEL_REGISTRY = Object.freeze({
  [DEFAULT_MODEL_ID]: Object.freeze({
    id: DEFAULT_MODEL_ID,
    name: "GLM-5.2",
    aliases: Object.freeze(["glm-5.2", "glm-5-2-fp8"]),
    provider: "zhipu",
    status: "production-primary",
    contextTokens: 1_000_000,
    codingCapability: "flagship",
    enabledByDefault: true,
    featureFlag: "SMEJJ_GLM_5_2_ENABLED",
    fallbackModelId: null,
    storage: Object.freeze({
      provider: "idrive-e2",
      bucketEnv: "IDRIVE_E2_MODEL_BUCKET",
      prefix: "model-files/glm-5-2-fp8/original/",
      vaultStatusId: GLM_5_2_FP8_STATUS.id
    }),
    capabilities: Object.freeze({
      chat: true,
      coding: true,
      fileAnalysis: true,
      projectAnalysis: true,
      agentTasks: true,
      streaming: true,
      patchPlanning: true,
      testExplanation: true
    }),
    runtime: Object.freeze({
      envPrefix: "ZHIPU",
      defaultBaseUrl: "https://api.z.ai/api/paas/v4",
      defaultModel: "glm-5.2",
      defaultHeader: "Authorization",
      storageFirstMode: "glm-5.2-storage-first",
      engines: Object.freeze(["openai-compatible", "sglang", "vllm", "ktransformers"]),
      workerEngines: Object.freeze(["sglang", "vllm", "ktransformers"]),
      requiredLocalCacheGb: 704,
      recommendedRamGb: 64
    })
  }),
  "kimi-k2-7": Object.freeze({
    id: "kimi-k2-7",
    name: "Kimi K2.7",
    aliases: Object.freeze(["kimi k2.7", "kimi-k2.7", "kimi k2.7 code", "kimi-k2-7-code"]),
    provider: "kimi",
    status: "storage-verified-runtime-configurable",
    contextTokens: 262_144,
    codingCapability: "agentic-coding",
    enabledByDefault: false,
    featureFlag: "SMEJJ_KIMI_K2_7_ENABLED",
    fallbackModelId: DEFAULT_MODEL_ID,
    storage: Object.freeze({
      provider: "idrive-e2",
      bucketEnv: "IDRIVE_E2_MODEL_BUCKET",
      prefix: "model-files/kimi-k2-7/original/",
      vaultStatusId: KIMI_K2_7_STATUS.id
    }),
    capabilities: Object.freeze({
      chat: true,
      coding: true,
      fileAnalysis: true,
      projectAnalysis: true,
      agentTasks: true,
      streaming: true,
      patchPlanning: true,
      testExplanation: true
    }),
    runtime: Object.freeze({
      envPrefix: "KIMI",
      defaultBaseUrl: "",
      defaultModel: "moonshotai/Kimi-K2.7-Code",
      defaultHeader: "Authorization",
      storageFirstMode: "kimi-k2.7-storage-first",
      engines: Object.freeze(["openai-compatible", "sglang", "vllm", "ktransformers"]),
      workerEngines: Object.freeze(["sglang", "vllm", "ktransformers"]),
      requiredLocalCacheGb: 555,
      recommendedRamGb: 128
    })
  }),
  // Kimi K3 — REIN ueber die Anbieter-API (Moonshot), KEIN Vault in IDrive e2.
  // Bewusste Abweichung von GLM-5.2/K2.7: die offenen Gewichte sind ~594 GB bis
  // 1,4 TB (MXFP4) und brauchen ein Mehr-Knoten-GPU-Cluster; ein e2-Abzug waere
  // Speicher ohne Laufzeit. Darum storage: null und ausschliesslich API-Betrieb.
  // Endpunkt und Modell-ID laut Moonshot-Quickstart: https://api.moonshot.ai/v1
  // mit model "kimi-k3" (OpenAI-kompatibel, Bearer-Auth).
  // FAIL-CLOSED: ohne SMEJJ_KIMI_K3_ENABLED + API-Key ist das Modell inaktiv und
  // der Router faellt auf GLM-5.2 zurueck. K3 ist kostenpflichtig — es wird nie
  // automatisch aktiv und verdraengt GLM-5.2 nicht als Standard.
  "kimi-k3": Object.freeze({
    id: "kimi-k3",
    name: "Kimi K3",
    aliases: Object.freeze(["kimi k3", "kimi-k3", "k3", "kimi k3 max"]),
    provider: "kimi",
    status: "api-only-runtime-configurable",
    contextTokens: 1_000_000,
    codingCapability: "flagship",
    enabledByDefault: false,
    featureFlag: "SMEJJ_KIMI_K3_ENABLED",
    fallbackModelId: DEFAULT_MODEL_ID,
    storage: null,
    capabilities: Object.freeze({
      chat: true,
      coding: true,
      fileAnalysis: true,
      projectAnalysis: true,
      agentTasks: true,
      streaming: true,
      patchPlanning: true,
      testExplanation: true
    }),
    runtime: Object.freeze({
      envPrefix: "KIMI_K3",
      // K2.7 und K3 liegen auf DEMSELBEN Moonshot-Konto. Ist kein eigener
      // K3-Key gesetzt, wird der bereits ausgerollte K2.7-Key genutzt — sonst
      // muesste derselbe Wert ein zweites Mal von Hand in die Umgebung
      // getippt werden. Ein eigener SMEJJ_LLM_KIMI_K3_API_KEY hat Vorrang.
      // Fail-closed bleibt bestehen: ohne SMEJJ_KIMI_K3_ENABLED laeuft nichts.
      keyFallbackEnvPrefix: "KIMI",
      defaultBaseUrl: "https://api.moonshot.ai/v1",
      defaultModel: "kimi-k3",
      defaultHeader: "Authorization",
      storageFirstMode: null,
      engines: Object.freeze(["openai-compatible"]),
      workerEngines: Object.freeze([]),
      requiredLocalCacheGb: 0,
      recommendedRamGb: 0
    })
  }),
  // smejj fast 1.0 — EIGENES, selbst gehostetes Modell auf gemieteter Salad-GPU.
  // Zweck: kurze Chat-Antworten (Profil "fast"), waehrend GLM-5.2 das
  // Qualitaets-/Coding-Fundament bleibt.
  //
  // BASIS: Qwen/Qwen3-8B, Apache-2.0 (kommerzielle Nutzung UND Fine-Tuning
  // erlaubt — der spaetere smejj-1-0-Pfad bleibt offen). Dichtes 8B-Modell,
  // GGUF UD-Q4_K_XL (5,14 GB) im Eimer IDRIVE_E2_MODEL_BUCKET unter
  // model-files/smejj-1-0/original/.
  //
  // DAS KLEINERE MODELL IST DAS BESSERE — gemessen, nicht vermutet. Beide mit
  // derselben Quantisierung (UD-Q4_K_XL) und derselben Suite (14 Faelle, je 5
  // Ziehungen, Transportweg provider, Kette auf salad verengt):
  //   Qwen3-8B  (5,14 GB)  92,9 % ± 2,3   0 Totalausfaelle   Median  659 ms
  //   Qwen3-14B (9,2  GB)  87,6 % ± 1,3   1 Totalausfall     Median  974 ms
  // Das 8B ist zusaetzlich 44 % kleiner und startet damit nach einer Salad-
  // Umverteilung deutlich frueher wieder — auf einer Plattform aus fremden
  // Privatrechnern ist die Kaltstartzeit ein Verfuegbarkeitswert.
  //
  // DIE GROESSE IST EINE STARTZEIT-ENTSCHEIDUNG, KEINE VRAM-ENTSCHEIDUNG.
  // Gemessen am 2026-08-01: llama.cpp laedt die Gewichte beim Start von
  // Hugging Face, und diese Ladezeit laeuft gegen die Salad-Startsonde. Deren
  // Obergrenze ist hart — initial_delay max 1200 s + failure_threshold max 20 x
  // period max 120 s = 60 Minuten. Ein 17,7-GB-Abbild
  // (Qwen3-Coder-30B-A3B-Instruct, ebenfalls Apache-2.0) wurde auf dem
  // zugeteilten Knoten in 60 Minuten NICHT fertig: Salad meldete zweimal
  // "Instance Interrupted (Startup Probe Failure)" und begann den Download von
  // vorn — eine Endlosschleife, in der der Dienst nie antwortet. 5,14 GB laufen
  // dagegen mit grosser Reserve durch. Wer die Gewichtsgroesse waehlt, waehlt
  // die Startzeit mit; auf 24 GB VRAM haette auch das 30B-Abbild gepasst.
  //
  // Ebenfalls verworfen: Qwen3.6-35B-A3B (der frueher hier eingetragene
  // Kandidat) — dessen UD-Q4_K_XL ist 22,4 GB und laesst auf einer 24-GB-Karte
  // keinen Platz fuer den KV-Zwischenspeicher bei 32k Kontext.
  //
  // Qwen3 denkt standardmaessig. Die Container Group setzt darum
  // LLAMA_ARG_CHAT_TEMPLATE_KWARGS={"enable_thinking":false} — sonst frisst der
  // Denkabschnitt das Token-Budget kurzer Anfragen auf und die Antwort bleibt
  // leer (dieselbe Falle wie in src/evaluation/evalTransport.js beschrieben).
  //
  // WARUM NICHT GLM-5.2 oder Kimi K2.7 aus dem eigenen Lager: deren Gewichte
  // sind 755,7 GB bzw. 595,2 GB und brauchen ein Mehr-Knoten-GPU-Cluster mit
  // 80-GB-Karten. Der Salad-Katalog hat (gemessen am 2026-08-01) 42 GPU-Klassen,
  // die groesste ist eine RTX 5090 mit 32 GB. Selbst hosten ist dort also nicht
  // teuer, sondern schlicht nicht bestellbar. GLM-5.2 bleibt darum ueber die
  // Anbieter-API das Fundament; das Lager ist Unabhaengigkeits-Reserve.
  //
  // Laufzeit: llama.cpp-Server auf Salad (Container Group smejj-fast-1); der
  // runtimeModel-Wert MUSS dem LLAMA_ARG_ALIAS der Container Group entsprechen
  // (dort auf "smejj-fast-1" gesetzt), sonst antwortet der Server 404.
  // FAIL-CLOSED: ohne SMEJJ_FAST_1_ENABLED + KEY ist das Modell inaktiv; der
  // Router faellt dann automatisch auf GLM-5.2 zurueck (fallbackModelId).
  "smejj-fast-1": Object.freeze({
    id: "smejj-fast-1",
    name: "smejj fast 1.0",
    aliases: Object.freeze(["smejj fast", "smejj-fast", "qwen3-8b"]),
    provider: "salad",
    status: "self-hosted-runtime-configurable",
    // Ausgeliefert wird, was der Dienst wirklich oeffnet (LLAMA_ARG_CTX_SIZE),
    // nicht was das Basismodell koennte (262 144). Ein zu grosser Wert hier
    // laesst die Oberflaeche Kontext versprechen, den der Server abschneidet.
    contextTokens: 32_768,
    codingCapability: "agentic-coding",
    enabledByDefault: false,
    featureFlag: "SMEJJ_FAST_1_ENABLED",
    fallbackModelId: DEFAULT_MODEL_ID,
    storage: Object.freeze({
      provider: "idrive-e2",
      bucketEnv: "IDRIVE_E2_MODEL_BUCKET",
      prefix: "model-files/smejj-1-0/original/",
      vaultStatusId: null
    }),
    capabilities: Object.freeze({
      chat: true,
      coding: true,
      fileAnalysis: true,
      projectAnalysis: false,
      agentTasks: false,
      streaming: true,
      patchPlanning: false,
      testExplanation: true
    }),
    runtime: Object.freeze({
      envPrefix: "FAST",
      // Bleibt bewusst LEER. Die Laufzeit-Adresse der Container Group kommt
      // ausschliesslich aus SMEJJ_LLM_FAST_BASE_URL (siehe .env.example).
      // Ein hier fest eingetragener Standard wuerde die dreiteilige
      // Fail-closed-Zusicherung (Flag + Adresse + Schluessel) auf zwei Teile
      // verkuerzen — dann genuegte ein versehentlich gesetztes Flag samt Key,
      // um Anfragen an eine Adresse zu schicken, die niemand bestaetigt hat.
      defaultBaseUrl: "",
      // Muss exakt dem LLAMA_ARG_ALIAS der Salad Container Group entsprechen.
      defaultModel: "smejj-fast-1",
      defaultHeader: "Salad-Api-Key",
      storageFirstMode: "smejj-fast-self-hosted",
      engines: Object.freeze(["openai-compatible", "llama.cpp", "vllm", "sglang"]),
      workerEngines: Object.freeze(["llama.cpp", "vllm", "sglang"]),
      requiredLocalCacheGb: 20,
      recommendedRamGb: 24
    })
  })
});

const MODEL_ALIASES = new Map(
  Object.values(MODEL_REGISTRY).flatMap((model) => (
    [model.id, model.name, ...model.aliases].map((alias) => [normalizeAlias(alias), model.id])
  ))
);

export function getModelDefinition(modelId) {
  return MODEL_REGISTRY[normalizeModelId(modelId)] || null;
}

export function normalizeModelId(value) {
  const alias = normalizeAlias(value);
  if (!alias) return DEFAULT_MODEL_ID;
  if (alias === AUTO_MODEL_ID) return AUTO_MODEL_ID;
  return MODEL_ALIASES.get(alias) || null;
}

export function isModelEnabled(modelOrId, env = process.env) {
  const model = typeof modelOrId === "string" ? getModelDefinition(modelOrId) : modelOrId;
  if (!model) return false;
  return readFlag(env[model.featureFlag], model.enabledByDefault);
}

export function getModelRuntimeConfig(modelOrId, env = process.env, profile = "default") {
  const model = typeof modelOrId === "string" ? getModelDefinition(modelOrId) : modelOrId;
  if (!model) return null;
  const prefix = model.runtime.envPrefix;
  const fallbackPrefix = model.runtime.keyFallbackEnvPrefix;
  const keys = uniqueKeys(env[`SMEJJ_LLM_${prefix}_API_KEY`], env[`SMEJJ_LLM_${prefix}_API_KEYS`]);
  // Nur wenn fuer dieses Modell gar kein eigener Key gesetzt ist, wird der Key
  // eines ausdruecklich benannten Schwestermodells beim selben Anbieter genutzt.
  const effectiveKeys = keys.length > 0 || !fallbackPrefix
    ? keys
    : uniqueKeys(env[`SMEJJ_LLM_${fallbackPrefix}_API_KEY`], env[`SMEJJ_LLM_${fallbackPrefix}_API_KEYS`]);
  const profileKey = `SMEJJ_LLM_${prefix}_MODEL_${String(profile || "default").toUpperCase()}`;
  const baseUrl = trimUrl(env[`SMEJJ_LLM_${prefix}_BASE_URL`] || model.runtime.defaultBaseUrl);
  const runtimeModel = String(env[profileKey] || env[`SMEJJ_LLM_${prefix}_MODEL`] || model.runtime.defaultModel || "").trim();
  const apiKeyHeader = String(env[`SMEJJ_LLM_${prefix}_HEADER`] || model.runtime.defaultHeader).trim();
  return {
    modelId: model.id,
    provider: model.provider,
    baseUrl,
    runtimeModel,
    apiKeyHeader,
    apiKeys: effectiveKeys,
    keySource: keys.length > 0 || effectiveKeys.length === 0 ? prefix : fallbackPrefix,
    configured: Boolean(baseUrl && runtimeModel && effectiveKeys.length > 0)
  };
}

/**
 * Weitere einsatzbereite Modelle als Ersatz, in Registry-Reihenfolge.
 * Nur Modelle, die aktiv UND vollstaendig konfiguriert sind — geraten wird nichts.
 */
function weitereErsatzmodelle(bereits, profile, env) {
  const zusatz = [];
  for (const model of Object.values(MODEL_REGISTRY)) {
    if (model.id === AUTO_MODEL_ID || bereits.includes(model.id)) continue;
    if (!isModelEnabled(model, env)) continue;
    if (!getModelRuntimeConfig(model, env, profile).configured) continue;
    zusatz.push(model.id);
  }
  return zusatz;
}

/**
 * Bekannt ausgefallene Modelle ans ENDE. Stabil, damit die Reihenfolge sonst
 * unveraendert bleibt: ohne Gesundheitsdaten aendert sich gar nichts.
 */
function nachGesundheitSortiert(ids, health) {
  if (!health || typeof health !== "object") return ids;
  const ausgefallen = (id) => health[id] && health[id].available === false;
  return [...ids.filter((id) => !ausgefallen(id)), ...ids.filter(ausgefallen)];
}

/**
 * @param {object} options.health optionaler Laufzeit-Gesundheitsstand
 *   ({ [modelId]: { available: boolean } }), z. B. aus
 *   control-server/src/llm/modelRuntimeHealth.js. Fehlt er, verhaelt sich die
 *   Funktion exakt wie zuvor — die Reihenfolge haengt dann allein an der Konfiguration.
 */
export function resolveModelSelection({ requestedModel, profile = "default", env = process.env, health = null } = {}) {
  // KEINE ANGABE IST KEINE WAHL (Live-Befund 2026-08-02).
  // normalizeModelId("") liefert das fest eingebaute DEFAULT_MODEL_ID. Reicht man
  // das ungeprueft weiter, sieht eine Anfrage OHNE Modellangabe aus wie die
  // ausdrueckliche Wahl von glm-5-2 (reason "explicit_model") — und
  // SMEJJ_MODEL_DEFAULT wird ausgerechnet im haeufigsten Fall wirkungslos.
  // Live belegt: der Betreiber stellte den Standard auf kimi-k2-7, /api/health
  // meldete ihn auch, aber 7 von 8 Anfragen gingen weiter an glm-5-2 — nur die,
  // die ausdruecklich "auto" schickten, landeten richtig. Coding antwortete
  // dadurch in 19,7 s (glm-4.7-flash) statt in 3,5 s (Kimi).
  // Ein Markenname ("smejj 1.0") ist wie "keine Angabe" zu behandeln: er sagt
  // "das Modell der Plattform", nicht "dieser Anbieter". Siehe BRAND_ALIASES.
  const rohAngabe = String(requestedModel ?? "").trim();
  const istMarkenname = BRAND_ALIASES.has(normalizeAlias(rohAngabe));
  const requestedId = rohAngabe && !istMarkenname ? normalizeModelId(rohAngabe) : "";
  const defaultId = enabledDefaultModelId(env);
  const autoRequested = requestedId === AUTO_MODEL_ID;
  const autoEnabled = readFlag(env.SMEJJ_MODEL_AUTO_ENABLED, false);
  let selectedId = requestedId && requestedId !== AUTO_MODEL_ID ? requestedId : defaultId;
  let reason = requestedId ? "explicit_model" : "default_model";

  if (autoRequested) {
    selectedId = autoEnabled ? autoModelId(profile, env, defaultId) : defaultId;
    reason = autoEnabled ? "auto_profile_selection" : "auto_disabled_default_used";
  }

  const selected = MODEL_REGISTRY[selectedId] || MODEL_REGISTRY[defaultId];
  const enabled = isModelEnabled(selected, env);
  const fallbackAllowed = readFlag(env.SMEJJ_MODEL_FALLBACK_ENABLED, true);
  const candidateIds = [];
  if (enabled) candidateIds.push(selected.id);
  if ((!enabled || selected.id !== defaultId) && fallbackAllowed && !candidateIds.includes(defaultId)) candidateIds.push(defaultId);
  // Live gemessen am 2026-08-02: Ist das gewaehlte Modell zugleich das Standard-
  // modell, war die zweite Bedingung falsch und die Kette hatte GENAU EINEN
  // Eintrag — der Fallback zeigte auf sich selbst. Faellt dieses eine Modell aus,
  // bekam jeder Nutzer HTTP 502, obwohl zwei gesunde Modelle konfiguriert waren.
  // Darum: bei erlaubtem Fallback kommen alle weiteren einsatzbereiten Modelle
  // dahinter, und bekannt ausgefallene rutschen ans Ende.
  if (fallbackAllowed) candidateIds.push(...weitereErsatzmodelle(candidateIds, profile, env));
  const geordnet = nachGesundheitSortiert(candidateIds, health);

  return {
    requestedModel: String(requestedModel || ""),
    requestedModelId: requestedId || defaultId,
    selectedModelId: geordnet[0] || (enabled ? selected.id : defaultId),
    candidateIds: geordnet,
    fallbackAllowed,
    autoRequested,
    autoEnabled,
    reason: enabled ? reason : "requested_model_inactive"
  };
}

export function getPublicModelRegistry(env = process.env, runtimeHealth = {}) {
  const defaultModelId = enabledDefaultModelId(env);
  const models = Object.values(MODEL_REGISTRY).map((model) => {
    const active = isModelEnabled(model, env);
    const runtime = getModelRuntimeConfig(model, env);
    const runtimeConfigured = active && runtime.configured;
    const health = publicRuntimeHealth(runtimeHealth[model.id]);
    const runtimeAvailable = runtimeConfigured && health?.available === true;
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      status: modelPublicStatus({ active, runtimeConfigured, health }),
      contextTokens: model.contextTokens,
      codingCapability: model.codingCapability,
      active,
      selectable: active,
      runtimeConfigured,
      runtimeAvailable,
      default: model.id === defaultModelId,
      fallbackModelId: model.fallbackModelId,
      storage: model.storage,
      capabilities: model.capabilities,
      runtime: {
        model: runtime.runtimeModel,
        engines: model.runtime.engines,
        health
      }
    };
  });
  return {
    version: 1,
    defaultModelId,
    auto: {
      id: AUTO_MODEL_ID,
      active: readFlag(env.SMEJJ_MODEL_AUTO_ENABLED, false),
      status: readFlag(env.SMEJJ_MODEL_AUTO_ENABLED, false) ? "ready" : "prepared-inactive"
    },
    models
  };
}

function modelPublicStatus({ active, runtimeConfigured, health }) {
  if (!active) return "inactive";
  if (!runtimeConfigured) return "fallback-only";
  if (health?.available === false) return "degraded";
  if (health?.available === true) return "ready";
  return "configured-unverified";
}

function publicRuntimeHealth(health) {
  if (!health || typeof health !== "object") return null;
  return {
    status: String(health.status || "unknown"),
    available: health.available === true,
    checkedAt: health.checkedAt || null,
    source: health.source || null,
    consecutiveFailures: Number(health.consecutiveFailures || 0),
    reason: health.reason || null
  };
}

function enabledDefaultModelId(env) {
  const configured = normalizeModelId(env.SMEJJ_MODEL_DEFAULT);
  if (configured && configured !== AUTO_MODEL_ID && isModelEnabled(configured, env)) return configured;
  return DEFAULT_MODEL_ID;
}

function autoModelId(profile, env, defaultId) {
  const kimi = MODEL_REGISTRY["kimi-k2-7"];
  const kimiRuntime = getModelRuntimeConfig(kimi, env, profile);
  if (profile === "coding" && isModelEnabled(kimi, env) && kimiRuntime.configured) return kimi.id;
  // Profil "fast": kurze Anfragen gehen an das eigene, selbst gehostete Modell —
  // aber NUR wenn es aktiviert UND vollstaendig konfiguriert ist (fail-closed).
  // Sonst bleibt GLM-5.2 zustaendig; Qualitaet geht vor Tempo.
  const fast = MODEL_REGISTRY["smejj-fast-1"];
  const fastRuntime = getModelRuntimeConfig(fast, env, profile);
  if (profile === "fast" && isModelEnabled(fast, env) && fastRuntime.configured) return fast.id;
  return defaultId;
}

function readFlag(value, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (ENABLED_VALUES.has(normalized)) return true;
  if (DISABLED_VALUES.has(normalized)) return false;
  return fallback;
}

function normalizeAlias(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function trimUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function uniqueKeys(...values) {
  return [...new Set(values.flatMap((value) => String(value || "").split(/[,\n]/)).map((key) => key.trim()).filter(Boolean))];
}
