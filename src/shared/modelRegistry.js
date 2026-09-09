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
// "smejj", "smejj-latest" (2026-09-05, Betreiber-Auftrag "neue Version uebernimmt
// alles"): der Alias der Modellfamilie. Zeigt auf das Standardmodell — und
// auf die stable-Version des Versionsregisters, sobald Nr. 83 sie live
// geschaltet hat (siehe control-server/src/llm/smejjAlias.js).
export const BRAND_ALIASES = Object.freeze(new Set([
  "smejj 1.0", "smejj 1.1", "smejj 1.2", "smejj 1.3",
  "smejj code", "smejj", "smejj-latest", "smejj latest"
]));

// Auto ist per Vorgabe AN (Betreiber 2026-09-10). Bis dahin stand die Vorgabe
// auf false: "auto" kam an, wurde erkannt — und nahm dann still das
// Standardmodell. Der Schalter SMEJJ_MODEL_AUTO_ENABLED bleibt, um Auto im
// Notfall ohne Deploy abstellen zu koennen.
const AUTO_STANDARD_AN = true;

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
    // Waehlbarkeit fuer "Auto" (2026-09-10). Live laeuft dahinter derzeit
    // glm-4.5-flash, das GRATIS-Kontingent des Anbieters (Umstellung 07.09.,
    // nachdem das bezahlte Kontingent leer war) — darum "gratis" und nicht
    // "guthaben". Tempo 6 von 10: gemessen 19,7 s fuer eine Coding-Antwort
    // (02.08.), also solide, aber nicht schnell.
    auswahl: Object.freeze({ kostenklasse: "gratis", tempo: 6, eigen: false }),
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
      // AUSWEICHMODELL SEIT 2026-09-07 — der Anbieter lehnt glm-5.2 ab.
      //
      // Live gemessen mit dem echten Schluessel gegen api.z.ai:
      //   glm-5.2       429 "Insufficient balance or no resource package"
      //   glm-4.6       429 desselben Inhalts
      //   glm-4.5-air   429 desselben Inhalts
      //   glm-4.5-flash 200 — antwortet normal ("Paris ist die Hauptstadt von
      //                 Frankreich.", 31 s, finish_reason "stop")
      // Ueber die zweite Anbieteradresse kam der Grund im Klartext:
      // "Weekly/Monthly Limit Exhausted. Your limit will reset at
      //  2026-09-10 17:06:51".
      //
      // Folge im Betrieb: /api/health meldete glm-5-2 als degraded
      // (runtimeAvailable=false, 48 Fehlschlaege in Folge). Weil KEIN anderes
      // Modell konfiguriert ist, war die tiefe Spur damit komplett tot —
      // "Nachdenken", Auto und Codieren antworteten gar nicht mehr.
      //
      // glm-4.5-flash laeuft im Freikontingent, verursacht also keine neuen
      // Kosten. ZURUECKSTELLEN auf "glm-5.2", sobald das Kontingent zurueck
      // ist (fruehestens 2026-09-10 17:06) oder Guthaben aufgeladen wurde.
      // Der Anzeigename der Marke bleibt unveraendert.
      defaultModel: "glm-4.5-flash",
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
    // Waehlbarkeit fuer "Auto": Anbieter-API auf Guthaben. Tempo 8 —
    // gemessen 3,5 s fuer dieselbe Coding-Antwort, fuer die GLM 19,7 s
    // brauchte (02.08.). Stark beim Programmieren, kostet aber echtes Geld.
    auswahl: Object.freeze({ kostenklasse: "guthaben", tempo: 8, eigen: false }),
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
    // Waehlbarkeit fuer "Auto": wie K2.7 auf Guthaben, groesseres
    // Kontextfenster. Tempo 7 — GESCHAETZT, nicht gemessen: fuer K3 liegt
    // keine eigene Messung vor.
    auswahl: Object.freeze({ kostenklasse: "guthaben", tempo: 7, eigen: false }),
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
  // Ox Alpha stand hier seit dem 26.08.2026 als drittes Modell im Menue
  // (OpenRouter, Slug "stealth/ox-alpha"). Betreiber-Ansage 2026-09-06: das
  // Modell ist abgeschafft und kommt nicht wieder — restlos entfernt, nicht
  // stillgelegt. Ein Eintrag, der auf einen abgeschalteten Anbieter zeigt, ist
  // kein Platzhalter fuer spaeter, sondern ein Versprechen ohne Deckung; genau
  // daran ist Kimi K2.7 aufgefallen (siehe KIMI_K2_7_STATUS in platform.js).
  //
  // Das Menue im Frontend ist seit SW v786 bereits ohne Ox Alpha live. Dieser
  // Commit zieht den Control-Server nach: solange der Eintrag hier stand,
  // meldete /api/health das Modell weiter, obwohl es niemand mehr waehlen kann.
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
    // Waehlbarkeit fuer "Auto": unser eigenes, selbst gehostetes Modell.
    // Rechenzeit auf Salad kostet stundenweise, aber es geht kein Geld an einen
    // fremden Anbieter und die Daten bleiben im Haus — darum "eigen". Tempo 9:
    // dafuer ist es gebaut. Kontextfenster 32.768, also nichts fuer Coding mit
    // mehreren Dateien; das schliesst bewerteFuerAuto selbst aus.
    auswahl: Object.freeze({ kostenklasse: "eigen", tempo: 9, eigen: true }),
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
  }),
  // smejj 1 — die trainierte Modellfamilie (Qwen3-4B-Instruct-2507 + LoRA-
  // Adapter aus datasets/smejj-1-1, erster Lauf 05.09.2026). WELCHE Version
  // (smejj-1-1, smejj-1-2 …) bedient wird, steht NICHT hier, sondern im
  // Versionsregister smejj/versionen auf e2 (src/shared/smejjVersionen.js);
  // Autopilot Nr. 83 haengt den Alias "smejj" nach bestandener Messung um.
  // Dieser Eintrag ist nur die Laufzeit-Anbindung — fail-closed wie smejj fast
  // 1.0: Flag + Adresse + Schluessel, sonst bleibt das Standardmodell zustaendig.
  "smejj-1": Object.freeze({
    id: "smejj-1",
    name: "smejj 1",
    aliases: Object.freeze(["smejj-1", "smejj 1.x", "smejj-1-x"]),
    // Laufzeit ist der Hausmodell-Dienst (workers/smejj-hausmodell, Zeabur
    // untitled-1, llama.cpp, ctx 4096, Bearer-Schluessel) — nicht Salad.
    // Katalog-Kennung dort: smejj-1-basis (SMEJJ_LLM_SMEJJ1_MODEL).
    provider: "hausmodell",
    status: "self-hosted-runtime-configurable",
    contextTokens: 4_096,
    codingCapability: "assistant",
    enabledByDefault: false,
    featureFlag: "SMEJJ_1_ENABLED",
    fallbackModelId: DEFAULT_MODEL_ID,
    storage: Object.freeze({
      provider: "idrive-e2",
      bucketEnv: "IDRIVE_E2_MODEL_BUCKET",
      prefix: "models/staging/qwen3-4b-instruct/",
      vaultStatusId: null
    }),
    // Waehlbarkeit fuer "Auto": das Hausmodell, das langfristige Ziel des
    // Projekts. Tempo 7 GESCHAETZT. Kontextfenster 4.096 — genug fuer kurze
    // Fragen, zu wenig fuer Programmieraufgaben.
    auswahl: Object.freeze({ kostenklasse: "eigen", tempo: 7, eigen: true }),
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
      envPrefix: "SMEJJ1",
      // Unser eigener Dienst auf Zeabur mit fester Adresse — darum darf sie
      // hier stehen (bei smejj fast 1.0 blieb sie leer, weil Salad-Adressen
      // wechseln). Fail-closed bleibt zweiteilig: Flag + Schluessel.
      defaultBaseUrl: "https://smejj-hausmodell.zeabur.app/v1",
      defaultModel: "smejj-1-basis",
      defaultHeader: "Authorization",
      storageFirstMode: "smejj-self-hosted",
      engines: Object.freeze(["openai-compatible", "vllm", "llama.cpp"]),
      workerEngines: Object.freeze(["vllm", "llama.cpp"]),
      requiredLocalCacheGb: 12,
      recommendedRamGb: 16
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
/**
 * @param {string|null} options.aliasZiel Registry-Modell, auf das der Alias
 *   "smejj" gerade zeigt (aus smejjAlias.js). Greift NUR bei Anfragen ohne
 *   ausdrueckliche Anbieterwahl (leer oder Markenname) und nur, wenn das Ziel
 *   freigegeben und konfiguriert ist — sonst verhaelt sich alles wie zuvor.
 */
export function resolveModelSelection({ requestedModel, profile = "default", env = process.env, health = null, aliasZiel = null } = {}) {
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
  const autoEnabled = readFlag(env.SMEJJ_MODEL_AUTO_ENABLED, AUTO_STANDARD_AN);
  let selectedId = requestedId && requestedId !== AUTO_MODEL_ID ? requestedId : defaultId;
  let reason = requestedId ? "explicit_model" : "default_model";
  // ALIAS "smejj" (2026-09-05): keine Angabe oder Markenname heisst "das Modell
  // der Plattform" — und das ist die stable-Version des Versionsregisters,
  // sobald sie live-tauglich und bedienbar ist. Ein ausdruecklich gewaehlter
  // Anbieter bleibt eine ausdrueckliche Wahl.
  const aliasId = aliasZiel && MODEL_REGISTRY[aliasZiel] && aliasZiel !== AUTO_MODEL_ID ? aliasZiel : null;
  const aliasGreift = Boolean(aliasId) && !requestedId && isModelEnabled(aliasId, env) && getModelRuntimeConfig(aliasId, env, profile).configured;
  if (aliasGreift) { selectedId = aliasId; reason = "smejj_alias"; }

  if (autoRequested) {
    selectedId = autoEnabled ? autoModelId(profile, env, defaultId, health) : defaultId;
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
    alias: aliasGreift ? aliasId : null,
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
      active: readFlag(env.SMEJJ_MODEL_AUTO_ENABLED, AUTO_STANDARD_AN),
      status: readFlag(env.SMEJJ_MODEL_AUTO_ENABLED, AUTO_STANDARD_AN) ? "ready" : "prepared-inactive"
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

/**
 * Waehlt fuer ein Profil das geeignetste LAUFENDE Modell.
 *
 * Betreiber 2026-09-10: "Auto soll automatisch das geeignetste verfuegbare
 * Modell fuer die jeweilige Aufgabe auswaehlen. Beruecksichtige: Aufgabe, Chat,
 * Coding, Reasoning, Geschwindigkeit, Kontextgroesse, verfuegbare Ressourcen,
 * API-Gesundheit, Kosten, lokale Modelle, kostenlose Modelle, eigene
 * smejj-Modelle, Fallback-Moeglichkeiten."
 *
 * Vorher standen hier zwei if-Zeilen: Coding -> Kimi, Fast -> smejj-fast-1,
 * sonst Standard. Drei Modelle, zwei Regeln, keine Kosten, keine Gesundheit —
 * und jedes neue Modell haette eine weitere if-Zeile gebraucht.
 *
 * DIE REIHENFOLGE DER KRITERIEN IST NICHT BELIEBIG:
 *   1. KANN ES DIE AUFGABE? Ein Modell, dessen Kontextfenster zu klein ist
 *      oder das kein Coding kann, ist kein guenstiger Kandidat — es ist gar
 *      keiner. Qualitaet geht vor Tempo und vor Kosten.
 *   2. LAEUFT ES WIRKLICH? fail-closed: ohne Schluessel/Konfiguration kein
 *      Kandidat, und ein bekannt ausgefallenes Modell rutscht ans Ende.
 *   3. ERST DANN Kosten und Tempo. Das ist die Betreiber-Reihenfolge aus dem
 *      Auftrag: eigene und kostenlose Modelle zuerst ("so trocken wie moeglich
 *      verbrauchen und trotzdem perfekter Service"), Guthaben zuletzt.
 *
 * Reine Funktion ohne Netz — damit die Wahl pruefbar bleibt.
 */
export function bewerteFuerAuto(model, profile, env, health = null) {
  if (!model || model.id === AUTO_MODEL_ID) return null;
  if (!isModelEnabled(model, env)) return null;
  if (!getModelRuntimeConfig(model, env, profile).configured) return null;

  const kann = model.capabilities || {};
  const wahl = model.auswahl || {};
  const gesund = !(health && health[model.id] && health[model.id].available === false);

  // 1. Eignung — ein "Nein" hier ist ein Ausschluss, kein Abzug.
  //
  // Die Profile kommen aus ROUTING_PROFILES (modelRouter.js):
  //   coding | reasoning | fast | web | default
  // "reasoning" MUSS hier stehen: ohne eigenen Zweig fiel es durch alle
  // Bedingungen und wurde wie eine kurze Alltagsfrage behandelt — dann gewann
  // das schnellste kleine Modell ausgerechnet die Aufgabe, bei der es um
  // Nachdenken geht. Aufgefallen an tests/model-registry.test.mjs.
  const grosseAufgabe = profile === "coding" || profile === "reasoning";
  if (profile === "coding" && !kann.coding) return null;
  // NUR das Profil "fast" darf ein kleines Modell nehmen.
  //
  // Unter 100.000 Tokens ist ein Modell fuer alles ausser kurzen Fragen keine
  // Sparsamkeit, sondern ein abgeschnittener Auftrag (smejj-1 hat 4.096,
  // smejj-fast-1 32.768). Diese Grenze stand sinngemaess schon im Bestand
  // ("smejj fast 1.0 verdraengt GLM-5.2 NICHT bei coding/reasoning/default —
  // Qualitaet geht vor Tempo") und gilt jetzt fuer jedes Modell statt fuer
  // eines. Ausgeschlossen heisst nicht verloren: als Ersatz bleibt es in der
  // Kette (weitereErsatzmodelle), falls das bessere ausfaellt.
  if (profile !== "fast" && Number(model.contextTokens || 0) < 100_000) return null;
  if (!kann.chat) return null;

  // 2. KOSTENGRENZE — und zwar hart, nicht als Punktabzug.
  //
  // Ein Modell, das echtes Guthaben zieht, waehlt die Automatik NIE von sich
  // aus. Der Nutzer kann es jederzeit von Hand waehlen; dann ist es seine
  // Entscheidung und er sieht sie. Diese Regel stand schon vor dem Umbau im
  // Bestand ("K3 ist kostenpflichtig und darf niemals ohne ausdrueckliches
  // Flag + Key greifen", tests/model-registry.test.mjs) — sie war dort nur
  // inkonsequent: Kimi K2.7 durfte bei Coding doch automatisch greifen,
  // obwohl es beim selben Anbieter dasselbe Geld kostet.
  //
  // Ein Punktabzug haette das nicht getragen: sobald das kostenlose Modell
  // ausfaellt oder fehlt, haette die Automatik still Geld ausgegeben. Der
  // Betreiber-Grundsatz ist das Gegenteil ("so trocken wie moeglich
  // verbrauchen und trotzdem perfekter Service").
  if (wahl.kostenklasse === "guthaben") return null;

  // 3. Punkte. Hoeher ist besser; die Gewichte stehen bewusst hier und nicht
  //    verteilt im Code, damit man sie an EINER Stelle nachlesen kann.
  let punkte = 0;
  if (!gesund) punkte -= 100;                       // ausgefallen: nur als letzte Wahl
  if (wahl.eigen) punkte += 30;                     // Projektziel: eigene Modelle zuerst
  if (wahl.kostenklasse === "gratis") punkte += 25;
  if (profile === "fast") punkte += Number(wahl.tempo || 0) * 3;
  if (grosseAufgabe) {
    // Bei grossen Aufgaben zaehlt Koennen, nicht Tempo.
    if (model.codingCapability === "flagship") punkte += 20;
    if (model.codingCapability === "agentic-coding") punkte += 15;
    punkte += Math.min(10, Math.round(Number(model.contextTokens || 0) / 100_000));
  }
  // "web" und "default" sind ausgewogen: Tempo zaehlt, aber nur einfach.
  if (profile === "default" || profile === "web") punkte += Number(wahl.tempo || 0);
  return { id: model.id, punkte, gesund };
}

function autoModelId(profile, env, defaultId, health = null) {
  const bewertet = Object.values(MODEL_REGISTRY)
    .map((model) => bewerteFuerAuto(model, profile, env, health))
    .filter(Boolean)
    .sort((a, b) => b.punkte - a.punkte || a.id.localeCompare(b.id));
  // Fail-safe: findet die Bewertung keinen Kandidaten (alles aus, nichts
  // konfiguriert), bleibt es beim Standardmodell — Auto darf nie eine
  // Sackgasse sein. Genau daran ist der alte Auto-Weg gescheitert.
  return bewertet.length > 0 ? bewertet[0].id : defaultId;
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
