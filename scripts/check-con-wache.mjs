#!/usr/bin/env node
// con-Autopilot — Wache (Single Responsibility: lebt der Kreislauf noch?).
//
// Ein Dienst, der nie startet, sieht von aussen genauso aus wie einer, der nichts zu tun
// hat — und ein Dienst, den es gar nicht gibt, ebenso. Am 04.09. stand der con-Autopilot
// zehn Stunden still, ohne dass irgendetwas Alarm schlug. Diese Wache prueft beides:
//
//   1. Antwortet der Dienst? (oeffentliches /health, ohne Zugangsdaten)
//   2. Ist der Herzschlag in e2 frisch? (con/autopilot/zustand.json, Feld letzterTick)
//
// Punkt 2 ist der wichtigere: /health kann gruen sein, waehrend der Takt steht.
// Ohne e2-Zugang prueft die Wache nur Punkt 1 und sagt das ausdruecklich — sie
// taeuscht kein vollstaendiges Gruen vor.
//
// Exit 0 = gruen, 1 = rot. Fuer Zeitplaene, Autopiloten und die Hand.
import { readFile } from "node:fs/promises";
import { gesamturteil, herzschlagUrteil, waehleDeckel } from "../workers/con-autopilot/wache.js";
import os from "node:os";
import path from "node:path";

const ADRESSE = process.env.CON_DIENST_URL || "https://smejj-con-autopilot.zeabur.app";
const MAX_ALTER_MIN = Number(process.env.CON_WACHE_MAX_MINUTEN) > 0 ? Number(process.env.CON_WACHE_MAX_MINUTEN) : 20;

async function envLocal() {
  try {
    for (const z of (await readFile(path.join(os.homedir(), ".config/smejj.com/env.local"), "utf8")).split("\n")) {
      const m = z.match(/^(?:export\s+)?([A-Z0-9_]+)=["']?([^"'\n]*)["']?$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* ohne Datei: nur Umgebung */ }
}

const befunde = [];
function melde(ok, text) { befunde.push({ ok, text }); console.log(`${ok ? "gruen " : "ROT   "} ${text}`); }

await envLocal();

// 1. Dienst erreichbar?
let gesundheit = null;
try {
  const r = await fetch(`${ADRESSE}/health`, { signal: AbortSignal.timeout(20_000) });
  gesundheit = r.ok ? await r.json() : null;
  if (!r.ok) melde(false, `Dienst antwortet mit HTTP ${r.status} (${ADRESSE})`);
} catch (fehler) {
  melde(false, `Dienst nicht erreichbar: ${String(fehler?.message || fehler).slice(0, 80)}`);
}
if (gesundheit) {
  melde(Boolean(gesundheit.ok), `Dienst antwortet (${ADRESSE})`);
  melde(gesundheit.aktiviert === true, `Autopilot eingeschaltet: ${gesundheit.aktiviert}`);
  melde(gesundheit.e2 === true, `Lager e2 verbunden: ${gesundheit.e2}`);
  melde(gesundheit.salad === true, `Rechenanbieter verbunden: ${gesundheit.salad}`);
}

// 2. Herzschlag in e2 — der eigentliche Beweis, dass der Takt laeuft.
try {
  const { leseKonfig } = await import("../workers/con-autopilot/config.js");
  const { e2Client } = await import("../workers/con-autopilot/e2.js");
  const konfig = leseKonfig(process.env);
  if (!konfig.e2.ok) {
    melde(false, `Herzschlag nicht pruefbar — e2-Zugang fehlt (${konfig.e2.fehlend.join(", ")})`);
  } else {
    const e2 = e2Client(konfig.e2, { timeoutMs: 60_000 });
    const zustand = await e2.getJson("con/autopilot/zustand.json", null);
    if (!zustand?.letzterTick) {
      melde(false, "Herzschlag fehlt — con/autopilot/zustand.json hat kein letzterTick");
    } else {
      const u = herzschlagUrteil(zustand, { maxAlterMin: MAX_ALTER_MIN });
      melde(u.ok, `Herzschlag ${u.alterMin.toFixed(0)} min alt (erlaubt ${MAX_ALTER_MIN}), Phase ${zustand.phase}, Takt ${zustand.ticks}`);
      if (zustand.letzterFehler) melde(false, `letzter Takt-Fehler: ${String(zustand.letzterFehler.text).slice(0, 100)}`);
      if (zustand.startBlockiert) melde(false, `Start blockiert: ${(zustand.startBlockiert.gruende || []).join("; ").slice(0, 120)}`);
      // Die Notbremse ist kein stiller Zustand: sie MUSS in der Wache rot leuchten,
      // sonst steht der Kreislauf und niemand erfaehrt es.
      if (zustand.phase === "gestoppt") melde(false, `ANGEHALTEN: ${zustand.plan?.grund || "ohne Grund"}`);
      if (zustand.fehlschlaege?.anzahl >= 2) melde(false, `${zustand.fehlschlaege.anzahl} gleiche Fehlschlaege: ${String(zustand.fehlschlaege.art).slice(0, 90)}`);
    }
    const kosten = await e2.getJson("con/logs/kosten/gesamt.json", { summeUsd: 0 });
    // Der Deckel des DIENSTES gilt, nicht der Standardwert dieser Wache. Der Autopilot
    // schreibt ihn seit dem 04.09. in den Zustand; solange ein alter Stand laeuft, wird
    // die Herkunft ausdruecklich genannt statt stillschweigend geraten.
    const { deckel, herkunft } = waehleDeckel(zustand, konfig.grenzen.gesamtdeckelUsd);
    melde((kosten.summeUsd || 0) <= deckel, `Kosten ${(kosten.summeUsd || 0).toFixed(3)} von ${deckel} USD (Deckel laut ${herkunft})`);
  }
} catch (fehler) {
  melde(false, `Herzschlag-Pruefung gescheitert: ${String(fehler?.message || fehler).slice(0, 120)}`);
}

const urteil = gesamturteil(befunde);
console.log(`\n${urteil.ok ? `gruen: alle ${urteil.gesamt} Punkte` : `ROT: ${urteil.rot} von ${urteil.gesamt} Punkten`}`);
process.exit(urteil.ok ? 0 : 1);
