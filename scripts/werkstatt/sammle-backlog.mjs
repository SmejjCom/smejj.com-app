#!/usr/bin/env node
// smejj.com — Werkstatt-Autopilot (Nr. 30), STATION 1: Sammeln.
//
// Erzeugt aus ECHTEN, gemessenen Quellen eine priorisierte Aufgabenliste und
// schreibt sie als Git-gepruefte Datei ins Repo (docs/werkstatt/BACKLOG.md).
// Kein unsichtbarer Zustand — genau so verlangt es die Spezifikation
// (docs/architecture/AUTOPILOT_30_WERKSTATT_SPEZIFIKATION.md).
//
// ABWEICHUNG VON DER SPEZIFIKATION, bewusst und begruendet (2026-08-12):
// Die Spezifikation nennt als Quellen den Konkurrenz-Radar und den
// E2E-Watchdog. Beide sind heute Attrappen: der Radar sendet nur ein
// Lebenszeichen ohne Quellenscan, der Watchdog ist gar nicht angebunden
// (messung "geplant"). Ein Sammler, der aus leeren Quellen ein leeres
// Backlog erzeugt und "keine Funde" meldet, waere die naechste Attrappe —
// dieselbe Klasse Fehler wie die gestempelte Ampel (siehe
// docs/approvals/2026-08-12-ampel-ehrlich-messen.md). Deshalb sammelt
// Station 1 aus den vier Quellen, die HEUTE wirklich messen. Sobald Radar
// und Watchdog echt laufen, kommen sie als weitere Quellen dazu.
//
// DIE WICHTIGSTE REGEL: EINE STUMME QUELLE IST KEIN LEERES BACKLOG.
// Faellt eine Quelle aus, steht das im Bericht — sonst sieht "nichts zu tun"
// genauso aus wie "ich konnte nicht nachsehen".
//
// Aufruf:
//   SMEJJ_EVAL_SESSION_TOKEN=$(node scripts/verlauf/mint-eval-token.mjs) \
//     node scripts/werkstatt/sammle-backlog.mjs [--mit-tests]
//
// --mit-tests laesst zusaetzlich die Pruefsuite laufen (rund 40 s) und nimmt
// jede rote Testdatei als Aufgabe auf.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ZIEL_MD = "docs/werkstatt/BACKLOG.md";
const ZIEL_JSON = "docs/werkstatt/backlog.json";
const CONTROL_URL = process.env.SMEJJ_CONTROL_URL || "https://smejj-control.zeabur.app";

// Die Sammel-Logik lebt jetzt im Control-Server, damit der Autopilot-Laeufer
// sie ebenfalls aufrufen kann (scripts/ ist nicht im Docker-Abbild).
// Hier bleibt nur, was ein CLI ausmacht: Daten holen und Datei schreiben.
import { STUFEN, baueBacklog, alsMarkdown } from "../../control-server/src/autopilots/werkstattBacklog.js";
export { STUFEN, baueBacklog, alsMarkdown };

async function holeAmpel() {
  const token = String(process.env.SMEJJ_EVAL_SESSION_TOKEN || "").trim();
  if (!token) return { ok: false, grund: "SMEJJ_EVAL_SESSION_TOKEN fehlt — ohne Nachweis keine Abfrage" };
  try {
    const antwort = await fetch(`${CONTROL_URL}/api/admin/ops/autopiloten`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000)
    });
    if (!antwort.ok) return { ok: false, grund: `HTTP ${antwort.status}` };
    const daten = await antwort.json();
    return { ok: true, autopiloten: daten.autopiloten || [], vorfaelle: daten.vorfaelle || [] };
  } catch (fehler) {
    return { ok: false, grund: String(fehler?.name || fehler) };
  }
}

async function holeMails() {
  const token = String(process.env.SMEJJ_EVAL_SESSION_TOKEN || "").trim();
  if (!token) return { ok: false, grund: "SMEJJ_EVAL_SESSION_TOKEN fehlt" };
  try {
    const antwort = await fetch(`${CONTROL_URL}/api/admin/ops/email`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000)
    });
    if (!antwort.ok) return { ok: false, grund: `HTTP ${antwort.status}` };
    const daten = await antwort.json();
    const p = daten.versandprotokoll || {};
    return { ok: true, gescheitert: Number(p.gescheitert || 0), zeitraumTage: p.zeitraumTage };
  } catch (fehler) {
    return { ok: false, grund: String(fehler?.name || fehler) };
  }
}

/** Prueflauf ueber die Suite; liefert die Dateinamen, die gefallen sind. */
function holeTests() {
  return new Promise((fertig) => {
    const kind = spawn("npm", ["run", "test:tests", "--silent"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
    let ausgabe = "";
    kind.stdout.on("data", (s) => { ausgabe += s.toString(); });
    kind.stderr.on("data", (s) => { ausgabe += s.toString(); });
    kind.once("error", (fehler) => fertig({ ok: false, grund: `Suite nicht startbar (${fehler.message})` }));
    kind.once("exit", () => {
      // Node meldet gefallene Dateien als "✖ <pfad>" im Schlussblock.
      const rote = [...new Set(
        (ausgabe.match(/^✖\s+(tests\/\S+\.test\.mjs)/gm) || [])
          .map((z) => z.replace(/^✖\s+/, "").trim())
      )];
      fertig({ ok: true, rote });
    });
  });
}

async function main() {
  const mitTests = process.argv.includes("--mit-tests");
  const [ampel, mails] = await Promise.all([holeAmpel(), holeMails()]);
  const tests = mitTests ? await holeTests() : { ok: false, grund: "nicht angefordert (--mit-tests setzen)" };
  const jetzt = new Date().toISOString();
  const backlog = baueBacklog({ ampel, tests, mails });

  mkdirSync(path.join(REPO, "docs/werkstatt"), { recursive: true });
  writeFileSync(path.join(REPO, ZIEL_MD), alsMarkdown(backlog, jetzt) + "\n", "utf8");
  writeFileSync(path.join(REPO, ZIEL_JSON), JSON.stringify({ gesammeltAm: jetzt, ...backlog }, null, 2) + "\n", "utf8");

  console.log(`[werkstatt] ${backlog.aufgaben.length} Aufgaben aus ${backlog.gesammeltAus.length} Quellen -> ${ZIEL_MD}`);
  for (const s of backlog.stummeQuellen) console.log(`[werkstatt] STUMM: ${s.quelle} (${s.grund})`);
  // Stumme Quellen sind ein Mangel des Laufs, kein Erfolg: Exit 1, damit ein
  // Zeitplan-Lauf nicht faelschlich als sauber durchgeht.
  process.exit(backlog.stummeQuellen.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
