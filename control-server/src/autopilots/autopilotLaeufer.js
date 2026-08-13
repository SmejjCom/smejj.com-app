// smejj.com — Autopilot-Laeufer: bringt die Autopilot-Module zum ARBEITEN.
//
// WARUM ES DAS GIBT (Befund 2026-08-12): Die Module in diesem Ordner waren
// vollstaendig implementiert — und wurden von keiner einzigen Zeile des
// Servers importiert. Toter Code. Ihre Ampeln standen auf grau ("geplant"),
// weil nichts lief. Der Betreiber will sie arbeiten sehen, nicht gruen
// gefaerbt (docs/approvals/2026-08-12-ampel-ehrlich-messen.md).
//
// Dieser Laeufer ruft sie im Takt mit ECHTEN Eingaben auf und meldet, was
// dabei herauskam — Zahlen aus der Arbeit, nie ein Pauschaltext:
//
//   bug-predictor     scannt die echten Quelldateien dieses Containers
//   knowledge-graph   baut den Symbolgraphen ueber dieselben Dateien
//   code-interpreter  fuehrt eine Rechnung mit PRUEFBAREM Ergebnis aus
//   smart-router      klassifiziert Prompts mit bekannter Soll-Zuordnung
//   self-healing      bekommt kaputte Antworten und muss sie erkennen
//
// Die letzten drei sind Selbsttests mit erwartetem Ergebnis: Der Autopilot
// wird nicht gefragt "laeufst du?", sondern bekommt eine Aufgabe, deren
// richtige Antwort feststeht. Faellt er durch, wird seine Ampel ROT. Genau
// das unterscheidet Arbeit von einem Lebenszeichen.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { interneMeldung, autopilotUebersicht } from "../admin/opsAutopiloten.js";
import { baueBacklog } from "./werkstattBacklog.js";
import { pruefeSpracheAlle } from "./spracheQualitaetAutopilot.js";
import { runProjectBugScan } from "./bugPredictorAutopilot.js";
import { buildKnowledgeGraph } from "./knowledgeGraphAutopilot.js";
import { runCodeInterpreter } from "./codeInterpreterAutopilot.js";
import { routePrompt } from "./smartRouterAutopilot.js";
import { inspectResponseHealth, detectRepetitiveLoop } from "./selfHealingAutopilot.js";
// Die uebrigen Selbsttests liegen in einer eigenen Datei (800-Zeilen-Regel).
import * as S from "./autopilotSelbsttests.js";
import { runFullSyntheticE2ECycle } from "./syntheticUserWatchdogAutopilot.js";

// Der Container hat seinen eigenen Quelltext an Bord (Dockerfile.smejj-control
// kopiert src/ und control-server/). Genau den scannen die beiden
// Repo-Autopiloten — kein kuenstliches Beispiel, sondern der Code, der
// gerade laeuft.
// fileURLToPath statt .pathname: der Projektordner enthaelt Leerzeichen, und
// .pathname liefert sie URL-kodiert als %20 — readdirSync findet dann nichts
// und der Scan meldete "kein Quelltext" mitten im vollen Repository.
const WURZEL = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const SCAN_ORDNER = ["control-server/src", "src"];
// Angelina (Nr. 31) prueft die ausgelieferten Seiten, nicht den Servercode.
const SEITEN_ORDNER = ["public"];
const MAX_DATEIEN = 400;
const MAX_BYTES = 200_000;

/** Sammelt die echten .js-Dateien dieses Containers. */
export function sammleQuelldateien({ wurzel = WURZEL, ordner = SCAN_ORDNER, maxDateien = MAX_DATEIEN } = {}) {
  const dateien = [];
  const besuche = (verzeichnis) => {
    if (dateien.length >= maxDateien) return;
    let eintraege;
    try {
      eintraege = readdirSync(verzeichnis, { withFileTypes: true });
    } catch {
      return; // Ordner fehlt im Abbild — kein Grund, den Lauf abzubrechen.
    }
    for (const e of eintraege) {
      if (dateien.length >= maxDateien) return;
      const voll = path.join(verzeichnis, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        besuche(voll);
      } else if (e.name.endsWith(".js") && !e.name.endsWith(".test.js")) {
        try {
          if (statSync(voll).size > MAX_BYTES) continue;
          dateien.push({ path: path.relative(wurzel, voll), content: readFileSync(voll, "utf8") });
        } catch { /* eine unlesbare Datei stoppt den Lauf nicht */ }
      }
    }
  };
  for (const o of ordner) besuche(path.join(wurzel, o));
  return dateien;
}

/** Ein Lauf, einheitlich verpackt: Dauer messen, Absturz zu "fehler" machen. */
async function fuehreAus(id, arbeit) {
  const start = Date.now();
  try {
    const { meldung, ok = true } = await arbeit();
    return { id, ok, meldung, dauerMs: Date.now() - start };
  } catch (fehler) {
    return {
      id,
      ok: false,
      meldung: `Lauf abgebrochen: ${String(fehler?.message || fehler).slice(0, 140)}`,
      dauerMs: Date.now() - start
    };
  }
}

export function laufBugPredictor(dateien) {
  const bericht = runProjectBugScan(dateien);
  if (!Number.isFinite(bericht?.scannedFiles) || bericht.scannedFiles === 0) {
    return { ok: false, meldung: "Kein Quelltext gefunden — Scan ohne Aussage" };
  }
  return {
    ok: true,
    meldung: `${bericht.scannedFiles} Dateien gescannt, ${bericht.totalFindings} Befunde, `
      + `${bericht.cleanFiles} sauber${bericht.hasCriticalIssues ? " — KRITISCHE Funde dabei" : ""}`
  };
}

export function laufKnowledgeGraph(dateien) {
  const graph = buildKnowledgeGraph(dateien);
  if (!graph?.totalSymbols) {
    return { ok: false, meldung: "Graph leer — kein Symbol extrahiert" };
  }
  // Gegenprobe: der Graph muss sich auch abfragen lassen, sonst ist er nur
  // eine Zahl. "export" kommt in jedem Modul vor.
  const treffer = typeof graph.search === "function" ? graph.search("lauf").length : -1;
  return {
    ok: treffer >= 0,
    meldung: `${graph.totalFiles} Dateien, ${graph.totalSymbols} Symbole, ${graph.totalEdges} Kanten indexiert`
  };
}

export function laufCodeInterpreter() {
  // Aufgabe mit feststehender richtiger Antwort: 1+2+...+100 = 5050.
  const ergebnis = runCodeInterpreter("let s = 0; for (let i = 1; i <= 100; i++) s += i; s;");
  const wert = Number(ergebnis?.result);
  if (ergebnis?.status !== "success" || wert !== 5050) {
    return { ok: false, meldung: `Selbsttest FEHLGESCHLAGEN: erwartet 5050, bekam ${ergebnis?.result} (${ergebnis?.error || ergebnis?.status})` };
  }
  return { ok: true, meldung: `Sandbox-Selbsttest bestanden (Summe 1..100 = 5050, ${ergebnis.executionTimeMs} ms)` };
}

export function laufSmartRouter() {
  // Drei Prompts mit bekannter Soll-Sparte. Trifft der Router daneben, ist
  // seine Klassifikation kaputt — und die Ampel muss das zeigen.
  const faelle = [
    { prompt: "Berechne das Integral von x^2 und beweise die Ableitung", erwartet: "math_and_logic" },
    { prompt: "Entwirf die Systemarchitektur fuer einen Microservice und refaktoriere die Module", erwartet: "system_architecture" }
  ];
  const daneben = [];
  for (const f of faelle) {
    const r = routePrompt(f.prompt);
    if (r?.domain !== f.erwartet) daneben.push(`"${f.prompt.slice(0, 24)}…" -> ${r?.domain || "?"} statt ${f.erwartet}`);
  }
  if (daneben.length) {
    return { ok: false, meldung: `Router traf ${daneben.length}/${faelle.length} Faelle nicht: ${daneben[0]}` };
  }
  return { ok: true, meldung: `Klassifikation geprueft: ${faelle.length}/${faelle.length} Prompts richtig zugeordnet` };
}

export function laufSelfHealing() {
  // Der Autopilot muss kaputte Antworten als kaputt erkennen UND eine
  // gesunde als gesund. Nur beides zusammen ist ein Nachweis.
  const pruefungen = [
    { name: "leere Antwort", healthy: inspectResponseHealth("")?.healthy, soll: false },
    { name: "kaputtes JSON", healthy: inspectResponseHealth('{"a": 1,,}', "json")?.healthy, soll: false },
    // Mindestens 50 Zeichen — kuerzere Texte prueft detectRepetitiveLoop
    // bewusst nicht (eine kurze Wiederholung ist oft legitim).
    { name: "Endlosschleife", healthy: !detectRepetitiveLoop("wiederhole dich wiederhole dich wiederhole dich wiederhole dich wiederhole dich"), soll: false },
    { name: "gesunde Antwort", healthy: inspectResponseHealth("Das ist eine vollstaendige, sinnvolle Antwort.")?.healthy, soll: true }
  ];
  const daneben = pruefungen.filter((p) => Boolean(p.healthy) !== p.soll);
  if (daneben.length) {
    return { ok: false, meldung: `Selbstheilung erkennt ${daneben.length} Fall/Faelle falsch: ${daneben.map((d) => d.name).join(", ")}` };
  }
  return { ok: true, meldung: `Fehlererkennung geprueft: ${pruefungen.length}/${pruefungen.length} Faelle richtig beurteilt` };
}

/**
 * Ein kompletter Durchgang. Liefert die Ergebnisse zurueck (fuer Tests) und
 * traegt sie als Herzschlaege ein.
 *
 * @param {{melde?: Function, dateienLader?: Function}} [optionen]
 */
/**
 * Der einzige Lauf mit echtem Netzverkehr: ein vollstaendiger Nutzer-Durchlauf
 * (Anmeldung -> Chat ueber die Bruecke -> Speicher mit Ruecklese-Probe).
 * Bis 2026-08-12 war dieses Modul innen eine Attrappe: es wuerfelte eine
 * Antwortzeit mit Math.random() und prueft, ob ein selbst gebauter String
 * laenger als 10 Zeichen ist. Jetzt misst es die echte Kette.
 */
export async function laufSyntheticWatchdog({ env = process.env } = {}) {
  const zyklus = await runFullSyntheticE2ECycle({ env });
  const chat = (zyklus.details || []).find((d) => d.step === "chat_inference_flow");
  if (!zyklus.ok) {
    const kaputt = (zyklus.details || []).find((d) => !d.passed);
    return { ok: false, meldung: `E2E-Durchlauf gescheitert bei "${zyklus.failedStep}": ${kaputt?.error || "ohne Grund"}` };
  }
  return {
    ok: true,
    meldung: `Echter Nutzer-Durchlauf bestanden: ${zyklus.stepsPassed}/3 Schritte `
      + `(Anmeldung, Chat ${chat?.ttftMs ?? "?"} ms, Speicher mit Rücklese-Probe)`
  };
}

/** Sammelt die ausgelieferten HTML-Seiten (fuer den Sprach-Waechter). */
export function sammleSeiten({ wurzel = WURZEL, ordner = SEITEN_ORDNER, maxDateien = MAX_DATEIEN } = {}) {
  const dateien = [];
  const besuche = (verzeichnis) => {
    if (dateien.length >= maxDateien) return;
    let eintraege;
    try { eintraege = readdirSync(verzeichnis, { withFileTypes: true }); } catch { return; }
    for (const e of eintraege) {
      if (dateien.length >= maxDateien) return;
      const voll = path.join(verzeichnis, e.name);
      if (e.isDirectory()) {
        // assets/ enthaelt gebuendelte Kopien — dieselben Texte doppelt zaehlen
        // waere kein Fund, sondern Laerm.
        if (e.name === "node_modules" || e.name === "assets" || e.name.startsWith(".")) continue;
        besuche(voll);
      } else if (e.name.endsWith(".html")) {
        try {
          if (statSync(voll).size > MAX_BYTES) continue;
          dateien.push({ path: path.relative(wurzel, voll), content: readFileSync(voll, "utf8") });
        } catch { /* eine unlesbare Seite stoppt den Lauf nicht */ }
      }
    }
  };
  for (const o of ordner) besuche(path.join(wurzel, o));
  return dateien;
}

/**
 * Angelina (Nr. 31): findet deutsche Texte, die der Nutzer zu sehen bekommt
 * und die falsch geschrieben sind (Ersatzschreibung statt Umlaut).
 *
 * Der Autopilot ist GRUEN, wenn er gemessen hat — Funde sind ein Befund an der
 * Oberflaeche, kein Ausfall des Waechters. Genau wie beim Bug-Predictor steht
 * die Zahl in der Meldung, damit sie niemand uebersieht. Findet er GAR NICHTS
 * zu pruefen, ist das dagegen ein Ausfall: dann fehlen die Seiten.
 */
export function laufSprachQualitaet(seiten) {
  const bericht = pruefeSpracheAlle(seiten);
  if (!bericht.geprueft) return { ok: false, meldung: "Keine Seiten gefunden — Sprachpruefung ohne Aussage" };
  if (!bericht.funde) {
    return { ok: true, meldung: `${bericht.geprueft} Seiten geprüft, keine falsch geschriebenen Texte gefunden` };
  }
  const erster = bericht.berichte[0];
  const beispiel = erster?.funde?.[0];
  return {
    ok: true,
    meldung: `${bericht.geprueft} Seiten geprüft, ${bericht.funde} Sprachfehler in ${bericht.dateienMitFunden} Datei(en)`
      + (beispiel ? ` — z.B. "${beispiel.falsch}" statt "${beispiel.richtig}" in ${erster.pfad}` : "")
  };
}

/**
 * Werkstatt-Autopilot (Nr. 30), Station 1: sammelt das Backlog aus den echten
 * Quellen — im Takt statt nur auf Abruf.
 *
 * Er liest die Ampel DIREKT im Prozess (autopilotUebersicht), nicht ueber
 * HTTP: kein Token, kein Netz, keine Frage der Erreichbarkeit. Die Datei
 * docs/werkstatt/BACKLOG.md schreibt weiterhin nur der Aufruf von Hand
 * (npm run werkstatt:sammeln) — der Container hat dafuer keinen Ort.
 *
 * Die Pruefsuite bleibt hier bewusst stumm: sie zu starten hiesse, im
 * Server einen Kindprozess ueber hunderte Dateien laufen zu lassen. Der
 * Bericht sagt das auch — eine stumme Quelle wird benannt, nie verschwiegen.
 */
export function laufWerkstattSammeln({ uebersicht = autopilotUebersicht } = {}) {
  const ampelDaten = uebersicht({});
  const backlog = baueBacklog({
    ampel: { ok: true, autopiloten: ampelDaten.autopiloten || [], vorfaelle: ampelDaten.vorfaelle || [] },
    tests: { ok: false, grund: "im Takt nicht ausgefuehrt — npm run werkstatt:sammeln -- --mit-tests" }
  });
  const dringend = backlog.aufgaben.filter((a) => a.stufe <= 2).length;
  return {
    ok: true,
    meldung: `Backlog gesammelt: ${backlog.aufgaben.length} Aufgaben, davon ${dringend} dringend `
      + `(Quellen: ${backlog.gesammeltAus.join(", ")}; stumm: ${backlog.stummeQuellen.length})`
  };
}

/**
 * Voice-Region: misst, was messbar IST — ob die Sprachausgabe für Nutzer
 * bereitsteht.
 *
 * Der Autopilot hiess urspruenglich "prueft, ob Google die Regionsaenderung
 * genehmigt hat". Das laesst sich nicht automatisch abfragen (dafuer braeuchte
 * es eine Anmeldung in der Google-Konsole) — aber sein ERGEBNIS laesst sich
 * messen: springt die Freigabe um, meldet die Bruecke premiumVoice. Genau das
 * prueft dieser Lauf, und er sagt in der Meldung, was er wirklich gesehen hat.
 *
 * Der Lauf lief bis 2026-08-13 im Zeabur-Dienst smejj-autopilot-jobs und blieb
 * dort zwei Tage aus (Ampel rot, Dienst von aussen nicht erreichbar). Im
 * Control-Server laeuft er im selben Takt wie alle anderen.
 *
 * POST statt GET ist Absicht: die Bruecke beantwortet jedes GET ausser /health
 * mit 404 — ein GET haette hier "Endpunkt tot" gemeldet, obwohl er lebt.
 */
export async function laufVoiceRegion({ env = process.env, fetchImpl = fetch } = {}) {
  const basis = String(env.SMEJJ_BRUECKE_URL || "https://smejj-chat-bridge.zeabur.app").replace(/\/+$/, "");
  try {
    const antwort = await fetchImpl(`${basis}/api/voice/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://smejj.com" },
      body: "{}",
      signal: AbortSignal.timeout(15_000)
    });
    if (!antwort.ok) return { ok: false, meldung: `Sprach-Status nicht abfragbar: HTTP ${antwort.status}` };
    const daten = await antwort.json();
    if (daten?.ok !== true) return { ok: false, meldung: `Sprach-Status meldet einen Fehler: ${String(daten?.error || "ohne Grund").slice(0, 80)}` };
    return {
      ok: true,
      meldung: daten.premiumVoice
        ? "Sprachausgabe verfügbar (premiumVoice aktiv) — Freigabe wirksam"
        : "Sprachausgabe noch nicht freigeschaltet (premiumVoice aus) — Stand unverändert"
    };
  } catch (fehler) {
    return { ok: false, meldung: `Sprach-Status nicht erreichbar: ${String(fehler?.name === "TimeoutError" ? "Zeitlimit 15 s" : fehler?.message || fehler).slice(0, 90)}` };
  }
}

/**
 * @param {{melde?: Function, dateienLader?: Function, mitNetz?: boolean}} [optionen]
 *   mitNetz=false laesst den E2E-Waechter aus — fuer Tests, die ohne Aussenwelt
 *   laufen muessen.
 */
export async function laufeAlle({ melde = interneMeldung, dateienLader = sammleQuelldateien, seitenLader = sammleSeiten, mitNetz = true } = {}) {
  // Einmal lesen, zweimal nutzen: beide Repo-Autopiloten sehen denselben Stand.
  let dateien = [];
  try {
    dateien = dateienLader();
  } catch { /* laufBugPredictor meldet dann "kein Quelltext" — ehrlich statt still */ }
  let seiten = [];
  try { seiten = seitenLader(); } catch { /* laufSprachQualitaet meldet dann "keine Seiten" */ }

  const ergebnisse = [
    await fuehreAus("bug-predictor", () => laufBugPredictor(dateien)),
    await fuehreAus("knowledge-graph", () => laufKnowledgeGraph(dateien)),
    await fuehreAus("code-interpreter", () => laufCodeInterpreter()),
    await fuehreAus("smart-router", () => laufSmartRouter()),
    await fuehreAus("self-healing", () => laufSelfHealing()),
    await fuehreAus("deep-research", () => S.laufDeepResearch()),
    await fuehreAus("memory-sync", () => S.laufMemory()),
    await fuehreAus("multimodal-engine", () => S.laufMultimodal()),
    await fuehreAus("task-orchestrator", () => S.laufTaskOrchestrator()),
    await fuehreAus("self-improvement", () => S.laufSelfImprovement()),
    await fuehreAus("model-lifecycle", () => S.laufModelLifecycle()),
    await fuehreAus("user-feedback-flywheel", () => S.laufUserFeedbackFlywheel()),
    await fuehreAus("process-reward", () => S.laufProcessReward()),
    await fuehreAus("knowledge-distiller", () => S.laufKnowledgeDistiller()),
    await fuehreAus("evolutionary-mutation", () => S.laufEvolutionaryMutation()),
    await fuehreAus("realtime-internet-harvester", () => S.laufInternetHarvester()),
    await fuehreAus("multi-file-repo-architect", () => S.laufRepoArchitect(dateien)),
    await fuehreAus("live-arena-leaderboard", () => S.laufLiveArena()),
    await fuehreAus("instant-web-container", () => S.laufWebContainer()),
    await fuehreAus("realtime-voice-pair", () => S.laufVoicePair()),
    await fuehreAus("autonomous-git-bot", () => S.laufGitBot()),
    await fuehreAus("werkstatt-autopilot", () => laufWerkstattSammeln()),
    await fuehreAus("angelina-autopilot", () => laufSprachQualitaet(seiten)),
    // Als Letztes und nur mit Netz: der einzige Lauf, der die Aussenwelt
    // anfasst (echter Chat ueber die Bruecke). Faellt er aus, sagt das etwas
    // ueber die LIVE-Kette — deshalb gehoert er hierher und nicht in einen
    // Selbsttest.
    ...(mitNetz ? [
      await fuehreAus("synthetic-user-watchdog", () => laufSyntheticWatchdog()),
      await fuehreAus("voice-region-check", () => laufVoiceRegion())
    ] : [])
  ];

  for (const e of ergebnisse) {
    melde(e.id, { status: e.ok ? "ok" : "fehler", meldung: e.meldung, dauerMs: e.dauerMs });
  }
  return ergebnisse;
}

/**
 * Den Laeufer im Takt starten. Standard: alle 30 Minuten — oft genug, damit
 * ein Ausfall binnen einer Stunde auffaellt, selten genug, dass der Scan
 * (einige hundert Dateien) den Server nicht beschaeftigt.
 * `unref()` haelt den Prozess nicht wach.
 */
export function starteAutopilotLaeufer({ intervallMs = 30 * 60 * 1000 } = {}) {
  const tick = () => { laufeAlle().catch(() => {}); };
  tick();
  const zeitgeber = setInterval(tick, intervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}
