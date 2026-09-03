// smejj.com — Agenten-Sonde (Autopilot Nr. 80), Audit A bis Z 2026-09-03.
//
// WARUM ES SIE GIBT: Maus-Engine (Browser-Automat) und Fern-Browser sind
// eigene Worker mit eigenen Adressen und Token. Bis heute fragte kein
// Autopilot sie ab — die Dienst-Sonden (Nr. 12) kennen nur Video-Worker und
// Bild-Maler. Fällt ein Worker aus, merkt es der Nutzer beim Klick auf
// „Browser", nicht die Ampel.
//
// Regel wie beim Türwächter: Ein Dienst, der in der Umgebung EINGESCHALTET ist
// (…_ENABLED=YES), muss antworten — sonst rot. Ein bewusst ausgeschalteter
// Dienst ist grün mit Hinweis, nie stumm. Gemessen wird GET /health beider
// Worker (ohne Auth, ohne Auftrag, ohne Kosten).
import { readMausEngineConfig } from "../routes/mausEngineRoutes.js";
import { readRemoteBrowserConfig } from "../routes/browserRemoteRoutes.js";

const HEALTH_TIMEOUT_MS = 8_000;

/** Beurteilt einen Dienst aus Konfiguration + Health-Antwort. Getrennt testbar. */
export function beurteileDienst(name, konfig, health) {
  if (!konfig?.enabled) return { ok: true, text: `${name}: aus (gewollt)` };
  if (!konfig.configured) return { ok: false, text: `${name}: eingeschaltet, aber unvollständig konfiguriert (${(konfig.missing || []).join(", ") || "Adresse/Token"})` };
  if (!health) return { ok: false, text: `${name}: keine Health-Antwort` };
  if (health.status !== 200 || health.daten?.ok !== true) return { ok: false, text: `${name}: /health antwortet ${health.status || "nichts"}${health.fehler ? ` (${health.fehler})` : ""}` };
  const extra = Number.isFinite(health.daten.sitzungen) ? `, ${health.daten.sitzungen} Sitzung(en)` : health.daten.running ? ", läuft gerade" : "";
  return { ok: true, text: `${name}: erreichbar${extra}` };
}

/** Selbsttest: kaputte UND gesunde Probe. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  if (!beurteileDienst("X", { enabled: false }, null).ok) fehler.push("ausgeschalteter Dienst darf nicht rot sein");
  if (beurteileDienst("X", { enabled: true, configured: true }, { status: 503 }).ok) fehler.push("503 vom eingeschalteten Dienst muss rot sein");
  if (beurteileDienst("X", { enabled: true, configured: false, missing: ["SMEJJ_X_TOKEN"] }, null).ok) fehler.push("eingeschaltet ohne Konfiguration muss rot sein");
  if (!beurteileDienst("X", { enabled: true, configured: true }, { status: 200, daten: { ok: true, sitzungen: 0 } }).ok) fehler.push("gesunder Dienst gilt fälschlich als rot");
  if (beurteileDienst("X", { enabled: true, configured: true }, null).ok) fehler.push("keine Antwort darf nicht grün sein");
  return { bestanden: fehler.length === 0, fehler, geprueft: 5 };
}

async function holeHealth(url, fetchImpl) {
  try {
    const antwort = await fetchImpl(`${String(url).replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS), headers: { "User-Agent": "smejj-agenten-sonde" } });
    let daten = null;
    try { daten = await antwort.json(); } catch { daten = null; }
    return { status: antwort.status, daten };
  } catch (f) {
    return { status: 0, daten: null, fehler: String(f?.message || f).slice(0, 40) };
  }
}

/** Der Lauf im Takt: Selbsttest, Konfiguration, mit Netz beide Health-Endpunkte. */
export async function laufAgentenSonde({ mitNetz = true, env = process.env, fetchImpl = fetch } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Agenten-Sonde beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  const dienste = [
    { name: "Maus-Engine", konfig: readMausEngineConfig(env) },
    { name: "Fern-Browser", konfig: readRemoteBrowserConfig(env) }
  ];
  if (!mitNetz) {
    const an = dienste.filter((d) => d.konfig?.enabled).map((d) => d.name);
    return { ok: true, meldung: `Netz-Takt abgewartet — eingeschaltet: ${an.join(", ") || "keiner"}` };
  }
  const urteile = [];
  for (const d of dienste) {
    const health = d.konfig?.enabled && d.konfig?.configured ? await holeHealth(d.konfig.workerUrl, fetchImpl) : null;
    urteile.push(beurteileDienst(d.name, d.konfig, health));
  }
  const rot = urteile.filter((u) => !u.ok);
  return {
    ok: rot.length === 0,
    meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${urteile.map((u) => u.text).join(" | ")}`
  };
}
