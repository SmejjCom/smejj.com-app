// smejj.com — Trainings-Speicher: Stand fuer /api/health, ohne Geheimnisse.
//
// WARUM: Am 2026-09-02 endeten Einwilligung und Fragen-Erfassung stundenlang
// mit "consent_service_unavailable". Der Sammelcode verdeckt absichtlich den
// Grund (Konfiguration fehlt? Verweis leer? Speicher antwortet 403?), und die
// Zeabur-Logs zeigen ihn nicht. Diese Sonde nennt die Stufe und den Fehlercode —
// nie einen Wert. Ergebnis wird 60 s gehalten, damit die Autopiloten-Abfragen
// von /api/health den Speicher nicht dauernd anfassen.
//
// F26 (2026-09-14): Ist der gehaltene Stand abgelaufen, wird er trotzdem
// SOFORT geliefert und im Hintergrund EINMAL neu gemessen (nie zwei Messungen
// nebeneinander). Vorher zahlte genau der Aufruf, der die 60 s riss, die
// volle Messung — bis 4 s — und /api/health hatte damit Ausreisser, die nicht
// vom Netz kamen. Nur der allererste Aufruf nach dem Start wartet noch.
import { readTrainingIdriveConfig } from "./idrive-conditional-writer.js";
import { parseS3Keys, signedS3List } from "../../control-server/src/storage/s3Signer.js";

const LEDGER_PREFIX = "training/consents/v1/";
const HALTE_MS = 60_000;
const ZEITBUDGET_MS = 4_000;
let gehalten = null;
let auffrischung = null;

function fehlerCode(error) {
  return String(error?.code || error?.message || error || "unbekannt").split(":").slice(0, 2).join(":").slice(0, 120);
}

/** Stufe "konfiguration" | "speicher" | "ok" — nie Schluessel, nie Endpunkt-Pfade. */
export async function trainingsSpeicherStand(env = process.env, { fetchImpl, jetzt = Date.now } = {}) {
  if (gehalten && jetzt() - gehalten.zeit < HALTE_MS) return gehalten.stand;
  if (gehalten) {
    // Abgelaufen, aber vorhanden: alten Stand liefern, neuen im Hintergrund holen.
    auffrischung ??= ermittle(env, fetchImpl)
      .then((stand) => { gehalten = { zeit: jetzt(), stand }; })
      .catch(() => {})
      .finally(() => { auffrischung = null; });
    return gehalten.stand;
  }
  const stand = await ermittle(env, fetchImpl);
  gehalten = { zeit: jetzt(), stand };
  return stand;
}

async function ermittle(env, fetchImpl) {
  let s3;
  try {
    s3 = readTrainingIdriveConfig(env);
  } catch (error) {
    return { ok: false, stufe: "konfiguration", fehler: fehlerCode(error) };
  }
  const host = (() => { try { return new URL(s3.endpoint).host; } catch { return "?"; } })();
  const request = fetchImpl ? { fetchImpl } : {};
  try {
    const abbruch = new Promise((_, reject) => setTimeout(() => reject(new Error("zeitbudget")), ZEITBUDGET_MS).unref?.());
    const { response, body } = await Promise.race([signedS3List({ ...s3, ...request, prefix: LEDGER_PREFIX }), abbruch]);
    if (!response?.ok) return { ok: false, stufe: "speicher", fehler: `list_http_${response?.status || 0}`, host, bucket: s3.bucket };
    return { ok: true, stufe: "ok", host, bucket: s3.bucket, eintraege: parseS3Keys(body).length };
  } catch (error) {
    return { ok: false, stufe: "speicher", fehler: fehlerCode(error), host, bucket: s3.bucket };
  }
}

/** Nur fuer Tests: Haltespeicher leeren. */
export function vergissTrainingsSpeicherStand() { gehalten = null; auffrischung = null; }

/** Nur fuer Tests: auf eine laufende Hintergrund-Messung warten. */
export async function warteAufTrainingsSpeicherStand() { if (auffrischung) await auffrischung; }
