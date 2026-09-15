// smejj.com — Bausteine, die zu ECHTER Arbeit ausgebaut wurden (Master-Audit 15.09., Runde 3).
//
// WARUM ES DIESE DATEI GIBT: Nr. 11, 14, 16 und 24 prueften ihr Modul nur mit
// festen Beispiel-Eingaben ("2/2 Pruefungen bestanden"). Hier arbeiten sie an
// echten Daten, ohne neue Kosten (kein Modellaufruf, keine Websuche):
//
//   smart-router (16)              die ECHTE Weiche des Produkts (classifyProfile +
//                                  resolveModelRequest, wie src/server.js) mit den
//                                  Prompts der Kernsuite und der Live-Konfiguration
//   self-healing (11)              die Fehlererkennung ueber die echten Antworten der
//                                  letzten Messlaeufe Nr. 75 und Nr. 79
//   self-improvement (14)          die echten DPO-Paare der Trainings-Ablage
//   multi-file-repo-architect (24) fehlende Importpfade und Zyklen im Quelltext des
//                                  Containers, Ergebnis in der Ablage
//
// Ausgelagert aus autopilotLaeufer.js (800-Zeilen-Regel, der Laeufer darf nicht wachsen).
// Jede Funktion liefert {ok, meldung}; kaputte UND gesunde Probe in bausteinEhrlichkeit.test.js.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyProfile, resolveModelRequest, ROUTING_PROFILES } from "../llm/modelRouter.js";
import { createRecordStore } from "../admin/recordStore.js";
import { inspectResponseHealth, detectRepetitiveLoop } from "./selfHealingAutopilot.js";
import { evaluateResponseQuality } from "./selfImprovementAutopilot.js";
import { pruefeRepoImporte } from "./multiFileRepoArchitectAutopilot.js";
import { ABLAGE_ID as MESS_ABLAGE_ID } from "./brueckenMesslauf.js";
import { laufSelfImprovement as bewerterProbe } from "./autopilotSelbsttests.js";

const WURZEL = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export const KERNSUITE = path.join(WURZEL, "evals/suites/smejj-chat-core-v1.json");

const kurz = (f) => String(f?.message || f).slice(0, 80);

// ---------------------------------------------------------------------------
// Nr. 16 Weichensteller
// ---------------------------------------------------------------------------

/** Die anonymisierten Pruef-Prompts der Kernsuite samt dort hinterlegtem Profil. */
export function ladeSuiteFaelle(datei = KERNSUITE) {
  const suite = JSON.parse(readFileSync(datei, "utf8"));
  return (suite.cases || [])
    .filter((c) => typeof c?.prompt === "string" && c.prompt.trim())
    .map((c) => ({ id: String(c.id || "?"), prompt: c.prompt, profil: c.profile || "" }));
}

/**
 * Stellt die Weiche so, wie der Chat des Produkts sie stellt (src/server.js:
 * classifyProfile(prompt) -> resolveModelRequest(profil, "", env)). ROT, wenn ein
 * Profil entsteht, das der Router nicht kennt, oder wenn ein erreichtes Profil mit
 * der Live-Konfiguration KEIN Modell hat — der Chat antwortete dann fail-closed.
 * Es wird kein Modell aufgerufen.
 */
export function laufSmartRouter({ env = process.env, faelleLader = ladeSuiteFaelle, klassifiziere = classifyProfile, kette = resolveModelRequest } = {}) {
  let faelle;
  try { faelle = faelleLader(); } catch (f) { return { ok: false, meldung: `Kernsuite nicht lesbar — Weichen-Pruefung ohne Aussage (${kurz(f)})` }; }
  if (!faelle?.length) return { ok: false, meldung: "Kernsuite ohne Prompts — Weichen-Pruefung ohne Aussage" };

  const jeProfil = new Map();
  const ungueltig = [];
  let wieSuite = 0;
  for (const fall of faelle) {
    const profil = klassifiziere(fall.prompt);
    if (!ROUTING_PROFILES.includes(profil)) { ungueltig.push(`${fall.id} -> ${profil}`); continue; }
    if (profil === fall.profil) wieSuite++;
    if (!jeProfil.has(profil)) jeProfil.set(profil, []);
    jeProfil.get(profil).push(fall.id);
  }
  if (ungueltig.length) {
    return { ok: false, meldung: `Weiche bildet unbekannte Profile: ${ungueltig.slice(0, 3).join(", ")} (erlaubt: ${ROUTING_PROFILES.join("/")})` };
  }

  const ohneModell = [];
  const erstesGlied = [];
  for (const [profil, ids] of jeProfil) {
    let glieder = [];
    try { glieder = kette(profil, "", env)?.chain || []; } catch (f) { return { ok: false, meldung: `Router warf bei Profil ${profil}: ${kurz(f)}` }; }
    if (!glieder.length) ohneModell.push(`${profil} (${ids.length} Fragen, z. B. ${ids[0]})`);
    else erstesGlied.push(`${profil} ${ids.length}→${glieder[0].name || "?"}/${glieder[0].model || "?"}`);
  }
  if (ohneModell.length) {
    return { ok: false, meldung: `Chat-Weiche ohne Modell: ${ohneModell.join("; ")} — resolveModelRequest liefert eine leere Kette, der Chat antwortete fail-closed` };
  }
  return {
    ok: true,
    meldung: `Echte Weiche mit ${faelle.length} Kernsuite-Prompts gestellt: ${erstesGlied.join(", ")}; `
      + `${wieSuite}/${faelle.length} im selben Profil wie in der Suite hinterlegt. Kein Modell aufgerufen; `
      + "der alte Regex-Router (routePrompt) wird im Produkt nirgends genutzt"
  };
}

// ---------------------------------------------------------------------------
// Nr. 11 Selbstheilung (Fehlererkennung)
// ---------------------------------------------------------------------------

export const MESS_ABLAGEN = Object.freeze([
  { kennung: "tiefe-spur-messung", nummer: "75" },
  { kennung: "red-team-probe", nummer: "79" }
]);

/** Die beurteilbaren Antworttexte eines abgelegten Messlaufs. */
export function antwortProbenAus(stand, nummer = "?") {
  const proben = [];
  let leer = 0;
  for (const fall of Array.isArray(stand?.faelle) ? stand.faelle : []) {
    if (fall?.fehler === "empty_response") { leer++; continue; }
    if (fall?.status === "error") continue;
    const anfang = fall?.antwort?.anfang ?? fall?.beleg?.auszug;
    if (typeof anfang !== "string") continue;
    proben.push({ id: `${nummer}/${fall.id}`, anfang, ende: fall?.antwort?.ende || "", bestanden: fall.status === "passed" });
  }
  return { proben, leer };
}

/** Beurteilt echte Antworten mit der Fehlererkennung des Moduls. Getrennt testbar. */
export function beurteileEchteAntworten(proben = []) {
  const ungesund = [];
  for (const p of proben) {
    const befund = inspectResponseHealth(p.anfang);
    const grund = !befund.healthy ? befund.reason : (p.ende && detectRepetitiveLoop(p.ende) ? "Endlosschleife am Antwortende" : null);
    if (grund) ungesund.push({ id: p.id, grund, bestanden: p.bestanden });
  }
  return { geprueft: proben.length, ungesund };
}

export async function laufSelfHealing({ env = process.env, storeFabrik = createRecordStore, ablagen = MESS_ABLAGEN, jetztMs = Date.now() } = {}) {
  const proben = [];
  const staende = [];
  let leer = 0;
  for (const a of ablagen) {
    let stand = null;
    try { stand = await storeFabrik(`autopiloten/${a.kennung}`, { maximal: 10 }).lies(MESS_ABLAGE_ID, { env }); } catch { stand = null; }
    if (!stand) continue;
    const alterH = Math.max(0, Math.round((jetztMs - Date.parse(stand.createdAt || 0)) / 3_600_000));
    staende.push(`Nr. ${a.nummer} vor ${Number.isFinite(alterH) ? alterH : "?"} h`);
    const aus = antwortProbenAus(stand, a.nummer);
    proben.push(...aus.proben);
    leer += aus.leer;
  }
  if (!staende.length) {
    return { ok: false, meldung: "Keine Messlauf-Ablage lesbar (Nr. 75/79) — Fehlererkennung ohne echte Antworten, keine Aussage" };
  }
  const leerHinweis = leer ? `; ${leer} leere Antwort(en), dort schon als nicht messbar gezaehlt` : "";
  if (!proben.length) {
    return { ok: true, meldung: `Messlaeufe gelesen (${staende.join(", ")}), aber noch ohne Antworttext — Auszuege legt erst der naechste Messlauf ab${leerHinweis}` };
  }
  const { geprueft, ungesund } = beurteileEchteAntworten(proben);
  if (ungesund.length) {
    const u = ungesund[0];
    return {
      ok: false,
      meldung: `${ungesund.length} von ${geprueft} echten Antworten ungesund — ${u.id}: ${u.grund}`
        + `${u.bestanden ? " (die Messung gab bestanden: Fehlalarm des Erkenners pruefen)" : ""}${leerHinweis}`
    };
  }
  return { ok: true, meldung: `${geprueft} echte Antworten der Messlaeufe (${staende.join(", ")}) beurteilt: keine leer, keine Endlosschleife${leerHinweis}. Repariert wird nichts — executeWithSelfHealing ist im Produkt nicht verdrahtet` };
}

// ---------------------------------------------------------------------------
// Nr. 14 Selbst-Verbesserer (DPO-Paare)
// ---------------------------------------------------------------------------

/** Warum ein Paar fuers Training nicht taugt — null, wenn es taugt. */
export function dpoMangel(paar) {
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  if (!text(paar?.prompt)) return "Prompt leer";
  if (!text(paar?.chosen)) return "chosen leer";
  if (!text(paar?.rejected)) return "rejected leer";
  if (text(paar.chosen) === text(paar.rejected)) return "chosen gleich rejected";
  return null;
}

export async function laufSelfImprovement({ env = process.env, storeFabrik = createRecordStore, limit = 100 } = {}) {
  const probe = bewerterProbe();
  if (!probe.ok) return probe;
  let liste;
  try { liste = await storeFabrik("self-improvement/dpo-dataset", { maximal: limit }).liste({ env, limit }); } catch (f) { liste = { ok: false, error: kurz(f) }; }
  if (!liste?.ok) return { ok: false, meldung: `Bewerter-Probe bestanden, aber DPO-Ablage nicht lesbar${liste?.error ? ` (${liste.error})` : ""}` };
  const paare = liste.datensaetze || [];
  if (!paare.length) return { ok: true, meldung: "Bewerter-Probe bestanden; DPO-Ablage gelesen, 0 echte Paare — nichts zu pruefen (Paare entstehen nur aus Daumen-Paaren)" };

  const untauglich = [];
  let einig = 0;
  for (const paar of paare) {
    const mangel = dpoMangel(paar);
    if (mangel) { untauglich.push({ id: paar.id, mangel, quelle: paar?.context?.source || "ohne Quelle" }); continue; }
    if (evaluateResponseQuality(paar.prompt, paar.chosen).score >= evaluateResponseQuality(paar.prompt, paar.rejected).score) einig++;
  }
  if (untauglich.length) {
    const u = untauglich[0];
    return { ok: false, meldung: `${untauglich.length} von ${paare.length} echten DPO-Paaren untauglich fuers Training — ${u.id}: ${u.mangel} (Quelle ${u.quelle})` };
  }
  return { ok: true, meldung: `${paare.length} echte DPO-Paare geprueft, alle tauglich; der Bewerter stimmt bei ${einig}/${paare.length} mit der Nutzerwahl ueberein` };
}

// ---------------------------------------------------------------------------
// Nr. 24 Repo-Architekt
// ---------------------------------------------------------------------------

const imAbbild = (relativ) => { try { return statSync(path.join(WURZEL, relativ)).isFile(); } catch { return false; } };

export async function laufRepoArchitect(dateien = [], { existiert = imAbbild, ablage = null, env = process.env } = {}) {
  if (!dateien.length) return { ok: false, meldung: "Kein Quelltext geladen — Architekturpruefung ohne Aussage" };
  const bericht = pruefeRepoImporte(dateien, { existiert });
  const ok = bericht.fehlend.length === 0;
  const zyklen = bericht.zyklen.length
    ? `${bericht.zyklen.length} Import-Zyklus/Zyklen (z. B. ${bericht.zyklen[0].map((p) => path.basename(p)).join(" ↔ ")})`
    : "keine Import-Zyklen";
  let abgelegt = true;
  try {
    await (ablage || createRecordStore("autopiloten/multi-file-repo-architect", { maximal: 10 })).schreib({
      id: "letzter-lauf", createdAt: new Date().toISOString(), ok, dateien: bericht.dateien, importe: bericht.importe,
      fehlend: bericht.fehlend.slice(0, 50), zyklen: bericht.zyklen.slice(0, 20)
    }, { env, timeoutMs: 5000 });
  } catch { abgelegt = false; }
  const nachsatz = abgelegt ? "" : " (Ergebnis nicht abgelegt)";
  if (!ok) {
    return { ok: false, meldung: `${bericht.fehlend.length} Importpfad(e) fehlen im Abbild — ${bericht.fehlend.slice(0, 2).join("; ")}; ${zyklen}${nachsatz}` };
  }
  return { ok: true, meldung: `${bericht.dateien} Dateien, ${bericht.importe} relative Importe: alle im Abbild vorhanden; ${zyklen}${nachsatz}` };
}
