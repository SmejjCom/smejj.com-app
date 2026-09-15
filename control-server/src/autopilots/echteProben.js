// smejj.com — Echte Mini-Proben fuer Nr. 12 (Bild), Nr. 80 (Browser) und
// Nr. 03 (Stimme), Master-Audit 2026-09-15.
//
// WARUM ES SIE GIBT: Vier Plattformbereiche wurden nur per GET /health
// ueberwacht. Ein Dienst, der /health beantwortet, aber kein Bild mehr malt,
// keine Seite mehr oeffnet oder keinen Ton mehr erzeugt, blieb gruen. Jede
// Probe hier laesst den eigenen Dienst EINE kleine echte Arbeit tun und prueft
// das Ergebnis an den Bytes (Magic-Bytes, Mindestgroesse, Titeltext).
//
// DREI HAUSREGELN, eingebaut:
//   1. Hoechstens einmal je 22 h (nach "nicht messbar" nach 2 h erneut). Das
//      Ergebnis liegt neustartfest im Datensatz-Speicher — dieselbe Bauart wie
//      brueckenMesslauf.js. Im Takt dazwischen wird der abgelegte Stand gemeldet.
//   2. Nie parallel: EINE Warteschlange ueber alle Proben. Der Zeabur-Server hat
//      2 Kerne fuer alle Dienste; ein Probebild neben einem Nutzerbild waere
//      Last, nicht Messung. Ein belegter Dienst (429 / running) ist "nicht
//      messbar", keine Stoerung.
//   3. Keine Fremd-APIs, keine Kosten: nur eigene Zeabur-Dienste.
import { createRecordStore } from "../admin/recordStore.js";

export const PROBE_ABSTAND_MS = 22 * 60 * 60 * 1000;
export const NACHPROBE_ABSTAND_MS = 2 * 60 * 60 * 1000;
export const ABLAGE_ID = "letzte-probe";
export const ABLAGE_VERSION = 1;
/** So lange wartet der Takt auf eine frisch gestartete Probe, bevor er den alten Stand meldet. */
export const SOFORT_WARTEN_MS = 20_000;

const laufend = new Map();
let warteschlange = Promise.resolve();
const speicherJeKennung = new Map();

const zahl = (wert, stellen = 1) => String(Math.round(wert * 10 ** stellen) / 10 ** stellen).replace(".", ",");
const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
const sekunden = (ms) => `${zahl(ms / 1000)} s`;
const fehlerText = (f, zeitlimitMs) => (f?.name === "TimeoutError" || f?.name === "AbortError"
  ? `Zeitlimit ${Math.round(zeitlimitMs / 1000)} s`
  : String(f?.message || f).slice(0, 60));

function speicherFuer(kennung) {
  if (!speicherJeKennung.has(kennung)) speicherJeKennung.set(kennung, createRecordStore(`autopiloten/${kennung}`, { maximal: 5 }));
  return speicherJeKennung.get(kennung);
}

/**
 * Meldet den abgelegten Stand einer Probe oder startet sie bei Faelligkeit.
 * `probe()` liefert { ok, text, nichtMessbar? }. Rueckgabe { ok, text }:
 * ok ist null, solange noch nie gemessen wurde (dann entscheidet /health allein).
 */
export async function probeImTakt({
  kennung, probe, mitNetz = true, ablage = null, jetztMs = Date.now(),
  abstandMs = PROBE_ABSTAND_MS, sofortMs = SOFORT_WARTEN_MS
} = {}) {
  const speicher = ablage || speicherFuer(kennung);
  let stand = null;
  try { stand = await speicher.lies(ABLAGE_ID); } catch { /* neu messen */ }
  if (stand && stand.version !== ABLAGE_VERSION) stand = null;
  const alterMs = stand ? jetztMs - Date.parse(stand.createdAt || 0) : Infinity;
  const haltbarMs = stand?.nichtMessbar ? Math.min(abstandMs, NACHPROBE_ABSTAND_MS) : abstandMs;
  const bericht = (s, alter) => ({ ok: s.ok === false ? false : true, text: `${s.text} (vor ${Math.max(0, Math.round(alter / 3_600_000))} h)` });
  if (stand && Number.isFinite(alterMs) && alterMs < haltbarMs) return bericht(stand, alterMs);
  if (!mitNetz || laufend.has(kennung)) {
    const hinweis = laufend.has(kennung) ? "Probe läuft gerade" : "Probe fällig — im nächsten Netz-Takt";
    return stand ? { ...bericht(stand, alterMs), text: `${hinweis}; zuletzt ${bericht(stand, alterMs).text}` } : { ok: null, text: hinweis };
  }

  const arbeit = warteschlange.then(async () => {
    let ergebnis;
    try {
      ergebnis = await probe();
    } catch (f) {
      ergebnis = { ok: false, text: `nicht messbar: ${String(f?.message || f).slice(0, 80)}` };
    }
    const datensatz = { id: ABLAGE_ID, version: ABLAGE_VERSION, createdAt: new Date().toISOString(), ok: ergebnis.ok !== false, nichtMessbar: ergebnis.nichtMessbar === true, text: String(ergebnis.text || "ohne Befund").slice(0, 240) };
    try { await speicher.schreib(datensatz, { timeoutMs: 5000 }); } catch { /* Meldung kommt trotzdem an */ }
    return datensatz;
  }).finally(() => laufend.delete(kennung));
  warteschlange = arbeit.catch(() => {});
  laufend.set(kennung, arbeit);

  let uhr;
  const fertig = await Promise.race([arbeit, new Promise((los) => { uhr = setTimeout(() => los(null), sofortMs); uhr.unref?.(); })]);
  clearTimeout(uhr);
  if (fertig) return { ok: fertig.ok, text: `${fertig.text} (gerade gemessen)` };
  return stand
    ? { ...bericht(stand, alterMs), text: `Probe läuft im Hintergrund; zuletzt ${bericht(stand, alterMs).text}` }
    : { ok: null, text: "Probe läuft im Hintergrund — Ergebnis im nächsten Takt" };
}

/** Für Tests: wartet auf eine laufende Probe. */
export async function warteAufProbe(kennung) { await laufend.get(kennung); }

// ---------------------------------------------------------------- Bytes lesen

/** Erkennt PNG/JPEG/WEBP an den Magic-Bytes; bei PNG auch die Maße (IHDR). */
export function bildArt(puffer) {
  const b = Buffer.from(puffer || []);
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { format: "PNG", breite: b.readUInt32BE(16), hoehe: b.readUInt32BE(20) };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { format: "JPEG" };
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return { format: "WEBP" };
  return null;
}

/** Erkennt WAV (mit Dauer aus fmt/data) oder OGG an den Kopf-Bytes. */
export function audioArt(puffer) {
  const b = Buffer.from(puffer || []);
  if (b.length >= 4 && b.toString("latin1", 0, 4) === "OggS") return { format: "OGG" };
  if (b.length < 12 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WAVE") return null;
  let rate = 0, kanaele = 0, bits = 0, datenBytes = 0;
  for (let pos = 12; pos + 8 <= b.length;) {
    const name = b.toString("latin1", pos, pos + 4);
    const groesse = b.readUInt32LE(pos + 4);
    if (name === "fmt " && pos + 24 <= b.length) {
      kanaele = b.readUInt16LE(pos + 10); rate = b.readUInt32LE(pos + 12); bits = b.readUInt16LE(pos + 22);
    }
    // Streamende Server schreiben 0 oder 0xFFFFFFFF als Datengroesse — dann zaehlt der Rest.
    if (name === "data") { datenBytes = groesse > 0 && groesse < 0xffffffff ? Math.min(groesse, b.length - pos - 8) : b.length - pos - 8; break; }
    pos += 8 + groesse + (groesse % 2);
  }
  const jeSekunde = rate * kanaele * (bits / 8);
  return { format: "WAV", rate, dauerS: jeSekunde > 0 ? datenBytes / jeSekunde : 0 };
}

// ---------------------------------------------------------------- 1. Bild

export const BILD_MIN_BYTES = 5_000;
export const BILD_TIMEOUT_MS = 170_000;
// "illustration" haelt den Maler aus seiner Foto-Anreicherung und damit aus der
// GFPGAN-Gesichtsreparatur (server.py) — die Probe soll malen, nicht RAM fressen.
export const BILD_PROMPT = "a small red apple on a white table, simple illustration";

/**
 * POST /erzeuge am Bild-Maler (workers/smejj-bild-maler/server.py): derselbe
 * Vertrag und derselbe Schluessel-Kopf x-smejj-key wie die Chat-Bruecke
 * (public/chat-bridge-bilder.js). Groesse und Schritte legt der Dienst per
 * Umgebung fest (SMEJJ_BILD_GROESSE/-SCHRITTE, 512 px / 3 Schritte) — kleiner
 * erlaubt er pro Auftrag nicht. Darum das lange Zeitlimit: CPU-Malen dauert
 * 40-120 s, die Bruecke gibt 150 s.
 */
export async function probeBild({ url, schluessel = "", fetchImpl = fetch, timeoutMs = BILD_TIMEOUT_MS } = {}) {
  const beginn = Date.now();
  try {
    const antwort = await fetchImpl(`${String(url).replace(/\/+$/, "")}/erzeuge`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", ...(schluessel ? { "x-smejj-key": schluessel } : {}) },
      body: JSON.stringify({ prompt: BILD_PROMPT })
    });
    const dauer = Date.now() - beginn;
    if (antwort.status === 429) return { ok: true, nichtMessbar: true, text: "Bild nicht messbar: Maler beschäftigt (Nutzerauftrag) — neuer Versuch in 2 h" };
    if (antwort.status === 401 || antwort.status === 403) {
      return schluessel
        ? { ok: false, text: `Bild-Probe abgewiesen: HTTP ${antwort.status} — SMEJJ_BILDER_WORKER_KEY weicht vom Maler ab` }
        : { ok: true, nichtMessbar: true, text: `Bild nicht messbar: Maler verlangt Schlüssel, SMEJJ_BILDER_WORKER_KEY fehlt im Control-Server (HTTP ${antwort.status})` };
    }
    if (!antwort.ok) return { ok: false, text: `Bild-Probe gescheitert: HTTP ${antwort.status} nach ${sekunden(dauer)}` };
    const daten = await antwort.json().catch(() => null);
    if (!daten?.ok) return { ok: false, text: `Bild-Probe gescheitert: Maler sagt nein (${String(daten?.fehler || "keine JSON-Antwort").slice(0, 60)})` };
    const b64 = String(daten.b64 || "");
    if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return { ok: false, text: "Bild-Probe gescheitert: keine Bilddaten in der Antwort" };
    const bytes = Buffer.from(b64, "base64");
    const art = bildArt(bytes);
    if (!art) return { ok: false, text: `Bild-Probe gescheitert: ${kb(bytes.length)} ohne Bild-Kopf (weder PNG noch JPEG/WEBP)` };
    if (bytes.length < BILD_MIN_BYTES) return { ok: false, text: `Bild-Probe gescheitert: ${art.format} nur ${bytes.length} Bytes (Mindestgröße ${BILD_MIN_BYTES})` };
    const masse = art.breite ? `${art.breite}×${art.hoehe} ` : "";
    return { ok: true, text: `Bild erzeugt: ${masse}${art.format} ${kb(bytes.length)} in ${sekunden(dauer)}` };
  } catch (f) {
    return { ok: false, text: `Bild-Probe gescheitert: ${fehlerText(f, timeoutMs)}` };
  }
}

// ---------------------------------------------------------------- 3. Browser

export const PROBE_SEITE = "https://example.com/";
export const PROBE_TITEL = "Example Domain";
export const BROWSER_TIMEOUT_MS = 45_000;

/** Fester Plan fuer die Maus-Engine — kein Planer-Modell, keine Kosten, gueltig nach schemas/maus-action-plan.schema.json. */
export function mausProbePlan(jetzt = new Date()) {
  return {
    schemaVersion: 1,
    planId: `agenten-sonde-${jetzt.toISOString().slice(0, 13).replace(/[^0-9]/g, "")}`,
    createdAt: jetzt.toISOString(),
    capsuleRef: "autopiloten/agenten-sonde",
    planner: { modelId: "keins-feste-probe", promptTemplateVersion: "probe-v1" },
    goal: "Tagesprobe der Agenten-Sonde: example.com öffnen, Titel und Überschrift lesen",
    policy: {
      domainAllowlist: ["example.com"],
      budget: { maxActions: 5, maxLocalRetries: 1, maxPlannerRoundtrips: 0, maxDurationMs: 40_000, defaultActionTimeoutMs: 15_000 },
      artifacts: { trace: false, har: false, consoleLog: false, screenshotOnError: false }
    },
    steps: [
      { id: "oeffnen", action: "openBrowser" },
      { id: "laden", action: "navigate", url: PROBE_SEITE, waitUntil: "domcontentloaded" },
      { id: "titel", action: "assert", condition: "titleContains", text: PROBE_TITEL },
      { id: "ueberschrift", action: "extract", name: "h1", target: { strategy: "css", value: "h1" } },
      { id: "schliessen", action: "closeBrowser" }
    ]
  };
}

/** POST /run an der Maus-Engine mit Bearer-Token — derselbe Weg wie mausWorkerClient.js. */
export async function probeMaus({ konfig, fetchImpl = fetch, timeoutMs = BROWSER_TIMEOUT_MS, jetzt = new Date() } = {}) {
  const beginn = Date.now();
  try {
    const antwort = await fetchImpl(`${konfig.workerUrl}/run`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${konfig.token}`, "content-type": "application/json" },
      body: JSON.stringify({ plan: mausProbePlan(jetzt) })
    });
    const dauer = Date.now() - beginn;
    if (antwort.status === 429) return { ok: true, nichtMessbar: true, text: "Maus-Probe nicht messbar: Engine arbeitet an einem Nutzerauftrag" };
    const daten = await antwort.json().catch(() => null);
    if (antwort.status === 401 || antwort.status === 403) return { ok: false, text: `Maus-Probe abgewiesen: HTTP ${antwort.status} (Token von Control-Server und Engine stimmen nicht überein)` };
    if (daten?.rejected) return { ok: false, text: `Maus-Probe: Plan abgelehnt (${(daten.errors || []).slice(0, 2).join(" | ").slice(0, 80)})` };
    if (!antwort.ok || !daten) return { ok: false, text: `Maus-Probe gescheitert: HTTP ${antwort.status} nach ${sekunden(dauer)}` };
    const h1 = String(daten.extracted?.h1 || "").trim();
    if (daten.ok !== true) return { ok: false, text: `Maus-Probe gescheitert bei ${daten.failedStep || "?"}: ${String(daten.abortReason || daten.error || "ohne Grund").slice(0, 70)}` };
    if (!h1.includes(PROBE_TITEL)) return { ok: false, text: `Maus-Probe: Seite geladen, aber Überschrift „${h1.slice(0, 40)}“ statt „${PROBE_TITEL}“` };
    return { ok: true, text: `Maus-Engine öffnete example.com: „${PROBE_TITEL}“ in ${sekunden(dauer)}` };
  } catch (f) {
    return { ok: false, text: `Maus-Probe gescheitert: ${fehlerText(f, timeoutMs)}` };
  }
}

/** POST /render am Fern-Browser mit Bearer-Token — derselbe Weg wie browserRemoteRoutes.js. */
export async function probeFernBrowser({ konfig, fetchImpl = fetch, timeoutMs = BROWSER_TIMEOUT_MS } = {}) {
  const beginn = Date.now();
  try {
    const antwort = await fetchImpl(`${konfig.workerUrl}/render`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${konfig.token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ url: PROBE_SEITE, viewport: { width: 800, height: 600 } })
    });
    const dauer = Date.now() - beginn;
    const daten = await antwort.json().catch(() => null);
    if (antwort.status === 401 || antwort.status === 403) return { ok: false, text: `Fern-Browser-Probe abgewiesen: HTTP ${antwort.status} (Token weicht ab)` };
    if (!antwort.ok || daten?.ok !== true) return { ok: false, text: `Fern-Browser-Probe gescheitert: HTTP ${antwort.status}${daten?.error ? ` (${String(daten.error).slice(0, 60)})` : ""}` };
    const titel = String(daten.title || "").trim();
    if (!titel.includes(PROBE_TITEL)) return { ok: false, text: `Fern-Browser-Probe: Titel „${titel.slice(0, 40)}“ statt „${PROBE_TITEL}“` };
    const bildBytes = Math.floor(String(daten.screenshot || "").replace(/^data:image\/\w+;base64,/, "").length * 0.75);
    if (bildBytes < 1_000) return { ok: false, text: "Fern-Browser-Probe: Titel stimmt, aber kein Bildschirmfoto" };
    return { ok: true, text: `Fern-Browser öffnete example.com: „${PROBE_TITEL}“, Foto ${kb(bildBytes)} in ${sekunden(dauer)}` };
  } catch (f) {
    return { ok: false, text: `Fern-Browser-Probe gescheitert: ${fehlerText(f, timeoutMs)}` };
  }
}

// ---------------------------------------------------------------- 4. Stimme

export const STIMME_TEXT = "Guten Tag.";
export const STIMME_TIMEOUT_MS = 15_000;
export const STIMME_MIN_BYTES = 2_000;

/** Adresse von smejj-voice-piper im Control-Server — gleiche Zeabur-Host-Logik wie beim Bild-Maler. */
export function piperAdresse(env = process.env) {
  return String(
    env.SMEJJ_VOICE_PIPER_URL
    || (env.SMEJJ_VOICE_PIPER_HOST ? `http://${env.SMEJJ_VOICE_PIPER_HOST}:8080` : "")
    || "http://smejj-voice-piper.zeabur.internal:8080"
  ).trim().replace(/\/+$/, "");
}

/**
 * POST /synthesize an smejj-voice-piper (piper.http_server, kostenlose lokale
 * TTS) — derselbe Aufruf wie probePiper der Bruecke und hole_erzaehlstimme des
 * Video-Workers. Zwei Woerter statt einer Silbe mit Absicht: der http_server
 * beantwortet Winz-Eingaben mit seiner HTML-Demo-Seite UND Status 200 (Befund
 * im Video-Worker). Darum zaehlt nur der RIFF/OGG-Kopf, nie der Status.
 */
export async function probeStimme({ url, fetchImpl = fetch, timeoutMs = STIMME_TIMEOUT_MS } = {}) {
  const beginn = Date.now();
  try {
    const antwort = await fetchImpl(`${url}/synthesize`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: STIMME_TEXT })
    });
    if (!antwort.ok) return { ok: false, text: `Stimm-Probe gescheitert: HTTP ${antwort.status}` };
    const bytes = Buffer.from(await antwort.arrayBuffer());
    const dauer = Date.now() - beginn;
    const art = audioArt(bytes);
    if (!art) {
      const typ = String(antwort.headers?.get?.("content-type") || "").split(";")[0] || "unbekannt";
      return { ok: false, text: `Stimm-Probe gescheitert: ${kb(bytes.length)} ${typ} ohne WAV/OGG-Kopf` };
    }
    if (bytes.length < STIMME_MIN_BYTES) return { ok: false, text: `Stimm-Probe gescheitert: ${art.format} nur ${bytes.length} Bytes` };
    const details = art.format === "WAV" ? ` ${zahl(art.rate / 1000)} kHz ${zahl(art.dauerS)} s` : "";
    return { ok: true, text: `Stimme erzeugt: ${art.format}${details} ${kb(bytes.length)} in ${sekunden(dauer)}` };
  } catch (f) {
    return { ok: false, text: `Stimm-Probe gescheitert: ${fehlerText(f, timeoutMs)}` };
  }
}
