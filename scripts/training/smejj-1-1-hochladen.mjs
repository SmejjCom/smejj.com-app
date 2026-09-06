// smejj.com — Datensatz smejj-1-1 nach IDrive e2 legen.
//
// Getrennt vom Bauen, damit das Bauen ohne Netz und ohne Zugangsdaten laufen
// und getestet werden kann. Geschrieben wird NUR unter datasets/smejj-1-1/;
// nichts wird geloescht, nichts ausserhalb angefasst.
import { e2KonfigAusEnv, e2Client } from "../../workers/con-autopilot/e2.js";

export const PRAEFIX = "datasets/smejj-1-1";
export const INDEX_KEY = "datasets/index.json";

/**
 * Legt train.jsonl und manifest.json ab und traegt den Datensatz in den Index.
 * @param {{text: string, manifest: object, env?: object, client?: object}} eingabe
 */
// TEILE STATT EINER GROSSEN DATEI (Befund 2026-09-04): Der geprüfte
// S3-Signierer deckelt jedes Zeitbudget hart bei 30 s
// (s3Signer.js#requestTimeoutSignal, boundedNumber(..., 30_000)) — was der
// Aufrufer übergibt, ist egal. 3,8 MB brauchen auf der Leitung des Betreibers
// (gemessen 1,5 Mbit/s) rund 20 s netto und liefen zweimal in die
// Zeitüberschreitung. Teile à 1.500 Paare (~550 KB) laden zuverlässig, sind
// einzeln wiederholbar und folgen derselben Regel wie der pdf.js-Worker im
// Repo: was zu gross am Stück ist, wird geteilt.
export const PAARE_JE_TEIL = 1500;

/** Zerlegt JSONL in Teile mit höchstens `proTeil` Zeilen. */
export function teile(text, proTeil = PAARE_JE_TEIL) {
  const zeilen = String(text).split("\n").filter((z) => z.trim());
  const out = [];
  for (let i = 0; i < zeilen.length; i += proTeil) out.push(zeilen.slice(i, i + proTeil).join("\n") + "\n");
  return out;
}

export async function ladeHoch({ text, manifest, env = process.env, client = null, praefix = PRAEFIX }) {
  // 3,8 MB ueber die Leitung des Betreibers (gemessen 1,5 Mbit/s) sind rund
  // 20 s reine Uebertragung — der Standard von 30 s reicht dafuer nicht
  // zuverlaessig. Hier gesetzt statt im con-Client: der gehoert dem
  // con-Autopiloten, und fremder Code wird nicht nebenbei umgestellt.
  const e2 = client || e2Client(e2KonfigAusEnv(env), { timeoutMs: 300_000 });
  // Der Trainings-Job erwartet EINE train.jsonl (job.py: "train.jsonl fehlt").
  // Sie ist 5,9 MB gross und laeuft auf der Leitung des Betreibers in den
  // 30-s-Deckel des Signierers. Der Deckel sitzt in requestTimeoutSignal() und
  // ist von aussen nicht zu heben — wohl aber zu umgehen, ohne fremden Code
  // anzufassen: fetchImpl ist parametrierbar, und ein eigenes fetchImpl kann
  // das mitgelieferte AbortSignal einfach weglassen. Der Deckel bleibt fuer
  // alle anderen Aufrufe unveraendert.
  const ohneZeitdeckel = (url, init = {}) => {
    const { signal, ...rest } = init;
    return fetch(url, { ...rest, signal: AbortSignal.timeout(600_000) });
  };
  const e2Gross = client || e2Client(e2KonfigAusEnv(env), { fetchImpl: ohneZeitdeckel, timeoutMs: 600_000 });
  await e2Gross.putText(`${praefix}/train.jsonl`, text, "application/x-ndjson");
  console.log(`  train.jsonl (${Math.round(Buffer.byteLength(text) / 1024)} KB, fuer den Trainings-Job)`);

  const stuecke = teile(text);
  const dateien = [];
  for (let i = 0; i < stuecke.length; i += 1) {
    const name = `train-${String(i + 1).padStart(3, "0")}.jsonl`;
    await e2.putText(`${praefix}/${name}`, stuecke[i], "application/x-ndjson");
    dateien.push({ name, zeilen: stuecke[i].split("\n").filter((z) => z.trim()).length, bytes: Buffer.byteLength(stuecke[i]) });
    console.log(`  ${name} (${dateien[i].zeilen} Paare, ${Math.round(dateien[i].bytes / 1024)} KB)`);
  }
  await e2.putJson(`${praefix}/manifest.json`, { ...manifest, dateien, teileJe: PAARE_JE_TEIL });
  // Der Index ist die Liste, die eine Wache lesen kann, ohne den ganzen
  // Datensatz zu holen. Bestehende Eintraege bleiben stehen.
  const index = (await e2.getJson(INDEX_KEY, null)) || { schemaVersion: 1, datensaetze: [] };
  index.datensaetze = (index.datensaetze || []).filter((d) => d.name !== manifest.name);
  index.datensaetze.push({
    name: manifest.name, praefix, paare: manifest.paare, kategorien: manifest.kategorien,
    sha256: manifest.sha256, erzeugtAm: manifest.erzeugtAm, quelle: manifest.quelle, freigegeben: true
  });
  index.aktualisiertAm = new Date().toISOString();
  await e2.putJson(INDEX_KEY, index);
  console.log(`hochgeladen: ${dateien.length} Teile (${manifest.paare} Paare), manifest.json, ${INDEX_KEY}`);
  return { ok: true, praefix, paare: manifest.paare, teile: dateien.length };
}
