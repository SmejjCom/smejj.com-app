// smejj.com — Umgebungs-Wache (Autopilot Nr. 71), Betreiber-Freigabe
// 2026-09-02 ("Ich gebe dir alle Rechte, mach hundert Prozent fertig. Lass nicht offen.").
//
// WARUM ES SIE GIBT: Am 2026-09-02 verschwand SMEJJ_LLM_ZHIPU_BASE_URL zweimal
// aus der Zeabur-Umgebung von smejj-control (05:41 und 13:20 UTC). Ohne die
// Coding-Adresse ruft der Router die Pay-as-you-go-Adresse, Zhipu antwortet
// 429/1113 "no resource package", und der Chat stand stundenlang — bei 64
// gruenen Ampeln, weil keine Wache die UMGEBUNG selbst misst. Diese Wache
// liest beim Takt die Variablen, die der Chat zum Leben braucht, und wird
// rot, BEVOR der erste Nutzer den Ausfall bemerkt.
//
// WAS SIE NIE TUT: einen Wert ausgeben. Adressen nennt sie als Host+Pfad,
// Schluessel nur als "gesetzt"/"fehlt".
import { getModelRuntimeConfig, DEFAULT_MODEL_ID } from "../../../src/shared/modelRegistry.js";

/** Die Coding-Adresse des GLM Coding Plans (Memory_Bank 2026-09-02, Nachtrag). */
export const ZHIPU_CODING_ADRESSE = "https://api.z.ai/api/coding/paas/v4";

/** Schluessel, ohne die kein Chat antwortet. Nur Namen — Werte bleiben unsichtbar. */
export const PFLICHT_SCHLUESSEL = Object.freeze(["SMEJJ_LLM_ZHIPU_API_KEY", "SMEJJ_LLM_GROQ_API_KEY"]);

function hostUndPfad(url) {
  try {
    const u = new URL(String(url || ""));
    return `${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "(keine gueltige Adresse)";
  }
}

/**
 * Beurteilt eine Umgebung. Getrennt testbar (kaputt + gesund):
 *   - Pflichtschluessel fehlt -> rot (ohne Schluessel kein Anbieter)
 *   - Zhipu-Adresse fehlt oder ist nicht die Coding-Adresse -> rot, denn der
 *     Betreiber-Schluessel gehoert zum Coding-Paket (1113 auf jeder anderen)
 *   - die Registry loest fuer das Standardmodell eine andere Adresse auf -> rot
 *     (die Umgebung kommt nicht an, obwohl sie gesetzt scheint)
 */
export function beurteileUmgebung(env = process.env) {
  const fehler = [];
  const fehlend = PFLICHT_SCHLUESSEL.filter((name) => !String(env[name] || "").trim());
  if (fehlend.length) fehler.push(`Schluessel fehlt: ${fehlend.join(", ")}`);

  const gesetzt = String(env.SMEJJ_LLM_ZHIPU_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!gesetzt) {
    fehler.push("SMEJJ_LLM_ZHIPU_BASE_URL fehlt — Router faellt auf die Pay-as-you-go-Adresse zurueck (Zhipu 1113)");
  } else if (gesetzt !== ZHIPU_CODING_ADRESSE) {
    fehler.push(`SMEJJ_LLM_ZHIPU_BASE_URL zeigt auf ${hostUndPfad(gesetzt)} statt ${hostUndPfad(ZHIPU_CODING_ADRESSE)}`);
  }

  let aufgeloest = "";
  try {
    aufgeloest = String(getModelRuntimeConfig(DEFAULT_MODEL_ID, env)?.baseUrl || "").replace(/\/+$/, "");
  } catch {
    aufgeloest = "";
  }
  if (gesetzt === ZHIPU_CODING_ADRESSE && aufgeloest && aufgeloest !== ZHIPU_CODING_ADRESSE) {
    fehler.push(`Registry loest fuer ${DEFAULT_MODEL_ID} ${hostUndPfad(aufgeloest)} auf — die Umgebung kommt nicht an`);
  }

  return {
    ok: fehler.length === 0,
    fehler,
    zhipuAdresse: hostUndPfad(gesetzt || aufgeloest),
    schluessel: Object.fromEntries(PFLICHT_SCHLUESSEL.map((name) => [name, !fehlend.includes(name)]))
  };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Proben, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const gesund = { SMEJJ_LLM_ZHIPU_API_KEY: "k", SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_ZHIPU_BASE_URL: ZHIPU_CODING_ADRESSE };
  if (!beurteileUmgebung(gesund).ok) fehler.push("eine vollstaendige Umgebung muss gruen sein");
  const ohneAdresse = beurteileUmgebung({ SMEJJ_LLM_ZHIPU_API_KEY: "k", SMEJJ_LLM_GROQ_API_KEY: "k" });
  if (ohneAdresse.ok || !ohneAdresse.fehler.some((f) => f.includes("fehlt —"))) fehler.push("ohne Zhipu-Adresse muss es rot sein");
  const falscheAdresse = beurteileUmgebung({ ...gesund, SMEJJ_LLM_ZHIPU_BASE_URL: "https://open.bigmodel.cn/api/paas/v4" });
  if (falscheAdresse.ok || !falscheAdresse.fehler.some((f) => f.includes("statt"))) fehler.push("die Pay-as-you-go-Adresse muss rot sein");
  const ohneSchluessel = beurteileUmgebung({ SMEJJ_LLM_ZHIPU_BASE_URL: ZHIPU_CODING_ADRESSE, SMEJJ_LLM_GROQ_API_KEY: "k" });
  if (ohneSchluessel.ok || !ohneSchluessel.fehler.some((f) => f.includes("SMEJJ_LLM_ZHIPU_API_KEY"))) fehler.push("ein fehlender Pflichtschluessel muss rot sein");
  const kurz = beurteileUmgebung({ ...gesund, SMEJJ_LLM_ZHIPU_BASE_URL: `${ZHIPU_CODING_ADRESSE}/` });
  if (!kurz.ok) fehler.push("ein Schraegstrich am Ende darf nicht rot machen");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann die echte Umgebung des laufenden Prozesses.
 * Rot ist ein echter Ausfall in spe — der naechste Chat wuerde 502/503 liefern.
 */
export async function laufUmgebungsWache({ env = process.env } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Umgebungs-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }
  const urteil = beurteileUmgebung(env);
  const schluessel = PFLICHT_SCHLUESSEL.map((n) => `${n.replace("SMEJJ_LLM_", "").replace("_API_KEY", "").toLowerCase()} ${urteil.schluessel[n] ? "gesetzt" : "FEHLT"}`).join(", ");
  if (!urteil.ok) {
    return { ok: false, meldung: `Umgebung unvollstaendig: ${urteil.fehler.join("; ")} — Zeabur-Variablen pruefen (Portal: smejj-control, Variable), dann Redeploy` };
  }
  return { ok: true, meldung: `Selbsttest 5/5; Zhipu-Adresse ${urteil.zhipuAdresse} (Coding-Paket), Schluessel: ${schluessel}` };
}
