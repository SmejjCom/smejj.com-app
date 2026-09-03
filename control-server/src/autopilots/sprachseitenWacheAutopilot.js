// smejj.com — Sprachseiten-Wache (Autopilot Nr. 78), Audit A bis Z 2026-09-03.
//
// WARUM ES SIE GIBT: smejj.com liefert 15 Sprachseiten aus (public/<code>/).
// Die Auffindbarkeits-Wache (Nr. 57) prüft nur "/". Bricht eine Sprachseite
// beim Umbau (404, leerer Titel, falsches lang), sieht das ein Nutzer in Tokio
// oder Riad — und keine Ampel. Diese Wache holt jede Sprachseite einmal am
// Tag von https://smejj.com und prüft Status, Titel und lang-Attribut.
//
// Dazwischen meldet sie den gemessenen Stand aus der Ablage (Bauart der
// Speicher-Wache): 15 Abrufe alle 30 Minuten wären Verkehr ohne Erkenntnis.
import { createRecordStore } from "../admin/recordStore.js";

/** Die ausgelieferten Sprachordner (public/<code>/index.html), Stand 03.09.2026. */
export const SPRACHEN = Object.freeze(["ar", "bn", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "pt", "ru", "tr", "zh"]);
const MESS_ABSTAND_MS = 22 * 60 * 60 * 1000;
const ABLAGE_ID = "letzter-stand";
const PARALLEL = 5;

let ablageStandard = null;
function holeAblage(ablage) {
  if (ablage) return ablage;
  if (!ablageStandard) ablageStandard = createRecordStore("betrieb/sprachseiten", { maximal: 20 });
  return ablageStandard;
}

/** Prüft EINE Sprachseite. Getrennt testbar. */
export function pruefeSprachseite(code, { status = 0, html = "" } = {}) {
  const maengel = [];
  if (status !== 200) { maengel.push(`HTTP ${status || "keine Antwort"}`); return { code, maengel }; }
  const quelle = String(html || "");
  const titel = quelle.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titel || titel[1].trim().length < 5) maengel.push("Titel fehlt oder zu kurz");
  const lang = quelle.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i);
  if (!lang) maengel.push("kein lang-Attribut");
  else if (lang[1].toLowerCase().split("-")[0] !== code) maengel.push(`lang="${lang[1]}" statt "${code}"`);
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(quelle)) maengel.push("NOINDEX");
  return { code, maengel };
}

/** Fasst die Einzelprüfungen zusammen. */
export function beurteileSprachseiten(ergebnisse = []) {
  const kaputt = ergebnisse.filter((e) => e.maengel.length);
  if (!ergebnisse.length) return { ok: false, grund: "keine Sprachseite gemessen" };
  if (kaputt.length) {
    return { ok: false, grund: `${kaputt.length} von ${ergebnisse.length} Sprachseiten mangelhaft: ${kaputt.map((k) => `${k.code} (${k.maengel.join(", ")})`).join("; ").slice(0, 160)}` };
  }
  return { ok: true, grund: `alle ${ergebnisse.length} Sprachseiten antworten 200 mit Titel und passendem lang` };
}

/** Selbsttest: kaputte UND gesunde Probe. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const gesund = pruefeSprachseite("fr", { status: 200, html: "<html lang=\"fr\"><head><title>smejj — assistant IA</title></head><body></body></html>" });
  if (gesund.maengel.length) fehler.push(`gesunde Seite löst Fehlalarm aus: ${gesund.maengel.join(", ")}`);
  const falsch = pruefeSprachseite("ja", { status: 200, html: "<html lang=\"en\"><head><title>smejj</title></head></html>" });
  if (!falsch.maengel.some((m) => /lang=/.test(m))) fehler.push("falsches lang wird nicht erkannt");
  if (pruefeSprachseite("de", { status: 404 }).maengel.length !== 1) fehler.push("404 wird nicht erkannt");
  if (beurteileSprachseiten([gesund, falsch]).ok) fehler.push("eine mangelhafte Seite muss das Urteil rot machen");
  if (!beurteileSprachseiten([gesund]).ok) fehler.push("nur gesunde Seiten müssen grün sein");
  if (beurteileSprachseiten([]).ok) fehler.push("ohne Messung darf es kein Grün geben");
  return { bestanden: fehler.length === 0, fehler, geprueft: 6 };
}

async function holeSeite(basis, code, fetchImpl) {
  try {
    const antwort = await fetchImpl(`${basis}/${code}/`, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "smejj-sprachseiten-wache" } });
    return pruefeSprachseite(code, { status: antwort.status, html: antwort.ok ? await antwort.text() : "" });
  } catch (f) {
    return { code, maengel: [`nicht erreichbar: ${String(f?.message || f).slice(0, 30)}`] };
  }
}

/** Der Lauf im Takt: täglich alle Sprachseiten, dazwischen der abgelegte Stand. */
export async function laufSprachseitenWache({ mitNetz = true, env = process.env, fetchImpl = fetch, ablage = null, jetztMs = Date.now(), sprachen = SPRACHEN } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Sprachseiten-Wache beurteilt bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  const speicher = holeAblage(ablage);
  let stand = null;
  try { stand = await speicher.lies(ABLAGE_ID); } catch { /* neu messen */ }
  const alterMs = stand ? jetztMs - Date.parse(stand.createdAt || 0) : Infinity;
  if (stand && Number.isFinite(alterMs) && alterMs < MESS_ABSTAND_MS) {
    return { ok: stand.ok !== false, meldung: `Sprachseiten (vor ${Math.round(alterMs / 3_600_000)} h gemessen): ${stand.grund}` };
  }
  if (!mitNetz) return { ok: true, meldung: "Sprachseiten-Messung fällig — läuft im nächsten Netz-Takt" };
  const basis = String(env.SMEJJ_SEITE_URL || "https://smejj.com").replace(/\/+$/, "");
  const ergebnisse = [];
  for (let i = 0; i < sprachen.length; i += PARALLEL) {
    const teil = sprachen.slice(i, i + PARALLEL);
    ergebnisse.push(...await Promise.all(teil.map((code) => holeSeite(basis, code, fetchImpl))));
  }
  const urteil = beurteileSprachseiten(ergebnisse);
  try {
    await speicher.schreib({ id: ABLAGE_ID, createdAt: new Date(jetztMs).toISOString(), ok: urteil.ok, grund: urteil.grund, maengel: ergebnisse.filter((e) => e.maengel.length) }, { timeoutMs: 5000 });
  } catch { /* die Meldung trägt das Urteil auch ohne Ablage */ }
  return { ok: urteil.ok, meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${urteil.grund}` };
}
