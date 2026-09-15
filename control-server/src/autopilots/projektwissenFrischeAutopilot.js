// smejj.com — Projektwissen-Frische (Autopilot Nr. 77), Audit A bis Z 2026-09-03.
//
// WARUM ES SIE GIBT: Die Schnellspur der Brücke antwortet mit Projektwissen
// (RAG-Schnipsel, exportiert aus dem Control-Index). Der Export ist eine
// Momentaufnahme mit Datum — veraltet er, antwortet der Chat mit altem Wissen,
// und keine Ampel sagte das bisher. Die Brücke nennt in /health
// `projektwissen: {enabled, chunkCount, exportedAt}`; diese Wache rechnet
// daraus Alter und Bestand und macht beides zur Zahl.
//
// Sie erneuert den Export NICHT — das ist ein Deploy-Schritt der Brücke.
// Sie sagt nur, wann es fällig ist.
import { issueSessionToken } from "../auth/sessionToken.js";

/** Älter als so viele Tage gilt der Export als veraltet (überschreibbar). */
export function maxAlterTage(env = process.env) {
  const roh = Number(env?.SMEJJ_PROJEKTWISSEN_MAX_ALTER_TAGE);
  return Number.isFinite(roh) && roh > 0 ? roh : 7;
}
/** Unter so vielen Schnipseln ist der Index kein Projektwissen mehr. */
export const MINDEST_CHUNKS = 100;

/** Beurteilt den Health-Auszug der Brücke. Getrennt testbar (kaputt + gesund). */
export function beurteileProjektwissen(projektwissen, { jetztMs = Date.now(), maxTage = 7 } = {}) {
  if (!projektwissen || typeof projektwissen !== "object") return { ok: false, grund: "Brücke nennt kein projektwissen in /health" };
  if (projektwissen.enabled !== true) return { ok: false, grund: "Projektwissen ist auf der Brücke AUS — Schnellspur antwortet ohne RAG" };
  const chunks = Number(projektwissen.chunkCount) || 0;
  if (chunks < MINDEST_CHUNKS) return { ok: false, grund: `nur ${chunks} Schnipsel im Export (Mindestmaß ${MINDEST_CHUNKS})` };
  const exportiert = Date.parse(projektwissen.exportedAt || "");
  if (!Number.isFinite(exportiert)) return { ok: false, grund: "Export ohne lesbares Datum (exportedAt)" };
  const alterStunden = Math.max(0, Math.round((jetztMs - exportiert) / 3_600_000));
  const alterTage = alterStunden / 24;
  const stand = `${chunks} Schnipsel, Export vor ${alterStunden} h (${projektwissen.exportedAt})`;
  if (alterTage > maxTage) return { ok: false, grund: `Projektwissen veraltet: ${stand} — Grenze ${maxTage} Tage; Export der Brücke erneuern`, alterStunden, chunks };
  return { ok: true, grund: stand, alterStunden, chunks };
}

/** Selbsttest: kaputte UND gesunde Probe. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const t = Date.parse("2026-09-03T12:00:00Z");
  const frisch = new Date(t - 3_600_000).toISOString();
  if (!beurteileProjektwissen({ enabled: true, chunkCount: 930, exportedAt: frisch }, { jetztMs: t }).ok) fehler.push("frischer Export gilt fälschlich als veraltet");
  if (beurteileProjektwissen({ enabled: true, chunkCount: 930, exportedAt: new Date(t - 10 * 86_400_000).toISOString() }, { jetztMs: t }).ok) fehler.push("10 Tage alter Export muss rot sein");
  if (beurteileProjektwissen({ enabled: false, chunkCount: 930, exportedAt: frisch }, { jetztMs: t }).ok) fehler.push("abgeschaltetes Projektwissen muss rot sein");
  if (beurteileProjektwissen({ enabled: true, chunkCount: 3, exportedAt: frisch }, { jetztMs: t }).ok) fehler.push("3 Schnipsel sind kein Projektwissen");
  if (beurteileProjektwissen(null, { jetztMs: t }).ok) fehler.push("fehlendes Feld darf nicht grün sein");
  return { bestanden: fehler.length === 0, fehler, geprueft: 5 };
}

/**
 * Brücke v157 (A-bis-Z-Livetest 15.09.) zeigt /health anonym nur {ok, app, version}.
 * Diese Wache braucht `projektwissen` — sie weist sich deshalb aus: Wächter-Ausweis
 * (SMEJJ_EVOLUTION_TOKEN) und/oder ein kurzlebiger Sitzungsausweis wie der Messlauf.
 */
export function waechterKoepfe(env = process.env) {
  const koepfe = { "User-Agent": "smejj-projektwissen-frische" };
  const token = String(env.SMEJJ_EVOLUTION_TOKEN || "").trim();
  if (token) koepfe["x-smejj-evolution-token"] = token;
  const secret = String(env.SMEJJ_SESSION_SECRET || "").trim();
  if (secret) {
    try {
      koepfe.Authorization = `Bearer ${issueSessionToken({ secret, user: { userId: "projektwissen-waechter", email: "messlauf@smejj.invalid", method: "local-e2e" }, ttlMs: 5 * 60 * 1000 })}`;
    } catch { /* ohne Ausweis bleibt die anonyme Antwort — die Meldung sagt dann "kein projektwissen" */ }
  }
  return koepfe;
}

/** Der Lauf im Takt: Selbsttest, dann /health der Brücke. */
export async function laufProjektwissenFrische({ mitNetz = true, env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Projektwissen-Frische beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  if (!mitNetz) return { ok: true, meldung: "Netz-Takt abgewartet — Brücken-Export wird im nächsten Lauf gemessen" };
  const basis = String(env.SMEJJ_BRUECKE_URL || "https://smejj-chat-bridge.zeabur.app").replace(/\/+$/, "");
  let health;
  try {
    const antwort = await fetchImpl(`${basis}/health`, { signal: AbortSignal.timeout(12_000), headers: waechterKoepfe(env) });
    if (!antwort.ok) return { ok: false, meldung: `Brücke /health antwortet HTTP ${antwort.status} — Projektwissen nicht messbar` };
    health = await antwort.json();
  } catch (f) {
    return { ok: false, meldung: `Brücke nicht erreichbar: ${String(f?.message || f).slice(0, 60)}` };
  }
  const urteil = beurteileProjektwissen(health?.projektwissen, { jetztMs, maxTage: maxAlterTage(env) });
  return { ok: urteil.ok, meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${urteil.grund}` };
}
