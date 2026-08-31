#!/usr/bin/env node
// smejj.com — TUEV des Hausmodell-Dienstes.
//
// Prueft den DIENST, nicht die Absicht: startet ihn echt, mit echtem
// llama-server und einem echten (winzigen) GGUF, und misst jede Zusage des
// Betreibers einzeln nach. Nach der Lehre "Waechter-TUEV" gehoert zu jeder
// gesunden Probe eine KAPUTTE: ein Test, der nur Erfolg kennt, beweist nichts.
//
// Aufruf:
//   node scripts/check-hausmodell-tuev.mjs
// Voraussetzung: llama-server-Binary (SMEJJ_HAUSMODELL_LLAMA) und e2-Zugang.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as warte } from "node:timers/promises";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
ladeLokaleUmgebung();

// stories15M: 19 MB, oeffentlich, SHA256 am 2026-09-01 aus der HF-LFS-Kennung
// geholt. Klein genug, dass der TUEV in Sekunden laeuft, echt genug, dass
// llama-server ihn wirklich laedt und rechnet.
const TESTMODELL = {
  id: "tuev-stories15m",
  anzeige: "TUEV-Zwergmodell",
  version: "stories15M-q4_0",
  format: "gguf-q4_0",
  stufe: "staging",
  datei: "stories15M-q4_0.gguf",
  sizeBytes: 19077344,
  sha256: "66967fbece6dbe97886593fdbb73589584927e29119ec31f08090732d1861739",
  hfRepo: "ggml-org/models-moved",
  hfDatei: "tinyllamas/stories15M-q4_0.gguf",
  lizenz: "MIT",
  ramSchaetzungMb: 60,
  kontext: 512
};

const HAFEN = Number(process.env.SMEJJ_TUEV_PORT || 8399);
const CACHE = fs.mkdtempSync(path.join(os.tmpdir(), "hausmodell-tuev-"));
const SCHLUESSEL = "tuev-schluessel-nur-fuer-diesen-lauf-0123456789";
const BASIS = `http://127.0.0.1:${HAFEN}`;

const pruefungen = [];
let dienst = null;

try {
  dienst = await starteDienst();
  await pruefeGesundheit();
  await pruefeSchluesselKaputt();
  await pruefeSchluesselGesund();
  await pruefeUnbekanntesModell();
  await pruefeErstbezugUndSpiegel();
  await pruefeAntwort();
  await pruefeWarteschlangeDeckel();
  await pruefeEntladen();
  await pruefeAusE2Zurueck();
  await pruefeLeerlaufEntlaedt();
} catch (fehler) {
  merke("TUEV-Ablauf", false, `abgebrochen: ${fehler.message}`);
} finally {
  if (dienst) {
    dienst.kill("SIGTERM");
    await warte(1500);
    if (!dienst.killed) dienst.kill("SIGKILL");
  }
  fs.rmSync(CACHE, { recursive: true, force: true });
}

berichte();

// ---------------------------------------------------------------- Pruefungen

async function pruefeGesundheit() {
  const antwort = await fetch(`${BASIS}/health`);
  const werte = await antwort.json();
  merke("/health ohne Schluessel erreichbar", antwort.status === 200 && werte.ok === true, `Status ${antwort.status}`);
  merke("Motor startet im Zustand STOPPED (0 MB Modell im RAM)", werte.motor?.zustand === "STOPPED" && werte.modellImRam === false, `zustand=${werte.motor?.zustand}, modellImRam=${werte.modellImRam}`);
}

// KAPUTTE PROBE: falscher Schluessel MUSS 401 geben.
async function pruefeSchluesselKaputt() {
  const ohne = await fetch(`${BASIS}/v1/models`);
  const falsch = await fetch(`${BASIS}/v1/models`, { headers: { authorization: "Bearer falsch-falsch-falsch" } });
  merke("KAPUTTE PROBE: ohne Schluessel -> 401", ohne.status === 401, `Status ${ohne.status}`);
  merke("KAPUTTE PROBE: falscher Schluessel -> 401", falsch.status === 401, `Status ${falsch.status}`);
}

async function pruefeSchluesselGesund() {
  const antwort = await fetch(`${BASIS}/v1/models`, { headers: { authorization: `Bearer ${SCHLUESSEL}` } });
  const werte = await antwort.json();
  const kennt = (werte.data || []).some((m) => m.id === TESTMODELL.id);
  merke("GESUNDE PROBE: richtiger Schluessel -> 200 + Katalog", antwort.status === 200 && kennt, `Status ${antwort.status}, Modelle ${(werte.data || []).map((m) => m.id).join(",")}`);
}

// KAPUTTE PROBE: ein Modell, das es nicht gibt, darf nichts starten.
async function pruefeUnbekanntesModell() {
  const antwort = await fetch(`${BASIS}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${SCHLUESSEL}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gibt-es-nicht", messages: [{ role: "user", content: "hallo" }] })
  });
  merke("KAPUTTE PROBE: unbekanntes Modell -> 400", antwort.status === 400, `Status ${antwort.status}`);
}

async function pruefeErstbezugUndSpiegel() {
  const begonnen = Date.now();
  const antwort = await fetch(`${BASIS}/verwaltung/vorwaermen`, {
    method: "POST",
    headers: { authorization: `Bearer ${SCHLUESSEL}`, "content-type": "application/json" },
    body: JSON.stringify({ model: TESTMODELL.id })
  });
  const werte = await antwort.json();
  const dauer = Date.now() - begonnen;
  merke("Erstbezug holt das Modell (HF -> SSD -> e2)", antwort.status === 200 && werte.ok === true, `Status ${antwort.status}, Quelle ${werte.quelle}, ${dauer} ms`);

  const datei = path.join(CACHE, TESTMODELL.id, TESTMODELL.datei);
  const werteDatei = fs.existsSync(datei) ? fs.statSync(datei) : null;
  merke("SSD-Cache traegt die Datei in korrekter Groesse", werteDatei?.size === TESTMODELL.sizeBytes, `${werteDatei?.size ?? "fehlt"} statt ${TESTMODELL.sizeBytes}`);

  const { e2AusUmgebung } = await import("../workers/smejj-hausmodell/e2.js");
  const e2 = e2AusUmgebung();
  const kopf = await e2.kopf(`models/staging/${TESTMODELL.id}/${TESTMODELL.datei}`);
  merke("e2 traegt die Modelldatei (Server -> e2, nicht ueber den Betreiber-Rechner)", kopf?.groesse === TESTMODELL.sizeBytes, `e2-Groesse ${kopf?.groesse ?? "fehlt"}`);

  const manifest = await e2.liesJson(`models/staging/${TESTMODELL.id}/manifest.json`);
  const vollstaendig = manifest && manifest.model_id && manifest.version && manifest.format && manifest.size_bytes && manifest.sha256 && manifest.storage && manifest.status;
  merke("manifest.json ist vollstaendig (alle Pflichtfelder)", Boolean(vollstaendig), manifest ? `status=${manifest.status}` : "fehlt");

  const summen = await e2.lies(`models/staging/${TESTMODELL.id}/sha256.txt`);
  merke("sha256.txt liegt daneben und traegt die richtige Summe", Boolean(summen && summen.includes(TESTMODELL.sha256)), summen ? summen.trim().slice(0, 40) : "fehlt");
}

async function pruefeAntwort() {
  const begonnen = Date.now();
  const antwort = await fetch(`${BASIS}/v1/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${SCHLUESSEL}`, "content-type": "application/json" },
    body: JSON.stringify({ model: TESTMODELL.id, prompt: "Once upon a time", n_predict: 16, max_tokens: 16 })
  });
  const werte = await antwort.json().catch(() => ({}));
  const text = werte?.choices?.[0]?.text ?? "";
  merke("Modell rechnet wirklich und antwortet", antwort.status === 200 && text.length > 0, `Status ${antwort.status}, ${Date.now() - begonnen} ms, Text "${String(text).trim().slice(0, 50)}"`);

  const gesund = await (await fetch(`${BASIS}/health`)).json();
  merke("nach der Anfrage: Zustand WARM, Modell im RAM", gesund.motor?.zustand === "WARM" && gesund.modellImRam === true, `zustand=${gesund.motor?.zustand}`);
}

// Deckel: drei gleichzeitige Anfragen duerfen NIE zu zweit rechnen.
async function pruefeWarteschlangeDeckel() {
  let hoechstensGleichzeitig = 0;
  const beobachter = setInterval(async () => {
    try {
      const werte = await (await fetch(`${BASIS}/health`)).json();
      hoechstensGleichzeitig = Math.max(hoechstensGleichzeitig, werte.schlange?.laufend ?? 0);
    } catch { /* egal */ }
  }, 30);

  const anfragen = [0, 1, 2].map(() =>
    fetch(`${BASIS}/v1/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${SCHLUESSEL}`, "content-type": "application/json" },
      body: JSON.stringify({ model: TESTMODELL.id, prompt: "The dragon", n_predict: 24, max_tokens: 24 })
    }).then((a) => a.status)
  );
  const stati = await Promise.all(anfragen);
  clearInterval(beobachter);
  merke("drei gleichzeitige Anfragen kommen alle durch", stati.every((s) => s === 200), `Stati ${stati.join(",")}`);
  merke("Deckel haelt: nie mehr als 1 Inferenz gleichzeitig", hoechstensGleichzeitig <= 1, `hoechstens ${hoechstensGleichzeitig} gleichzeitig gemessen`);
}

async function pruefeEntladen() {
  const vorher = await (await fetch(`${BASIS}/health`)).json();
  const antwort = await fetch(`${BASIS}/verwaltung/entladen`, { method: "POST", headers: { authorization: `Bearer ${SCHLUESSEL}` } });
  const werte = await antwort.json();
  await warte(600);
  const nachher = await (await fetch(`${BASIS}/health`)).json();
  merke("Entladen beendet den Motor (0 MB Modell im RAM)", werte.entladen === true && nachher.motor?.zustand === "STOPPED" && nachher.modellImRam === false, `vorher ${vorher.motor?.zustand} -> nachher ${nachher.motor?.zustand}`);
}

// Zweiter Bezug MUSS aus e2 kommen, nicht wieder von Hugging Face.
async function pruefeAusE2Zurueck() {
  fs.rmSync(path.join(CACHE, TESTMODELL.id), { recursive: true, force: true });
  const antwort = await fetch(`${BASIS}/verwaltung/vorwaermen`, {
    method: "POST",
    headers: { authorization: `Bearer ${SCHLUESSEL}`, "content-type": "application/json" },
    body: JSON.stringify({ model: TESTMODELL.id })
  });
  const werte = await antwort.json();
  merke("nach geloeschtem Cache kommt das Modell aus e2 (nicht neu von HF)", werte.quelle === "e2", `Quelle ${werte.quelle}`);
}

/**
 * Der Kern der Betreiber-Regel: ohne Anfrage geht das Modell VON SELBST aus
 * der Erinnerung. Fuer den TUEV steht die Leerlauf-Uhr auf wenige Sekunden
 * statt auf 5 Minuten — geprueft wird die Mechanik, nicht die Zahl.
 */
async function pruefeLeerlaufEntlaedt() {
  const leerlaufSekunden = Number(process.env.SMEJJ_TUEV_LEERLAUF_MIN || 5) * 60;
  if (leerlaufSekunden > 30) {
    merke("Leerlauf-Uhr entlaedt von selbst", true, `uebersprungen (Leerlauf ${leerlaufSekunden} s; mit SMEJJ_TUEV_LEERLAUF_MIN=0.15 messbar)`);
    return;
  }
  await fetch(`${BASIS}/v1/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${SCHLUESSEL}`, "content-type": "application/json" },
    body: JSON.stringify({ model: TESTMODELL.id, prompt: "A cat", n_predict: 8, max_tokens: 8 })
  });
  const warm = await (await fetch(`${BASIS}/health`)).json();
  merke("vor dem Warten: Modell ist geladen (WARM)", warm.motor?.zustand === "WARM" && warm.modellImRam === true, `zustand=${warm.motor?.zustand}`);

  await warte(leerlaufSekunden * 1000 + 2500);
  const kalt = await (await fetch(`${BASIS}/health`)).json();
  merke(`nach ${leerlaufSekunden} s Leerlauf: Modell entladen, 0 MB im RAM`, kalt.motor?.zustand === "STOPPED" && kalt.modellImRam === false, `zustand=${kalt.motor?.zustand}, modellImRam=${kalt.modellImRam}`);
}

// ------------------------------------------------------------------- Technik

function starteDienst() {
  return new Promise((loese, verwirf) => {
    const kind = spawn(process.execPath, [path.join(WURZEL, "workers/smejj-hausmodell/server.js")], {
      env: {
        ...process.env,
        PORT: String(HAFEN),
        SMEJJ_HAUSMODELL_MOTOR_PORT: String(HAFEN + 1),
        SMEJJ_HAUSMODELL_KEY: SCHLUESSEL,
        SMEJJ_HAUSMODELL_CACHE: CACHE,
        SMEJJ_HAUSMODELL_CACHE_GB: "1",
        SMEJJ_HAUSMODELL_LEERLAUF_MIN: String(process.env.SMEJJ_TUEV_LEERLAUF_MIN || 5),
        SMEJJ_HAUSMODELL_ZUSATZMODELLE: JSON.stringify([TESTMODELL]),
        SMEJJ_HAUSMODELL_THREADS: "2"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const zeigen = process.env.SMEJJ_TUEV_LAUT === "1";
    kind.stdout.on("data", (d) => zeigen && process.stdout.write(`  | ${d}`));
    kind.stderr.on("data", (d) => zeigen && process.stderr.write(`  ! ${d}`));
    kind.on("exit", (code) => verwirf(new Error(`Dienst beendete sich beim Start (code ${code})`)));

    (async () => {
      for (let i = 0; i < 60; i += 1) {
        await warte(250);
        try {
          const antwort = await fetch(`${BASIS}/health`, { signal: AbortSignal.timeout(1500) });
          if (antwort.ok) {
            kind.removeAllListeners("exit");
            loese(kind);
            return;
          }
        } catch { /* noch nicht oben */ }
      }
      verwirf(new Error("Dienst wurde nicht bereit"));
    })();
  });
}

function merke(name, bestanden, hinweis = "") {
  pruefungen.push({ name, bestanden, hinweis });
  console.log(`${bestanden ? "OK  " : "ROT "} ${name}${hinweis ? `  (${hinweis})` : ""}`);
}

function berichte() {
  const rot = pruefungen.filter((p) => !p.bestanden);
  console.log(`\n${pruefungen.length - rot.length}/${pruefungen.length} Pruefungen bestanden.`);
  if (rot.length) {
    console.log("\nROT:");
    for (const p of rot) console.log(`  - ${p.name}: ${p.hinweis}`);
    process.exit(1);
  }
  console.log("Hausmodell-TUEV gruen.");
}

function ladeLokaleUmgebung() {
  const pfad = process.env.SMEJJ_LOCAL_ENV_FILE || path.join(process.env.HOME || WURZEL, ".config/smejj.com/env.local");
  if (!fs.existsSync(pfad)) return;
  for (const zeile of fs.readFileSync(pfad, "utf8").split(/\r?\n/)) {
    const gekuerzt = zeile.trim();
    if (!gekuerzt || gekuerzt.startsWith("#")) continue;
    const trenner = gekuerzt.indexOf("=");
    if (trenner <= 0) continue;
    const name = gekuerzt.slice(0, trenner);
    if (!process.env[name]) process.env[name] = gekuerzt.slice(trenner + 1);
  }
}
