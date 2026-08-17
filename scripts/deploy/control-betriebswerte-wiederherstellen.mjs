#!/usr/bin/env node
// smejj.com — die Betriebswerte wiederherstellen, ohne die smejj-control
// fail-closed dichtmacht.
//
// BEFUND 2026-08-17: Der Dienst smejj-control trug nur noch 35 Umgebungswerte
// (am 2026-08-14 waren es 101). Der Verlust fiel niemandem auf, weil jede
// fehlende Variable AN EINER ANDEREN STELLE einen anderen Fehler ausloest:
//   fehlte SMEJJ_WORKER_BUDGET_USD          -> Maus-Lauf: "budget_gate_blockiert"
//   fehlte PRESIGN_HARD_LIMIT_ALLOWED       -> Artefakt-Abruf: "rate_limit_not_enabled"
// Beides sah nach einem Fehler im jeweiligen Fachgebiet aus. Erst zusammen
// ergaben sie das Bild: nicht die Maus war kaputt, sondern ihre Umgebung.
//
// HIER STEHEN AUSSCHLIESSLICH WERTE, DIE KEINE GEHEIMNISSE SIND — Kostendeckel
// und Schalter. Schluessel und Token gehoeren NICHT in diese Datei; dafuer gibt
// es scripts/deploy/maus-token-angleichen.mjs, das Werte nur zwischen Diensten
// kopiert, ohne sie je auszugeben.
//
// Aufruf:  CONFIRM_CONTROL_BETRIEBSWERTE=JA node scripts/deploy/control-betriebswerte-wiederherstellen.mjs
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";
import { findeDienst, setzeUmgebungswerte, starteDienstNeu } from "./zeabur-umgebung-setzen.mjs";

const CONTROL = "smejj-control";
const ENGINE = "ghcriosmejjcomsmejj-maus-enginev1";

// DER FREIE MODUS (2026-08-17): Die Maus kann Schritt fuer Schritt arbeiten —
// hinsehen, entscheiden, handeln — statt einen starren Plan abzuspulen. Genau
// so arbeiten die Browser-Agenten von Claude und OpenAI. Der Code dafuer liegt
// seit dem 2026-07-15 fertig in workers/maus-engine/loop-runner.mjs.
//
// Gefehlt hat EIN Wert: die Adresse, unter der die Engine den Planer erreicht.
// Ohne ihn lehnt sie fail-closed ab ("loop_planner_nicht_konfiguriert"), und
// der freie Modus war damit unerreichbar, obwohl vollstaendig gebaut.
//
// Die Engine ruft NIE selbst ein Modell. Sie fragt den Planer-Proxy des
// Control Servers und weist sich mit dem Token aus, das sie ohnehin hat —
// deshalb ist diese Adresse kein Geheimnis, sondern eine Wegbeschreibung.
export const ENGINE_BETRIEBSWERTE = Object.freeze({
  SMEJJ_MAUS_PLANNER_URL: "https://smejj-control.zeabur.app/api/maus/run"
});

export const BETRIEBSWERTE = Object.freeze({
  // Budget-Gate (control-server/src/budget/budgetGate.js). Werte wie am
  // 2026-07-14 abgenommen, dokumentiert in docs/memory/MEMORY_ARCHIV_2026-07-B.md.
  SMEJJ_WORKER_BUDGET_USD: "0.05",
  SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "6",
  // Presign-Gate (gatekeeper/quota.js). PRESIGN_REMAINING wird NIRGENDS
  // heruntergezaehlt — im ganzen Quelltext gibt es nur Lesezugriffe. Es ist
  // also kein Restguthaben, sondern ein Schalter mit Zahlenform; ein hoher
  // Wert bedeutet "erlaubt", 0 bedeutet "gesperrt". Der eigentliche Schutz
  // sind die Praefix-Erlaubnisliste und die Adminpflicht in
  // storagePresignRoutes.js.
  PRESIGN_HARD_LIMIT_ALLOWED: "true",
  PRESIGN_REMAINING: "100000"
});

// Werte, die unter einer Obergrenze liegen muessen: { wert: obergrenze }.
const DECKEL = Object.freeze({
  SMEJJ_WORKER_BUDGET_USD: "SMEJJ_BUDGET_MAX_USD_PER_JOB",
  SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "SMEJJ_BUDGET_MAX_RUNTIME_MINUTES"
});

/** Liest alle Umgebungswerte eines Dienstes als Map. Gibt nie Geheimnisse aus. */
export async function leseUmgebung(dienstName, abfrage = zeaburAbfrage) {
  const dienst = await findeDienst(dienstName, abfrage);
  const daten = await abfrage(
    `query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key value } } }`,
    { s: dienst.serviceId, e: dienst.environmentId }
  );
  const map = new Map();
  for (const v of daten?.service?.variables || []) map.set(v.key, v.value);
  return map;
}

/**
 * Prueft die gedeckelten Werte gegen die Plattform-Obergrenzen.
 * Fail-closed: fehlt eine Obergrenze, wird NICHT geschrieben — sonst setzte man
 * einen Kostendeckel gegen einen unbekannten Rahmen.
 */
export function pruefeGegenObergrenzen(umgebung, werte = BETRIEBSWERTE) {
  const fehler = [];
  for (const [wertName, deckelName] of Object.entries(DECKEL)) {
    if (werte[wertName] === undefined) continue;
    const deckel = Number(umgebung.get(deckelName));
    if (!Number.isFinite(deckel) || deckel <= 0) {
      fehler.push(`${deckelName} fehlt oder ist nicht positiv`);
      continue;
    }
    if (Number(werte[wertName]) > deckel) {
      fehler.push(`${wertName}=${werte[wertName]} ueberschreitet ${deckelName}=${deckel}`);
    }
  }
  return { ok: fehler.length === 0, fehler };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  if (process.env.CONFIRM_CONTROL_BETRIEBSWERTE !== "JA") {
    console.error("Abbruch: CONFIRM_CONTROL_BETRIEBSWERTE=JA fehlt. Dieser Lauf aendert eine Produktions-Umgebung.");
    process.exit(1);
  }

  const vorher = await leseUmgebung(CONTROL);
  console.log(`${CONTROL}: ${vorher.size} Umgebungswerte`);

  const pruefung = pruefeGegenObergrenzen(vorher);
  if (!pruefung.ok) {
    console.error(`Abbruch: ${pruefung.fehler.join("; ")} — nichts geschrieben.`);
    process.exit(1);
  }

  // Nur Fehlendes ergaenzen. Ein vorhandener Wert kann bewusst abweichen —
  // ihn zu ueberschreiben waere eine Aenderung, keine Wiederherstellung.
  const fehlend = Object.fromEntries(
    Object.entries(BETRIEBSWERTE).filter(([k]) => !vorher.get(k))
  );
  if (!Object.keys(fehlend).length) {
    console.log("Alle Betriebswerte sind gesetzt — nichts zu tun.");
    process.exit(0);
  }

  await setzeUmgebungswerte(CONTROL, fehlend);
  const nachher = await leseUmgebung(CONTROL);
  for (const [k, w] of Object.entries(fehlend)) {
    if (nachher.get(k) !== w) {
      console.error(`Abbruch: ${k} zurueckgelesen "${nachher.get(k)}" statt "${w}".`);
      process.exit(1);
    }
    console.log(`${k} = ${w} (zurueckgelesen)`);
  }

  await starteDienstNeu(CONTROL);
  console.log(`${CONTROL} neu gestartet (${nachher.size} Werte).`);

  // Zweiter Dienst: die Maus-Engine. Getrennt behandelt, weil ein Fehlschlag
  // hier den Control-Teil oben nicht rueckgaengig machen soll.
  const engineVorher = await leseUmgebung(ENGINE);
  const engineFehlend = Object.fromEntries(
    Object.entries(ENGINE_BETRIEBSWERTE).filter(([k]) => !engineVorher.get(k))
  );
  if (!Object.keys(engineFehlend).length) {
    console.log(`${ENGINE}: alle Werte gesetzt — nichts zu tun.`);
    process.exit(0);
  }
  await setzeUmgebungswerte(ENGINE, engineFehlend);
  const engineNachher = await leseUmgebung(ENGINE);
  for (const [k, w] of Object.entries(engineFehlend)) {
    if (engineNachher.get(k) !== w) {
      console.error(`Abbruch: ${k} zurueckgelesen "${engineNachher.get(k)}" statt "${w}".`);
      process.exit(1);
    }
    console.log(`${ENGINE}: ${k} = ${w} (zurueckgelesen)`);
  }
  await starteDienstNeu(ENGINE);
  console.log(`${ENGINE} neu gestartet — der freie Modus (mode:"interaktiv") sollte jetzt anlaufen.`);
}
