#!/usr/bin/env node
// smejj.com — meldet Funktionen, die sich LIVE als abgeschaltet ausgeben.
//
// WARUM ES DAS GIBT (2026-08-17): Bilder erschienen im Chat als Wand aus
// Base64-Zeichen. Sieben Glieder der Kette waren gesund — schuld war EINE
// fehlende Zeile in der Server-Umgebung (SMEJJ_CHAT_SYNC_ENABLED), verloren
// bei der Umgebungs-Schrumpfung am 14.08. Die Medien-Ablage antwortete
// seither mit 503 "chat_sync_deaktiviert", und NIEMAND hat es bemerkt: die
// Oberflaeche schluckte den Fehler still, wochenlang.
//
// Der Trick, der das billig macht: die Abschalt-Pruefungen laufen VOR der
// Anmeldung. Ein abgeschalteter Weg antwortet 503 "…deaktiviert", ein
// eingeschalteter 401 "authentication_required". Dieser Waechter braucht
// deshalb KEINEN Token und kein Geheimnis — er klopft nur an.
//
// Aufruf:  node scripts/diagnose/funktionen-live.mjs [basis-url]
// Rueckgabe: Code 1, sobald eine Funktion abgeschaltet ist.

import { pathToFileURL } from "node:url";

const BASIS = (process.argv[2] || "https://smejj-control.zeabur.app").replace(/\/+$/, "");

// Jede Zeile ist eine FUNKTION, die der Betreiber im Alltag braucht — nicht
// jeder Endpunkt. Wer hier etwas ergaenzt, ergaenzt eine Funktion.
const WEGE = [
  ["Chat-Verlauf (Sync)", "/api/chats"],
  ["Projekte (Sync)", "/api/projekte"],
  ["Medien-Ablage (Bilder/Video im Chat)", "/api/chat-medien?id=probe"],
  ["Cline-Anbieter", "/api/providers/cline/status"],
  ["Eigene Anbieter-Keys", "/api/keys"],
  ["Abrechnung", "/api/billing/status"],
  ["Compliance", "/api/compliance"]
];

// Diese Gruende bedeuten "die Funktion ist AUS", nicht "du darfst nicht".
const AUS_MUSTER = /deaktiv|not_configured|nicht_konfig|disabled/i;

/**
 * Urteilt ueber EINE Antwort. Rein und ohne Netz — damit der TUEV sie mit
 * erfundenen Antworten pruefen kann.
 * @returns {"aus"|"an"|"unklar"}
 */
export function bewerte(status, nutzlast) {
  const grund = String(nutzlast?.error || "");
  if (AUS_MUSTER.test(grund)) return "aus";
  // 401 ist ein gutes Zeichen: der Weg lebt und verlangt nur eine Anmeldung.
  if (status === 401 || status === 200) return "an";
  // 404 mit eigenem Grund (z. B. "kennung_ungueltig") heisst: der Weg
  // antwortet fachlich, die Probe-Kennung gibt es nur nicht. Also an.
  if (status === 404 && grund) return "an";
  return "unklar";
}

async function pruefe(name, pfad) {
  try {
    // 20 s, nicht 10: die Medien-Ablage schlaegt vor der Antwort im Speicher
    // nach und brauchte beim ersten Lauf laenger — das ergab ein "unklar",
    // obwohl sie gesund war. Ein Waechter, der bei jedem Lauf gelb blinkt,
    // wird ignoriert.
    const antwort = await fetch(`${BASIS}${pfad}`, { signal: AbortSignal.timeout(20_000) });
    const nutzlast = await antwort.json().catch(() => ({}));
    return { name, pfad, status: antwort.status, grund: String(nutzlast?.error || ""), urteil: bewerte(antwort.status, nutzlast) };
  } catch (fehler) {
    return { name, pfad, status: 0, grund: String(fehler.message).slice(0, 60), urteil: "unklar" };
  }
}

async function main() {
  const ergebnisse = [];
  for (const [name, pfad] of WEGE) ergebnisse.push(await pruefe(name, pfad));
  const aus = ergebnisse.filter((e) => e.urteil === "aus");
  const unklar = ergebnisse.filter((e) => e.urteil === "unklar");

  for (const e of ergebnisse) {
    const zeichen = e.urteil === "aus" ? "AUS   " : e.urteil === "an" ? "an    " : "unklar";
    console.log(`${zeichen} ${e.name.padEnd(38)} ${String(e.status).padEnd(4)} ${e.grund}`);
  }
  console.log("");
  if (aus.length === 0 && unklar.length === 0) {
    console.log(`Alle ${ergebnisse.length} Funktionen antworten. Keine ist abgeschaltet.`);
    return 0;
  }
  if (aus.length) {
    console.log(`ABGESCHALTET: ${aus.length} Funktion(en) — meist eine fehlende Umgebungsvariable.`);
    console.log("Naechster Schritt: scripts/diagnose/control-umgebung-luecken.mjs lesen und den");
    console.log("passenden Schalter setzen (EINZEL-Mutation, nie die ersetzende Sammel-Form).");
  }
  if (unklar.length) console.log(`Unklar: ${unklar.map((e) => e.name).join(", ")}`);
  return aus.length ? 1 : 0;
}

// pathToFileURL statt `file://${argv[1]}`: der Projektordner heisst
// "- smejj.com info/smejj.com App" — mit Leerzeichen. import.meta.url kodiert
// sie als %20, process.argv[1] nicht, und der Vergleich war deshalb IMMER
// falsch: das Skript lief durch, ohne etwas zu tun, und meldete Code 0.
// Ein Waechter, der still nichts prueft, ist schlimmer als keiner.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; });
}
