#!/usr/bin/env node
// smejj.com — was geschuetzt ist, muss auch so AUSGELIEFERT werden.
//
// DIE LUECKE, DIE DIESES SKRIPT SCHLIESST (gefunden 2026-08-22):
// Alle sieben Dateisperren bewachen ausschliesslich Pfade unter `public/`.
// Die App laedt ihre Dateien aber aus `/assets/` — index.html Zeile 69,
// premium-surfaces.js, jedes loadStyles(). `public/assets/` ist eine eigene
// Kopie. Damit galt:
//
//   1. Die AUSGELIEFERTE Startseite war voellig ungeschuetzt. Man haette
//      public/assets/index.html oder .../start-styles.css beliebig aendern
//      koennen — der "100%-Schutz" haette weiter OK gemeldet, weil er nur
//      die Quelle daneben ansieht.
//   2. Umgekehrt konnte eine hier korrekt eingefrorene Aenderung live nie
//      ankommen. Genau das ist am 2026-08-22 fuer 26 Dateien nachgewiesen
//      worden, darunter start-styles.css und sw.js (v633 gegen v641).
//
// Beides ist dieselbe Ursache: der Schutz sass eine Ebene neben dem, was
// zaehlt.
//
// WARUM EIN EIGENES SKRIPT statt einer Erweiterung von check-start-lock.mjs:
// Diese Datei ist digest-gepinnt (idrive-layout/manifests/evaluations/
// phase1-foundation-benchmark.json, immutable: true, overwriteAllowed:
// false). Beim Bau dieses Wachters wurde die Erweiterung dort zuerst
// eingebaut und brach den Pin — eine Manipulationssperre. Zurueckgerollt.
// Wer den Schutz erweitern will, legt daneben, nicht hinein.
//
// Es wird bewusst KEIN eigenes Manifest gefuehrt: geprueft wird die
// GLEICHHEIT von Quelle und Auslieferung. Damit erbt die Kopie den Schutz
// der Quelle automatisch und muss nie separat eingefroren werden.
//
// Aufruf:  node scripts/check-auslieferung-lock.mjs
// Heilung: npm run build:assets
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { PROTECTED_FILES as SECURITY_FILES } from "./check-security-lock.mjs";
import { PROTECTED_FILES as ADMIN_FILES } from "./check-admin-lock.mjs";
import { PROTECTED_FILES as DEPLOY_FILES } from "./check-deploy-lock.mjs";
import { PROTECTED_FILES as ABO_FILES } from "./check-abo-lock.mjs";
import { PROTECTED_FILES as EINWILLIGUNG_FILES } from "./check-einwilligung-lock.mjs";
// EINE Wahrheit fuer die Ausnahmen: dieselbe Liste, die auch der Sync
// respektiert. Zwei getrennte Listen wuerden auseinanderlaufen, und dieser
// Waechter wuerde dann "npm run build:assets" empfehlen fuer Dateien, die
// der Sync bewusst nicht anfasst — ein Ratschlag ins Leere. Genau das ist
// beim ersten Lauf passiert.
import { AUSNAHMEN } from "./build/sync-assets.mjs";

// check-start-lock.mjs exportiert seine Liste NICHT und darf wegen des
// Digest-Pins auch nicht dafuer geaendert werden. Sie wird deshalb aus dem
// Quelltext gelesen — reines Lesen laesst den Digest unberuehrt.
export function startLockDateien(quelle = readFileSync("scripts/check-start-lock.mjs", "utf8")) {
  const block = quelle.match(/const PROTECTED_FILES = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error("PROTECTED_FILES in check-start-lock.mjs nicht gefunden — Aufbau geaendert?");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export const SPERREN = Object.freeze({
  start: startLockDateien(),
  security: SECURITY_FILES,
  admin: ADMIN_FILES,
  deploy: DEPLOY_FILES,
  abo: ABO_FILES,
  einwilligung: EINWILLIGUNG_FILES
});

const sha256 = (pfad) => createHash("sha256").update(readFileSync(pfad)).digest("hex");

export function pruefe(sperren = SPERREN) {
  const abweichend = [];
  const geprueft = [];
  const ohneKopie = [];
  const ausgenommen = [];
  for (const [sperre, dateien] of Object.entries(sperren)) {
    for (const datei of dateien) {
      if (!datei.startsWith("public/") || !existsSync(datei)) continue;
      const name = datei.replace(/^public\//, "");
      // Das Bruecken-Buendel ist im Frontend-Repo ein ERZEUGTES Artefakt und
      // darf der Quelle nie gleichen (ERR_MODULE_NOT_FOUND, siehe sync-assets).
      if (AUSNAHMEN[name]) { ausgenommen.push(datei); continue; }
      const ausgeliefert = `public/assets/${name}`;
      // Ohne Kopie wird direkt aus der Quelle geliefert (public/ai/* und
      // manifest.webmanifest, siehe src/http/staticServing.js) — dort KANN
      // nichts auseinanderlaufen.
      if (!existsSync(ausgeliefert)) { ohneKopie.push(datei); continue; }
      geprueft.push(datei);
      if (sha256(ausgeliefert) !== sha256(datei)) abweichend.push({ sperre, datei, ausgeliefert });
    }
  }
  return { abweichend, geprueft, ohneKopie, ausgenommen };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { abweichend, geprueft, ohneKopie, ausgenommen } = pruefe();
  if (abweichend.length > 0) {
    console.error(`auslieferung-lock VERLETZT (${abweichend.length}) — geschuetzte Dateien werden ANDERS ausgeliefert, als sie eingefroren sind:`);
    for (const { sperre, datei, ausgeliefert } of abweichend) {
      console.error(`  - [${sperre}] ${ausgeliefert} weicht von ${datei} ab`);
    }
    console.error("\nDie App laedt aus /assets/ — diese Dateien sind LIVE nicht das, was die Sperre schuetzt.");
    console.error("Heilung: npm run build:assets");
    process.exit(1);
  }
  console.log(`auslieferung-lock OK — ${geprueft.length} geschuetzte Dateien werden unveraendert ausgeliefert (${ohneKopie.length} ohne eigene Kopie, direkt aus der Quelle; ${ausgenommen.length} erzeugte Artefakte ausgenommen).`);
}
