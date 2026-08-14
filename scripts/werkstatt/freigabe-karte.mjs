#!/usr/bin/env node
// smejj.com — Werkstatt-Autopilot (Nr. 30), STATION 4: die 1-Klick-Freigabe.
//
// Nach einem Bau (Station 2) und gruenem Tor (Station 3) entsteht hier die
// Karte, mit der der Betreiber den Live-Gang mit EINEM Klick ausloest: ein
// Pull Request auf GitHub. Ohne den Klick bleibt der Code sicher auf dem
// feature/-Branch liegen — die Werkstatt kann bauen, aber nie selbst
// ausliefern. Diese Trennung ist der Kern des Sicherheitsmodells: kein
// scharfer Deploy-Schluessel liegt bei der Nacht-Routine.
//
// Aufruf:
//   node scripts/werkstatt/freigabe-karte.mjs <branch> [--gescheitert "Grund"]
//
// Nutzt die gh-CLI, wenn angemeldet; sonst wird die fertige PR-Adresse
// ausgegeben (GitHubs "compare"-Link erzeugt den PR mit einem Klick mehr).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BAU_BASIS } from "./pruefe-tor.mjs";

const REPO_PFAD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_GITHUB = "SmejjCom/smejj.com-app";

/**
 * Wogegen der Pull Request laeuft.
 *
 * KORRIGIERT 2026-08-14: Die Karte zeigte auf `main`. Gebaut und gemessen wird
 * aber gegen die Bau-Basis aus pruefe-tor.mjs — `main` liegt rund 95 Commits
 * zurueck (siehe Kopfkommentar dort). Ein PR gegen `main` zeigte darum den
 * Nachtbau plus hundert fremde Commits; der Betreiber haette einen Umfang
 * freigegeben, den niemand gebaut hat. Die Quelle der Wahrheit ist EINE:
 * dieselbe Konstante, gegen die auch das Tor prueft.
 */
export function basisBranch(basisRef = BAU_BASIS) {
  return String(basisRef).replace(/^origin\//, "");
}

/** Die 1-Klick-Adresse fuer den PR-Entwurf (ohne gh-CLI). */
export function vergleichsAdresse(branch, basisRef = BAU_BASIS, repo = REPO_GITHUB) {
  return `https://github.com/${repo}/compare/${encodeURIComponent(basisBranch(basisRef))}`
    + `...${encodeURIComponent(branch)}?expand=1`;
}

/**
 * Womit die Karte den Tor-Stand misst.
 *
 * KORRIGIERT 2026-08-14: Hier stand `--schnell`. Der schnelle Lauf laesst die
 * Pruefsuite aus und meldet DESHALB per Bauart "TOR ZU" — die Karte konnte
 * also nie etwas anderes sagen als "NICHT MERGEN", auch wenn der volle Lauf
 * kurz zuvor OFFEN gemeldet hatte. Eine Ampel, die immer rot ist, ist keine
 * Ampel. Die Karte misst darum voll; die Minute ist einmal pro Nacht zu
 * verkraften, eine falsche Ampel nicht.
 */
export function torArgumente() {
  return ["run", "werkstatt:tor", "--silent"];
}

/** Baut Titel und Beschreibung des PR. REINE Funktion, testbar ohne git. */
export function baueKarte({ branch, aufgabeTitel = "", torOffen = false, testStand = "", gescheitert = "", ziel = basisBranch() } = {}) {
  const status = gescheitert ? "GESCHEITERT" : torOffen ? "BEREIT ZUM MERGE" : "TOR ZU — NICHT MERGEN";
  const titel = gescheitert
    ? `werkstatt: GESCHEITERT — ${aufgabeTitel || branch}`
    : `werkstatt: ${aufgabeTitel || branch}`;
  const koerper = [
    `**Status: ${status}**`,
    "",
    "Gebaut von der naechtlichen Werkstatt-Routine (Autopilot Nr. 30, Station 2).",
    "Ein Klick auf **Merge** liefert aus; ohne Klick bleibt alles auf diesem Branch.",
    "",
    `- Aufgabe: ${aufgabeTitel || "(siehe docs/werkstatt/AUFTRAG.md auf dem Branch)"}`,
    `- Ziel-Branch: ${ziel} (die Bau-Basis, gegen die auch das Tor misst — nicht main)`,
    `- Pruef-Tor (Station 3): ${torOffen ? "OFFEN — alle Sperren und die volle Suite gruen" : "ZU — siehe Protokoll unten"}`,
    testStand ? `- Testlauf: ${testStand}` : null,
    gescheitert ? `- Warum gescheitert: ${gescheitert}` : null,
    "",
    "Schutzregeln des Auftrags: genau eine Aufgabe, keine gesperrten Dateien,",
    "keine neuen Dienste. Das Tor prueft das fail-closed nach — auch, ob die",
    "Lock-Manifeste selbst verschoben wurden.",
    "",
    "🤖 Erzeugt von der Werkstatt. Der Mensch entscheidet."
  ].filter((z) => z !== null).join("\n");
  return { titel, koerper, status };
}

async function main() {
  const branch = process.argv[2];
  if (!branch || !branch.startsWith("feature/werkstatt-")) {
    console.error("Aufruf: freigabe-karte.mjs <feature/werkstatt-...> [--gescheitert \"Grund\"]");
    process.exit(1);
  }
  const gescheitertIdx = process.argv.indexOf("--gescheitert");
  const gescheitert = gescheitertIdx > -1 ? String(process.argv[gescheitertIdx + 1] || "ohne Grund") : "";

  // Tor-Stand fuer die Karte messen — VOLL. Siehe torArgumente().
  const tor = spawnSync("npm", torArgumente(), { cwd: REPO_PFAD, encoding: "utf8" });
  const torOffen = tor.status === 0;

  const aufgabeTitel = spawnSync("git", ["log", "-1", "--format=%s", branch], { cwd: REPO_PFAD, encoding: "utf8" }).stdout.trim();
  const karte = baueKarte({ branch, aufgabeTitel, torOffen, gescheitert });

  // Weg 1: gh-CLI (falls angemeldet) erzeugt den PR direkt.
  const gh = spawnSync("gh", ["pr", "create",
    "--repo", REPO_GITHUB,
    "--base", basisBranch(),
    "--head", branch,
    "--title", karte.titel,
    "--body", karte.koerper
  ], { cwd: REPO_PFAD, encoding: "utf8" });

  if (gh.status === 0) {
    const url = gh.stdout.trim().split("\n").pop();
    console.log(`[werkstatt] Freigabe-Karte erstellt: ${url}`);
    console.log(`[werkstatt] Status: ${karte.status}`);
    return;
  }

  // Weg 2 (ohne gh): der compare-Link — ein Klick oeffnet den fertig
  // ausgefuellten PR-Entwurf.
  console.log("[werkstatt] gh-CLI nicht verfuegbar — 1-Klick-Adresse:");
  console.log(`  ${vergleichsAdresse(branch)}`);
  console.log(`[werkstatt] Titel: ${karte.titel}`);
  console.log(`[werkstatt] Status: ${karte.status}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
