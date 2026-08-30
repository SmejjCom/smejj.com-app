#!/usr/bin/env node
// smejj.com — Sync-Waechter: kommen Chats vom Server beim Client wirklich an?
//
// Hintergrund (2026-08-23): Seit 15.08. stempelte der Server jede Chat-Datei
// mit SEINER Kontokennung (SHA-256), der Client verglich mit seiner Sitzungs-ID.
// Jeder Import vom Server galt als fremd — der Geraete-Sync war acht Tage lang
// komplett tot, und kein Pruefer merkte es, weil lokal vorhandene Chats vor der
// Besitzpruefung uebersprungen werden. Dieser Waechter prueft genau die Kette,
// die damals riss, an zwei Stellen:
//
//  Stufe A (immer):  die vier Quelldateien tragen die Alias-Kette
//                    (Server nennt `konto`, Client merkt und nutzt es).
//  Stufe B (live):   mit SMEJJ_SESSION_SECRET aus env.local wird ein 60-s-Token
//                    fuer einen SYNTHETISCHEN Nutzer gepraegt (leerer Ordner,
//                    beruehrt keine echten Daten), die echte Live-Antwort durch
//                    das ECHTE Client-Modul public/chat-owner.js geschickt:
//                    gehoertNutzer({ ownerId: konto }) muss true sein.
//
// Aufruf: npm run check:sync-alias        (Stufe B nur, wenn das Geheimnis da ist)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASIS = process.env.SMEJJ_CONTROL_BASIS || "https://smejj-control.zeabur.app";
const PROBE_NUTZER = { userId: "sync-waechter", email: "sync-waechter@smejj.invalid", method: "local-e2e" };

/** Stufe A als reine Funktion (TUEV-testbar): Quelltexte rein, Befunde raus. */
export function pruefeQuellen({ owner, sync, store, route }) {
  const fehler = [];
  if (!/export function gehoertNutzer\([^)]*aliase/.test(owner)) fehler.push("chat-owner.js: gehoertNutzer kennt keinen Alias-Parameter");
  if (!/export function merkeKontoKennung/.test(owner) || !/export function kontoAliase/.test(owner)) fehler.push("chat-owner.js: merkeKontoKennung/kontoAliase fehlen");
  if (!/merkeKontoKennung\(localStorage, nutzer, daten\.konto\)/.test(sync)) fehler.push("chat-sync.js: pull() merkt das `konto` der Antwort nicht");
  if (!/gehoertNutzer\(fern, nutzer, besitzer, aliase\)/.test(sync)) fehler.push("chat-sync.js: pull() prueft ohne Alias");
  const nackt = (store.match(/(?<![\w.])gehoertNutzer\(/g) || []).length;
  if (nackt !== 1) fehler.push(`chat-store.js: ${nackt} nackte gehoertNutzer-Aufrufe (erlaubt ist genau einer, in eigen())`);
  if (!/kontoAliase\(localStorage, userId\)/.test(store)) fehler.push("chat-store.js: eigen() zieht keinen Alias");
  if (!/konto: kontoId/.test(route)) fehler.push("chatSyncRoutes.js: GET-Antwort nennt kein `konto`");
  const markeStore = (store.match(/chat-owner\.js\?v=([A-Za-z0-9.-]+)/) || [])[1];
  const markeSync = (sync.match(/chat-owner\.js\?v=([A-Za-z0-9.-]+)/) || [])[1];
  if (!markeStore || markeStore !== markeSync) fehler.push(`Marken-Kette: chat-owner.js?v= weicht ab (store ${markeStore}, sync ${markeSync})`);
  return { ok: fehler.length === 0, fehler };
}

/** Stufe B als reine Funktion: Live-Antwort + echtes Client-Modul. */
export function pruefeAntwort(antwort, ownerModul, userId = PROBE_NUTZER.userId) {
  const fehler = [];
  const konto = String(antwort?.konto || "");
  if (!/^user_[0-9a-f]{32}$/.test(konto)) fehler.push(`Antwort nennt kein gueltiges konto: ${JSON.stringify(antwort?.konto)}`);
  const speicher = new Map();
  const storage = { getItem: (k) => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, String(v)) };
  if (!ownerModul.merkeKontoKennung(storage, userId, konto)) fehler.push("Client merkt das konto nicht");
  const aliase = ownerModul.kontoAliase(storage, userId);
  if (!ownerModul.gehoertNutzer({ ownerId: konto }, userId, "", aliase)) fehler.push("Client haelt einen Server-Chat fuer FREMD — Sync tot");
  if (ownerModul.gehoertNutzer({ ownerId: konto }, "anderer_nutzer", "", ownerModul.kontoAliase(storage, "anderer_nutzer"))) fehler.push("Zweitkonto erbt den Alias — Besitzpruefung undicht");
  for (const c of antwort?.chats || []) if (c.ownerId && c.ownerId !== konto) fehler.push(`Eintrag ${c.id} traegt fremden Besitzer ${c.ownerId}`);
  return { ok: fehler.length === 0, fehler };
}

async function main() {
  const lies = (p) => readFileSync(path.join(WURZEL, p), "utf8");
  const a = pruefeQuellen({
    owner: lies("public/chat-owner.js"), sync: lies("public/chat-sync.js"),
    store: lies("public/chat-store.js"), route: lies("control-server/src/routes/chatSyncRoutes.js")
  });
  for (const f of a.fehler) console.error(`FEHLER Stufe A: ${f}`);
  console.log(`Stufe A (Quellen): ${a.ok ? "OK" : "ROT"}`);

  const { loadSecureLocalEnv } = await import(path.join(WURZEL, "src/shared/env.js"));
  loadSecureLocalEnv();
  const secret = String(process.env.SMEJJ_SESSION_SECRET || "").trim();
  let b = { ok: true, fehler: [], uebersprungen: true };
  if (secret) {
    const { issueSessionToken } = await import(path.join(WURZEL, "control-server/src/auth/sessionToken.js"));
    const token = issueSessionToken({ secret, user: PROBE_NUTZER, ttlMs: 60_000 });
    const t = performance.now();
    const res = await fetch(`${BASIS}/api/chats?nurAbgleich=1`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const ms = Math.round(performance.now() - t);
    if (res.status !== 200) {
      b = { ok: false, fehler: [`Live-Antwort ${res.status} (${ms} ms) — Token vom lokalen Geheimnis nicht angenommen oder Sync aus`] };
    } else {
      const ownerModul = await import(path.join(WURZEL, "public/chat-owner.js"));
      b = pruefeAntwort(await res.json(), ownerModul);
      b.ms = ms;
    }
    for (const f of b.fehler) console.error(`FEHLER Stufe B: ${f}`);
    console.log(`Stufe B (live ${BASIS}, ${b.ms ?? "-"} ms): ${b.ok ? "OK" : "ROT"}`);
  } else {
    console.log("Stufe B (live): uebersprungen — SMEJJ_SESSION_SECRET fehlt in env.local");
  }
  const ok = a.ok && b.ok;
  console.log(ok ? "sync-alias OK — Server-Chats gelten beim Client als eigene." : "sync-alias ROT");
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`FEHLER: ${e?.message || e}`); process.exit(1); });
}
