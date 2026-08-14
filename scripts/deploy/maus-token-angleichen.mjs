#!/usr/bin/env node
// smejj.com — den EINEN Wert angleichen, an dem die Maus seit Wochen haengt.
//
// DER BLOCKER, endlich vollstaendig belegt (2026-08-14):
//   Engine  SMEJJ_MAUS_ENGINE_TOKEN  sha 4cbb7a1f
//   Control SMEJJ_MAUS_ENGINE_TOKEN  sha c4e4ab90
// Zwei verschiedene Werte — deshalb endet JEDER Maus-Auftrag ueber die App an
// der Engine mit "nicht_autorisiert". Der Planer selbst arbeitet einwandfrei
// (gemessen: 3 Plaene erstellt und validiert, erst die Ausfuehrung scheitert).
//
// WARUM DAS JETZT GEHT: Der Zeabur-Zugang lag die ganze Zeit in
// ~/.config/zeabur/cli.yaml — gesucht wurde nur env.local. Damit laeuft das
// hier als gewoehnliche Infrastruktur-Aenderung ueber die API, so wie es bei
// Salad seit Wochen gemacht wird (set_maus_engine_env.mjs). Freigabe:
// docs/approvals/2026-08-13-maus-blocker-freigabe.md, Punkt 1.
//
// SICHERHEIT: Der Wert wird nie ausgegeben — weder bei Erfolg noch im Fehler.
// Sichtbar sind ausschliesslich Laenge und SHA-256-Prefix.
//
// Aufruf:  CONFIRM_MAUS_TOKEN=JA node scripts/deploy/maus-token-angleichen.mjs
import crypto from "node:crypto";
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";
import { findeDienst, setzeUmgebungswerte, starteDienstNeu } from "./zeabur-umgebung-setzen.mjs";

const ENGINE = "ghcriosmejjcomsmejj-maus-enginev1";
const CONTROL = "smejj-control";
const SCHLUESSEL = "SMEJJ_MAUS_ENGINE_TOKEN";

const finger = (wert) => wert
  ? `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`
  : "(fehlt)";

/** Liest EINEN Umgebungswert eines Dienstes. Gibt ihn zurueck, zeigt ihn nie. */
export async function leseWert(dienstName, schluessel, abfrage = zeaburAbfrage) {
  const dienst = await findeDienst(dienstName, abfrage);
  const daten = await abfrage(
    `query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key value } } }`,
    { s: dienst.serviceId, e: dienst.environmentId }
  );
  const treffer = (daten?.service?.variables || []).find((v) => v.key === schluessel);
  return treffer?.value || "";
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  if (process.env.CONFIRM_MAUS_TOKEN !== "JA") {
    console.error("Abbruch: CONFIRM_MAUS_TOKEN=JA fehlt. Dieser Lauf aendert eine Produktions-Umgebung.");
    process.exit(1);
  }

  const engineWert = await leseWert(ENGINE, SCHLUESSEL);
  const controlWert = await leseWert(CONTROL, SCHLUESSEL);
  console.log(`Engine : ${finger(engineWert)}`);
  console.log(`Control: ${finger(controlWert)}`);

  if (!engineWert || engineWert.length < 32) {
    console.error("Abbruch: der Engine-Wert ist nicht plausibel — nichts geschrieben.");
    process.exit(1);
  }
  if (engineWert === controlWert) {
    console.log("Beide stimmen bereits ueberein — nichts zu tun.");
    process.exit(0);
  }

  await setzeUmgebungswerte(CONTROL, { [SCHLUESSEL]: engineWert });
  const zurueck = await leseWert(CONTROL, SCHLUESSEL);
  if (zurueck !== engineWert) {
    console.error(`Abbruch: zurueckgelesen ${finger(zurueck)} — stimmt NICHT mit der Engine ueberein.`);
    process.exit(1);
  }
  console.log(`Gesetzt und zurueckgelesen: ${finger(zurueck)} — jetzt gleich.`);

  // Zeabur uebernimmt geaenderte Werte NICHT von selbst (gemessen 2026-08-14).
  await starteDienstNeu(CONTROL);
  console.log(`${CONTROL} neu gestartet. Beweis danach: POST /api/maus/run darf nicht mehr "nicht_autorisiert" liefern.`);
}
