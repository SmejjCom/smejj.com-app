#!/usr/bin/env node
// smejj.com — Salad-Container-Gruppen zeigen, und auf ausdrueckliche Ansage
// die Wegwerf-Artefakte entfernen.
//
// WARUM ES DAS GIBT (2026-09-08): Beim Bau der Verbindungs-Landkarte kamen
// 32 Container-Gruppen zum Vorschein, davon 20 seit ueber einem Monat still —
// Reste aus der Zeit vor dem Zeabur-Umzug. Sie kosten NICHTS (gestoppte
// Gruppen sind bei Salad gratis), aber sie verstecken das Einzige, worauf es
// ankommt: die eine Gruppe, die gerade laeuft und Geld kostet.
//
// Aufruf:
//   node scripts/diagnose/salad-gruppen.mjs
//       zeigt alles, aendert nichts
//   node scripts/diagnose/salad-gruppen.mjs --loeschen-wegwerf --ich-bin-sicher
//       loescht die Einmal-Jobs und Testfassungen aus dem Juli
//
// FAIL-CLOSED: Geloescht wird ausschliesslich, was dem Muster unten entspricht
// — ein Einmal-Job mit Hash-Namen oder eine Gruppe, deren Name auf "-staging"
// endet. Kein Praefix-Loeschen, keine Liste von der Kommandozeile, kein
// "alles ausser". Wer hier etwas anderes entfernen will, tut es von Hand in
// der Salad-Oberflaeche und denkt dabei nach.
//
// Der Zugang kommt aus ~/.config/smejj.com/env.local und wird nie ausgegeben.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SICHERUNG = join(WURZEL, "docs/infrastruktur/salad-gruppen-definitionen-2026-09-08.json");

// Einmal-Job: "smejj-job-" plus 32 Hex-Zeichen. Testfassung: endet auf
// "-staging". Nichts sonst.
const EINMAL_JOB = /^smejj-job-[0-9a-f]{32}$/;
const TESTFASSUNG = /-staging$/;

/**
 * Waehlt die entfernbaren Gruppen. Rein und ohne Netz, damit der TUEV sie mit
 * erfundenen Namen pruefen kann — besonders mit den Namen, die NICHT
 * ausgewaehlt werden duerfen.
 */
export function waehleWegwerf(gruppen = []) {
  return gruppen
    .filter((g) => {
      const name = String(g?.name || "");
      if (String(g?.status || "").toLowerCase() === "running") return false;
      return EINMAL_JOB.test(name) || TESTFASSUNG.test(name);
    })
    .map((g) => g.name)
    .sort();
}

function leseZugang() {
  const datei = join(process.env.HOME || "", ".config/smejj.com/env.local");
  const env = {};
  try {
    for (const zeile of readFileSync(datei, "utf8").split("\n")) {
      const treffer = /^([A-Z0-9_]+)=(.*)$/.exec(zeile.trim());
      if (treffer) env[treffer[1]] = treffer[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* kein Zugang — unten sauber gemeldet */ }
  return {
    org: env.SALAD_ORGANIZATION_NAME,
    projekt: env.SALAD_PROJECT_NAME,
    key: env.SALAD_API_KEY
  };
}

async function holeGruppen({ org, projekt, key }) {
  const url = `https://api.salad.com/api/public/organizations/${org}/projects/${projekt}/containers`;
  const antwort = await fetch(url, {
    headers: { "Salad-Api-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  if (!antwort.ok) throw new Error(`Salad antwortet ${antwort.status}`);
  const nutzlast = await antwort.json();
  const jetzt = Date.now();
  return (nutzlast.items || []).map((g) => {
    const letzte = Date.parse(g.update_time || g.create_time || "");
    return {
      name: g.name,
      status: g.current_state?.status || "?",
      start: g.current_state?.start_time,
      neustart: g.restart_policy,
      ruhtTage: Number.isFinite(letzte) ? Math.floor((jetzt - letzte) / 86400000) : null
    };
  });
}

async function loescheGruppe({ org, projekt, key }, name) {
  const url = `https://api.salad.com/api/public/organizations/${org}/projects/${projekt}/containers/${name}`;
  const antwort = await fetch(url, {
    method: "DELETE",
    headers: { "Salad-Api-Key": key },
    signal: AbortSignal.timeout(30000)
  });
  if (!antwort.ok && antwort.status !== 404) {
    throw new Error(`${antwort.status} ${(await antwort.text()).slice(0, 120)}`);
  }
  return antwort.status;
}

export async function main() {
  const zugang = leseZugang();
  if (!zugang.org || !zugang.projekt || !zugang.key) {
    console.log("Kein Salad-Zugang in ~/.config/smejj.com/env.local — nichts geprueft.");
    return 1;
  }

  const gruppen = await holeGruppen(zugang);
  const laufend = gruppen.filter((g) => String(g.status).toLowerCase() === "running");

  console.log(`${gruppen.length} Container-Gruppen, ${laufend.length} laufend.\n`);
  const breite = Math.max(...gruppen.map((g) => g.name.length));
  for (const g of [...gruppen].sort((a, b) => (b.ruhtTage ?? 0) - (a.ruhtTage ?? 0))) {
    const ruht = g.ruhtTage === null ? "?" : `ruht ${g.ruhtTage} Tage`;
    console.log(`  ${g.name.padEnd(breite)}  ${String(g.status).padEnd(8)}  ${ruht}`);
  }

  const wegwerf = waehleWegwerf(gruppen);
  console.log(`\nEntfernbar (Einmal-Jobs und Testfassungen): ${wegwerf.length}`);

  const loeschen = process.argv.includes("--loeschen-wegwerf");
  const sicher = process.argv.includes("--ich-bin-sicher");

  if (!loeschen) {
    if (wegwerf.length) {
      console.log("Zum Entfernen: --loeschen-wegwerf --ich-bin-sicher");
      console.log("Es kostet nichts, sie zu behalten — der Gewinn ist allein Uebersicht.");
    }
    return 0;
  }
  if (!sicher) {
    console.log("ABBRUCH: --loeschen-wegwerf ohne --ich-bin-sicher. Beide Schalter sind noetig.");
    return 1;
  }
  // Ohne gesicherte Definitionen wird nichts entfernt: eine geloeschte Gruppe
  // ist sonst unwiederbringlich.
  if (!existsSync(SICHERUNG)) {
    console.log(`ABBRUCH: Sicherung fehlt (${SICHERUNG}). Erst sichern, dann loeschen.`);
    return 1;
  }

  let weg = 0;
  for (const name of wegwerf) {
    try {
      const status = await loescheGruppe(zugang, name);
      console.log(`  entfernt: ${name} (HTTP ${status})`);
      weg += 1;
    } catch (fehler) {
      console.log(`  FEHLER bei ${name}: ${fehler.message}`);
    }
  }
  console.log(`\n${weg} von ${wegwerf.length} entfernt.`);
  return weg === wegwerf.length ? 0 : 1;
}

// pathToFileURL statt `file://${argv[1]}`: der Projektordner enthaelt
// Leerzeichen — der naive Vergleich waere hier immer falsch.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; });
}
