// smejj.com — smejj-Versions-Takt (Autopilot Nr. 83), Betreiber-Auftrag
// 2026-09-05: "Wenn eine neue Version kommt, soll sie automatisch alles
// uebernehmen … alles ueber unsere Autopilots."
//
// WAS ER TUT (alle 30 Minuten, neustart-fest, ohne GPU, ohne Kosten):
//   1. Register lesen (e2 smejj/versionen/register) — fehlt es, beginnt ein leeres.
//   2. Neue Bewertungen lesen (e2 smejj/bewertungen/<jobId>, Status "neu";
//      schreibt das Mess-Skript scripts/training/smejj-1-1-messen.mjs).
//   3. Je Bewertung entscheiden (src/shared/smejjVersionen.js): Adapter besser
//      als Basis nackt, besser als bisherige stable um mehr als Rauschen, keine
//      kritischen Fehler → stable; sonst abgelehnt mit Gruenden. Nichts wird geloescht.
//   4. Live-Schalter: stable darf den Alias "smejj" nur tragen, wenn die Note
//      die Referenz der Live-Kette (Nr. 72/75) erreicht. Ist die Laufzeit des
//      eigenen Modells rot (modelRuntimeHealth), geht der Alias sofort AUS —
//      der Rueckweg dauert einen Takt, nicht einen Menschen.
//   5. Register schreiben und dem Router im Speicher geben (smejjAlias.js).
//
// WAS ER NICHT TUT: trainieren, messen, GPU mieten, Nr. 18 anfassen. Nr. 18
// (Release-Verwalter) bleibt, wie er ist — Nummern-Register ist eingefroren.
import { createRecordStore } from "../admin/recordStore.js";
import { getModelRuntimeHealthSnapshot } from "../llm/modelRuntimeHealth.js";
import { setzeSmejjRegister, smejjAliasZiel, SMEJJ_MODELL_ID, SMEJJ_VERSIONEN_ABLAGE, REGISTER_ID } from "../llm/smejjAlias.js";
import {
  entscheideBefoerderung, haengeUm, lehneAb, leeresRegister, liveTauglich, rolleZurueck, schalteLive, stableEintrag, STATUS
} from "../../../src/shared/smejjVersionen.js";

export const SMEJJ_BEWERTUNGEN_ABLAGE = "smejj/bewertungen";
export { SMEJJ_VERSIONEN_ABLAGE, REGISTER_ID };

/** Selbsttest nach Hausregel: kaputte UND gesunde Probe, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const gut = entscheideBefoerderung({ kandidat: { version: "v2", note: 0.9, kritisch: 0 }, stabil: { note: 0.8 }, basis: { note: 0.6 } });
  if (!gut.befoerdern) fehler.push(`besserer Kandidat wird abgelehnt (${gut.gruende.join(",")})`);
  const kritisch = entscheideBefoerderung({ kandidat: { version: "v2", note: 0.95, kritisch: 1 }, stabil: { note: 0.8 }, basis: { note: 0.6 } });
  if (kritisch.befoerdern) fehler.push("ein kritischer Sicherheitsfehler muss die Befoerderung sperren");
  const rauschen = entscheideBefoerderung({ kandidat: { version: "v2", note: 0.81, kritisch: 0 }, stabil: { note: 0.8 }, basis: { note: 0.6 } });
  if (rauschen.befoerdern) fehler.push("ein Punkt Vorsprung ist Rauschen, keine Befoerderung");
  const schlechterAlsBasis = entscheideBefoerderung({ kandidat: { version: "v1", note: 0.5, kritisch: 0 }, basis: { note: 0.6 } });
  if (schlechterAlsBasis.befoerdern) fehler.push("ein Adapter unter dem nackten Basismodell darf nicht stable werden");
  const ohneNote = entscheideBefoerderung({ kandidat: { version: "v1" } });
  if (ohneNote.befoerdern) fehler.push("ohne Note keine Befoerderung (fail-closed)");
  if (liveTauglich({ note: 0.95, referenzNote: 97 }).tauglich !== true) fehler.push("95 % erreicht Referenz 97 % innerhalb der Toleranz");
  if (liveTauglich({ note: 0.6, referenzNote: 97 }).tauglich !== false) fehler.push("60 % darf nicht live gegen Referenz 97 %");
  if (liveTauglich({ note: 0.99, referenzNote: null }).tauglich !== false) fehler.push("ohne Referenz kein Live");
  const reg = haengeUm(haengeUm(leeresRegister("2026-09-05T00:00:00Z"), { version: "v1", note: 0.7, referenzNote: 97 }), { version: "v2", note: 0.8, referenzNote: 97 });
  const rueck = rolleZurueck(reg, "Probe");
  if (rueck.register.stable !== "v1" || !rueck.zurueckgerollt) fehler.push("Rueckweg muss die ersetzte Version wieder stable machen");
  return { bestanden: fehler.length === 0, fehler, geprueft: 9 };
}

function alsBewertung(d) {
  return {
    id: d.id,
    version: String(d.version || ""),
    note: Number(d.kandidatNote ?? d.note),
    basisNote: Number.isFinite(Number(d.basisNote)) ? Number(d.basisNote) : null,
    kritisch: Number(d.kritisch || 0),
    faelle: Number(d.faelle || 0),
    jobId: d.jobId || d.id,
    adapterPrefix: d.adapterPrefix || null,
    referenzNote: Number.isFinite(Number(d.referenzNote)) ? Number(d.referenzNote) : null,
    createdAt: d.createdAt || ""
  };
}

/**
 * Der Lauf im Takt. GRUEN, solange Register und Bewertungen lesbar sind — eine
 * Ablehnung ist ein Ergebnis, kein Fehler. ROT bei unlesbarer Ablage oder
 * falsch beurteiltem Selbsttest.
 */
export async function laufSmejjVersionsTakt({
  env = process.env,
  storeFabrik = createRecordStore,
  gesundheit = getModelRuntimeHealthSnapshot,
  cacheSetzer = setzeSmejjRegister,
  jetztMs = Date.now()
} = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Versions-Takt beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  const jetztIso = new Date(jetztMs).toISOString();

  const registerAblage = storeFabrik(SMEJJ_VERSIONEN_ABLAGE, { maximal: 5 });
  let register;
  try { register = (await registerAblage.lies(REGISTER_ID)) || leeresRegister(jetztIso); } catch (f) {
    return { ok: false, meldung: `Versionsregister nicht lesbar: ${String(f?.message || f).slice(0, 80)}` };
  }
  const vorher = JSON.stringify(register);

  const bewertungsAblage = storeFabrik(SMEJJ_BEWERTUNGEN_ABLAGE, { maximal: 50 });
  let liste;
  try { liste = await bewertungsAblage.liste({ env, limit: 50 }); } catch (f) {
    return { ok: false, meldung: `Bewertungs-Ablage nicht lesbar: ${String(f?.message || f).slice(0, 80)}` };
  }
  if (liste && liste.ok === false) return { ok: false, meldung: `Bewertungs-Ablage nicht lesbar: ${liste.error || "ohne Grund"}` };
  const neue = (liste?.datensaetze || []).filter((d) => d && d.status === "neu").map(alsBewertung)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const entschieden = [];
  for (const b of neue) {
    const stabil = stableEintrag(register);
    const urteil = entscheideBefoerderung({ kandidat: b, stabil, basis: b.basisNote != null ? { note: b.basisNote } : null });
    if (urteil.befoerdern) { register = haengeUm(register, b, { jetztIso }); entschieden.push(`${b.version} → stable (${(b.note * 100).toFixed(1)} %${stabil ? `, +${(urteil.delta * 100).toFixed(1)}` : ""})`); }
    else { register = lehneAb(register, b, urteil.gruende, { jetztIso }); entschieden.push(`${b.version} abgelehnt (${urteil.gruende.join(", ")})`); }
    try { await bewertungsAblage.schreib({ ...(liste.datensaetze.find((d) => d.id === b.id) || { id: b.id }), status: urteil.befoerdern ? "befoerdert" : "abgelehnt", entschiedenAm: jetztIso, gruende: urteil.gruende }, { env, timeoutMs: 5000 }); } catch { /* Bewertung bleibt "neu" — naechster Takt entscheidet erneut, gleich */ }
  }

  // Rueckweg: rote Laufzeit nimmt dem Alias sofort das Live.
  let gesund = null;
  try { gesund = gesundheit()?.[SMEJJ_MODELL_ID] || null; } catch { gesund = null; }
  if (register.live && gesund && gesund.available === false) {
    register = schalteLive(register, false, `Laufzeit ${SMEJJ_MODELL_ID} rot: ${gesund.reason || "ohne Grund"}`, { jetztIso });
  } else if (register.stable && !register.live && gesund && gesund.available === true) {
    // Laufzeit wieder gruen: Live nur zurueck, wenn die Note die Referenz traegt.
    const s = stableEintrag(register);
    const lt = liveTauglich({ note: s?.note, referenzNote: s?.referenzNote ?? register.referenzNote });
    if (lt.tauglich && /Laufzeit .* rot/.test(register.liveGrund || "")) register = schalteLive(register, true, `Laufzeit wieder gruen — ${lt.grund}`, { jetztIso });
  }

  let ablageStatus = "Register unveraendert";
  if (JSON.stringify(register) !== vorher) {
    try { await registerAblage.schreib({ ...register, id: REGISTER_ID }, { env, timeoutMs: 5000 }); ablageStatus = "Register geschrieben"; } catch {
      ablageStatus = "Register NICHT geschrieben (Ablage gestoert)";
    }
  }
  cacheSetzer(register);
  const ziel = smejjAliasZiel(env, register);
  const stabil = stableEintrag(register);
  const versionenText = (register.versionen || []).map((v) => `${v.version}:${v.status}`).join(", ") || "keine";
  return {
    ok: true,
    meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; stable ${stabil ? `${stabil.version} (${(stabil.note * 100).toFixed(1)} %, ${stabil.kritisch} kritisch)` : "keine eigene Version"}; `
      + `Alias smejj ${ziel.live ? "LIVE" : "AUS"} — ${ziel.grund}; ${neue.length} neue Bewertung(en)${entschieden.length ? `: ${entschieden.join("; ")}` : ""}; `
      + `Versionen ${versionenText}; ${ablageStatus}`
  };
}
