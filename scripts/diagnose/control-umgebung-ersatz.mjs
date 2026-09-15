// smejj.com — Ersatzmessung der Pflicht-Betriebswerte OHNE Zeabur-Schluessel.
//
// WARUM ES SIE GIBT (Master-Audit 2026-09-15): Die Betriebswache (Nr. 42) fragt
// die Zeabur-API nach den gesetzten Umgebungsvariablen. Der Zeabur-Schluessel
// auf dem Mac ist abgelaufen (HTTP 401) — seitdem stand die Wache jede Nacht
// ROT mit "Responsive+Touch rot", obwohl Responsive und Touch gruen waren und
// kein einziger Pflichtwert fehlte. Ein Schluessel ist ein Zugang: erneuern
// kann ihn nur der Betreiber.
//
// Die Pflichtwerte lassen sich aber an ihrer WIRKUNG belegen, gemessen am
// laufenden Server — ohne je einen Wert zu sehen:
//   SMEJJ_SESSION_SECRET   der Server nimmt einen mit env.local signierten Ausweis an
//   SMEJJ_AUTOPILOT_KEYS   Herzschlaege von AUSSEN (Mac-Laeufe) kamen in 48 h an
//   Einwilligungs-Werte    Nr. 74 misst im Container "Einwilligung erteilbar"
// Nicht belegbar ist nicht "in Ordnung": dann bleibt die Wache rot (fail-closed).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const EXTERNE_MELDER = Object.freeze(["qualitaetsmessung", "codeberg-spiegel", "test-waechter", "web-vitals-wache", "oberflaechenwache"]);
export const EINWILLIGUNGS_WERTE = Object.freeze([
  "SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64", "SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID",
  "SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64", "SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID",
  "SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256"
]);

/** Beurteilt die Belege. `autopiloten` = null heisst: der Server nahm den Ausweis nicht an. */
export function beurteileErsatz(autopiloten, { pflicht = [], jetztMs = Date.now() } = {}) {
  const belegt = [];
  const unbelegt = [];
  const nach = new Map((autopiloten || []).map((a) => [a.id, a]));
  const frisch = (a, ms) => Boolean(a?.letzterLauf?.am) && jetztMs - Date.parse(a.letzterLauf.am) < ms;
  for (const name of pflicht) {
    if (name === "SMEJJ_SESSION_SECRET") {
      if (autopiloten) belegt.push(name); else unbelegt.push({ name, grund: "Server nahm den signierten Ausweis nicht an" });
    } else if (name === "SMEJJ_AUTOPILOT_KEYS") {
      const melder = EXTERNE_MELDER.filter((id) => frisch(nach.get(id), 48 * 3_600_000));
      if (melder.length) belegt.push(name); else unbelegt.push({ name, grund: "kein Herzschlag von aussen in 48 h" });
    } else if (EINWILLIGUNGS_WERTE.includes(name)) {
      const w = nach.get("einwilligungs-wache");
      const ok = frisch(w, 2 * 3_600_000) && w.letzterLauf.status === "ok" && /erteilbar/i.test(String(w.letzterLauf.meldung || ""));
      if (ok) belegt.push(name); else unbelegt.push({ name, grund: "Einwilligungs-Wache meldet nicht 'erteilbar'" });
    } else {
      unbelegt.push({ name, grund: "ohne Zeabur-Zugang nicht belegbar" });
    }
  }
  return { belegt, unbelegt };
}

/** Holt die Live-Ampel mit einem kurzlebigen Ausweis (Wert wird nie ausgegeben). */
export async function holeAutopiloten({ basis = process.env.SMEJJ_CONTROL_URL || "https://smejj-control.zeabur.app", fetchImpl = fetch } = {}) {
  let token = "";
  try {
    token = execFileSync("node", ["scripts/verlauf/mint-eval-token.mjs"], { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
  if (!token) return null;
  try {
    const antwort = await fetchImpl(`${basis}/api/admin/ops/autopiloten`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (!antwort.ok) return null;
    return (await antwort.json())?.autopiloten || null;
  } catch { return null; }
}
