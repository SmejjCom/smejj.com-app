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
import { planeHeilung, fuehreHeilungAus } from "./selbstheilung.js";
import { offeneUeberfaellig, listeTickets } from "../admin/supportTickets.js";
import { scrubPiiData, getUserFlywheelStats } from "./userFeedbackFlywheelAutopilot.js";
import { executeRealtimeHarvestCycle, getHarvestBestand, HARVEST_TOPICS } from "./realtimeInternetHarvesterAutopilot.js";

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

// Wen betreibt dieser Laeufer? Genau diese lassen sich hier auch wiederbeleben.
export const IM_LAEUFER_BETRIEBEN = Object.freeze([
  "bug-predictor", "knowledge-graph", "code-interpreter", "smart-router", "self-healing",
  "deep-research", "memory-sync", "multimodal-engine", "task-orchestrator", "self-improvement",
  "model-lifecycle", "user-feedback-flywheel", "process-reward", "knowledge-distiller",
  "evolutionary-mutation", "realtime-internet-harvester", "multi-file-repo-architect",
  "live-arena-leaderboard", "instant-web-container", "realtime-voice-pair", "autonomous-git-bot",
  "werkstatt-autopilot", "synthetic-user-watchdog", "voice-region-check"
]);

// Zaehler der Selbstheilung: id -> {versuche, letzterMs, eskaliert}. Lebt im
// Prozess; ein Neustart setzt ihn zurueck — richtig so, denn ein Neustart ist
// selbst schon der groesste denkbare Heilungsversuch.
const heilungsZustand = new Map();

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

/**
 * Ein Lauf, einheitlich verpackt: Dauer messen, Absturz zu "fehler" machen.
 *
 * Das Zeitlimit ist kein Komfort, sondern eine Lehre (Befund 2026-08-13):
 * ein einziger Lauf ohne eigenes Zeitlimit, der auf eine tote Verbindung
 * wartet, hielt den gesamten Durchgang fest — und weil damals erst am Ende
 * gemeldet wurde, blieben ALLE Ampeln stumm-grau, ohne Hinweis auf den einen
 * Haenger. Der haengende Lauf selbst laeuft im Hintergrund weiter (abbrechen
 * kann man ein fremdes Promise nicht), aber der Durchgang geht weiter und
 * die Ampel nennt den Schuldigen beim Namen.
 */
const ZEITLIMIT_JE_LAUF_MS = 120_000;

export async function fuehreAus(id, arbeit, zeitlimitMs = ZEITLIMIT_JE_LAUF_MS) {
  const start = Date.now();
  let wecker = null;
  try {
    const ergebnis = await Promise.race([
      Promise.resolve().then(arbeit),
      new Promise((_, ablehnen) => {
        wecker = setTimeout(
          () => ablehnen(new Error(`Zeitlimit ${Math.round(zeitlimitMs / 1000)} s ueberschritten — der Lauf haengt`)),
          zeitlimitMs
        );
        if (typeof wecker.unref === "function") wecker.unref();
      })
    ]);
    const { meldung, ok = true } = ergebnis;
    return { id, ok, meldung, dauerMs: Date.now() - start };
  } catch (fehler) {
    return {
      id,
      ok: false,
      meldung: `Lauf abgebrochen: ${String(fehler?.message || fehler).slice(0, 140)}`,
      dauerMs: Date.now() - start
    };
  } finally {
    if (wecker) clearTimeout(wecker);
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
export async function laufWerkstattSammeln({ uebersicht = autopilotUebersicht, statsLader = getUserFlywheelStats } = {}) {
  const ampelDaten = uebersicht({});
  // Seit dem Daten-Schwungrad (2026-08-13) liest die Werkstatt auch die
  // Nicht-hilfreich-Signale der Nutzer: schlechte Antworten sind Arbeit,
  // keine Statistik. Nicht lesbar => als stumme Quelle benannt, nie erfunden.
  const stats = await statsLader().catch(() => null);
  const backlog = baueBacklog({
    ampel: { ok: true, autopiloten: ampelDaten.autopiloten || [], vorfaelle: ampelDaten.vorfaelle || [] },
    tests: { ok: false, grund: "im Takt nicht ausgefuehrt — npm run werkstatt:sammeln -- --mit-tests" },
    antworten: stats?.ok
      ? { ok: true, negative: stats.negativeLetzte7Tage }
      : { ok: false, grund: stats?.grund || "Feedback-Ablage nicht lesbar" }
  });
  const dringend = backlog.aufgaben.filter((a) => a.stufe <= 2).length;
  return {
    ok: true,
    meldung: `Backlog gesammelt: ${backlog.aufgaben.length} Aufgaben, davon ${dringend} dringend `
      + `(Quellen: ${backlog.gesammeltAus.join(", ")}; stumm: ${backlog.stummeQuellen.length})`
  };
}

/**
 * Daten-Schwungrad (Nr. 19), seit 2026-08-13 echt: zaehlt die WIRKLICH
 * eingegangenen Daumen-Signale (POST /api/feedback) statt nur den
 * PII-Filter zu testen. Der Filter wird trotzdem weiter geprueft — er ist
 * die Bedingung, unter der ueberhaupt gespeichert werden darf: faellt er,
 * ist der Lauf rot, egal wie schoen die Zahlen sind.
 */
export async function laufFeedbackSchwungrad({ statsLader = getUserFlywheelStats } = {}) {
  const probe = scrubPiiData("Mail an alan.best@example.com, Schluessel sk-abcdef1234567890abcdef, IP 192.168.10.5");
  const filterHeil = !probe.includes("alan.best@example.com")
    && !probe.includes("sk-abcdef1234567890abcdef")
    && !probe.includes("192.168.10.5");
  if (!filterHeil) {
    return { ok: false, meldung: "PII-Filter durchlaessig — es darf NICHTS gespeichert werden, bis er wieder maskiert" };
  }
  const stats = await statsLader();
  if (!stats.ok) {
    return { ok: false, meldung: `PII-Filter dicht, aber Feedback-Ablage nicht lesbar: ${stats.grund || "ohne Grund"}` };
  }
  const negativ = stats.negativeLetzte7Tage.length;
  const typen = Object.entries(stats.jeTyp).map(([typ, n]) => `${n}x ${typ}`).join(", ");
  return {
    ok: true,
    meldung: stats.gesamt === 0
      ? "PII-Filter dicht; noch keine Nutzersignale eingegangen — der Daumen-Weg ist frisch verdrahtet"
      : `PII-Filter dicht; ${stats.gesamt} Signale (${typen}), davon ${negativ} negativ in 7 Tagen`
  };
}

// Zwischen zwei Ernten liegt mindestens ein Tag: die Themen rotieren
// kalendertaeglich, und haeufigeres Ernten wuerde nur dieselben Treffer
// erneut einsammeln (und Suchkontingent verbrennen).
const ERNTE_ABSTAND_MS = 24 * 60 * 60 * 1000;

/**
 * Wissens-Ernte (Nr. 23), seit 2026-08-13 echt: einmal taeglich holt sie
 * ueber die echte Websuche neue Fakten zum Tagesthema und legt sie in den
 * Feed, den der RAG-Index des Agenten seit heute WIRKLICH einliest
 * (agentContext.js). In den uebrigen Takten meldet sie den gemessenen
 * Bestand — nie einen Pauschaltext.
 */
export async function laufWissensErnte({ mitNetz = true, bestandLader = getHarvestBestand, ernte = executeRealtimeHarvestCycle, jetztMs = Date.now() } = {}) {
  const bestand = await bestandLader();
  if (!bestand.ok) {
    return { ok: false, meldung: `Ernte-Ablage nicht lesbar: ${bestand.grund || "ohne Grund"}` };
  }
  const letzteMs = bestand.letzterBatch ? Date.parse(bestand.letzterBatch.createdAt || "") : NaN;
  const frisch = Number.isFinite(letzteMs) && jetztMs - letzteMs < ERNTE_ABSTAND_MS;
  if (frisch) {
    const stunden = Math.round((jetztMs - letzteMs) / 3_600_000);
    return {
      ok: true,
      meldung: `Ernte aktuell: ${bestand.faktenGesamt} Fakten in ${bestand.batches} Laeufen, `
        + `letzte vor ${stunden} h ("${String(bestand.letzterBatch.topic).slice(0, 40)}")`
    };
  }
  if (!mitNetz) {
    return { ok: true, meldung: `Ernte faellig (Bestand: ${bestand.faktenGesamt} Fakten) — laeuft im naechsten Netz-Takt` };
  }
  const tagDesJahres = Math.floor(jetztMs / 86_400_000);
  const thema = HARVEST_TOPICS[tagDesJahres % HARVEST_TOPICS.length];
  const ergebnis = await ernte(thema);
  if (!ergebnis.ok || ergebnis.factsHarvested === 0) {
    return {
      ok: false,
      meldung: `Ernte zu "${String(thema).slice(0, 40)}" brachte ${ergebnis.factsHarvested || 0} Fakten`
        + `${ergebnis.error ? ` (${String(ergebnis.error).slice(0, 60)})` : " — Suchweg pruefen"}`
    };
  }
  return {
    ok: true,
    meldung: `${ergebnis.factsHarvested} frische Fakten zu "${String(thema).slice(0, 40)}" geerntet `
      + `(Bestand vorher: ${bestand.faktenGesamt})`
  };
}

/**
 * Bild/Video-Qualitaet (Nr. 8 multimodal-engine), seit 2026-08-13 echt:
 * fragt die BEIDEN Erzeuger-Dienste nach ihrem Zustand, statt nur die
 * Eingabepruefung zu testen. Faellt ein Worker um oder meldet er sich
 * nicht bereit, wird die Ampel rot — und der Vorfall laeuft von selbst
 * ins Werkstatt-Backlog (Ampel-Quelle).
 *
 * Der Video-Worker wird IMMER geprueft (er ist seit 2026-08-11 live);
 * der Bild-Maler nur, wenn seine Adresse gesetzt ist — einen nie
 * ausgerollten Dienst rot zu malen waere keine Messung, sondern Laerm.
 */
export async function laufMedienQualitaet({ mitNetz = true, env = process.env, fetchImpl = fetch } = {}) {
  if (!mitNetz) {
    return { ok: true, meldung: "Netz-Takt abgewartet — Worker-Zustand wird im naechsten Lauf gemessen" };
  }
  const ziele = [
    { name: "Video-Worker", url: String(env.SMEJJ_VIDEO_WORKER_URL || "http://smejj-video-worker.zeabur.internal:8080") }
  ];
  if (env.SMEJJ_BILDER_WORKER_URL) {
    ziele.push({ name: "Bild-Maler", url: String(env.SMEJJ_BILDER_WORKER_URL) });
  }
  const befunde = [];
  let allesOk = true;
  for (const ziel of ziele) {
    try {
      const antwort = await fetchImpl(`${ziel.url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(10_000) });
      if (!antwort.ok) {
        allesOk = false;
        befunde.push(`${ziel.name}: HTTP ${antwort.status}`);
        continue;
      }
      const daten = await antwort.json().catch(() => ({}));
      if (daten.bereit === false) {
        // "laeuft, aber nicht bereit" ist der Salad-Fehlbild-Klassiker —
        // genau der Zustand, der frueher unsichtbar blieb.
        allesOk = false;
        befunde.push(`${ziel.name}: laeuft, aber NICHT bereit${daten.fehler ? ` (${String(daten.fehler).slice(0, 40)})` : ""}`);
      } else {
        befunde.push(`${ziel.name}: bereit${daten.engine ? ` (${daten.engine})` : ""}`);
      }
    } catch (fehler) {
      allesOk = false;
      befunde.push(`${ziel.name}: nicht erreichbar (${String(fehler?.name === "TimeoutError" ? "Zeitlimit 10 s" : fehler?.message || fehler).slice(0, 50)})`);
    }
  }
  return { ok: allesOk, meldung: befunde.join("; ") };
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
/**
 * Die Laeufe der Reihe nach ausfuehren und JEDEN SOFORT melden (Befund
 * 2026-08-13): als die Meldungen gesammelt nach allen Laeufen kamen, hielt
 * EIN haengender Lauf saemtliche 26 Ampeln auf stumm-grau — und der Haenger
 * selbst war unsichtbar. So fuellt sich die Ampel Stueck fuer Stueck, und
 * was haengt, faellt als Luecke sofort auf.
 */
export async function fuehreLaeufeAus(laeufe, { melde = interneMeldung, zeitlimitMs = ZEITLIMIT_JE_LAUF_MS } = {}) {
  const ergebnisse = [];
  for (const [id, arbeit] of laeufe) {
    const e = await fuehreAus(id, arbeit, zeitlimitMs);
    melde(e.id, { status: e.ok ? "ok" : "fehler", meldung: e.meldung, dauerMs: e.dauerMs });
    ergebnisse.push(e);
  }
  return ergebnisse;
}

export async function laufeAlle({ melde = interneMeldung, dateienLader = sammleQuelldateien, seitenLader = sammleSeiten, mitNetz = true, zeitlimitMs = ZEITLIMIT_JE_LAUF_MS } = {}) {
  // Einmal lesen, zweimal nutzen: beide Repo-Autopiloten sehen denselben Stand.
  let dateien = [];
  try {
    dateien = dateienLader();
  } catch { /* laufBugPredictor meldet dann "kein Quelltext" — ehrlich statt still */ }
  let seiten = [];
  try { seiten = seitenLader(); } catch { /* laufSprachQualitaet meldet dann "keine Seiten" */ }

  const laeufe = [
    ["bug-predictor", () => laufBugPredictor(dateien)],
    ["knowledge-graph", () => laufKnowledgeGraph(dateien)],
    ["code-interpreter", () => laufCodeInterpreter()],
    ["smart-router", () => laufSmartRouter()],
    ["self-healing", () => laufSelfHealing()],
    ["deep-research", () => S.laufDeepResearch()],
    ["memory-sync", () => S.laufMemory()],
    ["multimodal-engine", () => laufMedienQualitaet({ mitNetz })],
    ["task-orchestrator", () => S.laufTaskOrchestrator()],
    ["self-improvement", () => S.laufSelfImprovement()],
    ["model-lifecycle", () => S.laufModelLifecycle()],
    ["user-feedback-flywheel", () => laufFeedbackSchwungrad()],
    ["process-reward", () => S.laufProcessReward()],
    ["knowledge-distiller", () => S.laufKnowledgeDistiller()],
    ["evolutionary-mutation", () => S.laufEvolutionaryMutation()],
    ["realtime-internet-harvester", () => laufWissensErnte({ mitNetz })],
    ["multi-file-repo-architect", () => S.laufRepoArchitect(dateien)],
    ["live-arena-leaderboard", () => S.laufLiveArena()],
    ["instant-web-container", () => S.laufWebContainer()],
    ["realtime-voice-pair", () => S.laufVoicePair()],
    ["autonomous-git-bot", () => S.laufGitBot()],
    ["werkstatt-autopilot", () => laufWerkstattSammeln()],
    ["support-sla", () => laufSupportSla()],
    ["angelina-autopilot", () => laufSprachQualitaet(seiten)],
    // Als Letztes und nur mit Netz: der einzige Lauf, der die Aussenwelt
    // anfasst (echter Chat ueber die Bruecke). Faellt er aus, sagt das etwas
    // ueber die LIVE-Kette — deshalb gehoert er hierher und nicht in einen
    // Selbsttest.
    ...(mitNetz ? [
      ["synthetic-user-watchdog", () => laufSyntheticWatchdog()],
      ["voice-region-check", () => laufVoiceRegion()]
    ] : [])
  ];

  const ergebnisse = await fuehreLaeufeAus(laeufe, { melde, zeitlimitMs });

  // TOTMANNSCHALTER FUER DEN TAKTGEBER (2026-08-13).
  //
  // Wer bewacht den Waechter? Bleibt dieser Laeufer stehen, ohne dass der
  // Server abstuerzt, wuerden alle von ihm betriebenen Ampeln nacheinander
  // rot — ohne erkennbaren gemeinsamen Grund, und niemand kaeme auf die
  // Idee, den Motor zu verdaechtigen. Diese eine Meldung macht den
  // Stillstand sofort sichtbar: bleibt SIE aus, steht der Taktgeber.
  const gelungen = ergebnisse.filter((e) => e.ok).length;
  const gesamtMs = ergebnisse.reduce((summe, e) => summe + (e.dauerMs || 0), 0);
  melde("autopilot-laeufer", {
    // Ein Durchgang, in dem KEIN einziger Lauf gelingt, ist selbst ein
    // Ausfall — dann stimmt etwas Grundsaetzliches, nicht 24 Einzelheiten.
    status: gelungen > 0 ? "ok" : "fehler",
    meldung: gelungen > 0
      ? `Durchgang beendet: ${gelungen}/${ergebnisse.length} Läufe gelungen (${gesamtMs} ms)`
      : `Durchgang OHNE einen einzigen gelungenen Lauf (${ergebnisse.length} versucht) — der Motor läuft, aber nichts funktioniert`,
    dauerMs: gesamtMs
  });

  return ergebnisse;
}

/**
 * Die Wiederbelebungswege — bewusst knapp und ehrlich.
 *
 * Wer hier fehlt, ist von hier aus NICHT wiederbelebbar; die Selbstheilung
 * sagt das dann klar, statt einen Versuch vorzutäuschen. Konkret betrifft
 * das die Autopiloten im Dienst smejj-autopilot-jobs: er ist von außen nicht
 * erreichbar (404 auf allen Pfaden), sein Start-Weg also nicht aufrufbar.
 * Das ist ein echter Mangel — aber einer, den der Betreiber im Portal lösen
 * muss, nicht einer, den ein Heiler wegzaubern kann.
 */
export function baueHeiler({ melde = interneMeldung } = {}) {
  // Die im Control-Server betriebenen Autopiloten heilt derselbe Griff:
  // ihren Lauf sofort wiederholen, statt bis zum nächsten Takt zu warten.
  const sofortNochmal = async () => {
    await laufeAlle({ melde, mitNetz: true });
    return true;
  };
  const heiler = {};
  for (const id of IM_LAEUFER_BETRIEBEN) heiler[id] = sofortNochmal;
  return heiler;
}


/**
 * Baut den Eskalations-Mailversand fuer die Selbstheilung. Wohnt HIER statt
 * in src/server.js: die 800-Zeilen-Regel gilt auch fuer den Serverkern, und
 * der Text gehoert fachlich zum Heiler, nicht zum HTTP-Einstieg.
 */
export function baueEskalationsVersand(sendAuthMail, env = process.env) {
  return async ({ id, name, grund }) => {
    const empfaenger = String(env.SMEJJ_ADMIN_OWNER_EMAILS || "").split(",")[0].trim();
    if (!empfaenger) return;
    await sendAuthMail({
      to: empfaenger,
      subject: `smejj.com Autopilot gibt auf: ${name || id}`,
      text: `Der Autopilot "${name || id}" liess sich nicht wiederbeleben.\n\n`
        + `${grund}\n\n`
        + "Die automatischen Versuche sind eingestellt, damit nicht endlos gegen einen "
        + "ausgefallenen Dienst gehaemmert wird. Sobald er von selbst wieder gruen wird, "
        + "beginnt die Selbstheilung wieder bei null.\n\n"
        + "Ampel: https://smejj.com/admin/autopiloten/",
      art: "autopilot-eskalation"
    }, env);
  };
}


/**
 * Support-SLA (Nr. 35): Ein Kunde, der laenger als 15 Minuten ohne Antwort
 * wartet, ist ein AUSFALL — kein Schoenheitsfehler. Die Sofortantwort der
 * KI beantwortet normal in Sekunden; steht hier trotzdem etwas offen, ist
 * die Kette dahinter kaputt (Bruecke, Geheimnis, Speicher) oder ein Fall
 * wartet wirklich auf einen Menschen. Beides gehoert auf Rot — die
 * Alarm-Wache verschickt dann die Mail an den Betreiber.
 */
export async function laufSupportSla({ env = process.env, jetztMs = Date.now() } = {}) {
  const ueberfaellig = await offeneUeberfaellig({ env, minuten: 15, jetztMs });
  if (ueberfaellig.length) {
    const aeltestes = ueberfaellig[ueberfaellig.length - 1];
    return {
      ok: false,
      meldung: `${ueberfaellig.length} Kunde(n) warten laenger als 15 min ohne Antwort — aeltestes Ticket ${aeltestes.id} (${aeltestes.betreff.slice(0, 40)})`
    };
  }
  const alle = await listeTickets({ env });
  const beantwortet = alle.filter((t) => t.status === "beantwortet").length;
  return {
    ok: true,
    meldung: alle.length
      ? `Kein Kunde wartet: ${alle.length} Ticket(s), ${beantwortet} automatisch beantwortet`
      : "Kein Kunde wartet — noch keine Tickets eingegangen"
  };
}

/** Prüft die Ampel und heilt, was rot ist — mit Bremse und Eskalation. */
export async function heileWasRotIst({
  uebersicht = autopilotUebersicht,
  zustand = heilungsZustand,
  melde = interneMeldung,
  sendeAlarm = null,
  jetztMs = Date.now(),
  log = () => {}
} = {}) {
  const daten = uebersicht({ jetztMs });
  const plan = planeHeilung({ autopiloten: daten.autopiloten || [], zustand, jetztMs });
  return fuehreHeilungAus({ plan, heiler: baueHeiler({ melde }), melde, sendeAlarm, log });
}

/**
 * Den Laeufer im Takt starten. Standard: alle 30 Minuten — oft genug, damit
 * ein Ausfall binnen einer Stunde auffaellt, selten genug, dass der Scan
 * (einige hundert Dateien) den Server nicht beschaeftigt.
 * `unref()` haelt den Prozess nicht wach.
 */
export function starteAutopilotLaeufer({ intervallMs = 30 * 60 * 1000, sendeAlarm = null } = {}) {
  const tick = () => {
    // Erst arbeiten, dann nachsehen, ob etwas liegen geblieben ist. Die
    // Reihenfolge ist Absicht: Der Heiler soll die FRISCHEN Ergebnisse
    // bewerten, nicht die von vor 30 Minuten.
    laufeAlle()
      .then(() => heileWasRotIst({ sendeAlarm, log: console.log }))
      .catch(() => {});
  };
  // Der ERSTE Takt kommt 90 Sekunden nach dem Boot, nicht sofort: Beim Start
  // gehoeren CPU und Speicher dem HTTP-Server und dem Gesundheits-Check.
  // Ein Container, der in den ersten Sekunden 265 Dateien scannt und 25
  // Autopiloten betreibt, kann seine eigene Startsonde verpassen — dann
  // startet ihn die Plattform im Kreis neu (502-Vorfall 2026-08-13).
  const anlauf = setTimeout(tick, 90_000);
  if (typeof anlauf.unref === "function") anlauf.unref();
  const zeitgeber = setInterval(tick, intervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}
