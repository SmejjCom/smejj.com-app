// smejj.com — 24/7 Synthetic User & Full-Stack E2E Watchdog (Autopilot Nr. 29)
// Simuliert rund um die Uhr reale Nutzer-Abläufe (Login, Chat-Start, smejj 1.0 Inferenz,
// IDrive e2 Speicher-Integrität) und schlägt bei Ausfällen sofort Alarm.

import { createRecordStore } from "../admin/recordStore.js";
import { issueSessionToken, verifySessionToken } from "../auth/sessionToken.js";

const e2eWatchdogStore = createRecordStore("watchdog/synthetic-e2e-runs", { maximal: 1000 });

// Die Bruecke, die auch die App benutzt (public/config.js). Ueber sie laeuft
// der Chat-Schritt — genau den Weg nimmt ein echter Nutzer.
const BRUECKE_STANDARD = "https://smejj-chat-bridge.zeabur.app";

/**
 * Prüft den echten Anmelde-Weg: ein frisch ausgestelltes Token muss von der
 * echten Verifikation angenommen, ein verfälschtes abgelehnt werden.
 *
 * WARUM BEIDE RICHTUNGEN: Bis 2026-08-12 stand hier eine Attrappe, die sich
 * selbst einen String "mock_session_…" baute und dann prüfte, ob er mit
 * "mock_session_" beginnt — ein Test, der per Konstruktion nie fehlschlagen
 * kann. Ein Anmelde-Check, der nur "gültig ist gültig" zeigt, würde auch dann
 * bestehen, wenn die Verifikation jedes beliebige Token durchwinkt.
 *
 * @returns {{passed: boolean, latencyMs: number, step: string, error?: string}}
 */
export function runSyntheticAuthCheck({ env = process.env } = {}) {
  const start = Date.now();
  const step = "auth_token_validation";
  const fertig = (passed, error) => ({ passed, latencyMs: Math.max(1, Date.now() - start), step, ...(error ? { error } : {}) });
  const secret = String(env.SMEJJ_SESSION_SECRET || "").trim();
  if (!secret) return fertig(false, "SMEJJ_SESSION_SECRET fehlt — Anmelde-Weg nicht prüfbar");
  try {
    const token = issueSessionToken({
      secret,
      user: { userId: "e2e-watchdog", email: "watchdog@smejj.invalid", method: "local-e2e" },
      ttlMs: 60_000
    });
    const angenommen = verifySessionToken(token, { secret });
    if (!angenommen || angenommen.userId !== "e2e-watchdog") {
      return fertig(false, "gültiges Token wurde NICHT angenommen");
    }
    // Gegenprobe: ein Zeichen in der Signatur verändern muss das Token töten.
    const verfaelscht = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    if (verifySessionToken(verfaelscht, { secret })) {
      return fertig(false, "verfälschtes Token wurde angenommen — Signaturprüfung wirkungslos");
    }
    return fertig(true);
  } catch (err) {
    return fertig(false, String(err?.message || err));
  }
}

/**
 * Prüft den Chat-Inferenz-Flow für smejj 1.0 synthetisch.
 * @param {string} prompt
 * @returns {{passed: boolean, latencyMs: number, ttftMs: number, step: string, error?: string}}
 */
export async function runSyntheticChatCheck(prompt = "Antworte nur mit dem Wort: bereit", { env = process.env, fetchImpl = fetch } = {}) {
  const start = Date.now();
  const step = "chat_inference_flow";
  const fertig = (passed, ttftMs, error) => ({
    passed, latencyMs: Math.max(1, Date.now() - start), ttftMs, step, ...(error ? { error } : {})
  });
  const secret = String(env.SMEJJ_SESSION_SECRET || "").trim();
  if (!secret) return fertig(false, 0, "SMEJJ_SESSION_SECRET fehlt — Chat-Weg nicht prüfbar");

  const basis = String(env.SMEJJ_BRUECKE_URL || BRUECKE_STANDARD).replace(/\/+$/, "");
  try {
    const token = issueSessionToken({
      secret,
      user: { userId: "e2e-watchdog", email: "watchdog@smejj.invalid", method: "local-e2e" },
      ttlMs: 120_000
    });
    // Echter Aufruf über dieselbe Adresse wie die App. Kurzer Prompt mit
    // Absicht: der Lauf soll die Kette prüfen, nicht Tokens verbrauchen.
    const antwort = await fetchImpl(`${basis}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task: prompt }),
      signal: AbortSignal.timeout(30_000)
    });
    const ttftMs = Math.max(1, Date.now() - start);
    if (!antwort.ok) return fertig(false, ttftMs, `Brücke antwortete HTTP ${antwort.status}`);
    const text = await antwort.text();
    // Inhaltsprüfung: ein leerer 200er ist ein Ausfall, kein Erfolg.
    const inhalt = text.replace(/data:\s*/g, "").replace(/\[DONE\]/g, "").trim();
    if (inhalt.length < 10) return fertig(false, ttftMs, "Brücke antwortete leer");
    return fertig(true, ttftMs);
  } catch (err) {
    return fertig(false, Math.max(1, Date.now() - start), String(err?.name === "TimeoutError" ? "Zeitlimit 30 s überschritten" : err?.message || err));
  }
}

/**
 * Prüft die Lese- und Schreibfähigkeit des IDrive e2 S3 Speichers.
 * @param {object} options
 * @returns {Promise<{passed: boolean, latencyMs: number, step: string, error?: string}>}
 */
export async function runSyntheticStorageCheck({ env = process.env } = {}) {
  const start = Date.now();
  try {
    const testId = `e2e_ping_${Date.now()}`;
    const marke = new Date().toISOString();
    await e2eWatchdogStore.schreib({
      id: testId,
      type: "canary_ping",
      timestamp: marke
    }, { env });

    // RUECKLESEPROBE: "Schreiben hat nicht geworfen" ist kein Nachweis, dass
    // die Daten angekommen sind — genau daran ist der Speicher schon still
    // gescheitert (S3-Zeitlimit 2,5 s, Hintergrundschreiber ohne timeoutMs).
    const zurueck = await e2eWatchdogStore.lies(testId, { env });
    if (!zurueck || zurueck.timestamp !== marke) {
      return {
        passed: false,
        latencyMs: Math.max(1, Date.now() - start),
        step: "storage_integrity",
        error: zurueck ? "zurückgelesener Datensatz weicht ab" : "geschriebener Datensatz war nicht wieder lesbar"
      };
    }

    return {
      passed: true,
      latencyMs: Math.max(1, Date.now() - start),
      step: "storage_integrity"
    };
  } catch (err) {
    return {
      passed: false,
      latencyMs: Math.max(1, Date.now() - start),
      step: "storage_integrity",
      error: String(err?.message || err)
    };
  }
}

/**
 * Führt einen vollständigen 24/7 E2E-Nutzer-Zyklus von A bis Z durch.
 * @param {object} options
 * @returns {Promise<{ok: boolean, totalLatencyMs: number, stepsPassed: number, failedStep: string | null, details: Array}>}
 */
export async function runFullSyntheticE2ECycle({ env = process.env } = {}) {
  const cycleStart = Date.now();
  const stepResults = [];

  // Schritt 1: Auth
  const authRes = runSyntheticAuthCheck({ env });
  stepResults.push(authRes);

  // Schritt 2: Chat — echter Aufruf über die Brücke (seit 2026-08-12).
  const chatRes = await runSyntheticChatCheck(undefined, { env });
  stepResults.push(chatRes);

  // Schritt 3: Storage
  const storageRes = await runSyntheticStorageCheck({ env });
  stepResults.push(storageRes);

  const failed = stepResults.find((s) => !s.passed);
  const stepsPassed = stepResults.filter((s) => s.passed).length;
  const totalLatencyMs = Math.max(1, Date.now() - cycleStart);

  return {
    ok: !failed,
    totalLatencyMs,
    stepsPassed,
    failedStep: failed ? failed.step : null,
    details: stepResults
  };
}
