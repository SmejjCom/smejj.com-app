#!/usr/bin/env node
// con-Autopilot — Kommandozeile fuer den Betreiber-Mac (dieselben Module wie der Zeabur-Dienst).
//   node workers/con-autopilot/cli.mjs status          Zustand, Register, Kosten (nur lesen)
//   node workers/con-autopilot/cli.mjs tick            EIN Takt des Kreislaufs (startet ggf. einen Salad-Job — nur mit CON_SALAD_FREIGABE=YES)
//   node workers/con-autopilot/cli.mjs plan            zeigt, was der naechste Takt taete (startet nichts)
//   node workers/con-autopilot/cli.mjs bewerte <version> <jobId>   Antworten aus e2 neu benoten (ohne Register)
//   node workers/con-autopilot/cli.mjs job:stop        Salad-Gruppe sofort stoppen (Notbremse)
//   node workers/con-autopilot/cli.mjs rollback:probe  Rollback absichtlich ausloesen und beweisen
//   node workers/con-autopilot/cli.mjs dashboard <datei.html>   Dashboard als Datei
// Zugangsdaten aus ~/.config/smejj.com/env.local, wenn nicht schon in der Umgebung (Werte werden nie ausgegeben).
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { leseKonfig } from "./config.js";
import { e2Client } from "./e2.js";
import { saladClient, gruppenZustand } from "./salad.js";
import { tick, leseZustand, planeNaechstenSchritt, ladeSuiten } from "./kreislauf.js";
import { leseRegistry, schreibeRegistry } from "./registry.js";
import { bewerteAntworten, schwaechsteKategorie } from "./bewertung.js";
import { baueStatus, dashboardHtml } from "./dashboard.js";
import { fuehreRollbackAus, leseDeploy, pruefeRollback } from "./canary.js";

async function ladeEnvLocal() {
  try {
    const text = await readFile(path.join(os.homedir(), ".config/smejj.com/env.local"), "utf8");
    for (const zeile of text.split("\n")) {
      const m = zeile.match(/^(?:export\s+)?([A-Z0-9_]+)=["']?([^"'\n]*)["']?$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* ohne Datei: nur Umgebung */ }
}

await ladeEnvLocal();
const konfig = leseKonfig(process.env);
const e2 = e2Client(konfig.e2);
const salad = konfig.salad.ok ? saladClient(konfig.salad) : null;
const log = (...a) => console.log(new Date().toISOString(), ...a);
const [befehl, ...args] = process.argv.slice(2);

switch (befehl) {
  case "status": {
    const s = await baueStatus({ konfig, e2, salad });
    console.log(JSON.stringify(s, null, 2));
    break;
  }
  case "plan": {
    const z = await leseZustand(e2);
    const registry = await leseRegistry(e2);
    console.log(JSON.stringify({ phase: z.phase, laufenderJob: z.laufenderJob, plan: await planeNaechstenSchritt({ e2, konfig }, z, registry) }, null, 2));
    break;
  }
  case "tick": {
    const z = await tick({ konfig, e2, salad, log });
    console.log(JSON.stringify({ phase: z.phase, laufenderJob: z.laufenderJob, letzteEntscheidung: z.letzteEntscheidung, startBlockiert: z.startBlockiert, plan: z.plan?.job?.ziel || z.plan?.grund, letzterFehler: z.letzterFehler }, null, 2));
    break;
  }
  case "bewerte": {
    const [version, jobId] = args;
    const antworten = await e2.getJson(`con/evals/${version}/${jobId}/antworten.json`, null);
    if (!antworten) throw new Error("antworten.json fehlt");
    const b = bewerteAntworten(antworten, await ladeSuiten(konfig.suitesDir));
    await e2.putJson(`con/evals/${version}/${jobId}/bewertung.json`, b);
    console.log(JSON.stringify({ gesamt: b.gesamt, kritisch: b.kritisch, kategorien: b.kategorien, leistung: b.leistung, schwaechste: schwaechsteKategorie(b), warnungen: b.warnungen, gefallen: b.faelleDetail.filter((f) => f.score < 1).map((f) => `${f.suite}/${f.id} ${f.score} ${f.gruende.join("; ").slice(0, 80)}`) }, null, 2));
    break;
  }
  case "job:stop": {
    if (!salad) throw new Error("Salad nicht konfiguriert");
    const r = await salad.stoppe();
    console.log("stop:", r.status, JSON.stringify(r.daten).slice(0, 200));
    console.log("gruppe:", JSON.stringify(await gruppenZustand(salad)));
    break;
  }
  case "gruppe:anlegen": {
    // Gruppe anlegen/aktualisieren OHNE Start (kostet nichts): prueft, ob Salad die Ressourcen (Speicher, RAM, GPU-Klassen) annimmt.
    if (!salad) throw new Error("Salad nicht konfiguriert");
    const { bereiteJobVor } = await import("./salad.js");
    const r = await bereiteJobVor({ client: salad, konfig, e2: konfig.e2, jobId: "vorbereitung-ohne-start", modus: "messung", parameter: { CON_VERSION: "con-1.0.0" }, maxMinuten: 10, log });
    console.log(JSON.stringify({ vorbereitung: r, gruppe: await gruppenZustand(salad) }, null, 2));
    break;
  }
  case "gruppe": {
    if (!salad) throw new Error("Salad nicht konfiguriert");
    console.log(JSON.stringify(await gruppenZustand(salad), null, 2));
    break;
  }
  case "rollback:probe": {
    // Beweis: kuenstliche Betriebsdaten mit hoher Fehlerrate fuer die Canary -> Rollback muss greifen.
    const registry = await leseRegistry(e2);
    const d = await leseDeploy(e2);
    if (!d.stable) throw new Error("Kein Deploy-Stand — erst eine stabile Version");
    const probeVersion = `${d.stable}-rollback-probe`;
    const vorher = { stable: d.stable, canary: d.canary };
    d.canary = probeVersion; d.canarySeit = new Date().toISOString();
    await e2.putJson("con/deploy.json", d);
    const metriken = { antworten: 50, fehlerrate: 0.4, sicherheitsvorfaelle: 0, kostenProAntwortUsd: 0.001, abstuerze: 0, probe: true, zeit: new Date().toISOString() };
    await e2.putJson(`con/deploy-metriken/${probeVersion}.json`, metriken);
    const p = pruefeRollback(metriken);
    const r = await fuehreRollbackAus(e2, registry, d, p.gruende, log);
    const nachher = await leseDeploy(e2);
    console.log(JSON.stringify({ vorher, probeCanary: probeVersion, metriken, pruefung: p, rollback: r, nachher: { stable: nachher.stable, canary: nachher.canary, letzterRollback: nachher.letzterRollback }, bewiesen: nachher.canary === vorher.stable && r.noetig }, null, 2));
    break;
  }
  case "daten:bauen": {
    // node cli.mjs daten:bauen <name> <e2-quellprefix-train.jsonl> [maxPaare] [kategorien,kommagetrennt]
    const [name, quelle, maxPaare, kats] = args;
    if (!name || !quelle) throw new Error("Aufruf: daten:bauen <name> <e2-key train.jsonl> [maxPaare] [kategorien]");
    const { baueDatensatz, veroeffentliche } = await import("./daten.js");
    const roh = await e2.getText(quelle);
    if (!roh) throw new Error("Quelle fehlt: " + quelle);
    const { paare, bericht } = baueDatensatz(roh, { suiten: await ladeSuiten(konfig.suitesDir), maxPaare: maxPaare ? Number(maxPaare) : null });
    const manifest = await veroeffentliche(e2, { name, paare, bericht, quelle: { key: quelle, sha256: (await import("./daten.js")).hashText(roh) }, kategorien: (kats || "allgemein,sprache").split(",") });
    console.log(JSON.stringify({ name, paare: paare.length, bericht, sha256: manifest.dateien[0].sha256 }, null, 2));
    break;
  }
  case "dashboard": {
    const html = dashboardHtml(await baueStatus({ konfig, e2, salad }));
    await writeFile(args[0] || "con-dashboard.html", html);
    console.log("geschrieben:", args[0] || "con-dashboard.html");
    break;
  }
  default:
    console.log("Befehle: status | plan | tick | bewerte <version> <jobId> | job:stop | gruppe | rollback:probe | dashboard <datei>");
    process.exit(1);
}
