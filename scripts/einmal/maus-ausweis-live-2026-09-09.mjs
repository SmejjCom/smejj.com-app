#!/usr/bin/env node
// smejj.com — Maus-Ausweis-Fix AUF DEN LIVE-STAND legen (2026-09-09).
//
// WARUM SO: Live ist die Maus seit 8228a2a in drei Dateien geteilt
// (browser-pane-maus-frei.js traegt den freien Lauf); der Arbeitszweig
// feature/design-v11 hat diese Teilung nicht. Ein Deploy aus dem Zweig wuerde
// die Teilung ueberschreiben. Darum wird der Fix (412fad17) hier als TEXT-
// AENDERUNG auf die Live-Datei gelegt: dieselben zwei Stellen, Wort fuer Wort.
// SICHERHEITSNETZ: Pruefsumme der Live-Datei UND beide Anker muessen passen,
// sonst Abbruch ohne eine einzige geschriebene Datei.
// Aufruf: node maus-ausweis-live-2026-09-09.mjs <klon>
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const [klon] = process.argv.slice(2);
if (!klon) { console.error("Aufruf: <klon>"); process.exit(2); }
const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
const lies = (p) => readFileSync(p, "utf8");
const DATEI = "browser-pane-maus-frei.js";
const VORHER = "c07bfe2ba39a";

const pfad = join(klon, DATEI);
let t = lies(pfad);
if (sha(t) !== VORHER) { console.error(`ABBRUCH: ${DATEI} live (${sha(t)}) ist nicht der Stand ${VORHER}, auf den der Fix passt.`); process.exit(1); }

const anker1 = `export async function fuehreFreienLaufAus({
  auftrag, tab, schrittUrl, holeToken = () => "", sende, zeige = () => {},
  abbruch = () => false, maxSchritte = FREI_MAX_SCHRITTE, braucheSitzung = true,
  schrittFristMs = SCHRITT_FRIST_MS, erneuere = null, zeiger = null,
  aktionFristMs = AKTION_FRIST_MS, uhrTakt = null
} = {}) {`;
const neu1 = `// NACHWEIS ERNEUERN, WENN DER SERVER IHN ABLEHNT.
//
// LIVE 09.09. 14:55: Nach gut zehn Minuten im Panel endete jeder Lauf sofort
// mit "Maus konnte nicht entscheiden: authentication_required". Der im
// Speicher liegende Ausweis war abgelaufen. Der Live-Browser-Client holt sich
// in genau dem Fall laengst einen frischen (browser-pane-session.js) — die
// Maus fragte nie danach und gab beim ersten 401 auf. Derselbe Weg wie dort:
// /api/auth/session-token per Cookie, einmal wiederholen, den frischen
// Ausweis dort ablegen, wo der alte lag.
export async function frischerNachweis(schrittUrl, fetchImpl = fetch) {
  try {
    const origin = new URL(schrittUrl).origin;
    const r = await fetchImpl(\`\${origin}/api/auth/session-token\`, { credentials: "include" });
    if (!r.ok) return "";
    const d = await r.json().catch(() => null);
    const t = String(d?.accessToken || "");
    if (t) {
      for (const speicher of [globalThis.localStorage, globalThis.sessionStorage]) {
        try { if (speicher?.getItem("smejj.auth.accessToken.v1")) speicher.setItem("smejj.auth.accessToken.v1", t); } catch { /* gesperrt */ }
      }
    }
    return t;
  } catch {
    return "";
  }
}

export async function fuehreFreienLaufAus({
  auftrag, tab, schrittUrl, holeToken = () => "", sende, zeige = () => {},
  abbruch = () => false, maxSchritte = FREI_MAX_SCHRITTE, braucheSitzung = true,
  schrittFristMs = SCHRITT_FRIST_MS, erneuere = null, zeiger = null,
  aktionFristMs = AKTION_FRIST_MS, uhrTakt = null, erneuereToken = frischerNachweis
} = {}) {
  // Ein frisch geholter Ausweis gilt fuer den ganzen Lauf — auch wenn der
  // Speicher keinen traegt (Cookie-Anmeldung) und holeToken() leer bleibt.
  let frischerAusweis = "";`;
const anker2 = `      const token = await holeToken();
      // Frist je Entscheidung — siehe SCHRITT_FRIST_MS. Sie gilt auch fuer das
      // Lesen der Antwort: ein Server, der die Verbindung offen haelt und nie
      // zu Ende sendet, hinge sonst genauso.
      const frist = new AbortController();
      const frist_uhr = setTimeout(() => frist.abort(), schrittFristMs);
      const r = await fetch(schrittUrl, {
        method: "POST",
        credentials: "include",
        signal: frist.signal,
        headers: { "content-type": "application/json", ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },`;
const neu2 = `      const token = (await holeToken()) || frischerAusweis;
      // Frist je Entscheidung — siehe SCHRITT_FRIST_MS. Sie gilt auch fuer das
      // Lesen der Antwort: ein Server, der die Verbindung offen haelt und nie
      // zu Ende sendet, hinge sonst genauso.
      const frist = new AbortController();
      const frist_uhr = setTimeout(() => frist.abort(), schrittFristMs);
      const schicke = (ausweis) => fetch(schrittUrl, {
        method: "POST",
        credentials: "include",
        signal: frist.signal,
        headers: { "content-type": "application/json", ...(ausweis ? { Authorization: \`Bearer \${ausweis}\` } : {}) },`;
const anker3 = `          restSchritte: maxSchritte - n + 1
        })
      });
      antwort = await r.json().catch(() => null);`;
const neu3 = `          restSchritte: maxSchritte - n + 1
        })
      });
      let r = await schicke(token);
      if (r.status === 401 || r.status === 403) {
        const frisch = await erneuereToken(schrittUrl);
        if (frisch) { frischerAusweis = frisch; r = await schicke(frisch); }
      }
      antwort = await r.json().catch(() => null);`;
for (const [a, n] of [[anker1, neu1], [anker2, neu2], [anker3, neu3]]) {
  if (t.split(a).length !== 2) { console.error("ABBRUCH: Anker nicht genau einmal gefunden:\n" + a.slice(0, 80)); process.exit(1); }
  t = t.replace(a, n);
}
writeFileSync(pfad, t);
const geaendert = new Set([DATEI]);

// Marken der Importeure IM LIVE-STAND hochzaehlen — bis nichts mehr wandert.
const kandidaten = readdirSync(klon).filter((n) => n.endsWith(".js") || n === "index.html");
const bump = (m) => {
  const x = /^(.*-)(\d+)$/.exec(m); if (x) return x[1] + (Number(x[2]) + 1);
  if (/^\d+$/.test(m)) return String(Number(m) + 1);
  const b = /^b(\d+)$/.exec(m); if (b) return "b" + (Number(b[1]) + 1);
  throw new Error("unbekannte Marke " + m);
};
const offen = [DATEI]; const protokoll = [];
while (offen.length) {
  const modul = offen.shift();
  const muster = new RegExp(modul.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=([A-Za-z0-9-]+)", "g");
  for (const g of kandidaten) {
    const p = join(klon, g); const text = lies(p);
    if (!muster.test(text)) continue; muster.lastIndex = 0;
    writeFileSync(p, text.replace(muster, (_, marke) => `${modul}?v=${bump(marke)}`));
    protokoll.push(`${g}: ${modul} Marke gehoben`);
    if (!geaendert.has(g) && g !== "index.html") { geaendert.add(g); offen.push(g); }
    geaendert.add(g);
  }
}
const swPfad = join(klon, "sw.js"); const sw = lies(swPfad);
const m = /const CACHE_NAME = "smejj-shell-v(\d+)";/.exec(sw);
if (!m) { console.error("ABBRUCH: CACHE_NAME nicht gefunden."); process.exit(1); }
const swNeu = `smejj-shell-v${Number(m[1]) + 1}`;
writeFileSync(swPfad, sw.replace(m[0], `const CACHE_NAME = "${swNeu}";`)); geaendert.add("sw.js");
for (const f of geaendert) { const kopie = join(klon, "assets", f); if (existsSync(kopie)) writeFileSync(kopie, lies(join(klon, f))); }
console.log(protokoll.join("\n")); console.log(`SW: v${m[1]} -> ${swNeu}`); console.log("GEAENDERT:", [...geaendert].sort().join(" "));
writeFileSync("/tmp/maus-ausweis-live-sw.txt", swNeu);
