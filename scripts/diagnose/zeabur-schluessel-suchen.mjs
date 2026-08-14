#!/usr/bin/env node
// smejj.com — sucht einen tragfaehigen Zeabur-Zugang an ALLEN Orten, an denen
// einer liegen kann, und sagt nur: welcher Ort traegt.
//
// WARUM ES DAS GIBT (2026-08-14): zeabur-zugang-pruefen.mjs schaut nur nach
// ZEABUR_API_TOKEN in env.local. Dort steht keiner — aber die Zeabur-CLI legt
// nach einem `zeabur auth login` einen Schluessel in ~/.config/zeabur/cli.yaml
// ab. Solange niemand dort nachsieht, bleibt jede Umgebungsaenderung ein
// Handgriff des Betreibers, obwohl der Zugang laengst auf der Platte liegt.
//
// Der Schluessel wird NIEMALS ausgegeben — nur Fundort, Laenge und
// SHA-256-Prefix (Muster wie set_maus_engine_env.mjs).
//
// Aufruf: node scripts/diagnose/zeabur-schluessel-suchen.mjs
// Exit 0 = mindestens ein Ort traegt. Exit 1 = keiner.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const API = "https://api.zeabur.com/graphql";

function fingerabdruck(wert) {
  return `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`;
}

// Alle plausiblen Ablagen einsammeln. Aus der CLI-Datei wird jeder Wert
// genommen, der wie ein Schluessel aussieht — das Format hat sich zwischen
// CLI-Fassungen schon geaendert, und Raten waere hier teurer als Probieren.
export function schluesselKandidaten(env = process.env) {
  const gefunden = [];
  for (const name of ["ZEABUR_API_TOKEN", "ZEABUR_TOKEN", "ZEABUR_API_KEY"]) {
    const wert = String(env[name] || "").trim();
    if (wert) gefunden.push({ ort: `env.local:${name}`, wert });
  }
  const cliPfad = path.join(os.homedir(), ".config", "zeabur", "cli.yaml");
  let roh = "";
  try { roh = readFileSync(cliPfad, "utf8"); } catch { roh = ""; }
  for (const treffer of roh.matchAll(/^\s*([\w.-]*(?:token|key|secret)[\w.-]*)\s*:\s*["']?([^"'\s#]+)["']?\s*$/gim)) {
    const wert = treffer[2].trim();
    if (wert.length >= 20) gefunden.push({ ort: `cli.yaml:${treffer[1]}`, wert });
  }
  // Doppelte Werte nur einmal probieren.
  const gesehen = new Set();
  return gefunden.filter(({ wert }) => (gesehen.has(wert) ? false : gesehen.add(wert)));
}

async function traegt(wert) {
  try {
    const antwort = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${wert}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ me { _id username } }" }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!antwort.ok) return { ok: false, grund: `HTTP ${antwort.status}` };
    const daten = await antwort.json().catch(() => ({}));
    if (daten.errors?.length) return { ok: false, grund: String(daten.errors[0]?.message || "abgelehnt").slice(0, 80) };
    const ich = daten.data?.me;
    return ich?._id ? { ok: true, wer: ich.username || ich._id } : { ok: false, grund: "kein Nutzer" };
  } catch (fehler) {
    return { ok: false, grund: fehler.name };
  }
}

// fileURLToPath statt String-Vergleich: der Projektpfad enthaelt Leerzeichen,
// und `file://${argv[1]}` waere dann prozentkodiert ungleich — das Skript
// haette stillschweigend nichts getan (Exit 0 ohne Ausgabe).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  loadSecureLocalEnv();
  const kandidaten = schluesselKandidaten();
  if (!kandidaten.length) {
    console.error("Kein Zeabur-Schluessel gefunden (weder env.local noch ~/.config/zeabur/cli.yaml).");
    process.exit(1);
  }
  let einerTraegt = false;
  for (const { ort, wert } of kandidaten) {
    const ergebnis = await traegt(wert);
    console.log(`${ort} (${fingerabdruck(wert)}): ${ergebnis.ok ? `TRAEGT — angemeldet als ${ergebnis.wer}` : `traegt nicht (${ergebnis.grund})`}`);
    if (ergebnis.ok) einerTraegt = true;
  }
  process.exit(einerTraegt ? 0 : 1);
}
