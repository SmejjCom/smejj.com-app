// smejj.com — schreibt public/verlauf-messwerte.json aus der Antwort von
// GET /verlauf des Messdienstes.
//
// Warum ein Skript und kein automatischer Schreiber: der Messdienst hat
// absichtlich keine oeffentliche Adresse, und ein automatischer Schreiber
// braeuchte Zugangsdaten. Beides wurde bewusst vermieden. Der Weg ist deshalb:
// im Zeabur-Container `GET /verlauf` abrufen, die Antwort hierher geben.
//
// Aufruf (Antwort aus der Zwischenablage oder Datei):
//   pbpaste | node scripts/verlauf/aktualisiere-messwerte.mjs
//   node scripts/verlauf/aktualisiere-messwerte.mjs < verlauf.json
//
// Fail-closed: bei unerwarteter Eingabe wird NICHTS geschrieben. Eine kaputte
// Messwert-Datei waere schlimmer als eine veraltete — die Seite wuerde dann
// falsche Zahlen zeigen statt eines ehrlichen alten Standes.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ZIEL = path.join(WURZEL, "public/verlauf-messwerte.json");

/** Liest eine Messung aus dem Verlauf und laesst nur bekannte Felder durch. */
export function uebernehmeMessung(eintrag) {
  const zahl = (wert) => (Number.isFinite(Number(wert)) ? Number(wert) : null);
  const zeitpunkt = String(eintrag?.zeitpunkt || "");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(zeitpunkt)) return null;
  const punktzahl = zahl(eintrag?.punktzahl);
  if (punktzahl === null || punktzahl < 0 || punktzahl > 1) return null;
  return {
    zeitpunkt,
    punktzahl,
    faelle: zahl(eintrag?.faelle),
    bestanden: zahl(eintrag?.bestanden),
    nichtBestanden: zahl(eintrag?.nichtBestanden),
    kritischeFehler: zahl(eintrag?.kritischeFehler),
    p95Ms: zahl(eintrag?.p95Ms),
    medianMs: zahl(eintrag?.medianMs),
    urteil: String(eintrag?.urteil || "unbekannt"),
    abgelegt: eintrag?.abgelegt === true
  };
}

/**
 * Fuehrt vorhandene und neue Messungen zusammen. Bewusst zusammenfuehren statt
 * ersetzen: der Verlauf des Dienstes liegt im Arbeitsspeicher und beginnt bei
 * jedem Neubau bei Null — wuerde diese Datei ersetzt, ginge bei jedem Deploy
 * die ganze Geschichte verloren.
 */
export function fuegeZusammen(bestand, neu) {
  const nachZeit = new Map();
  for (const m of [...(bestand || []), ...(neu || [])]) {
    const sauber = uebernehmeMessung(m);
    if (sauber) nachZeit.set(sauber.zeitpunkt, sauber);
  }
  return [...nachZeit.values()].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt));
}

export function baueDatei(vorhanden, verlaufAntwort) {
  const neu = Array.isArray(verlaufAntwort?.verlauf) ? verlaufAntwort.verlauf : null;
  if (!neu) throw new Error("Eingabe enthaelt kein Feld 'verlauf' — nichts geschrieben.");
  const messungen = fuegeZusammen(vorhanden?.messungen, neu);
  if (messungen.length === 0) throw new Error("Keine gueltige Messung erkannt — nichts geschrieben.");
  return {
    ...vorhanden,
    schemaVersion: 1,
    kind: "smejj.com-qualitaetsverlauf",
    erzeugtAm: messungen[messungen.length - 1].zeitpunkt,
    messungen
  };
}

async function main() {
  const eingabe = await new Promise((loesen, ablehnen) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (teil) => { text += teil; });
    process.stdin.on("end", () => loesen(text));
    process.stdin.on("error", ablehnen);
  });
  const antwort = JSON.parse(eingabe);
  const vorhanden = JSON.parse(await readFile(ZIEL, "utf8").catch(() => "{}"));
  const datei = baueDatei(vorhanden, antwort);
  await writeFile(ZIEL, `${JSON.stringify(datei, null, 2)}\n`, "utf8");
  console.log(`verlauf-messwerte.json aktualisiert — ${datei.messungen.length} Messungen, Stand ${datei.erzeugtAm}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((fehler) => {
    console.error(`Abbruch: ${String(fehler?.message || fehler)}`);
    process.exitCode = 1;
  });
}
