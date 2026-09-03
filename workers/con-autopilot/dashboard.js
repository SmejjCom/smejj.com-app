// con-Autopilot — Dashboard (Single Responsibility: Zustand aus e2 einsammeln und anzeigen; entscheidet nichts).
import { leseRegistry } from "./registry.js";
import { leseZustand, naechsterSchrittText } from "./kreislauf.js";
import { leseGesamtverbrauch, leseTagesbuch } from "./budget.js";
import { leseDeploy } from "./canary.js";
import { gruppenZustand } from "./salad.js";

export async function baueStatus({ konfig, e2, salad }) {
  const [registry, zustand, tagesbuch, gesamt, deploy, basisManifest, tasks] = await Promise.all([
    leseRegistry(e2).catch((e) => ({ fehler: e.message, versions: [] })),
    leseZustand(e2), leseTagesbuch(e2), leseGesamtverbrauch(e2), leseDeploy(e2),
    e2.getJson(`${konfig.basis.prefix}/manifest.json`, null),
    e2.getJson("con/logs/tasks/index.json", null)
  ]);
  const gruppe = salad ? await gruppenZustand(salad).catch(() => ({ zustand: "unbekannt" })) : { zustand: "kein_salad" };
  const jobStatus = zustand.laufenderJob ? await e2.getJson(`con/logs/jobs/${zustand.laufenderJob.jobId}/status.json`, null) : null;
  return {
    zeit: new Date().toISOString(),
    autopilot: { aktiviert: konfig.aktiviert, phase: zustand.phase, ticks: zustand.ticks, letzterTick: zustand.letzterTick, naechsterTick: zustand.naechsterTick,
      naechsterSchritt: naechsterSchrittText(zustand), letzteEntscheidung: zustand.letzteEntscheidung || null, schwaechste: zustand.schwaechste || null,
      startBlockiert: zustand.startBlockiert || null, letzterFehler: zustand.letzterFehler || null, notaus: konfig.grenzen.notaus, freigabe: konfig.grenzen.freigabe },
    job: zustand.laufenderJob ? { ...zustand.laufenderJob, live: jobStatus ? { phase: jobStatus.phase, schritt: jobStatus.schritt, aktualisiert: jobStatus.aktualisiert, laufzeitMinuten: jobStatus.laufzeitMinuten,
      fortschritt: jobStatus.erledigt != null ? `${jobStatus.erledigt}/${jobStatus.von}` : (jobStatus.fertigDateien != null ? `${jobStatus.fertigDateien}/${jobStatus.vonDateien} Dateien, ${gb(jobStatus.fertigBytes)}/${gb(jobStatus.gesamtBytes)} GB` : null),
      loss: jobStatus.loss ?? null, gpu: jobStatus.gpu || null } : null } : null,
    letzterJob: zustand.letzterJob || null,
    salad: { gruppe: konfig.salad.gruppe, zustand: gruppe.zustand, prioritaet: konfig.salad.prioritaet, gpuKlassen: konfig.salad.gpuKlassen.length },
    kosten: { heuteUsd: tagesbuch.summeUsd || 0, tagesbudgetUsd: konfig.grenzen.tagesbudgetUsd, gesamtUsd: gesamt.summeUsd || 0, gesamtdeckelUsd: konfig.grenzen.gesamtdeckelUsd, jobs: gesamt.jobs || 0 },
    basis: { repo: konfig.basis.repo, prefix: konfig.basis.prefix, gespiegelt: Boolean(basisManifest?.komplett), dateien: basisManifest?.dateien?.length || 0, gb: gb(basisManifest?.gesamtBytes) },
    registry: { stable: registry.stable || null, candidate: registry.candidate || null, versionen: (registry.versions || []).map((v) => ({ version: v.version, status: v.status, gesamt: v.benchmarks?.gesamt ?? null, kritisch: v.benchmarks?.kritisch ?? null,
      kategorien: v.benchmarks?.kategorien || null, leistung: v.benchmarks?.leistung || null, kostenUsd: v.kostenUsd ?? null, hardware: v.hardware?.name || null, basis: v.basisRepo || null, datensatz: v.datensatz || null, jobId: v.jobId || null, promotedAt: v.promotedAt || null, urteil: v.urteil?.gruende || null })) },
    deploy: { stable: deploy.stable, canary: deploy.canary, canarySeit: deploy.canarySeit, letzterRollback: deploy.letzterRollback || null },
    tasks: (tasks?.tasks || []).slice(-8).reverse(),
    historie: (zustand.historie || []).slice(-12).reverse()
  };
}

function gb(bytes) { return Number.isFinite(Number(bytes)) && bytes > 0 ? (Number(bytes) / 1e9).toFixed(1) : "0"; }
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function pct(x) { return Number.isFinite(Number(x)) ? (Number(x) * 100).toFixed(1) + " %" : "–"; }

export function dashboardHtml(s) {
  const kats = ["sprache", "reasoning", "coding", "werkzeuge", "recherche", "sicherheit"];
  const zeilen = s.registry.versionen.map((v) => `<tr><td><b>${esc(v.version)}</b></td><td class="${esc(v.status)}">${esc(v.status)}</td><td>${pct(v.gesamt)}</td><td>${v.kritisch ?? "–"}</td>${kats.map((k) => `<td>${pct(v.kategorien?.[k]?.score)}</td>`).join("")}<td>${v.leistung?.tokensProSekunde ?? "–"} tok/s · ${v.leistung?.latenzMsMittel ?? "–"} ms · Fehler ${pct(v.leistung?.fehlerrate)}</td><td>${v.kostenUsd ?? "–"} USD</td><td>${esc(v.hardware || "–")}</td></tr>`).join("");
  const job = s.job ? `<p><b>${esc(s.job.jobId)}</b> · ${esc(s.job.modus)} · ${esc(s.job.ziel)}<br>Phase ${esc(s.job.live?.phase || "–")} ${esc(s.job.live?.schritt || "")} · Fortschritt ${esc(s.job.live?.fortschritt || "–")} · Loss ${esc(s.job.live?.loss ?? "–")} · ${s.job.live?.laufzeitMinuten ?? 0} min von ${s.job.maxMinuten} · GPU ${esc(s.job.live?.gpu?.name || "–")}</p>` : "<p>kein Job aktiv</p>";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="refresh" content="60"><title>con-Autopilot</title>
<style>body{font:18px/1.45 -apple-system,system-ui,sans-serif;margin:24px;color:#111;background:#fafafa}h1{font-size:30px}h2{font-size:22px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:16px}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#eee}.stable{color:#0a7a2f;font-weight:700}.candidate{color:#b36b00}.rejected{color:#a00}.k{display:inline-block;padding:4px 10px;border:2px solid #333;margin:4px 6px 4px 0}.rot{border-color:#a00;color:#a00}.gruen{border-color:#0a7a2f;color:#0a7a2f}small{color:#555}</style></head><body>
<h1>con-Autopilot</h1>
<p><span class="k ${s.autopilot.aktiviert ? "gruen" : "rot"}">Autopilot ${s.autopilot.aktiviert ? "AN" : "AUS"}</span><span class="k">Phase ${esc(s.autopilot.phase)}</span><span class="k">letzter Takt ${esc(s.autopilot.letzterTick || "–")}</span><span class="k">naechster Takt ${esc(s.autopilot.naechsterTick || "–")}</span><span class="k ${s.autopilot.freigabe ? "gruen" : "rot"}">Salad-Freigabe ${s.autopilot.freigabe ? "JA" : "NEIN"}</span>${s.autopilot.notaus ? '<span class="k rot">NOTAUS</span>' : ""}</p>
<p><b>Naechster Schritt:</b> ${esc(s.autopilot.naechsterSchritt)}${s.autopilot.startBlockiert ? `<br><span class="rot">Start blockiert: ${esc(s.autopilot.startBlockiert.gruende.join("; "))}</span>` : ""}</p>
<h2>Laufender Job</h2>${job}
<h2>Kosten</h2><p>Heute ${s.kosten.heuteUsd} von ${s.kosten.tagesbudgetUsd} USD · Gesamt ${s.kosten.gesamtUsd} von ${s.kosten.gesamtdeckelUsd} USD · ${s.kosten.jobs} Jobs · Salad-Gruppe ${esc(s.salad.gruppe)}: ${esc(s.salad.zustand)}</p>
<h2>Versionen</h2><table><tr><th>Version</th><th>Status</th><th>Gesamt</th><th>kritisch</th>${kats.map((k) => `<th>${k}</th>`).join("")}<th>Leistung</th><th>Kosten</th><th>Hardware</th></tr>${zeilen || '<tr><td colspan="13">noch keine Version — der erste Job setzt die Messlatte con-1.0.0</td></tr>'}</table>
<p>Stabil: <b>${esc(s.registry.stable || "–")}</b> · Kandidat: ${esc(s.registry.candidate || "–")} · Canary: ${esc(s.deploy.canary || "–")} ${s.deploy.letzterRollback ? `· letzter Rollback ${esc(s.deploy.letzterRollback.von)} → ${esc(s.deploy.letzterRollback.nach)} (${esc(s.deploy.letzterRollback.gruende.join("; "))})` : ""}</p>
<p>Letzte Entscheidung: ${s.autopilot.letzteEntscheidung ? `<b>${esc(s.autopilot.letzteEntscheidung.entscheidung)}</b> fuer ${esc(s.autopilot.letzteEntscheidung.version)} — ${esc((s.autopilot.letzteEntscheidung.gruende || []).join("; "))}` : "–"}<br>Schwaechste Kategorie: ${s.autopilot.schwaechste ? `${esc(s.autopilot.schwaechste.kategorie)} (${pct(s.autopilot.schwaechste.score)}, ${s.autopilot.schwaechste.kritisch} kritisch)` : "–"}</p>
<h2>Basismodell</h2><p>${esc(s.basis.repo)} → e2 ${esc(s.basis.prefix)}: ${s.basis.gespiegelt ? `gespiegelt (${s.basis.dateien} Dateien, ${s.basis.gb} GB)` : "noch nicht gespiegelt"}</p>
<h2>Aufgaben</h2><table><tr><th>ID</th><th>Ziel</th><th>Status</th><th>Ergebnis</th></tr>${s.tasks.map((t) => `<tr><td><small>${esc(t.id)}</small></td><td>${esc(t.ziel)}</td><td>${esc(t.status)}</td><td>${esc(t.ergebnis || "")}</td></tr>`).join("") || "<tr><td colspan=4>–</td></tr>"}</table>
<h2>Verlauf</h2><ul>${s.historie.map((h) => `<li><small>${esc(h.zeit)}</small> ${esc(h.text)}</li>`).join("")}</ul>
<p><small>Stand ${esc(s.zeit)} · Seite laedt jede Minute neu · JSON: /api/con/status</small></p></body></html>`;
}
