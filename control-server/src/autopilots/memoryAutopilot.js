// smejj.com — Memory & Langzeitgedächtnis KI-Autopilot
// Extrahiert fortlaufend wichtige Fakten, Vorlieben und Kontext aus Chats und hält das Nutzerprofil aktuell.

import { createRecordStore } from "../admin/recordStore.js";

const memoryStore = createRecordStore("user-memory", { maximal: 500 });

export const MEMORY_CONFIG = Object.freeze({
  maxMemoriesPerUser: 100,
  confidenceThreshold: 0.7
});

export function extractUserFacts(chatMessages = []) {
  if (!Array.isArray(chatMessages) || chatMessages.length === 0) {
    return [];
  }

  const extractedFacts = [];
  const factPatterns = [
    { pattern: /(?:ich heiße|mein name ist|ich bin)\s+([A-Za-zÄöüÄÖÜß]+)(?:\s+und|\s+ich|\s+wohne|\.|\,|$)/i, category: "identity", key: "name" },
    { pattern: /(?:ich wohne in|ich lebe in|mein wohnort ist)\s+([A-Za-zÄöüÄÖÜß]+)(?:\s+und|\s+ich|\.|\,|$)/i, category: "location", key: "location" },
    { pattern: /(?:ich arbeite als|mein beruf ist|ich bin von beruf)\s+([A-Za-zÄöüÄÖÜß]+)(?:\s+und|\s+ich|\.|\,|$)/i, category: "profession", key: "job" },
    { pattern: /(?:ich mag|ich liebe|mein lieblings(?:fach|gericht|farbe|tier))\s+([A-Za-zÄöüÄÖÜß]+)(?:\s+und|\s+ich|\.|\,|$)/i, category: "preference", key: "preference" }
  ];

  for (const msg of chatMessages) {
    if (msg.role !== "user" || typeof msg.content !== "string") continue;

    for (const rule of factPatterns) {
      const match = msg.content.match(rule.pattern);
      if (match && match[1]) {
        extractedFacts.push({
          category: rule.category,
          key: rule.key,
          value: match[1].trim(),
          rawText: msg.content,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  return extractedFacts;
}

export async function updateMemoryProfile(userId, newFacts = []) {
  if (!userId) {
    throw new Error("updateMemoryProfile benötigt eine userId.");
  }

  const existingProfile = (await memoryStore.lies(userId)) || {
    id: userId,
    userId,
    memories: [],
    updatedAt: new Date().toISOString()
  };

  const updatedMemories = [...existingProfile.memories];

  for (const fact of newFacts) {
    const existingIndex = updatedMemories.findIndex(m => m.key === fact.key && m.category === fact.category);
    if (existingIndex >= 0) {
      updatedMemories[existingIndex] = { ...fact, updatedAt: new Date().toISOString() };
    } else {
      updatedMemories.push({ ...fact, createdAt: new Date().toISOString() });
    }
  }

  const prunedMemories = updatedMemories.slice(-MEMORY_CONFIG.maxMemoriesPerUser);
  const newProfile = {
    id: userId,
    userId,
    memories: prunedMemories,
    updatedAt: new Date().toISOString()
  };

  await memoryStore.schreib(newProfile);
  return newProfile;
}

export async function runMemoryAutopilot(userId, chatMessages = []) {
  const newFacts = extractUserFacts(chatMessages);
  if (newFacts.length > 0) {
    const updatedProfile = await updateMemoryProfile(userId, newFacts);
    return {
      status: "updated",
      factsExtracted: newFacts.length,
      profile: updatedProfile
    };
  }

  return {
    status: "unchanged",
    factsExtracted: 0
  };
}
