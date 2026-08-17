#!/usr/bin/env node
// smejj.com — smejj-control WIRKLICH neu bauen (aus dem Git-Stand), nicht nur
// neu starten.
//
// DER UNTERSCHIED, DER SCHON ZEIT GEKOSTET HAT:
//   redeployService(serviceID, environmentID)  -> startet das ALTE Abbild neu.
//                                                 Neuer Code kommt NICHT mit.
//   deploy(serviceID, environmentID, gitRef)   -> baut aus dem angegebenen
//                                                 Branch neu. Nur das rollt aus.
// Wer den ersten Weg nimmt und "deployt" sagt, misst danach den alten Code und
// wundert sich, dass die Aenderung nicht wirkt.
//
// UND: Der Control-Server baut aus `feature/auth-redesign-github-magiclink`,
// NICHT aus `main` und nicht aus dem jeweiligen Arbeitsbranch. Ein Push nach
// main wird nie gebaut ([[smejj-zeabur-baut-main]] ist genau dazu die Notiz).
// Deshalb steht der Branch hier als Vorgabe und muss bewusst ueberschrieben
// werden.
//
// Aufruf:
//   CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs [branch]
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";
import { findeDienst } from "./zeabur-umgebung-setzen.mjs";

const DIENST = "smejj-control";
const REPO_ID = 1270642167; // SmejjCom/smejj.com-app
const STANDARD_BRANCH = "feature/auth-redesign-github-magiclink";

/** Liest den Startzeitpunkt des laufenden Prozesses — der Beweis fuer "neu". */
export async function gestartetAm(basis = "https://smejj-control.zeabur.app") {
  try {
    const antwort = await fetch(`${basis}/api/health`, { signal: AbortSignal.timeout(20_000) });
    const daten = await antwort.json();
    return String(daten?.gestartetAm || daten?.startedAt || "");
  } catch {
    return "";
  }
}

export async function baueNeu(branch = STANDARD_BRANCH, abfrage = zeaburAbfrage) {
  const dienst = await findeDienst(DIENST, abfrage);
  // `deploy` gibt ein Boolean zurueck — KEINE Feldauswahl anhaengen, sonst
  // antwortet Zeabur mit HTTP 422 (dieselbe Falle wie bei den Umgebungswerten:
  // bei 422 nicht die Anfrage raten, sondern das Schema fragen).
  const ergebnis = await abfrage(
    `mutation($s:ObjectID!,$e:ObjectID,$g:GitRef){ deploy(serviceID:$s, environmentID:$e, gitRef:$g) }`,
    { s: dienst.serviceId, e: dienst.environmentId, g: { repoID: REPO_ID, ref: branch } }
  );
  return { ok: ergebnis?.deploy === true, branch, serviceId: dienst.serviceId };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  if (process.env.CONFIRM_CONTROL_BAU !== "JA") {
    console.error("Abbruch: CONFIRM_CONTROL_BAU=JA fehlt. Dieser Lauf baut den Produktivserver neu.");
    process.exit(1);
  }
  const branch = process.argv[2] || STANDARD_BRANCH;
  const vorher = await gestartetAm();
  console.log(`Vorher gestartetAm: ${vorher || "(unbekannt)"}`);

  const ergebnis = await baueNeu(branch);
  if (!ergebnis.ok) {
    console.error("Abbruch: Zeabur hat den Bau nicht bestaetigt.");
    process.exit(1);
  }
  console.log(`Bau angestossen aus ${branch}.`);
  console.log("Es dauert real 4-6 Minuten, bis /api/health ein neues gestartetAm zeigt.");
  console.log("VORHER gemessene 200er kommen noch vom alten Prozess — nicht zu frueh Erfolg melden.");
  console.log(`Fertig ist es, wenn gestartetAm NICHT mehr ${vorher || "(der alte Wert)"} lautet.`);
}
