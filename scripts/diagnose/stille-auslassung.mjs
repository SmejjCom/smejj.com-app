#!/usr/bin/env node
// smejj.com — sucht Pruefungen, die bei fehlender Konfiguration STILL entfallen.
//
// WARUM ES DAS GIBT (Befund 2026-08-22): Der Autopilot "Medien-Qualitaet" nahm
// den Bild-Maler nur in seine Ziele auf, wenn SMEJJ_BILDER_WORKER_URL gesetzt
// war — ohne Ausweg, ohne Meldung. Die Variable fehlte seit dem 14.08., also
// prueft er seither nur den Video-Worker und meldete Medien GRUEN, waehrend
// die Bilderzeugung nie angefasst wurde.
//
// Falsches Gruen ist schlimmer als rot: rot wird untersucht, gruen wird
// geglaubt. Eine fehlende Konfiguration darf darum eine Pruefung nicht
// stillschweigend ausfallen lassen — entweder es gibt einen Standard, oder das
// Fehlen wird gemeldet.
//
// WAS ER SUCHT: eine Bedingung ueber einem Umgebungswert, in deren Naehe ein
// Pruefziel oder eine Messung steht, und in deren Umgebung NICHTS gemeldet
// wird. Das Muster kennt kein Verstaendnis — es zeigt Stellen zum Nachsehen.
//
// GEGENPROBE eingebaut: --selbsttest laesst ihn ueber den alten
// Bild-Maler-Code laufen. Findet er ihn nicht, ist sein Schweigen wertlos und
// der Lauf schlaegt fehl.
//
// Aufruf:  node scripts/diagnose/stille-auslassung.mjs [--selbsttest]
// Exit 0 = nichts gefunden, 2 = Verdacht, 1 = Selbsttest gescheitert.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const WURZELN = ["control-server/src", "src", "scripts"];

// Eine Bedingung ueber einem Umgebungswert: `if (env.X)`, `if (!env.X)`,
// `&& env.X`, `env.X ? ... : ...`.
const BEDINGUNG = /(?:if\s*\(\s*!?\s*|&&\s*|\?\s*)(?:process\.)?env\??[.[]["']?([A-Z][A-Z0-9_]{4,})/;
// Steht in der Naehe ein Pruefziel oder eine Messung?
const PRUEFZIEL = /(ziele\.push|targets\.push|pruef|check|messe|measure|sonde|probe|waechter|health)/i;
// Wird das Ueberspringen irgendwo gemeldet? Dann ist es kein stiller Ausfall.
const MELDUNG = /(meldung|befund|error|warn|ok:\s*false|console\.(log|error|warn)|push\(`)/i;

// Begruendete Ausnahmen. Ohne Begruendung waere es eine stille Absenkung —
// dasselbe Uebel, das dieser Pruefer sucht.
export const AUSNAHMEN = [
  {
    muster: /^CONFIRM_/,
    grund: "Sicherungsabfragen in Deploy-Skripten (CONFIRM_...=JA). Sie ueberspringen "
      + "keine Pruefung, sondern verlangen eine Bestaetigung — und brechen laut ab."
  }
];

function dateien(wurzel) {
  const gefunden = [];
  const lauf = (pfad) => {
    let eintraege;
    try { eintraege = readdirSync(pfad); } catch { return; }
    for (const name of eintraege) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const voll = join(pfad, name);
      if (statSync(voll).isDirectory()) lauf(voll);
      else if (/\.(js|mjs)$/.test(name) && !/\.test\./.test(name)) gefunden.push(voll);
    }
  };
  lauf(wurzel);
  return gefunden;
}

/** Die Suche selbst — auf einem Text, damit sie ohne Dateien pruefbar ist. */
export function verdachtImText(text, datei = "(text)") {
  const zeilen = text.split("\n");
  const treffer = [];
  for (let i = 0; i < zeilen.length; i += 1) {
    const passt = BEDINGUNG.exec(zeilen[i]);
    if (!passt) continue;
    const name = passt[1];
    if (AUSNAHMEN.some((a) => a.muster.test(name))) continue;
    const umfeld = zeilen.slice(Math.max(0, i - 2), i + 6).join("\n");
    if (!PRUEFZIEL.test(umfeld)) continue;
    if (MELDUNG.test(umfeld)) continue;
    treffer.push({ datei, zeile: i + 1, name, text: zeilen[i].trim().slice(0, 120) });
  }
  return treffer;
}

// Der alte Bild-Maler-Code, woertlich. Er ist die kaputte Probe: findet der
// Sucher ihn nicht, taugt er nichts.
export const KAPUTTE_PROBE = `export async function laufMedienQualitaet({ env = process.env } = {}) {
  const ziele = [
    { name: "Video-Worker", url: String(env.SMEJJ_VIDEO_WORKER_URL || "http://smejj-video-worker.zeabur.internal:8080") }
  ];
  if (env.SMEJJ_BILDER_WORKER_URL) {
    ziele.push({ name: "Bild-Maler", url: String(env.SMEJJ_BILDER_WORKER_URL) });
  }
  return ziele;
}`;

// Die gesunde Probe: dieselbe Sache, aber mit Standard statt stillem Entfallen.
export const GESUNDE_PROBE = `export async function laufMedienQualitaet({ env = process.env } = {}) {
  const ziele = [
    { name: "Video-Worker", url: String(env.SMEJJ_VIDEO_WORKER_URL || "http://video.internal:8080") },
    { name: "Bild-Maler", url: String(env.SMEJJ_BILDER_WORKER_URL || "http://maler.internal:8080") }
  ];
  return ziele;
}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--selbsttest")) {
    const kaputt = verdachtImText(KAPUTTE_PROBE, "(kaputte Probe)");
    const gesund = verdachtImText(GESUNDE_PROBE, "(gesunde Probe)");
    console.log(`Selbsttest: kaputte Probe ${kaputt.length} Treffer, gesunde Probe ${gesund.length}.`);
    if (!kaputt.length) {
      console.log("SELBSTTEST GESCHEITERT: der bekannte Fall wird nicht gefunden — Schweigen beweist nichts.");
      process.exit(1);
    }
    if (gesund.length) {
      console.log("SELBSTTEST GESCHEITERT: die gesunde Probe wird beanstandet — der Sucher ist zu scharf.");
      process.exit(1);
    }
    console.log("Selbsttest bestanden: kaputt wird gefunden, gesund bleibt still.");
    process.exit(0);
  }

  const alle = [];
  // Die eigene Datei bleibt draussen: sie traegt die kaputte Probe woertlich im
  // Text, und der Sucher fand darum sich selbst. Genau dieselbe Falle hatte der
  // Bug-Predictor schon einmal — ein Werkzeug, das seine eigene Testprobe
  // meldet, macht aus jedem Lauf einen Fehlalarm und wird bald ignoriert.
  const eigeneDatei = "stille-auslassung.mjs";
  for (const wurzel of WURZELN) {
    for (const datei of dateien(wurzel)) {
      if (datei.endsWith(eigeneDatei)) continue;
      alle.push(...verdachtImText(readFileSync(datei, "utf8"), datei));
    }
  }
  for (const a of AUSNAHMEN) console.log(`Ausnahme ${a.muster}: ${a.grund}`);
  if (!alle.length) {
    console.log("\nKeine Pruefung entfaellt still — jede fehlende Konfiguration hat einen Standard");
    console.log("oder wird gemeldet.");
    process.exit(0);
  }
  console.log(`\nVERDACHT (${alle.length}): hier entfaellt eine Pruefung, ohne dass es jemand erfaehrt.`);
  for (const t of alle) {
    console.log(`  ${t.datei}:${t.zeile}   [${t.name}]`);
    console.log(`      ${t.text}`);
  }
  console.log("\nEntweder einen Standard geben oder das Fehlen ausdruecklich melden.");
  process.exit(2);
}
