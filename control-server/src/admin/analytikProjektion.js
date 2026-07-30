// smejj.com — Tagesprojektion fuer Modul W (Single Responsibility: Zahlen vorrechnen).
//
// WARUM ES DAS BRAUCHT
//
// Modul W hat seine vier Reihen zuerst bei JEDEM Aufruf frisch gezaehlt: vier
// Auflistungen auf IDrive e2, `jobs/` allein mit fast tausend Objekten. Live
// gemessen 824 ms — ueber dem p99-Budget von 800 ms.
//
// Ein Zwischenspeicher im Arbeitsspeicher hat das zwar auf 284 ms gedrueckt,
// aber nur JE INSTANZ. Der Master Prompt verlangt das Gegenteil: "kein Sitzungs-,
// Job- oder Zaehlstand im Serverspeicher. Alles auf IDrive e2. Erst dann sind 1
// und 50 Instanzen technisch dasselbe." Bei 50 Instanzen waeren es 50 kalte
// Aufrufe pro Minute — der Engpass waechst mit der Zahl der Instanzen mit,
// genau das, was die Skalierungsregel verbietet.
//
// Deshalb liegt das Ergebnis als EIN kleines Objekt auf IDrive e2. Lesen kostet
// einen GET; das Zaehlen passiert im Hintergrund und nur, wenn jemand hinsieht.
//
// DIE PROJEKTION IST NIEMALS DIE WAHRHEIT.
//
// Sie ist eine abgeleitete Sicht, wie der Nutzer-Index: jederzeit verwerfbar,
// jederzeit neu baubar, und sie traegt ihr Alter sichtbar mit sich. Drei Regeln,
// damit daraus keine zweite, abweichende Wahrheit wird:
//
//   1. EINE GESCHEITERTE QUELLE WIRD ALS GESCHEITERT GESPEICHERT, nie als 0.
//      Sonst friert ein Ausfall als "an dem Tag war nichts" ein — und bleibt
//      auch dann stehen, wenn die Quelle langst wieder antwortet.
//   2. DAS ALTER FAEHRT MIT. `gebautAm` und `alterSekunden` gehen an den
//      Aufrufer; eine alte Projektion behauptet nie, frisch zu sein.
//   3. EIN FEHLGESCHLAGENER NEUBAU UEBERSCHREIBT NICHTS. Liefert das Zaehlen
//      gar keine lesbare Quelle, bleibt die alte Projektion stehen. Ein
//      Netzausfall darf gute Zahlen nicht durch Luecken ersetzen.
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";

const PROJEKTION_KEY = "admin/index/analytik-tage.json";
// 90 Tage, weil das die groesste Spanne ist, die Modul W beantwortet.
const MAX_TAGE = 90;
// Ab wann im Hintergrund neu gezaehlt wird. Bewusst grosszuegig: die Reihen
// aendern sich im Minutentakt nicht, und jeder Neubau kostet vier Auflistungen.
export const AUFFRISCHEN_AB_SEKUNDEN = 600;

let neubauLaeuft = false;

// Lesedurchgriff auf DASSELBE Objekt, 20 Sekunden. Das ist ausdruecklich KEIN
// Zaehlstand im Arbeitsspeicher: gerechnet wird nichts, gemerkt wird nur die
// Antwort eines GET, den sonst jeder Seitenaufruf erneut stellt. Mit 50
// Instanzen halten 50 Prozesse denselben Stand — keiner rechnet eigene Zahlen.
// Gemessen 2026-07-30: der GET kostet rund 79 ms (p50) je Aufruf. Gleiche
// Bauart und gleiche Begruendung wie der 30-s-Durchgriff im Nutzer-Index.
const LESE_CACHE_MS = 20_000;
let leseCache = null; // { bisMs, wert }

/**
 * Liest die Projektion. `ok:false`, solange nie gebaut wurde — kein stilles
 * leeres Ergebnis, das wie "gemessen und nichts gefunden" aussieht.
 */
export async function leseProjektion({
  env = process.env, fetchImpl = fetch, jetztMs = Date.now(), leseCacheMs = LESE_CACHE_MS
} = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  if (leseCacheMs > 0 && leseCache && leseCache.bisMs > jetztMs) {
    // Das Alter wird NEU gerechnet: es ist das Alter der PROJEKTION, nicht das
    // des Durchgriffs. Sonst wuerde ein gemerkter Stand mit jeder Sekunde
    // juenger erscheinen, als er ist.
    return { ...leseCache.wert, alterSekunden: alterVon(leseCache.wert.gebautAm, jetztMs) };
  }
  try {
    const ergebnis = await signedS3Get({ ...cfg, key: PROJEKTION_KEY, allowNotFound: true, fetchImpl });
    if (!ergebnis.ok || !ergebnis.body) return { ok: false, error: "projektion_nicht_gebaut" };
    const gelesen = JSON.parse(ergebnis.body);
    if (!gelesen || typeof gelesen !== "object" || !gelesen.reihen) {
      return { ok: false, error: "projektion_unlesbar" };
    }
    const wert = {
      ok: true,
      gebautAm: gelesen.gebautAm || null,
      alterSekunden: alterVon(gelesen.gebautAm, jetztMs),
      reihen: gelesen.reihen
    };
    // Nur ein gelungener Lesevorgang wird gemerkt. Ein Ausfall zwanzig Sekunden
    // lang festzuschreiben hiesse, eine Stoerung zu verlaengern.
    if (leseCacheMs > 0) leseCache = { bisMs: jetztMs + leseCacheMs, wert };
    return wert;
  } catch {
    return { ok: false, error: "projektion_unlesbar" };
  }
}

/**
 * Zaehlt neu und schreibt die Projektion.
 * @param {object} p
 * @param {() => Promise<object>} p.zaehleAlles Liefert `{ [reihe]: {erreichbar, nachTag: Map|Objekt, …} }`.
 */
export async function baueProjektion({
  env = process.env, fetchImpl = fetch, jetztMs = Date.now(), zaehleAlles
} = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };

  let gezaehlt;
  try {
    gezaehlt = await zaehleAlles();
  } catch (error) {
    return { ok: false, error: String(error?.message || "zaehlen_fehlgeschlagen").slice(0, 120) };
  }

  const reihen = {};
  let irgendetwasLesbar = false;
  for (const [name, reihe] of Object.entries(gezaehlt || {})) {
    // Regel 1: ein Ausfall wird als Ausfall gespeichert, nicht als Null.
    if (!reihe?.erreichbar) {
      reihen[name] = { erreichbar: false, grund: String(reihe?.grund || "unbekannt").slice(0, 120) };
      continue;
    }
    irgendetwasLesbar = true;
    reihen[name] = {
      erreichbar: true,
      quelle: reihe.quelle || null,
      unvollstaendig: reihe.unvollstaendig === true,
      grundUnvollstaendig: reihe.grundUnvollstaendig || null,
      ohneDatum: Number(reihe.ohneDatum) || 0,
      hinweis: reihe.hinweis || null,
      indexGebautAm: reihe.indexGebautAm || null,
      tage: nurLetzteTage(reihe.nachTag, jetztMs)
    };
  }

  // Regel 3: ohne eine einzige lesbare Quelle wird NICHT geschrieben. Eine
  // vorhandene, gute Projektion ist mehr wert als eine frische aus Luecken.
  if (!irgendetwasLesbar) return { ok: false, error: "keine_quelle_lesbar", nichtGeschrieben: true };

  const gebautAm = new Date(jetztMs).toISOString();
  try {
    await signedS3Put({
      ...cfg,
      key: PROJEKTION_KEY,
      body: JSON.stringify({ version: 1, gebautAm, reihen }),
      contentType: "application/json; charset=utf-8",
      fetchImpl
    });
  } catch (error) {
    return { ok: false, error: String(error?.message || "schreiben_fehlgeschlagen").slice(0, 120) };
  }
  // Nach einem Neubau muss der naechste Lesevorgang den frischen Stand sehen.
  leseCache = null;
  return { ok: true, gebautAm, reihen, alterSekunden: 0 };
}

/**
 * Der Weg fuer den Normalbetrieb: vorhandene Projektion sofort liefern und bei
 * Bedarf im Hintergrund neu zaehlen. Blockiert nur, wenn es noch KEINE
 * Projektion gibt — dann ist ein langsamer erster Aufruf besser als eine
 * Ansicht, die behauptet, es gebe keine Daten.
 */
export async function projektionFrisch({
  env = process.env,
  fetchImpl = fetch,
  jetztMs = Date.now(),
  zaehleAlles,
  auffrischenAbSekunden = AUFFRISCHEN_AB_SEKUNDEN
} = {}) {
  const vorhanden = await leseProjektion({ env, fetchImpl, jetztMs });
  if (!vorhanden.ok) {
    if (vorhanden.error === "speicher_nicht_eingerichtet") return vorhanden;
    const gebaut = await baueProjektion({ env, fetchImpl, jetztMs, zaehleAlles });
    return gebaut.ok ? { ...gebaut, ersterBau: true } : gebaut;
  }

  const veraltet = Number(vorhanden.alterSekunden) >= auffrischenAbSekunden;
  if (!veraltet || neubauLaeuft) return { ...vorhanden, wirdAufgefrischt: neubauLaeuft };

  neubauLaeuft = true;
  // Bewusst ohne await: der Aufrufer bekommt den vorhandenen Stand sofort.
  Promise.resolve()
    .then(() => baueProjektion({ env, fetchImpl, zaehleAlles }))
    .catch(() => { /* ein gescheiterter Neubau darf die Ansicht nicht kippen */ })
    .finally(() => { neubauLaeuft = false; });

  return { ...vorhanden, wirdAufgefrischt: true };
}

/** Nur fuer Tests: der Hintergrund-Merker darf nicht zwischen Faellen durchschlagen. */
export function __neubauMerkerLeeren() {
  neubauLaeuft = false;
  leseCache = null;
}

/**
 * Behaelt die letzten MAX_TAGE Tage. Ein Tag ohne Eintrag fehlt bewusst — der
 * Leser setzt ihn auf 0, WEIL die Quelle erreichbar war. Eine gespeicherte 0
 * waere nicht von einer gespeicherten Luecke zu unterscheiden.
 */
function nurLetzteTage(nachTag, jetztMs) {
  const grenze = new Date(jetztMs - MAX_TAGE * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const paare = nachTag instanceof Map ? [...nachTag.entries()] : Object.entries(nachTag || {});
  const raus = {};
  for (const [tag, anzahl] of paare) {
    // Der Sammelposten "" (ohne Datum) gehoert nicht in eine Tagesreihe.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tag)) || String(tag) < grenze) continue;
    raus[tag] = Number(anzahl) || 0;
  }
  return raus;
}

function alterVon(gebautAm, jetztMs) {
  const ms = Date.parse(String(gebautAm || ""));
  return Number.isFinite(ms) ? Math.max(0, Math.round((jetztMs - ms) / 1000)) : null;
}

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}
