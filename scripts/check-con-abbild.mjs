#!/usr/bin/env node
// con-Autopilot — Abbild-Waechter (Single Responsibility: enthaelt das Bau-Abbild alles, was der Dienst importiert?).
//
// Warum es diese Pruefung gibt: Am 2026-09-04 fehlte im Dockerfile eine einzige Zeile
// (control-server/src/shared/hash.js, von s3Signer.js importiert). Der Container startete
// nicht, Zeabur antwortete 502 — und KEIN Test hat es gemerkt, weil lokal alle Dateien da sind.
//
// Zwei Stufen, beide ohne Docker (auf dem Betreiber-Mac ist keines installiert):
//   1. Importbaum ab server.mjs gegen die COPY-Zeilen halten.
//   2. Den Dateibestand des Abbilds in ein leeres Verzeichnis kopieren und den Dienst
//      dort WIRKLICH starten. Nur wenn /health antwortet, ist das Abbild vollstaendig.
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCKERFILE = "Dockerfile.con-autopilot";
const EINSTIEG = "workers/con-autopilot/server.mjs";
const PORT = 8431 + (process.pid % 200);

async function importBaum(start) {
  const gesehen = new Set();
  // WICHTIG: fuer JEDE Datei ein frisches Muster. Ein geteiltes /g-Muster traegt seinen
  // Suchzeiger mit; die Rekursion setzt ihn mitten im Lauf zurueck und ueberspringt
  // Importe. Genau daran meldete diese Pruefung am 04.09.2026 faelschlich "gruen".
  function importeVon(text) {
    const muster = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
    const treffer = [];
    let m;
    while ((m = muster.exec(text))) treffer.push(m[1] || m[2]);
    return treffer;
  }
  async function gehe(datei) {
    const rel = path.relative(WURZEL, datei);
    if (gesehen.has(rel) || !existsSync(datei)) return;
    gesehen.add(rel);
    for (const spec of importeVon(await readFile(datei, "utf8"))) {
      if (spec.startsWith(".")) await gehe(path.resolve(path.dirname(datei), spec));
    }
  }
  await gehe(path.resolve(WURZEL, start));
  return [...gesehen].sort();
}

/**
 * Bildet `.dockerignore` nach: liefert true, wenn Docker diesen Pfad NICHT in den Bau-Kontext
 * legt. Die letzte zutreffende Regel gewinnt; eine Zeile mit `!` nimmt wieder auf.
 * Ohne diese Pruefung gruent der Waechter, waehrend der echte Bau mit
 * "failed to calculate checksum of ref" abbricht — die Falle, die schon den Training-Loop kostete.
 */
async function dockerignoreFilter() {
  const datei = path.join(WURZEL, ".dockerignore");
  if (!existsSync(datei)) return () => false;
  const regeln = (await readFile(datei, "utf8")).split("\n")
    .map((z) => z.trim())
    .filter((z) => z && !z.startsWith("#"))
    .map((z) => (z.startsWith("!") ? { negiert: true, muster: z.slice(1) } : { negiert: false, muster: z }));
  const zuRegex = (muster) => new RegExp("^" + muster
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, "[^/]") + "(/.*)?$");
  return (relPfad) => {
    let ignoriert = false;
    for (const r of regeln) if (zuRegex(r.muster).test(relPfad)) ignoriert = !r.negiert;
    return ignoriert;
  };
}

async function copyZiele() {
  const text = await readFile(path.join(WURZEL, DOCKERFILE), "utf8");
  return text.split("\n")
    .filter((z) => z.startsWith("COPY "))
    .map((z) => z.slice(5).trim().split(/\s+/)[0])
    .filter((q) => q && q !== "package.json");
}

function abgedeckt(datei, quellen) {
  return quellen.some((q) => datei === q || datei.startsWith(q.replace(/\/$/, "") + "/"));
}

async function main() {
  const noetig = await importBaum(EINSTIEG);
  const quellen = await copyZiele();
  const fehlend = noetig.filter((d) => !abgedeckt(d, quellen));
  console.log(`Importbaum: ${noetig.length} Dateien, ${quellen.length} COPY-Quellen`);
  if (fehlend.length) {
    console.log("FEHLT im " + DOCKERFILE + ":");
    for (const f of fehlend) console.log("  COPY " + f + " ./" + f);
    process.exit(1);
  }
  console.log("Stufe 1 gruen: jede importierte Datei ist im Abbild.");

  // Stufe 1b: Was .dockerignore ausschliesst, landet nie im Bau-Kontext — auch wenn eine COPY-Zeile es nennt.
  const ignoriert = await dockerignoreFilter();
  const ausgesperrt = [...noetig, ...quellen].filter((d) => ignoriert(d));
  if (ausgesperrt.length) {
    console.log("Von .dockerignore ausgesperrt, obwohl gebraucht:");
    for (const d of [...new Set(ausgesperrt)]) console.log("  !" + d);
    process.exit(1);
  }
  console.log("Stufe 1b gruen: .dockerignore sperrt nichts Gebrauchtes aus.");

  const ziel = await mkdtemp(path.join(os.tmpdir(), "con-abbild-"));
  try {
    await cp(path.join(WURZEL, "package.json"), path.join(ziel, "package.json"));
    for (const q of quellen) {
      const von = path.join(WURZEL, q);
      if (!existsSync(von)) { console.log("COPY-Quelle fehlt im Repo:", q); process.exit(1); }
      await mkdir(path.dirname(path.join(ziel, q)), { recursive: true });
      await cp(von, path.join(ziel, q), { recursive: true });
    }
    const PROBE_SCHLUESSEL = "abbild-probe-" + Math.random().toString(36).slice(2, 10);
    const kind = spawn(process.execPath, [EINSTIEG], {
      cwd: ziel, env: { PATH: process.env.PATH, PORT: String(PORT), SMEJJ_HOST: "127.0.0.1", CON_ADMIN_KEY: PROBE_SCHLUESSEL },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let ausgabe = "";
    kind.stdout.on("data", (b) => { ausgabe += b; });
    kind.stderr.on("data", (b) => { ausgabe += b; });
    const antwort = await new Promise((fertig) => {
      const frist = Date.now() + 15_000;
      const versuch = async () => {
        if (kind.exitCode !== null) return fertig({ ok: false, grund: `Prozess beendet mit ${kind.exitCode}` });
        try {
          const r = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(2000) });
          return fertig({ ok: r.ok, status: r.status, koerper: await r.json() });
        } catch {
          if (Date.now() > frist) return fertig({ ok: false, grund: "keine Antwort in 15 s" });
          setTimeout(versuch, 500);
        }
      };
      versuch();
    });
    if (!antwort.ok) {
      kind.kill("SIGKILL");
      console.log("Stufe 2 ROT:", antwort.grund || `HTTP ${antwort.status}`);
      console.log(ausgabe.split("\n").slice(0, 12).join("\n"));
      process.exit(1);
    }
    console.log("Stufe 2 gruen: Dienst startet im Abbild und /health antwortet:",
      JSON.stringify({ ok: antwort.koerper.ok, dienst: antwort.koerper.dienst, aktiviert: antwort.koerper.aktiviert }));

    // Stufe 3: Betriebsdaten duerfen nie offen im Netz stehen, sobald ein Schluessel gesetzt ist.
    const hole = (kopf) => fetch(`http://127.0.0.1:${PORT}/api/con/status`,
      { headers: kopf, signal: AbortSignal.timeout(4000) }).catch(() => null);
    const ohne = await hole(undefined);
    const falsch = await hole({ "x-con-key": "falsch" });
    const richtig = await hole({ "x-con-key": PROBE_SCHLUESSEL });
    kind.kill("SIGKILL");
    if (!(ohne?.status === 401 && falsch?.status === 401 && richtig && richtig.status !== 401)) {
      console.log("Stufe 3 ROT: /api/con/status ist nicht durch CON_ADMIN_KEY geschuetzt",
        JSON.stringify({ ohne: ohne?.status, falsch: falsch?.status, richtig: richtig?.status }));
      process.exit(1);
    }
    console.log(`Stufe 3 gruen: /api/con/status verlangt den Schluessel (ohne/falsch 401, richtig ${richtig.status}).`);
  } finally {
    await rm(ziel, { recursive: true, force: true });
  }
}

main();
