#!/usr/bin/env node
// smejj.com — prueft, ob der abgelegte Zeabur-Zugangsschluessel wirklich traegt.
//
// WARUM ES DAS GIBT (2026-08-13): Der Maus-Blocker war wochenlang "offen",
// weil alle Skripte gegen SALAD massen — waehrend die App laengst auf ZEABUR
// laeuft (public/config.js: DEFAULT_API_ORIGIN = smejj-control.zeabur.app).
// Fuer Salad gab es einen API-Schluessel, fuer Zeabur nicht; deshalb konnte
// die Sitzung Zeabur-Umgebungswerte nicht selbst pflegen und JEDE Aenderung
// blieb an einem Handgriff des Betreibers haengen.
//
// Dieses Skript zeigt den Schluessel NIEMALS an — nur Laenge und
// SHA-256-Prefix (dasselbe Muster wie set_maus_engine_env.mjs).
//
// Aufruf: node scripts/diagnose/zeabur-zugang-pruefen.mjs
// Exit 0 = Schluessel traegt. Exit 1 = fehlt oder wird abgelehnt.
import crypto from "node:crypto";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const API = "https://api.zeabur.com/graphql";

loadSecureLocalEnv();
const token = String(process.env.ZEABUR_API_TOKEN || "").trim();

if (!token) {
  console.error("ZEABUR_API_TOKEN fehlt in ~/.config/smejj.com/env.local — nichts geprueft.");
  process.exit(1);
}

const sha8 = crypto.createHash("sha256").update(token).digest("hex").slice(0, 8);
console.log(`Schluessel gefunden: laenge=${token.length} sha=${sha8}`);

// Kleinste sinnvolle Abfrage: Wer bin ich? Traegt der Schluessel nicht,
// antwortet Zeabur mit errors statt mit einem Nutzer.
const antwort = await fetch(API, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "{ me { _id name username } }" }),
  signal: AbortSignal.timeout(20_000)
}).catch((fehler) => ({ ok: false, status: 0, fehler: fehler.message }));

if (!antwort.ok) {
  console.error(`Zeabur antwortete HTTP ${antwort.status || 0}${antwort.fehler ? ` (${antwort.fehler})` : ""} — Schluessel traegt NICHT.`);
  process.exit(1);
}

const daten = await antwort.json().catch(() => ({}));
if (daten.errors?.length) {
  console.error(`Zeabur lehnt den Schluessel ab: ${String(daten.errors[0]?.message || "unbekannt").slice(0, 120)}`);
  process.exit(1);
}

const ich = daten.data?.me;
if (!ich?._id) {
  console.error("Zeabur antwortete ohne Nutzer — Schluessel traegt NICHT.");
  process.exit(1);
}

console.log(`OK — angemeldet als ${ich.username || ich.name || ich._id}. Die Sitzung kann Zeabur jetzt selbst pflegen.`);
