// smejj.com — DPO Dataset Export & Training Preparation Pipeline
// Liest bewertete Praeferenzpaare aus dem RecordStore, formatiert sie in Standard-DPO/JSONL
// und stellt Trainings-Batches fuer LoRA/QLoRA-Schleifen auf IDrive e2 bereit.

import { createRecordStore } from "../admin/recordStore.js";

const dpoStore = createRecordStore("self-improvement/dpo-dataset", { maximal: 1000 });
const batchStore = createRecordStore("self-improvement/training-batches", { maximal: 100 });

/**
 * Formatiert ein DPO-Paar in das gaengige ChatML- / HuggingFace-DPO-Format.
 * @param {object} rawPair
 * @returns {object}
 */
export function formatDpoJsonlRecord(rawPair) {
  return {
    id: rawPair.id || `dpo_${Date.now()}`,
    prompt: [
      { role: "system", content: "Du bist der intelligente autonome Coding-Assistent von smejj.com." },
      { role: "user", content: String(rawPair.prompt || "").trim() }
    ],
    chosen: [
      { role: "assistant", content: String(rawPair.chosen || "").trim() }
    ],
    rejected: [
      { role: "assistant", content: String(rawPair.rejected || "").trim() }
    ],
    metadata: {
      generatedAt: rawPair.savedAt || new Date().toISOString(),
      scoreGap: rawPair.context?.chosenScore && rawPair.context?.rejectedScore
        ? rawPair.context.chosenScore - rawPair.context.rejectedScore
        : null
    }
  };
}

/**
 * Sammelt unkompilierte DPO-Eintraege und erzeugt ein versioniertes Trainings-Batch.
 * @param {object} options
 * @returns {Promise<{ok: boolean, batchId?: string, count: number, datasetJsonl?: string, error?: string}>}
 */
export async function compileTrainingBatch({ minRecords = 5, env = process.env } = {}) {
  try {
    const listResult = await dpoStore.liste({ env });
    if (!listResult.ok || !listResult.datensaetze || listResult.datensaetze.length < minRecords) {
      return {
        ok: false,
        count: listResult.datensaetze?.length || 0,
        error: `Zu wenige DPO-Datensaetze vorhanden (Minimum: ${minRecords}, Vorhanden: ${listResult.datensaetze?.length || 0}).`
      };
    }

    const records = listResult.datensaetze.map(formatDpoJsonlRecord);
    const jsonlLines = records.map((r) => JSON.stringify(r)).join("\n");
    const batchId = `batch_dpo_${Date.now()}_v${records.length}`;

    await batchStore.schreib({
      id: batchId,
      batchId,
      createdAt: new Date().toISOString(),
      recordCount: records.length,
      samplePrompt: records[0]?.prompt[1]?.content?.slice(0, 100) || "",
      status: "compiled_ready_for_lora"
    }, { env });

    return {
      ok: true,
      batchId,
      count: records.length,
      datasetJsonl: jsonlLines
    };
  } catch (err) {
    return { ok: false, count: 0, error: String(err?.message || err) };
  }
}
