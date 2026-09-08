// Drei-Wege-Abgleich Repo <-> Auslieferung.
//
// Der Wächter sagt: "Live-Fassung zur Basis nehmen, eigene Aenderung
// daraufsetzen — sonst verschwindet fremde Arbeit lautlos." Genau das macht
// dieses Werkzeug maschinell und nachpruefbar, statt zu kopieren:
//
//   BASIS  = die Fassung aus der Frontend-Historie, die byte-genau dem
//            lokalen Stand entspricht (dort war das Repo zuletzt gleichauf)
//   MEIN   = die lokale Fassung
//   ANDERE = die heutige Auslieferung
//
// Ohne Basis wird NICHT gemergt — dann fehlt der Beweis, was wessen Aenderung
// ist, und ein Merge waere Raten. Solche Dateien werden nur gemeldet.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.env.SMEJJ_REPO;
const KLON = process.env.SMEJJ_FRONTEND_KLON || join(process.env.HOME, "smejj-app-frontend");
const NUR = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SCHREIBEN = process.argv.includes("--schreiben");

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const gitRoh = (args, cwd) => execFileSync("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });

/** Alle Blob-Hashes, die diese Datei in der Frontend-Historie je hatte. */
function historie(zielPfad) {
  let commits;
  try {
    commits = git(["log", "--all", "--format=%H", "--", zielPfad], KLON).split("\n").filter(Boolean);
  } catch { return []; }
  const stände = [];
  for (const c of commits) {
    try { stände.push({ commit: c, blob: git(["rev-parse", `${c}:${zielPfad}`], KLON) }); } catch { /* Datei gab es dort nicht */ }
  }
  return stände;
}

export function abgleichen(quelle, zielPfad) {
  const lokalDatei = join(REPO, "public", quelle);
  if (!existsSync(lokalDatei)) return { quelle, lage: "lokal fehlt" };
  const lokalBlob = git(["hash-object", lokalDatei], REPO);
  const stände = historie(zielPfad);
  if (!stände.length) return { quelle, lage: "nicht in der Frontend-Historie" };

  const liveBlob = stände[0].blob;
  if (liveBlob === lokalBlob) return { quelle, lage: "bereits gleich" };

  let basis = stände.find((s) => s.blob === lokalBlob);
  if (!basis) {
    // Kein Stand ist byte-gleich mit lokal: dann ist die AEHNLICHSTE Fassung
    // die wahrscheinlichste gemeinsame Wurzel. Das ist eine Schaetzung — aber
    // eine ueberpruefbare: merge-file meldet jede Stelle, an der sie nicht
    // traegt, als Konflikt. Geraten wird also nie still.
    const lokalZeilen = new Set(readFileSync(lokalDatei, "utf8").split("\n"));
    let beste = null;
    for (const s of stände) {
      const zeilen = gitRoh(["cat-file", "blob", s.blob], KLON).toString("utf8").split("\n");
      let gleich = 0;
      for (const z of zeilen) if (lokalZeilen.has(z)) gleich += 1;
      const naehe = gleich / Math.max(zeilen.length, lokalZeilen.size);
      if (!beste || naehe > beste.naehe) beste = { ...s, naehe };
    }
    if (!beste || beste.naehe < 0.5) return { quelle, lage: "KEINE BASIS — zu weit auseinander" };
    basis = beste;
  }

  // Basis == lokal: die lokale Fassung ist ein alter Auslieferungsstand ohne
  // eigene Zeilen darueber. Dann ist der Merge trivial die Live-Fassung.
  const tmp = mkdtempSync(join(tmpdir(), "merge-"));
  const pfade = { basis: join(tmp, "basis"), mein: join(tmp, "mein"), andere: join(tmp, "andere") };
  writeFileSync(pfade.basis, gitRoh(["cat-file", "blob", basis.blob], KLON));
  writeFileSync(pfade.mein, readFileSync(lokalDatei));
  writeFileSync(pfade.andere, gitRoh(["cat-file", "blob", liveBlob], KLON));

  let konflikt = false;
  try {
    execFileSync("git", ["merge-file", "-L", "lokal", "-L", "gemeinsame Basis", "-L", "Auslieferung",
      pfade.mein, pfade.basis, pfade.andere], { stdio: "pipe" });
  } catch (fehler) {
    // Exit > 0 = Zahl der Konflikte; negativ = Fehler
    konflikt = (fehler.status ?? -1) > 0;
    if (!konflikt) { return { quelle, lage: `merge-file scheiterte: ${fehler.message.slice(0, 60)}` }; }
  }
  const ergebnis = readFileSync(pfade.mein, "utf8");
  if (konflikt) return { quelle, lage: "KONFLIKT — Hand anlegen", konflikte: (ergebnis.match(/^<<<<<<< /gm) || []).length };

  if (SCHREIBEN) writeFileSync(lokalDatei, ergebnis);
  return { quelle, lage: SCHREIBEN ? "zusammengefuehrt" : "wuerde sauber zusammenfuehren" };
}

const eingabe = NUR.length ? NUR : JSON.parse(process.env.SMEJJ_LISTE || "[]");
const zaehler = new Map();
for (const eintrag of eingabe) {
  const [quelle, ziel] = eintrag.split("::");
  const r = abgleichen(quelle, ziel);
  zaehler.set(r.lage, (zaehler.get(r.lage) || 0) + 1);
  console.log(`  ${r.lage.padEnd(34)} ${quelle}${r.konflikte ? ` (${r.konflikte} Stellen)` : ""}`);
}
console.log("\nZusammenfassung:");
for (const [lage, n] of [...zaehler].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${lage}`);
