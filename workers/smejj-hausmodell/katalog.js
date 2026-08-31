// smejj.com Hausmodell — Katalog der Modelle, die der Dienst kennt.
//
// LAUF-MODELLE laufen wirklich auf dem Tencent-Silicon-Valley-Server
// (2 Kerne, 8 GB, davon rund 3,2 GB frei — live gemessen 2026-09-01).
// ARCHIV-MODELLE gehoeren dem Betreiber, passen aber nicht in 8 GB; sie
// stehen hier nur, damit die Registry sie fuehrt, und tragen status
// "archive-only". Der Dienst weigert sich, sie zu starten.
//
// Alle sha256-Werte stammen aus der Hugging-Face-LFS-Kennung (die IST der
// SHA256 der Datei) und wurden am 2026-09-01 live abgefragt. Sie sind die
// Sollwerte, gegen die jeder Download geprueft wird.

/** Modelle, die der Dienst starten darf. */
export const LAUF_MODELLE = [
  {
    id: "bitnet-b1.58-2b-4t",
    anzeige: "Hausmodell BitNet 2B (kostenlos)",
    version: "1.58-2B-4T-tq2_0",
    format: "gguf-tq2_0",
    stufe: "production",
    standard: true,
    // TQ2_0 statt Microsofts I2_S: I2_S liest NUR bitnet.cpp, TQ2_0 liest
    // Standard-llama.cpp. Damit kommt der Dienst mit EINEM Motor aus.
    datei: "bitnet-2b4t-tq2_0.gguf",
    sizeBytes: 1203563648,
    sha256: "9f8e1097502528a0d80d885c603ea7ee3e4d214a6685356e39baaf697c02cbb6",
    hfRepo: "Synapticode/bitnet-b1.58-2B-4T-tq2_0-gguf",
    hfDatei: "bitnet-2b4t-tq2_0.gguf",
    lizenz: "MIT",
    ramSchaetzungMb: 900,
    kontext: 4096
  },
  {
    id: "qwen3.5-4b",
    anzeige: "Hausmodell Qwen 4B (kostenlos, Reserve)",
    version: "3.5-4B-Q4_K_M",
    format: "gguf-q4_k_m",
    stufe: "production",
    standard: false,
    datei: "Qwen3.5-4B-Q4_K_M.gguf",
    sizeBytes: 2740937888,
    sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
    hfRepo: "unsloth/Qwen3.5-4B-GGUF",
    hfDatei: "Qwen3.5-4B-Q4_K_M.gguf",
    lizenz: "Apache-2.0",
    // 2,74 GB Datei plus KV-Cache liegt dicht an den freien 3,2 GB. Deshalb
    // Reserve, nicht Standard: erst starten, wenn der Bild-Maler schlaeft.
    ramSchaetzungMb: 3100,
    kontext: 4096
  }
];

/**
 * Besitz-Archiv. Diese Modelle laufen auf 2C/8GB NICHT. Sie werden nur
 * gelagert — und jeder Upload kostet e2-Lager, deshalb steht die
 * Groessenschaetzung dabei und jeder braucht Einzel-Freigabe.
 */
export const ARCHIV_MODELLE = [
  { id: "kimi-k3", anbieter: "Moonshot", version: "K3", format: "gguf-q4", geschaetztGb: 1500 },
  { id: "deepseek-v4-pro", anbieter: "DeepSeek", version: "V4 Pro", format: "safetensors", geschaetztGb: 450 },
  { id: "glm-5.3-flash", anbieter: "Z.ai", version: "GLM-5.3-Flash", format: "safetensors", geschaetztGb: 180 },
  { id: "minimax-m3", anbieter: "MiniMax", version: "M3", format: "safetensors", geschaetztGb: 120 },
  { id: "llama-4-maverick", anbieter: "Meta", version: "Llama 4 Maverick", format: "safetensors", geschaetztGb: 230 },
  { id: "gpt-oss-120b", anbieter: "OpenAI", version: "gpt-oss-120b", format: "safetensors", geschaetztGb: 65 },
  { id: "mistral-small-4", anbieter: "Mistral", version: "Small 4", format: "safetensors", geschaetztGb: 18 },
  { id: "gemma-4-26b", anbieter: "Google", version: "Gemma 4 26B", format: "safetensors", geschaetztGb: 16 },
  { id: "phi-4-14b", anbieter: "Microsoft", version: "Phi-4 14B", format: "safetensors", geschaetztGb: 9 }
];


/**
 * Zusatzmodelle aus der Umgebung (JSON-Array in SMEJJ_HAUSMODELL_ZUSATZMODELLE).
 * So kommt ein neues Modell in den Dienst, ohne dass ein Deploy noetig ist —
 * und der Waechter-TUEV kann mit einem winzigen Modell pruefen, statt 1,2 GB
 * durch die Leitung zu ziehen.
 */
function zusatzModelle() {
  const roh = process.env.SMEJJ_HAUSMODELL_ZUSATZMODELLE;
  if (!roh) return [];
  try {
    const liste = JSON.parse(roh);
    if (!Array.isArray(liste)) return [];
    return liste.filter((m) => m && m.id && m.datei && m.sha256 && m.sizeBytes).map((m) => ({ stufe: "staging", kontext: 4096, ...m }));
  } catch {
    console.error("[katalog] SMEJJ_HAUSMODELL_ZUSATZMODELLE ist kein gueltiges JSON — wird ignoriert");
    return [];
  }
}

/** Alle startbaren Modelle: fest verdrahtete plus Zusatzmodelle. */
export function alleLaufModelle() {
  return [...LAUF_MODELLE, ...zusatzModelle()];
}

export function findeLaufModell(id) {
  const alle = alleLaufModelle();
  if (!id) return standardModell();
  return alle.find((m) => m.id === id) || null;
}

export function standardModell() {
  const alle = alleLaufModelle();
  return alle.find((m) => m.standard) || alle[0];
}

/** e2-Schluessel der Modelldatei innerhalb der Registry. */
export function e2Schluessel(modell) {
  return `models/${modell.stufe}/${modell.id}/${modell.datei}`;
}

export function e2ManifestSchluessel(modell) {
  return `models/${modell.stufe}/${modell.id}/manifest.json`;
}

export function e2PruefsummenSchluessel(modell) {
  return `models/${modell.stufe}/${modell.id}/sha256.txt`;
}

/** Baut das manifest.json in der vom Betreiber vorgegebenen Form. */
export function baueManifest(modell, { hochgeladenAm = new Date().toISOString(), status = "ready" } = {}) {
  return {
    model_id: modell.id,
    version: modell.version,
    format: modell.format,
    size_bytes: modell.sizeBytes,
    sha256: modell.sha256,
    storage: {
      provider: "idrive-e2",
      bucket: process.env.IDRIVE_E2_BUCKET || "smejj-model-files",
      key: e2Schluessel(modell)
    },
    status,
    anzeige: modell.anzeige,
    lizenz: modell.lizenz,
    quelle: { hf_repo: modell.hfRepo, hf_datei: modell.hfDatei },
    ram_schaetzung_mb: modell.ramSchaetzungMb,
    kontext: modell.kontext,
    hochgeladen_am: hochgeladenAm
  };
}

/** Archiv-Eintrag ohne Datei: Besitz vermerkt, Lauf ausgeschlossen. */
export function baueArchivManifest(eintrag, { angelegtAm = new Date().toISOString() } = {}) {
  return {
    model_id: eintrag.id,
    version: eintrag.version,
    format: eintrag.format,
    size_bytes: null,
    sha256: null,
    storage: { provider: "idrive-e2", bucket: process.env.IDRIVE_E2_BUCKET || "smejj-model-files", key: `models/archive/${eintrag.id}/` },
    status: "archive-only",
    anbieter: eintrag.anbieter,
    geschaetzt_gb: eintrag.geschaetztGb,
    hinweis: "Auf 2 Kernen / 8 GB nicht lauffaehig. Lagerung nur nach Einzel-Freigabe des Betreibers (e2 kostet rund 4 USD je TB und Monat).",
    angelegt_am: angelegtAm
  };
}
