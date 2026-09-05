#!/usr/bin/env node
// smejj.com — Landkarte aller Zugangsschluessel: welcher Schluessel wird WO benutzt?
//
// Betreiber-Auftrag 2026-09-05: "Ich moechte im Admin-Bereich einfach sehen
// koennen: Wie viele Stellen verwenden API X?"
//
// WAS SIE TUT: Sie liest den Quelltext und zaehlt jede Stelle, an der ein
// Schluessel aus der Umgebung gelesen wird. Danach sagt sie je Schluessel:
// wie viele Stellen, in welchen Bereichen, und ob er in der Umgebung
// ueberhaupt gesetzt ist.
//
// WAS SIE NIE TUT: einen WERT ausgeben. Nur Namen, Zahlen und "gesetzt"/
// "fehlt". Ein Diagnosewerkzeug, das Geheimnisse ins Protokoll schreibt, ist
// selbst das Leck, das es finden soll.
//
// WARUM STATISCH: Ein Aufruf zur Laufzeit misst nur, was gerade laeuft. Der
// Quelltext zeigt ALLE Stellen — auch die, die selten dran sind. Genau die
// fallen sonst niemandem auf.
//
// Aufruf:  node scripts/diagnose/schluessel-landkarte.mjs [--json]
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORDNER = ["src", "control-server/src", "workers", "scripts", "public"];
const AUSNAHMEN = new Set(["node_modules", ".git", "vendor", "out", "dist", "coverage"]);
const ENDUNGEN = new Set([".js", ".mjs", ".cjs"]);

/** Wonach die Landkarte sucht: Namen, die nach Zugang klingen. */
export const SCHLUESSEL_MUSTER = /\b([A-Z][A-Z0-9_]{3,})\b/g;
export const IST_ZUGANG = /(_API_KEY|_SECRET|_TOKEN|_ACCESS_KEY|_SECRET_KEY|_PASSWORD|_KEY_B64|_SIGNING_KEY)/;

/** Bereich aus dem Dateipfad — das ist die Spalte, die der Betreiber lesen will. */
export function bereichFuer(pfad) {
  const p = pfad.replace(/\\/g, "/");
  if (p.includes("/autopilots/")) return "Autopilot";
  if (p.includes("/llm/") || p.includes("modelRouter") || p.includes("modelRegistry")) return "Model Router";
  if (p.startsWith("workers/")) return "Worker";
  if (p.includes("/routes/")) return "API-Route";
  if (p.includes("/billing/") || p.includes("publicapi")) return "Abrechnung";
  if (p.includes("/auth/") || p.includes("passkey") || p.includes("session")) return "Anmeldung";
  if (p.includes("/storage/") || p.includes("idrive") || p.includes("s3")) return "Speicher";
  if (p.includes("/training/") || p.includes("/evaluation/")) return "Training";
  if (p.includes("/rag/") || p.includes("/search/")) return "Suche";
  if (p.startsWith("scripts/")) return "Werkzeug";
  if (p.startsWith("public/")) return "Bruecke";
  return "Sonstiges";
}

function* dateien(start) {
  let eintraege;
  try { eintraege = readdirSync(start); } catch { return; }
  for (const name of eintraege) {
    if (AUSNAHMEN.has(name)) continue;
    const voll = path.join(start, name);
    let s;
    try { s = statSync(voll); } catch { continue; }
    if (s.isDirectory()) yield* dateien(voll);
    else if (ENDUNGEN.has(path.extname(name))) yield voll;
  }
}

/**
 * Baut die Landkarte. Rein bis auf das Lesen — testbar ueber `texte`.
 * @param {Array<{pfad: string, text: string}>} quellen
 * @param {object} env nur fuer "gesetzt"/"fehlt", Werte werden NIE gelesen
 */
export function baueLandkarte(quellen, env = {}) {
  const karte = new Map();
  for (const { pfad, text } of quellen) {
    const bereich = bereichFuer(pfad);
    // Nur Zeilen, die wirklich aus der Umgebung lesen — eine blosse Erwaehnung
    // im Kommentar ist keine Verwendung.
    for (const zeile of text.split("\n")) {
      if (/^\s*(\/\/|\*|#)/.test(zeile)) continue;
      // ZWEI ARTEN VON FUNDSTELLE, und die zweite hat diese Landkarte beim
      // ersten Lauf uebersehen:
      //   1. direkt gelesen:  env.SMEJJ_X_API_KEY
      //   2. als Name genannt: { envKey: "SMEJJ_X_API_KEY" }
      // Die zweite ist genauso eine Verwendung. Beim ersten Lauf meldete die
      // Landkarte SMEJJ_SEARCH_TAVILY_API_KEY als "gesetzt, aber nirgends
      // benutzt" — er steht in src/search/searchKeyProvider.js als envKey und
      // wird sehr wohl benutzt. Eine Pruefung, die den Fall nicht sehen kann,
      // den sie pruefen soll, ist schlimmer als keine: sie haette den Betreiber
      // dazu gebracht, einen funktionierenden Schluessel zu loeschen.
      const direkt = /(process\.)?env[.[]/.test(zeile);
      const genannt = /(envKey|envName|schluesselName|keyEnv)\s*:/.test(zeile);
      if (!direkt && !genannt) continue;
      for (const treffer of zeile.matchAll(SCHLUESSEL_MUSTER)) {
        const name = treffer[1];
        if (!IST_ZUGANG.test(name)) continue;
        if (!karte.has(name)) karte.set(name, { name, stellen: 0, bereiche: new Map(), dateien: new Set() });
        const eintrag = karte.get(name);
        eintrag.stellen += 1;
        if (genannt && !direkt) eintrag.nurGenannt = (eintrag.nurGenannt || 0) + 1;
        eintrag.bereiche.set(bereich, (eintrag.bereiche.get(bereich) || 0) + 1);
        eintrag.dateien.add(pfad);
      }
    }
  }
  return [...karte.values()]
    .map((e) => ({
      name: e.name,
      stellen: e.stellen,
      nurGenannt: e.nurGenannt || 0,
      dateien: e.dateien.size,
      bereiche: [...e.bereiche.entries()].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} (${n})`),
      gesetzt: Boolean(String(env[e.name] || "").trim())
    }))
    .sort((a, b) => b.stellen - a.stellen);
}

/** Was auffallen soll: benutzt aber nicht gesetzt, oder gesetzt aber nirgends benutzt. */
export function findeLuecken(landkarte, env = {}) {
  const benutzt = new Set(landkarte.map((e) => e.name));
  const fehlend = landkarte.filter((e) => !e.gesetzt).map((e) => e.name);
  const verwaist = Object.keys(env)
    .filter((n) => IST_ZUGANG.test(n) && !benutzt.has(n) && String(env[n] || "").trim())
    .sort();
  return { fehlend, verwaist };
}

function main() {
  const quellen = [];
  for (const ordner of ORDNER) {
    for (const datei of dateien(path.join(WURZEL, ordner))) {
      try { quellen.push({ pfad: path.relative(WURZEL, datei), text: readFileSync(datei, "utf8") }); } catch { /* unlesbar: überspringen */ }
    }
  }
  const landkarte = baueLandkarte(quellen, process.env);
  const luecken = findeLuecken(landkarte, process.env);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ landkarte, luecken, dateienGelesen: quellen.length }, null, 2));
    return;
  }
  console.log(`Zugangsschluessel im Quelltext — ${quellen.length} Dateien gelesen\n`);
  console.log("Die Spalte 'Hier' sagt NUR, ob der Wert auf DIESEM Rechner steht.");
  console.log("Die Dienste holen ihre Werte aus dem Zeabur-Portal — 'NEIN' heisst");
  console.log("also nicht 'fehlt im Betrieb', sondern 'liegt nicht auf diesem Mac'.\n");
  console.log("Stellen  Dateien   Hier    Name");
  console.log("-------  -------  -------  ----------------------------------");
  for (const e of landkarte) {
    console.log(`${String(e.stellen).padStart(7)}  ${String(e.dateien).padStart(7)}  ${(e.gesetzt ? "ja" : "NEIN").padStart(7)}  ${e.name}`);
    console.log(`${" ".repeat(25)}${e.bereiche.join(", ")}`);
  }
  console.log(`\n${landkarte.length} Schluessel im Code.`);
  if (luecken.fehlend.length) {
    console.log(`\nIm Code benutzt, auf diesem Rechner nicht gesetzt (${luecken.fehlend.length}).`);
    console.log("Das ist der Normalfall — Betriebsschluessel gehoeren ins Zeabur-Portal, nicht auf den Mac.");
    console.log("Welche im BETRIEB fehlen, misst die Umgebungs-Wache (Autopilot Nr. 71) live.");
  }
  if (luecken.verwaist.length) {
    console.log(`\nHier gesetzt, aber im Code nirgends benutzt (${luecken.verwaist.length}): ${luecken.verwaist.join(", ")}`);
    console.log("Solche Werte sind Kandidaten zum Aufraeumen — aber ERST nachsehen, wofuer sie da waren.");
  }
  console.log("\nHinweis: WERTE werden nie gelesen oder ausgegeben — nur Namen und Zahlen.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
