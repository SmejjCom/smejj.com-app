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

// Dringlichkeit: 1 = Nutzer merkt es jetzt, 5 = geplanter Ausbau.
export const STUFEN = Object.freeze({
  AUSFALL: 1,      // gemessener roter Vorfall — etwas ist kaputt
  REGRESSION: 2,   // roter Test — Code weicht von seiner Zusage ab
  VERSPAETUNG: 3,  // gelber Vorfall — laeuft, aber nicht puenktlich
  ZUSTELLUNG: 4,   // Mails erreichen den Empfaenger nicht
  AUSBAU: 5        // grauer Autopilot — dokumentierte offene Aufgabe
});

/**
 * Baut die priorisierte Aufgabenliste. REINE Funktion: kein Netz, keine
 * Dateien — damit sie ohne laufende Dienste pruefbar ist (Hausregel aus dem
 * Maus-Engine-Umbau: Engine-Logik immer ohne Umgebung testbar bauen).
 *
 * @param {object} quellen
 * @param {{ok: boolean, autopiloten?: Array, vorfaelle?: Array, grund?: string}} quellen.ampel
 * @param {{ok: boolean, rote?: Array<string>, grund?: string}} [quellen.tests]
 * @param {{ok: boolean, gescheitert?: number, zeitraumTage?: number, grund?: string}} [quellen.mails]
 * @returns {{aufgaben: Array, stummeQuellen: Array, gesammeltAus: Array}}
 */
export function baueBacklog({ ampel, tests, mails } = {}) {
  const aufgaben = [];
  const stummeQuellen = [];
  const gesammeltAus = [];

  if (ampel?.ok) {
    gesammeltAus.push("Autopiloten-Ampel");
    const offene = (ampel.vorfaelle || []).filter((v) => v && v.bis === null);
    for (const v of offene) {
      aufgaben.push({
        stufe: v.art === "rot" ? STUFEN.AUSFALL : STUFEN.VERSPAETUNG,
        quelle: "Ampel-Vorfall",
        betrifft: v.id,
        titel: `${v.art === "rot" ? "Ausfall" : "Verspaetung"}: ${v.name || v.id}`,
        befund: String(v.grund || "").slice(0, 200),
        seit: v.von || null
      });
    }
    for (const a of ampel.autopiloten || []) {
      if (a.ampel !== "grau") continue;
      aufgaben.push({
        stufe: STUFEN.AUSBAU,
        quelle: "Ampel-grau",
        betrifft: a.id,
        titel: `Messung anschliessen: ${a.name || a.id}`,
        befund: String(a.ampelGrund || "").slice(0, 200),
        seit: null
      });
    }
  } else {
    stummeQuellen.push({ quelle: "Autopiloten-Ampel", grund: ampel?.grund || "nicht abgefragt" });
  }

  if (tests?.ok) {
    gesammeltAus.push("Pruefsuite");
    for (const datei of tests.rote || []) {
      aufgaben.push({
        stufe: STUFEN.REGRESSION,
        quelle: "Pruefsuite",
        betrifft: datei,
        titel: `Roter Test: ${datei}`,
        befund: "Die Datei faellt in der Pruefsuite. Ursache klaeren und beheben — nicht den Test anpassen, bis der Befund verstanden ist.",
        seit: null
      });
    }
  } else if (tests) {
    stummeQuellen.push({ quelle: "Pruefsuite", grund: tests.grund || "nicht ausgefuehrt" });
  }

  if (mails?.ok) {
    gesammeltAus.push("Mail-Zustellprotokoll");
    if (Number(mails.gescheitert) > 0) {
      aufgaben.push({
        stufe: STUFEN.ZUSTELLUNG,
        quelle: "Mail-Protokoll",
        betrifft: "email-zustellung",
        titel: `${mails.gescheitert} Mails haben den Server nicht verlassen`,
        befund: `Gemessen ueber ${mails.zeitraumTage || "?"} Tage. Gruende stehen im Versandprotokoll (Adminbereich, Ansicht V).`,
        seit: null
      });
    }
  } else if (mails) {
    stummeQuellen.push({ quelle: "Mail-Zustellprotokoll", grund: mails.grund || "nicht abgefragt" });
  }

  aufgaben.sort((a, b) => a.stufe - b.stufe || String(a.betrifft).localeCompare(String(b.betrifft)));
  return { aufgaben, stummeQuellen, gesammeltAus };
}

/** Der Bericht als Markdown — fuer Menschen lesbar, in Git nachvollziehbar. */
export function alsMarkdown({ aufgaben, stummeQuellen, gesammeltAus }, jetzt) {
  const zeilen = [];
  zeilen.push("# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)");
  zeilen.push("");
  zeilen.push(`Gesammelt am ${jetzt} aus ECHTEN Messungen — nicht aus Vermutungen.`);
  zeilen.push("Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.");
  zeilen.push("");
  zeilen.push(`**Quellen, die geantwortet haben:** ${gesammeltAus.length ? gesammeltAus.join(", ") : "keine"}`);
  if (stummeQuellen.length) {
    zeilen.push("");
    zeilen.push("**STUMME QUELLEN — hier wurde NICHT nachgesehen:**");
    for (const s of stummeQuellen) zeilen.push(`- ${s.quelle}: ${s.grund}`);
    zeilen.push("");
    zeilen.push("> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.");
  }
  zeilen.push("");
  zeilen.push(`## ${aufgaben.length} Aufgaben, nach Dringlichkeit`);
  zeilen.push("");
  if (!aufgaben.length) {
    zeilen.push("Keine Aufgaben gefunden. Das gilt nur fuer die oben genannten Quellen.");
  }
  const namen = { 1: "1 — Ausfall", 2: "2 — Regression", 3: "3 — Verspaetung", 4: "4 — Zustellung", 5: "5 — Ausbau" };
  let letzteStufe = null;
  for (const a of aufgaben) {
    if (a.stufe !== letzteStufe) {
      zeilen.push("");
      zeilen.push(`### Stufe ${namen[a.stufe] || a.stufe}`);
      zeilen.push("");
      letzteStufe = a.stufe;
    }
    zeilen.push(`- **${a.titel}**`);
    zeilen.push(`  - Betrifft: \`${a.betrifft}\` · Quelle: ${a.quelle}${a.seit ? ` · offen seit ${a.seit}` : ""}`);
    if (a.befund) zeilen.push(`  - Befund: ${a.befund}`);
  }
  zeilen.push("");
  return zeilen.join("\n");
}

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
