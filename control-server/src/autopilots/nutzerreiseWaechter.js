// smejj.com — Nutzerreise-Wächter: der dichte A-bis-Z-Takt des Probe-Nutzers
// (Autopilot Nr. 29). Betreiber-Auftrag 2026-08-25: die GESAMTE App alle
// 10-15 Minuten als echter Nutzer durchprüfen — nicht nur Anmeldung, Chat
// und Speicher.
//
// WARUM ES DIESES MODUL GIBT: Am 2026-08-25 war /code auf ALLEN Domains tot
// (SyntaxError in code-flaeche.js), während alle 64 Ampeln grün standen und
// der nächtliche Messlauf "100.00 %" veröffentlichte. Kein Wächter hat je
// die AUSLIEFERUNG als Nutzer angefasst: der Probe-Nutzer prüfte Token,
// Brücke und S3 — aber keine Startseite, kein nachgeladenes Modul, keine
// Bündel-Gleichheit. Genau diese Lücken schließt dieser Takt.
//
// RESSOURCEN-REGEL (der Control-Server hat 2 vCPU): Dieser Takt macht NUR
// wenige HTTP-Abrufe und Parser-Proben — keinen Dateiscan, keinen Browser,
// keinen Kindprozess. Der schwere 30-Minuten-Durchgang (laufeAlle) bleibt
// unangetastet; die Startsonde wird nie verdrängt (erster Lauf erst 3 min
// nach dem Boot).
import { runFullSyntheticE2ECycle } from "./syntheticUserWatchdogAutopilot.js";
import { createRecordStore } from "../admin/recordStore.js";

const REISE_TAKT_MS = 15 * 60 * 1000; // im geforderten 10-15-Minuten-Fenster
const START_VERZOEGERUNG_MS = 3 * 60 * 1000;
const APP_URSPRUNG = "https://smejj.com";
const API_URSPRUNG = "https://api.smejj.com";

// Verlauf im Adminbereich: jeder Durchlauf wird abgelegt (Ringpuffer 500),
// mit Prioritaet je Befund — P0 kritisch bis P3 kosmetisch.
let reiseAblage = null;
function holeReiseAblage() {
  if (!reiseAblage) reiseAblage = createRecordStore("watchdog/nutzerreise-laeufe", { maximal: 500 });
  return reiseAblage;
}

/** Startseite: liefert sie, ist sie die App, und wie schnell kam sie? */
export async function pruefeStartseite({ fetchImpl = fetch, ursprung = APP_URSPRUNG } = {}) {
  const start = Date.now();
  const schritt = "startseite";
  try {
    const antwort = await fetchImpl(`${ursprung}/`, { signal: AbortSignal.timeout(15_000) });
    const ms = Date.now() - start;
    if (!antwort.ok) return { schritt, passed: false, ms, prio: "P0", error: `HTTP ${antwort.status}` };
    const html = await antwort.text();
    if (!/smejj/i.test(html) || html.length < 5_000) {
      return { schritt, passed: false, ms, prio: "P0", error: `Antwort ist nicht die App (${html.length} Zeichen)` };
    }
    // Serverseitig gemessen; das Browser-Budget (LCP) misst Nr. 63 im echten
    // Chrome. Hier zaehlt: die Auslieferung selbst darf nicht lahmen.
    if (ms > 3_000) return { schritt, passed: false, ms, prio: "P2", error: `Startseite brauchte ${ms} ms (> 3000)` };
    return { schritt, passed: true, ms };
  } catch (fehler) {
    return { schritt, passed: false, ms: Date.now() - start, prio: "P0", error: String(fehler?.message || fehler) };
  }
}

/** Ein-Bündel-Vertrag: beide Domains liefern denselben Service Worker. */
export async function pruefeBuendelGleichheit({ fetchImpl = fetch, a = APP_URSPRUNG, b = API_URSPRUNG } = {}) {
  const schritt = "buendel_gleichheit";
  const start = Date.now();
  try {
    const [swA, swB] = await Promise.all([
      fetchImpl(`${a}/sw.js`, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status} von ${a}`)))),
      fetchImpl(`${b}/sw.js`, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status} von ${b}`))))
    ]);
    const ms = Date.now() - start;
    const nameA = swA.match(/CACHE_NAME = "([^"]+)"/)?.[1] || "?";
    const nameB = swB.match(/CACHE_NAME = "([^"]+)"/)?.[1] || "?";
    if (swA !== swB) {
      return { schritt, passed: false, ms, prio: "P1", error: `sw.js weicht ab: ${a} traegt ${nameA}, ${b} traegt ${nameB}` };
    }
    return { schritt, passed: true, ms, detail: nameA };
  } catch (fehler) {
    return { schritt, passed: false, ms: Date.now() - start, prio: "P1", error: String(fehler?.message || fehler) };
  }
}

/**
 * Parser-Probe eines ES-Moduls OHNE Kindprozess und OHNE Ausführung:
 * Der data:-Import parst und LINKT das Modul. Der angehängte, nie auflösbare
 * Import garantiert, dass das Linken scheitert, BEVOR irgendetwas läuft —
 * ein Syntaxfehler fällt aber schon beim Parsen, also vorher. So wird genau
 * die Fehlerklasse vom 2026-08-25 (Import im Import) live erkannt.
 */
export async function parseAlsModul(quelltext) {
  const gepanzert = `${quelltext}\nimport "smejj-nie-aufloesbar-nutzerreise-probe";`;
  const url = `data:text/javascript;base64,${Buffer.from(gepanzert, "utf8").toString("base64")}`;
  try {
    await import(url);
    return { ok: false, grund: "Probe-Import wurde aufgeloest — Panzerung wirkungslos" };
  } catch (fehler) {
    if (fehler instanceof SyntaxError) return { ok: false, grund: String(fehler.message || fehler).slice(0, 160) };
    return { ok: true };
  }
}

/**
 * Nachlade-Kette: die Module, die erst auf Klick kommen und deren Bruch
 * deshalb keine Boot-Sonde je sieht. Geprüft wird die LIVE ausgelieferte
 * Fassung — der Einstieg (code-nachladen.js) nennt selbst, welche
 * code-flaeche-Version er laden wird.
 */
export async function pruefeNachladeKette({ fetchImpl = fetch, ursprung = APP_URSPRUNG } = {}) {
  const schritt = "nachlade_kette";
  const start = Date.now();
  const kaputt = [];
  const geprueft = [];
  try {
    const hole = async (pfad) => {
      const antwort = await fetchImpl(`${ursprung}${pfad}`, { signal: AbortSignal.timeout(15_000) });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status} fuer ${pfad}`);
      return antwort.text();
    };
    const nachlader = await hole("/assets/code-nachladen.js");
    // chat-stream wohnt unter /assets/ai/ (app.js importiert es genau so) —
    // der erste Live-Lauf dieses Waechters bewies das per 404-Fehlalarm.
    const ziele = ["/assets/code-nachladen.js", "/assets/ai/chat-stream.js"];
    const flaeche = nachlader.match(/import\("\.\/(code-flaeche\.js\?v=\d+)"\)/)?.[1];
    if (flaeche) ziele.push(`/assets/${flaeche}`);
    const inhalte = new Map([["/assets/code-nachladen.js", nachlader]]);
    for (const ziel of ziele) {
      if (!inhalte.has(ziel)) inhalte.set(ziel, await hole(ziel));
      const probe = await parseAlsModul(inhalte.get(ziel));
      geprueft.push(ziel);
      if (!probe.ok) kaputt.push(`${ziel}: ${probe.grund}`);
    }
    const ms = Date.now() - start;
    if (kaputt.length) return { schritt, passed: false, ms, prio: "P1", error: kaputt.join(" | ") };
    return { schritt, passed: true, ms, detail: `${geprueft.length} Module geparst` };
  } catch (fehler) {
    return { schritt, passed: false, ms: Date.now() - start, prio: "P1", error: String(fehler?.message || fehler) };
  }
}

/** Kern-Endpunkte: gesund UND fail-closed (401 ist richtig, 5xx ist krank). */
export async function pruefeApiKernpfade({ fetchImpl = fetch, ursprung = API_URSPRUNG } = {}) {
  const schritt = "api_kernpfade";
  const start = Date.now();
  const befunde = [];
  const proben = [
    { pfad: "/api/health", erwartet: (s) => s === 200, sinn: "gesund" },
    { pfad: "/api/admin/me", erwartet: (s) => s === 401 || s === 403, sinn: "ohne Anmeldung dicht" },
    { pfad: "/v1/models", erwartet: (s) => s === 401 || s === 200, sinn: "kein Serverfehler" }
  ];
  for (const probe of proben) {
    try {
      const antwort = await fetchImpl(`${ursprung}${probe.pfad}`, { signal: AbortSignal.timeout(15_000) });
      if (!probe.erwartet(antwort.status)) befunde.push(`${probe.pfad} antwortete HTTP ${antwort.status} (erwartet: ${probe.sinn})`);
    } catch (fehler) {
      befunde.push(`${probe.pfad}: ${String(fehler?.message || fehler).slice(0, 80)}`);
    }
  }
  const ms = Date.now() - start;
  if (befunde.length) return { schritt, passed: false, ms, prio: "P1", error: befunde.join(" | ") };
  return { schritt, passed: true, ms };
}

/**
 * Der volle A-bis-Z-Durchlauf: Auslieferung (Startseite, Bündel, Nachlade-
 * Kette), Kernpfade und der klassische Nutzerpfad (Anmeldung, Chat über die
 * Brücke, Speicher mit Rücklese-Probe). Jeder Befund traegt eine Prioritaet
 * P0-P3; die schlimmste bestimmt die Meldung.
 */
export async function laufNutzerreise({ env = process.env, fetchImpl = fetch, zyklus = runFullSyntheticE2ECycle, ablage = holeReiseAblage } = {}) {
  const start = Date.now();
  const schritte = [];
  schritte.push(await pruefeStartseite({ fetchImpl }));
  schritte.push(await pruefeBuendelGleichheit({ fetchImpl }));
  schritte.push(await pruefeNachladeKette({ fetchImpl }));
  schritte.push(await pruefeApiKernpfade({ fetchImpl }));
  // Der bewaehrte Kern (Auth, Chat mit TTFT, Speicher-Ruecklese) — unveraendert.
  const kern = await zyklus({ env });
  for (const d of kern.details || []) {
    schritte.push({ schritt: d.step, passed: Boolean(d.passed), ms: d.latencyMs || 0, prio: d.passed ? undefined : "P0", error: d.error, ttftMs: d.ttftMs });
  }
  const kaputte = schritte.filter((s) => !s.passed);
  const rang = { P0: 0, P1: 1, P2: 2, P3: 3 };
  kaputte.sort((a, b) => (rang[a.prio] ?? 3) - (rang[b.prio] ?? 3));
  const dauerMs = Date.now() - start;
  const ergebnis = {
    ok: kaputte.length === 0,
    dauerMs,
    schritteGesamt: schritte.length,
    schritteBestanden: schritte.length - kaputte.length,
    schlimmste: kaputte[0]?.prio || null,
    schritte
  };
  // Verlauf fuer den Adminbereich — still und fehlertolerant: die Ablage ist
  // Beleg, nie Voraussetzung der Messung.
  try {
    await ablage().schreib({
      id: `reise_${Date.now()}`,
      createdAt: new Date().toISOString(),
      ok: ergebnis.ok,
      dauerMs,
      schlimmste: ergebnis.schlimmste,
      befunde: kaputte.map((k) => ({ schritt: k.schritt, prio: k.prio, error: String(k.error || "").slice(0, 200) }))
    });
  } catch { /* Ablage-Ausfall meldet der Speicher-Schritt selbst */ }
  return ergebnis;
}

/** Formt das Ergebnis in die Ampel-Meldung des Probe-Nutzers (Nr. 29). */
export function alsAmpelMeldung(reise) {
  if (reise.ok) {
    const chat = reise.schritte.find((s) => s.schritt === "chat_inference_flow");
    return {
      status: "ok",
      meldung: `Nutzerreise bestanden: ${reise.schritteBestanden}/${reise.schritteGesamt} Schritte in ${reise.dauerMs} ms `
        + `(Startseite, Bündel, Nachlade-Kette, API, Anmeldung, Chat ${chat?.ttftMs ?? "?"} ms, Speicher)`
    };
  }
  const kaputte = reise.schritte.filter((s) => !s.passed);
  const erster = kaputte[0];
  return {
    status: "fehler",
    meldung: `Nutzerreise ${reise.schlimmste}: ${kaputte.length} von ${reise.schritteGesamt} Schritten kaputt — `
      + `${erster.schritt}: ${String(erster.error || "ohne Grund").slice(0, 160)}`
  };
}

// Bremse gegen Doppel-Laeufe: ein haengender Durchlauf (alle Fetches haben
// 15-s-Limits, aber sicher ist sicher) blockiert den naechsten Tick, statt
// sich mit ihm zu stapeln.
let reiseLaeuft = false;

/**
 * Der eigene, dichte Takt des Probe-Nutzers — zusaetzlich zum schweren
 * 30-Minuten-Durchgang, der alle uebrigen Autopiloten betreibt. `melde`
 * schreibt denselben Herzschlag wie der Durchgang ("synthetic-user-watchdog"),
 * die Ampel Nr. 29 wird damit alle 15 Minuten frisch — und ihre Eskalation
 * (Heiler, Alarm-Mail) haengt unveraendert an derselben Kennung.
 */
export function starteNutzerreiseTakt({ intervallMs = REISE_TAKT_MS, melde, lauf = laufNutzerreise } = {}) {
  if (typeof melde !== "function") throw new Error("starteNutzerreiseTakt braucht melde() — ein Waechter ohne Anschluss ist keiner");
  const tick = () => {
    if (reiseLaeuft) return;
    reiseLaeuft = true;
    lauf()
      .then((reise) => melde("synthetic-user-watchdog", { ...alsAmpelMeldung(reise), dauerMs: reise.dauerMs }))
      .catch((fehler) => melde("synthetic-user-watchdog", { status: "fehler", meldung: `Nutzerreise selbst gestuerzt: ${String(fehler?.message || fehler).slice(0, 160)}` }))
      .finally(() => { reiseLaeuft = false; });
  };
  const anlauf = setTimeout(tick, START_VERZOEGERUNG_MS);
  if (typeof anlauf.unref === "function") anlauf.unref();
  const zeitgeber = setInterval(tick, intervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}
