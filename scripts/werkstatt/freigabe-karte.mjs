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

const REPO_PFAD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_GITHUB = "SmejjCom/smejj.com-app";

/** Baut Titel und Beschreibung des PR. REINE Funktion, testbar ohne git. */
export function baueKarte({ branch, aufgabeTitel = "", torOffen = false, testStand = "", gescheitert = "" } = {}) {
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

  // Tor-Stand fuer die Karte messen (schnell, ohne Vollsuite — der volle
  // Lauf ist Teil der Abnahme im Auftrag und lief bereits auf dem Branch).
  const tor = spawnSync("npm", ["run", "werkstatt:tor", "--silent", "--", "--schnell"], { cwd: REPO_PFAD, encoding: "utf8" });
  const torOffen = tor.status === 0;

  const aufgabeTitel = spawnSync("git", ["log", "-1", "--format=%s", branch], { cwd: REPO_PFAD, encoding: "utf8" }).stdout.trim();
  const karte = baueKarte({ branch, aufgabeTitel, torOffen, gescheitert });

  // Weg 1: gh-CLI (falls angemeldet) erzeugt den PR direkt.
  const gh = spawnSync("gh", ["pr", "create",
    "--repo", REPO_GITHUB,
    "--base", "main",
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
  const compare = `https://github.com/${REPO_GITHUB}/compare/main...${encodeURIComponent(branch)}?expand=1`;
  console.log("[werkstatt] gh-CLI nicht verfuegbar — 1-Klick-Adresse:");
  console.log(`  ${compare}`);
  console.log(`[werkstatt] Titel: ${karte.titel}`);
  console.log(`[werkstatt] Status: ${karte.status}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
