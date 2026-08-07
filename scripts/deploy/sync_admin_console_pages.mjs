#!/usr/bin/env node
// smejj.com — Konsolen-Dateien in den Frontend-Klon spiegeln (fuer smejj.com/admin).
//
// Warum es diesen Schritt gibt: Die Operations Console liegt als Quelle in
// `control-server/admin-ui/`. Ausgeliefert wird sie seit 2026-08-07 STATISCH
// von smejj.com/admin (GitHub Pages) — so verlangt es die Architekturregel
// "Alles, was statisch ausgeliefert werden kann, wird statisch ausgeliefert".
// Der Control-Server liefert dieselben Dateien weiter aus (Rueckfallweg).
//
// Zwei Orte, EINE Quelle: dieses Skript kopiert, es erfindet nichts. Wer eine
// Datei nur im Frontend-Repo aendert, faellt beim Vergleich unten auf.
//
// Aufruf:
//   node scripts/deploy/sync_admin_console_pages.mjs <pfad-zum-frontend-klon>
//   node scripts/deploy/sync_admin_console_pages.mjs <pfad> --pruefen
//
// `--pruefen` aendert nichts und endet mit Code 1, sobald etwas abweicht.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUELLE = path.resolve(fileURLToPath(new URL("../../control-server/admin-ui/", import.meta.url)));

// Jede Konsolen-Seite bekommt auf GitHub Pages einen eigenen Ordner mit einer
// Kopie von index.html — so sind die Adressen ECHTE Pfade (smejj.com/admin/jobs/)
// statt #-Routen. Die Liste entspricht den Registrierungen in console.js und
// den console-stage*.js; wer dort eine Seite ergaenzt, ergaenzt sie HIER —
// sonst antwortet Pages auf die neue Adresse mit 404 und der Fehler faellt
// erst beim Klicken auf. „uebersicht" fehlt bewusst: sie ist /admin/ selbst.
const SEITEN_ORDNER = Object.freeze([
  "nutzer", "rollen", "support", "freigaben", "audit", "compliance",
  "moderation", "dsgvo", "ankuendigungen", "flags",
  "modelle", "jobs", "worker", "deploy", "speicher",
  "schluessel", "ereignisse", "adminverwaltung",
  "abrechnung", "kosten",
  "wissen", "sprachen", "experimente", "email", "analytik", "aufgaben",
  "autopiloten"
]);

function sha256(inhalt) {
  return createHash("sha256").update(inhalt).digest("hex");
}

export function konsolenDateien(quelle = QUELLE) {
  return readdirSync(quelle).filter((name) => !name.startsWith(".")).sort();
}

export function spiegeln(zielWurzel, { pruefen = false, quelle = QUELLE } = {}) {
  const ziel = path.join(zielWurzel, "admin");
  if (!existsSync(zielWurzel)) throw new Error(`Frontend-Klon nicht gefunden: ${zielWurzel}`);
  if (!pruefen) mkdirSync(ziel, { recursive: true });

  const abweichungen = [];
  const geschrieben = [];
  for (const name of konsolenDateien(quelle)) {
    const inhalt = readFileSync(path.join(quelle, name));
    const zielPfad = path.join(ziel, name);
    const vorhanden = existsSync(zielPfad) ? readFileSync(zielPfad) : null;
    if (vorhanden && sha256(vorhanden) === sha256(inhalt)) continue;
    abweichungen.push(name + (vorhanden ? " (veraendert)" : " (fehlt)"));
    if (!pruefen) {
      writeFileSync(zielPfad, inhalt);
      geschrieben.push(name);
    }
  }
  // Seiten-Ordner: jeweils eine Kopie von index.html (alle Verweise darin sind
  // absolut /admin/..., deshalb funktioniert dieselbe Datei in jeder Tiefe).
  const indexInhalt = readFileSync(path.join(quelle, "index.html"));
  for (const seite of SEITEN_ORDNER) {
    const ordnerPfad = path.join(ziel, seite, "index.html");
    const vorhanden = existsSync(ordnerPfad) ? readFileSync(ordnerPfad) : null;
    if (vorhanden && sha256(vorhanden) === sha256(indexInhalt)) continue;
    abweichungen.push(seite + "/index.html" + (vorhanden ? " (veraendert)" : " (fehlt)"));
    if (!pruefen) {
      mkdirSync(path.join(ziel, seite), { recursive: true });
      writeFileSync(ordnerPfad, indexInhalt);
      geschrieben.push(seite + "/index.html");
    }
  }
  return { dateien: konsolenDateien(quelle).length + SEITEN_ORDNER.length, abweichungen, geschrieben };
}

function main() {
  const zielWurzel = process.argv[2];
  const pruefen = process.argv.includes("--pruefen");
  if (!zielWurzel) {
    console.error("Aufruf: node scripts/deploy/sync_admin_console_pages.mjs <frontend-klon> [--pruefen]");
    process.exit(1);
  }
  const ergebnis = spiegeln(path.resolve(zielWurzel), { pruefen });
  console.log(JSON.stringify({ modus: pruefen ? "pruefen" : "spiegeln", ...ergebnis }, null, 2));
  if (pruefen && ergebnis.abweichungen.length > 0) {
    console.error("Frontend-Kopie weicht von control-server/admin-ui ab — erst spiegeln, dann deployen.");
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
