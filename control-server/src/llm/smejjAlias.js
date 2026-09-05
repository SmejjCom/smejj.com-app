// smejj.com — Alias "smejj" im Router: zeigt auf die stable-Version des
// Versionsregisters, sobald sie live-tauglich UND bedienbar ist.
//
// Der Router ist synchron (resolveModelRequest), das Register liegt in e2.
// Darum haelt dieser Prozess einen Stand im Speicher, den Autopilot Nr. 83
// (smejj-Versions-Takt) alle 30 Minuten nachfuehrt — ueber setzeSmejjRegister.
// Ohne Stand (frisch gestartet, Ablage weg) gilt: Alias AUS, Standardmodell
// zustaendig. Fail-closed, nie geraten.
//
// Bedienbar heisst: das Registry-Modell smejj-1 ist per Flag freigegeben UND
// hat Adresse + Schluessel (dreiteilige Zusicherung wie bei smejj fast 1.0).
// Fehlt eines, sagt der Grund, was fehlt — der Alias schweigt nicht.
import { getModelDefinition, getModelRuntimeConfig, isModelEnabled } from "../../../src/shared/modelRegistry.js";

export const SMEJJ_VERSIONEN_ABLAGE = "smejj/versionen";
export const REGISTER_ID = "register";
export const SMEJJ_MODELL_ID = "smejj-1";

let stand = null;

export function setzeSmejjRegister(register) {
  stand = register && typeof register === "object" ? register : null;
  return stand;
}

export function leseSmejjRegister() {
  return stand;
}

/**
 * Wohin zeigt der Alias gerade? { modelId, version, live, grund }.
 * live=true nur, wenn Register live sagt UND das Modell bedienbar ist.
 */
export function smejjAliasZiel(env = process.env, register = stand) {
  if (!register?.stable) return { modelId: null, version: null, live: false, grund: "kein eigenes Modell befoerdert" };
  const basis = { modelId: SMEJJ_MODELL_ID, version: register.stable };
  if (register.live !== true) return { ...basis, live: false, grund: register.liveGrund || "Live-Schalter aus" };
  const definition = getModelDefinition(SMEJJ_MODELL_ID);
  if (!definition) return { ...basis, live: false, grund: `Registry kennt ${SMEJJ_MODELL_ID} nicht` };
  if (!isModelEnabled(definition, env)) return { ...basis, live: false, grund: `${definition.featureFlag} nicht gesetzt` };
  if (!getModelRuntimeConfig(definition, env).configured) return { ...basis, live: false, grund: "Laufzeit ohne Adresse oder Schluessel (SMEJJ_LLM_SMEJJ1_*)" };
  return { ...basis, live: true, grund: `Alias smejj → ${register.stable}` };
}
