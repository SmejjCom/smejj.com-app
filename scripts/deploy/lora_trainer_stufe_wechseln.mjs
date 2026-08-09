#!/usr/bin/env node
// smejj.com — Preisstufe der Trainer-Gruppe wechseln (loeschen + neu anlegen).
//
//   node scripts/deploy/lora_trainer_stufe_wechseln.mjs                 # Trockenlauf
//   CONFIRM_STUFE_WECHSEL=YES node scripts/deploy/lora_trainer_stufe_wechseln.mjs
//
// WARUM LOESCHEN UND NEU ANLEGEN — am 2026-08-06 zweimal geprueft:
// `PATCH {"priority":"batch"}` antwortet HTTP 200 und aendert NICHTS; das Feld
// bleibt `high`. Der Weg ueber `container` ist gesperrt, weil ein PATCH mit
// `container` die ganze Umgebung ersetzt. Wirksam ist nur Neuanlegen.
//
// KOSTEN: RTX 3090 batch 0,09 USD/h (64,80/Monat) statt high 0,25 (180/Monat).
//
// BETREIBER-FREIGABE 2026-08-06, woertlich:
//   "Die Salad-Gruppe smejj-lora-trainer darf geloescht und mit Stufe 'batch'
//    statt 'high' neu angelegt werden. ... Konfiguration wird vorher gesichert
//    und unveraendert uebernommen."
//
// Das Skript nimmt diese Auflage ernst: es baut den Neuanlage-Koerper AUS DER
// GESICHERTEN ANTWORT und aendert genau ein Feld. Alles andere wird
// uebernommen und danach Feld fuer Feld gegengelesen.
//
// EINE FOLGE, DIE MAN LEICHT UEBERSIEHT: Salad vergibt die DNS-Adresse neu.
// Zwei Werte zeigen darauf — SMEJJ_TRAINER_PUBLIC_URL in der Container-Umgebung
// und SMEJJ_LORA_TRAINER_URL im Startskript der Schleife. Das Skript meldet die
// neue Adresse ausdruecklich und traegt die Container-Variable selbst nach.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GRUPPE = process.env.SMEJJ_TRAINER_GRUPPE || "smejj-lora-trainer-batch";
const ZIEL_STUFE = process.env.SMEJJ_TRAINER_ZIEL_STUFE || "batch";
const SICHERUNG = process.env.SMEJJ_TRAINER_SICHERUNG
  || path.join(REPO, "backups/salad/smejj-lora-trainer-2026-08-06-vor-batch-neuanlage.json");

loadSecureLocalEnv();

function pflicht(name) {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt`);
  return wert;
}

const API_KEY = pflicht("SALAD_API_KEY");
const BASIS = `https://api.salad.com/api/public/organizations/${pflicht("SALAD_ORGANIZATION_NAME")}`
  + `/projects/${pflicht("SALAD_PROJECT_NAME")}/containers`;

async function api(pfad, methode = "GET", koerper = null) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: methode,
    headers: {
      "Salad-Api-Key": API_KEY,
      accept: "application/json",
      ...(koerper ? { "content-type": methode === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: koerper ? JSON.stringify(koerper) : undefined
  });
  const text = await antwort.text();
  let daten = null;
  try { daten = text ? JSON.parse(text) : null; } catch { /* Rohtext genuegt */ }
  return { ok: antwort.ok, status: antwort.status, daten, text };
}

const warte = (ms) => new Promise((f) => setTimeout(f, ms));

/** Baut den Neuanlage-Koerper aus der Sicherung — genau ein Feld weicht ab. */
function koerperAus(alt) {
  return {
    // GRUPPE, nicht alt.name: Salad haelt den Namen einer geloeschten Gruppe
    // dauerhaft belegt (am 2026-08-06 ueber 45 Minuten erfolglos gewartet).
    // Die Neuanlage laeuft deshalb unter einem anderen Namen, und der muss aus
    // der Umgebung kommen — sonst versucht das Skript stur den reservierten.
    name: GRUPPE,
    display_name: GRUPPE,
    container: {
      image: alt.container.image,
      command: alt.container.command,
      resources: alt.container.resources,
      environment_variables: alt.container.environment_variables,
      priority: ZIEL_STUFE
    },
    networking: {
      protocol: alt.networking.protocol,
      port: alt.networking.port,
      auth: alt.networking.auth,
      client_request_timeout: alt.networking.client_request_timeout,
      server_response_timeout: alt.networking.server_response_timeout,
      load_balancer: alt.networking.load_balancer,
      single_connection_limit: alt.networking.single_connection_limit
    },
    startup_probe: alt.startup_probe || undefined,
    readiness_probe: alt.readiness_probe || undefined,
    liveness_probe: alt.liveness_probe || undefined,
    restart_policy: alt.restart_policy,
    // BEWUSST false: Anlegen darf nie Geld kosten. Starten ist ein eigener,
    // sichtbarer Schritt.
    autostart_policy: false,
    replicas: alt.replicas
  };
}

/** Vergleicht Feld fuer Feld und meldet JEDE Abweichung ausser der gewollten. */
function vergleiche(alt, neu) {
  const abweichungen = [];
  const pruefe = (name, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) abweichungen.push(`${name}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  };
  pruefe("image", alt.container.image, neu.container.image);
  pruefe("command", alt.container.command, neu.container.command);
  pruefe("resources", alt.container.resources, neu.container.resources);
  pruefe("restart_policy", alt.restart_policy, neu.restart_policy);
  pruefe("replicas", alt.replicas, neu.replicas);
  pruefe("networking.auth", alt.networking.auth, neu.networking.auth);
  pruefe("networking.port", alt.networking.port, neu.networking.port);
  pruefe("startup_probe", alt.startup_probe, neu.startup_probe);
  pruefe("readiness_probe", alt.readiness_probe, neu.readiness_probe);
  pruefe("liveness_probe", alt.liveness_probe, neu.liveness_probe);

  const altEnv = alt.container.environment_variables || {};
  const neuEnv = neu.container.environment_variables || {};
  for (const schluessel of Object.keys(altEnv)) {
    if (!(schluessel in neuEnv)) abweichungen.push(`Variable FEHLT: ${schluessel}`);
    // SMEJJ_TRAINER_PUBLIC_URL darf abweichen — die DNS-Adresse ist neu.
    else if (neuEnv[schluessel] !== altEnv[schluessel] && schluessel !== "SMEJJ_TRAINER_PUBLIC_URL") {
      abweichungen.push(`Variable GEAENDERT: ${schluessel}`);
    }
  }
  for (const schluessel of Object.keys(neuEnv)) {
    if (!(schluessel in altEnv)) abweichungen.push(`Variable NEU: ${schluessel}`);
  }
  return abweichungen;
}

async function main() {
  const alt = JSON.parse(readFileSync(SICHERUNG, "utf8"));
  if (!alt?.container?.environment_variables) throw new Error(`Sicherung unbrauchbar: ${SICHERUNG}`);

  const jetzt = await api(`/${GRUPPE}`);
  const zustand = jetzt.daten?.current_state?.status;

  console.log(`Gruppe:     ${GRUPPE}`);
  console.log(`Sicherung:  ${path.relative(REPO, SICHERUNG)}`);
  console.log(`Stufe:      ${jetzt.daten?.priority} -> ${ZIEL_STUFE}`);
  console.log(`Zustand:    ${zustand}`);
  console.log(`DNS bisher: ${jetzt.daten?.networking?.dns}`);
  console.log(`Variablen:  ${Object.keys(alt.container.environment_variables).length} werden uebernommen`);

  // Sicherheitsnetz: eine LAUFENDE Gruppe wird nie geloescht. Das waere ein
  // abgebrochener Trainingslauf ohne Vorwarnung.
  const schonWeg = jetzt.status === 404;
  if (schonWeg) {
    console.log("Zustand:    Gruppe existiert nicht (404) — Loeschen entfaellt, es wird nur angelegt.");
  }
  if (!schonWeg && zustand && zustand !== "stopped") {
    console.error(`\nABBRUCH: Gruppe ist '${zustand}', nicht 'stopped'. Erst stoppen.`);
    process.exitCode = 1;
    return;
  }

  if (process.env.CONFIRM_STUFE_WECHSEL !== "YES") {
    console.log("\nTrockenlauf — nichts geloescht. Zum Ausfuehren: CONFIRM_STUFE_WECHSEL=YES");
    return;
  }

  if (!schonWeg) {
    console.log("\nLoesche...");
    const geloescht = await api(`/${GRUPPE}`, "DELETE");
    if (!geloescht.ok && geloescht.status !== 404) {
      console.error(`FEHLER beim Loeschen: HTTP ${geloescht.status} ${geloescht.text.slice(0, 300)}`);
      process.exitCode = 1;
      return;
    }
    await warte(10_000);
  }

  // Anlegen mit Wiederholung. Gemessen am 2026-08-06: fuenf Sekunden nach dem
  // DELETE antwortet die API noch `name_conflict` — der Name ist reserviert,
  // waehrend die Gruppe in Liste und GET schon weg ist. Ein einzelner Versuch
  // laesst das Projekt dann OHNE Gruppe zurueck.
  console.log("Lege neu an...");
  let angelegt = null;
  for (let runde = 1; runde <= 12; runde += 1) {
    angelegt = await api("", "POST", koerperAus(alt));
    if (angelegt.ok) break;
    const konflikt = angelegt.status === 400 && /name_conflict/.test(angelegt.text || "");
    if (!konflikt) break;
    console.log(`  Name noch reserviert (Versuch ${runde}/12) — 10 s warten`);
    await warte(10_000);
  }
  if (!angelegt.ok) {
    console.error(`FEHLER beim Anlegen: HTTP ${angelegt.status} ${angelegt.text.slice(0, 600)}`);
    console.error(`\nDIE GRUPPE FEHLT JETZT. Sicherung liegt in ${path.relative(REPO, SICHERUNG)} —`);
    console.error("erneut ausfuehren oder von Hand aus der Sicherung anlegen.");
    process.exitCode = 1;
    return;
  }

  // Gegenlesen mit Wiederholung: die API antwortet verzoegert konsistent.
  let neu = null;
  for (let runde = 1; runde <= 10; runde += 1) {
    await warte(3000);
    const gelesen = await api(`/${GRUPPE}`);
    if (gelesen.ok && gelesen.daten?.container?.environment_variables) { neu = gelesen.daten; break; }
  }
  if (!neu) {
    console.error("Neu angelegt, aber nicht zurueckgelesen — von Hand pruefen.");
    process.exitCode = 1;
    return;
  }

  const neueDns = neu.networking?.dns || "";
  console.log(`\nStufe jetzt:  ${neu.priority} ${neu.priority === ZIEL_STUFE ? "(UEBERNOMMEN)" : "(NICHT uebernommen!)"}`);
  console.log(`Zustand:      ${neu.current_state?.status}`);
  console.log(`DNS jetzt:    ${neueDns}`);

  const abweichungen = vergleiche(alt, neu);
  if (abweichungen.length) {
    console.log("\nABWEICHUNGEN gegenueber der Sicherung:");
    for (const zeile of abweichungen) console.log(`  ${zeile}`);
  } else {
    console.log("\nAlle Felder unveraendert uebernommen (ausser der Stufe).");
  }

  // Die eigene Adresse in der Container-Umgebung nachziehen, falls Salad eine
  // neue vergeben hat. Ohne das liefert /training/status einen messEndpunkt,
  // der auf die alte, nicht mehr existierende Gruppe zeigt.
  const alteUrl = (alt.container.environment_variables.SMEJJ_TRAINER_PUBLIC_URL || "").replace(/\/$/, "");
  const neueUrl = neueDns ? `https://${neueDns}` : "";
  if (neueUrl && alteUrl && neueUrl !== alteUrl) {
    console.log(`\nDNS hat sich geaendert — SMEJJ_TRAINER_PUBLIC_URL wird nachgezogen:`);
    console.log(`  ${alteUrl}\n  -> ${neueUrl}`);
    const umgebung = { ...neu.container.environment_variables, SMEJJ_TRAINER_PUBLIC_URL: neueUrl };
    const gesetzt = await api(`/${GRUPPE}`, "PATCH", { container: { environment_variables: umgebung } });
    console.log(`  PATCH: HTTP ${gesetzt.status}`);
    console.log("\nACHTUNG, VON HAND NACHZIEHEN:");
    console.log(`  scripts/deploy/lora_dauerbetrieb_starten.sh  ->  SMEJJ_LORA_TRAINER_URL=${neueUrl}`);
    console.log(`  scripts/deploy/lora_trainer_waechter.mjs     ->  Standardadresse`);
    console.log(`  scripts/deploy/create_lora_trainer_group.mjs ->  Standardadresse`);
  } else if (neueUrl) {
    console.log("\nDNS unveraendert — keine Adresse nachzuziehen.");
  }

  console.log("\nAutostart ist AUS. Starten kostet Geld und ist ein eigener Schritt:");
  console.log(`  curl -X POST -H "Salad-Api-Key: ***" ${BASIS}/${GRUPPE}/start`);
}

main().catch((fehler) => {
  console.error(`FEHLER: ${String(fehler?.stack || fehler)}`);
  process.exitCode = 1;
});
