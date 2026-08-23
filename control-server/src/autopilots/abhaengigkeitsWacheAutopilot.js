// smejj.com — Abhängigkeits-Wache (Autopilot Nr. 54): fragt einmal täglich
// die OSV-Datenbank (osv.dev), ob eine der WIRKLICH installierten
// Abhängigkeiten eine bekannte Schwachstelle trägt.
//
// Der lokale CVE-Wächter (npm run check:cve) läuft nur, wenn jemand ihn
// startet — dieser hier läuft im Takt des Dienstes, gegen die package-lock
// des Containers, der gerade antwortet.
//
// ZWEI LEHREN aus dem lokalen Wächter stecken drin:
// 1. DEDUPLIZIEREN: osv.dev nennt dieselbe Schwachstelle je Version einmal —
//    gezählt wird je Kennung (GHSA-…), sonst verdoppeln sich die Zahlen
//    (Modul-Gedächtnis "CVE-Wächter zählt doppelt").
// 2. Der Bestand wird in der Ablage gehalten: zwischen zwei Tagesabfragen
//    meldet die Ampel den gemessenen Stand, nie einen Pauschaltext.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordStore } from "../admin/recordStore.js";

const WURZEL = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OSV_URL = "https://api.osv.dev/v1/querybatch";
const ABFRAGE_ABSTAND_MS = 24 * 60 * 60 * 1000;
const ABLAGE_ID = "cve-stand";

let ablageStandard = null;
function holeAblage(ablage) {
  if (ablage) return ablage;
  if (!ablageStandard) ablageStandard = createRecordStore("sicherheit/abhaengigkeiten", { maximal: 10 });
  return ablageStandard;
}

/**
 * Liest die installierten Pakete aus einer package-lock (v2/v3-Format).
 * Getrennt testbar.
 * @returns {Array<{name: string, version: string}>}
 */
export function lesePaketeAusLock(lockInhalt) {
  let lock;
  try { lock = JSON.parse(String(lockInhalt || "")); } catch { return []; }
  const pakete = [];
  const gesehen = new Set();
  for (const [pfad, info] of Object.entries(lock?.packages || {})) {
    if (!pfad.startsWith("node_modules/")) continue;
    const name = pfad.replace(/^.*node_modules\//, "");
    const version = String(info?.version || "");
    const kennung = `${name}@${version}`;
    if (!name || !version || gesehen.has(kennung)) continue;
    gesehen.add(kennung);
    pakete.push({ name, version });
  }
  return pakete;
}

/**
 * Dedupliziert OSV-Antworten auf eindeutige Schwachstellen-Kennungen.
 * Getrennt testbar — genau hier saß der Doppelzähl-Fehler des lokalen Wächters.
 * @param {Array<{vulns?: Array<{id: string}>}>} ergebnisse je Paket
 */
export function eindeutigeSchwachstellen(ergebnisse = []) {
  const kennungen = new Set();
  const betroffene = new Set();
  ergebnisse.forEach((ergebnis, i) => {
    for (const v of ergebnis?.vulns || []) {
      if (v?.id) { kennungen.add(v.id); betroffene.add(i); }
    }
  });
  return { schwachstellen: [...kennungen], betroffenePakete: betroffene.size };
}

/** Selbsttest: Doppelnennungen MÜSSEN zusammenfallen, saubere Antworten leer bleiben. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = eindeutigeSchwachstellen([
    { vulns: [{ id: "GHSA-aaaa" }, { id: "GHSA-bbbb" }] },
    { vulns: [{ id: "GHSA-aaaa" }] },
    {}
  ]);
  if (kaputt.schwachstellen.length !== 2) fehler.push(`Dedup: ${kaputt.schwachstellen.length} statt 2 eindeutige Kennungen`);
  if (kaputt.betroffenePakete !== 2) fehler.push(`Betroffene: ${kaputt.betroffenePakete} statt 2 Pakete`);
  const gesund = eindeutigeSchwachstellen([{}, { vulns: [] }]);
  if (gesund.schwachstellen.length !== 0) fehler.push("saubere Antworten erzeugen fälschlich Funde");
  const pakete = lesePaketeAusLock(JSON.stringify({
    packages: { "": {}, "node_modules/beispiel": { version: "1.2.3" }, "node_modules/beispiel/node_modules/tief": { version: "0.1.0" } }
  }));
  if (pakete.length !== 2) fehler.push(`Lock-Leser: ${pakete.length} statt 2 Pakete`);
  return { bestanden: fehler.length === 0, fehler };
}

/** Fragt osv.dev in Blöcken zu je 90 Paketen. */
export async function frageOsv(pakete, { fetchImpl = fetch } = {}) {
  const ergebnisse = [];
  for (let i = 0; i < pakete.length; i += 90) {
    const block = pakete.slice(i, i + 90);
    const antwort = await fetchImpl(OSV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: block.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version }))
      }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!antwort.ok) throw new Error(`osv.dev antwortet HTTP ${antwort.status}`);
    const daten = await antwort.json();
    ergebnisse.push(...(daten?.results || []));
  }
  return ergebnisse;
}

/**
 * Der Lauf im Takt: Selbsttest, dann täglich die echte Abfrage; dazwischen
 * der gemessene Stand aus der Ablage.
 */
export async function laufAbhaengigkeitsWache({ mitNetz = true, ablage = null, fetchImpl = fetch, jetztMs = Date.now(), lockLeser = () => readFileSync(path.join(WURZEL, "package-lock.json"), "utf8") } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Abhängigkeits-Wache besteht den Selbsttest nicht: ${probe.fehler.join("; ")}` };
  }
  const speicher = holeAblage(ablage);
  let stand = null;
  try { stand = await speicher.lies(ABLAGE_ID); } catch { /* unten neu gemessen */ }
  const standAlterMs = stand ? jetztMs - Date.parse(stand.createdAt || 0) : Infinity;

  if (Number.isFinite(standAlterMs) && standAlterMs < ABFRAGE_ABSTAND_MS && stand) {
    const stunden = Math.round(standAlterMs / 3_600_000);
    if (stand.schwachstellen > 0) {
      return { ok: false, meldung: `${stand.schwachstellen} bekannte Schwachstelle(n) in ${stand.betroffenePakete} Paket(en) — Stand vor ${stunden} h, z. B. ${String(stand.beispiel || "").slice(0, 40)}` };
    }
    return { ok: true, meldung: `Abfrage aktuell (vor ${stunden} h): ${stand.pakete} Pakete geprüft, keine bekannte Schwachstelle` };
  }
  if (!mitNetz) {
    return { ok: true, meldung: "Abfrage fällig — läuft im nächsten Netz-Takt" };
  }

  let lockInhalt;
  try { lockInhalt = lockLeser(); } catch {
    return { ok: false, meldung: "package-lock.json im Container nicht lesbar — Abhängigkeiten nicht prüfbar" };
  }
  const pakete = lesePaketeAusLock(lockInhalt);
  if (!pakete.length) {
    return { ok: false, meldung: "package-lock.json enthält keine Pakete — Leseweg prüfen" };
  }
  let ergebnisse;
  try {
    ergebnisse = await frageOsv(pakete, { fetchImpl });
  } catch (f) {
    return { ok: false, meldung: `osv.dev nicht abfragbar: ${String(f?.message || f).slice(0, 80)}` };
  }
  const { schwachstellen, betroffenePakete } = eindeutigeSchwachstellen(ergebnisse);
  try {
    await speicher.schreib({
      id: ABLAGE_ID,
      createdAt: new Date(jetztMs).toISOString(),
      pakete: pakete.length,
      schwachstellen: schwachstellen.length,
      betroffenePakete,
      beispiel: schwachstellen[0] || ""
    });
  } catch { /* die Meldung unten trägt die Zahlen auch ohne Ablage */ }
  if (schwachstellen.length) {
    return { ok: false, meldung: `${schwachstellen.length} bekannte Schwachstelle(n) in ${betroffenePakete} von ${pakete.length} Paketen — z. B. ${schwachstellen[0]}` };
  }
  return { ok: true, meldung: `${pakete.length} installierte Pakete gegen osv.dev geprüft — keine bekannte Schwachstelle` };
}
