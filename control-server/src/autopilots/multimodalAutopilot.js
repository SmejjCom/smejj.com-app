// smejj.com — Multimodaler Audio/Vision KI-Autopilot
// Steuert und aufbereitet multimodale Streams (Audio-Chunks, Bild-Frames) für Live-Sprach- und Sehen-Interaktionen.

export const MULTIMODAL_CONFIG = Object.freeze({
  supportedMimeTypes: ["image/jpeg", "image/png", "image/webp", "audio/wav", "audio/mp3", "audio/webm"],
  maxImageSizeMb: 5,
  maxAudioChunkMs: 10000
});

export function validateMultimodalInput(inputPayload) {
  if (!inputPayload || typeof inputPayload !== "object") {
    return { valid: false, reason: "Payload muss ein Objekt sein." };
  }

  const { mimeType, data, text } = inputPayload;

  if (text && typeof text !== "string") {
    return { valid: false, reason: "Text-Payload muss vom Typ String sein." };
  }

  if (mimeType) {
    if (!MULTIMODAL_CONFIG.supportedMimeTypes.includes(mimeType)) {
      return { valid: false, reason: `Nicht unterstützter MIME-Typ: ${mimeType}` };
    }

    if (!data || typeof data !== "string") {
      return { valid: false, reason: "Multimodale Daten müssen als Base64-String übergeben werden." };
    }
  }

  return { valid: true };
}

export function formatMultimodalPromptPayload(inputPayload) {
  const validation = validateMultimodalInput(inputPayload);
  if (!validation.valid) {
    throw new Error(`Ungültiges multimodales Format: ${validation.reason}`);
  }

  const parts = [];

  if (inputPayload.text) {
    parts.push({ text: inputPayload.text });
  }

  if (inputPayload.mimeType && inputPayload.data) {
    parts.push({
      inlineData: {
        mimeType: inputPayload.mimeType,
        data: inputPayload.data
      }
    });
  }

  return {
    contents: [
      {
        role: "user",
        parts
      }
    ],
    timestamp: new Date().toISOString()
  };
}

export function processAudioChunkStream(chunks = []) {
  if (!Array.isArray(chunks)) return { chunksCount: 0, totalBytes: 0 };
  let totalBytes = 0;
  for (const chunk of chunks) {
    if (chunk && chunk.data) {
      totalBytes += chunk.data.length;
    }
  }
  return {
    chunksCount: chunks.length,
    totalBytes,
    readyForInference: chunks.length > 0
  };
}
