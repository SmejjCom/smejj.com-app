// smejj.com — Server-AI-Verfuegbarkeit fuer Health/Status: EIN Ort fuer die
// Wahrheit "ist serverseitige AI nutzbar?". Fail-closed: ai=true gilt nur wenn
// die aufgeloeste Provider-Kette mindestens ein verwendbares Backend enthaelt
// UND entweder das klassische Server-AI-Gate mit positivem Budget aktiv ist
// ODER ein BYOK/pay-per-use Z.ai/Zhipu-Provider konfiguriert ist. Der zweite
// Fall bildet den Live-Stand ab: Z.ai verwaltet das Guthaben ausserhalb des
// Control-Servers, smejj.com startet dabei keinen versteckten Fallback.
// Keine Secrets in der Ausgabe: nur Provider-Name und Modell-ID
// (z. B. "zhipu:glm-5.2") — niemals Keys, Base-URLs oder Header.
import { getPublicModelRegistry } from "../../../src/shared/modelRegistry.js";
import { resolveModelRequest } from "./modelRouter.js";
import { getModelRuntimeHealthSnapshot } from "./modelRuntimeHealth.js";
import { smejjAliasZiel } from "./smejjAlias.js";

/**
 * Bewertet die serverseitige AI-Verfuegbarkeit rein aus der Umgebung (pur, ohne I/O).
 * Input:  env (Objekt wie process.env), optional profile fuer die Kette.
 * Output: { ai, aiBackend, gateEnabled, budgetOk, providerOk, activationMode }
 *   - ai: true nur bei verwendbarer Provider-Kette und erlaubtem Aktivierungsmodus
 *   - aiBackend: "provider:modell" des primaeren Backends der Kette, sonst ""
 */
/**
 * Kern-Entscheidung "ist serverseitige AI nutzbar?" — OHNE Registry-Aufbau.
 *
 * 2026-08-15: Bis hierher gab es diese Entscheidung ZWEIMAL. Die Ampel
 * (/api/health) fragte evaluateAiAvailability und kannte den BYOK-Pfad
 * (Zhipu/Kimi verwalten ihr Guthaben selbst). Der Chat-Pfad (streamLLM in
 * src/server.js) prueffte dagegen nur `SMEJJ_SERVER_AI_ENABLED === "true"`.
 * Ergebnis: Ampel gruen ("ai": true, "zhipu:glm-5.2"), Chat aber stumm im
 * Rueckfall-Text — der Betreiber sah eine freundliche Antwort statt eines
 * Fehlers und keine Messung schlug an. Beide Pfade lesen ab jetzt DIESE
 * Funktion; die Ampel kann nicht mehr gruen sein, waehrend der Chat faellt.
 */
export function resolveServerAiGate(env = process.env, profile = "default", requestedModel = "") {
  const gateEnabled = env.SMEJJ_SERVER_AI_ENABLED === "true";
  const remaining = Number(env.SMEJJ_SERVER_AI_REMAINING || 0);
  const budgetOk = Number.isFinite(remaining) && remaining > 0;
  const { chain, selection } = resolveModelRequest(profile, requestedModel, env);
  const providerOk = chain.length > 0;
  const primary = chain[0] || null;
  const registryByokOk = ["zhipu", "kimi"].includes(primary?.name)
    && primary?.logicalModelId !== "provider-fallback";
  // DAS EIGENE MODELL (13.09.2026). Das klassische Tor ist ein AUSGABEN-Tor:
  // es schuetzt ein Server-Budget vor Anbietern, die je Anfrage kosten. Zhipu
  // und Kimi duerfen ohne es durch, weil sie ihr Guthaben selbst verwalten.
  // Der Hausmodell-Dienst kostet je Anfrage GAR NICHTS — er laeuft auf einem
  // fest bezahlten Server. Ihn hinter ein Ausgabenbudget zu stellen, schuetzt
  // nichts und hat eine gemessene Folge: smejj-1 stand am 13.09. auf "ready",
  // wurde im Chat gewaehlt, und JEDE Frage bekam den Rueckfall-Text
  // ("Verstanden. Ich kann daraus eine konkrete Aufgabe machen ..."), weil
  // dieses Tor fuer den Anbieter "hausmodell" zu blieb.
  //
  // Fail-closed bleibt es: providerOk verlangt eine verwendbare Kette, und die
  // entsteht fuer smejj-1 nur mit gesetztem Schluessel (getModelRuntimeConfig).
  // Die Ueberlast schuetzt die Warteschlange des Dienstes (Deckel 1, 24 wartend).
  const eigenesModellOk = primary?.name === "hausmodell"
    && primary?.logicalModelId !== "provider-fallback";
  const classicGateOk = gateEnabled && budgetOk;
  const ai = providerOk && (classicGateOk || registryByokOk || eigenesModellOk);
  return { ai, chain, selection, gateEnabled, budgetOk, providerOk, classicGateOk, registryByokOk, eigenesModellOk };
}

export function evaluateAiAvailability(env = process.env, profile = "default", requestedModel = "") {
  const { ai, chain, selection, gateEnabled, budgetOk, providerOk, classicGateOk } =
    resolveServerAiGate(env, profile, requestedModel);
  return {
    ai,
    aiBackend: ai ? `${chain[0].name}:${chain[0].model}` : "",
    activeModelId: ai ? chain[0].logicalModelId : "",
    requestedModelId: selection.requestedModelId,
    gateEnabled,
    budgetOk,
    providerOk,
    activationMode: ai ? (classicGateOk ? "server-budget-gate" : `${chain[0].name}-byok`) : "disabled",
    registry: getPublicModelRegistry(env, getModelRuntimeHealthSnapshot()),
    // Alias "smejj" (Nr. 83): worauf er zeigt und warum — auch wenn er AUS ist.
    smejjAlias: smejjAliasZiel(env)
  };
}
