#!/usr/bin/env node
// smejj.com — Werkstatt-Autopilot (Nr. 30), STATION 3: Prüfen (fail-closed Tor).
//
// Zwischen dem, was ein Bau-Agent geschrieben hat, und dem Live-Betrieb steht
// genau dieses Tor. Es oeffnet nur, wenn ALLE Pruefungen bestehen. Jeder
// Fehler, jede unbeantwortete Frage, jeder Abbruch => geschlossen.
//
// DIE LUECKE, DIE DIESES TOR SCHLIESST (gemessen am 2026-08-12):
// Die Spezifikation verlangt "Lock-Manifeste werden per SHA256 verglichen".
// Das allein genuegt NICHT. Eine parallele Sitzung hat an diesem Tag in JEDEM
// ihrer sechs Commits die Lock-Manifeste gleich mitgeaendert — die
// Lock-Pruefung blieb dadurch gruen, obwohl gesperrte Dateien angefasst
// wurden. Ein Schloss, dessen Schluessel im Schloss steckt, ist kein Schloss.
// Darum prueft dieses Tor ZUERST, ob die Manifeste selbst seit der Bau-Basis
// unveraendert sind. Wer ein Manifest neu einfriert, muss das mit einer
// Betreiber-Freigabe tun — nicht nebenbei im selben Commit.
//
// WELCHE BAU-BASIS? (korrigiert 2026-08-13, live gemessen)
// Die Basis war `origin/main` — und das machte das Tor STRUKTURELL
// unpassierbar. Gebaut und ausgeliefert wird aus
// `feature/auth-redesign-github-magiclink` (docs/deployment/
// CONTROL_SERVER_ZEABUR_UMZUG.md Zeile 37: "Branch ... waehlen, **nicht**
// `main`"). Gemessen am 2026-08-13: origin/main fehlten 95 Commits des
// Bau-Branches. Gegen so eine Basis gilt JEDES Lock-Manifest als "seit der
// Bau-Basis veraendert" — der Nachtbau fiel jede Nacht an derselben Zeile,
// ohne dass je etwas faul gewesen waere.
// Die Regel selbst bleibt unveraendert scharf: Manifeste, die im SELBEN Zug
// wie Code neu eingefroren werden, fallen weiterhin auf. Nur wird jetzt
// gegen den Stand verglichen, der wirklich ausgeliefert wird.
// Mit --basis laesst sich weiterhin jede andere Basis erzwingen.
//
// Aufruf:
//   node scripts/werkstatt/pruefe-tor.mjs [--basis <ref>] [--schnell]
//
// --schnell laesst die 40-Sekunden-Vollsuite aus (nur fuer Zwischenlaeufe des
// Bau-Agenten; das Tor vor einer Freigabe laeuft IMMER vollstaendig).
// Exit 0 = Tor offen. Exit 1 = geschlossen, Grund steht in der Ausgabe.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Der Branch, aus dem wirklich gebaut und ausgeliefert wird. Siehe die
// ausfuehrliche Begruendung im Kopfkommentar ("WELCHE BAU-BASIS?").
export const BAU_BASIS = "origin/feature/auth-redesign-github-magiclink";

// Die Manifeste, die den Schutz TRAGEN. Aendert sich eines davon im selben
// Zug wie der Code, ist die Sperre umgangen.
export const MANIFESTE = Object.freeze([
  "docs/frontend/start-lock-manifest.json",
  "docs/frontend/favicon-lock-manifest.json",
  "docs/security/security-lock-manifest.json",
  "docs/security/admin-lock-manifest.json",
  "docs/deploy/deploy-lock-manifest.json",
  "docs/approvals/einwilligung-lock-manifest.json"
]);

// Die einzelnen Sperren. Reihenfolge = Reihenfolge der Ausgabe.
export const SPERREN = Object.freeze([
  "check:start-lock",
  "check:security-lock",
  "check:favicon-lock",
  "check:admin-lock",
  "check:deploy-lock",
  "check:einwilligung-lock",
  "check:guidelines"
]);

/**
 * Das Urteil aus den Einzelbefunden. REINE Funktion — ohne Git, ohne npm,
 * damit die Entscheidungslogik selbst pruefbar ist.
 *
 * @param {object} befunde
 * @param {{ok: boolean, veraendert?: string[], grund?: string}} befunde.manifeste
 * @param {Array<{name: string, ok: boolean, ausgabe?: string}>} befunde.sperren
 * @param {{ok: boolean, uebersprungen?: boolean, ausgabe?: string}} befunde.suite
 * @returns {{offen: boolean, gruende: string[]}}
 */
export function faelleUrteil({ manifeste, sperren, suite } = {}) {
  const gruende = [];

  // Fail-closed: eine Pruefung, die gar nicht stattgefunden hat, zaehlt als
  // NICHT bestanden. "Konnte nicht nachsehen" ist kein "in Ordnung".
  if (!manifeste || manifeste.ok !== true) {
    const liste = manifeste?.veraendert?.length ? ` (${manifeste.veraendert.join(", ")})` : "";
    gruende.push(`Lock-Manifeste: ${manifeste?.grund || "nicht geprueft"}${liste}`);
  }
  if (!Array.isArray(sperren) || !sperren.length) {
    gruende.push("Sperren: nicht geprueft");
  } else {
    for (const s of sperren) {
      if (s?.ok !== true) gruende.push(`Sperre ${s?.name || "?"} verletzt`);
    }
    const fehlende = SPERREN.filter((n) => !sperren.some((s) => s.name === n));
    if (fehlende.length) gruende.push(`Sperren nicht ausgefuehrt: ${fehlende.join(", ")}`);
  }
  if (!suite || suite.ok !== true) {
    gruende.push(`Pruefsuite: ${suite?.uebersprungen ? "uebersprungen (--schnell)" : "gefallen"}`);
  }

  return { offen: gruende.length === 0, gruende };
}

function lauf(befehl, argumente, optionen = {}) {
  return new Promise((fertig) => {
    const kind = spawn(befehl, argumente, { cwd: REPO, ...optionen, stdio: ["ignore", "pipe", "pipe"] });
    let ausgabe = "";
    kind.stdout.on("data", (s) => { ausgabe += s.toString(); });
    kind.stderr.on("data", (s) => { ausgabe += s.toString(); });
    kind.once("error", (fehler) => fertig({ code: -1, ausgabe: `${ausgabe}\n${fehler.message}` }));
    kind.once("exit", (code) => fertig({ code, ausgabe }));
  });
}

/** Sind die Lock-Manifeste seit der Bau-Basis unangetastet? */
export async function pruefeManifeste(basis, laufFn = lauf) {
  const ergebnis = await laufFn("git", ["diff", "--name-only", `${basis}...HEAD`, "--", ...MANIFESTE]);
  if (ergebnis.code !== 0) {
    return { ok: false, grund: `Vergleich gegen ${basis} nicht moeglich — fail-closed` };
  }
  const veraendert = ergebnis.ausgabe.split("\n").map((z) => z.trim()).filter(Boolean);
  if (veraendert.length) {
    return {
      ok: false,
      veraendert,
      grund: "seit der Bau-Basis veraendert — eine Sperre darf nicht im selben Zug neu eingefroren werden"
    };
  }
  return { ok: true, veraendert: [] };
}

async function main() {
  const argv = process.argv.slice(2);
  const basisIndex = argv.indexOf("--basis");
  const basis = basisIndex >= 0 ? argv[basisIndex + 1] : BAU_BASIS;
  const schnell = argv.includes("--schnell");

  console.log(`[tor] Station 3 — Pruefung gegen Bau-Basis ${basis}`);

  const manifeste = await pruefeManifeste(basis);
  console.log(manifeste.ok
    ? "[tor] ✔ Lock-Manifeste unangetastet"
    : `[tor] ✖ Lock-Manifeste: ${manifeste.grund}`);

  const sperren = [];
  for (const name of SPERREN) {
    const r = await lauf("npm", ["run", name, "--silent"]);
    const ok = r.code === 0;
    sperren.push({ name, ok, ausgabe: ok ? "" : r.ausgabe.slice(-400) });
    console.log(`[tor] ${ok ? "✔" : "✖"} ${name}`);
  }

  let suite;
  if (schnell) {
    suite = { ok: false, uebersprungen: true };
    console.log("[tor] ⏭ Pruefsuite uebersprungen (--schnell) — das Tor bleibt damit ZU");
  } else {
    const r = await lauf("npm", ["test", "--silent"]);
    suite = { ok: r.code === 0, ausgabe: r.code === 0 ? "" : r.ausgabe.slice(-800) };
    console.log(`[tor] ${suite.ok ? "✔" : "✖"} Pruefsuite`);
  }

  const urteil = faelleUrteil({ manifeste, sperren, suite });
  console.log("");
  if (urteil.offen) {
    console.log("[tor] TOR OFFEN — die Aenderung darf zur Freigabe (Station 4).");
    process.exit(0);
  }
  console.log("[tor] TOR GESCHLOSSEN. Gruende:");
  for (const g of urteil.gruende) console.log(`  - ${g}`);
  for (const s of sperren.filter((x) => !x.ok)) {
    console.log(`\n--- ${s.name} ---\n${s.ausgabe}`);
  }
  if (suite && !suite.ok && !suite.uebersprungen) console.log(`\n--- Pruefsuite ---\n${suite.ausgabe}`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
