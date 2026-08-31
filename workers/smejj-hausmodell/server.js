#!/usr/bin/env node
// smejj.com Hausmodell — OpenAI-vertraeglicher Dienst mit Bedarfs-Laden.
//
// Aufbau:  Anfrage -> Schluesselpruefung -> Warteschlange (max 1) ->
//          Depot (SSD/e2/HF) -> Motor (llama-server) -> Antwort
//          -> 5 min Leerlauf -> Motor aus, 0 MB RAM
//
// Endpunkte:
//   GET  /health                  Ampel-Futter, OHNE Schluessel (Zeabur prueft damit)
//   GET  /v1/models               Katalog (Schluessel)
//   POST /v1/chat/completions     OpenAI-vertraeglich (Schluessel)
//   POST /v1/completions          OpenAI-vertraeglich (Schluessel)
//   POST /verwaltung/entladen     Motor sofort stoppen (Schluessel) — fuer den Livetest
//   POST /verwaltung/vorwaermen   Modell vorab holen (Schluessel)
//
// Schutz: SMEJJ_HAUSMODELL_KEY. Ohne gueltigen Schluessel 401 — ausser /health.
import http from "node:http";
import os from "node:os";
import { e2AusUmgebung } from "./e2.js";
import { Depot } from "./depot.js";
import { Motor, ZUSTAENDE } from "./motor.js";
import { Warteschlange } from "./warteschlange.js";
import { alleLaufModelle, findeLaufModell, standardModell } from "./katalog.js";

const HAFEN = Number(process.env.PORT || 8080);
const MOTOR_HAFEN = Number(process.env.SMEJJ_HAUSMODELL_MOTOR_PORT || 8081);
const SCHLUESSEL = process.env.SMEJJ_HAUSMODELL_KEY || "";
const CACHE_VERZEICHNIS = process.env.SMEJJ_HAUSMODELL_CACHE || "/var/cache/hausmodell";
const CACHE_DECKEL_GB = Number(process.env.SMEJJ_HAUSMODELL_CACHE_GB || 20);
const LEERLAUF_MIN = Number(process.env.SMEJJ_HAUSMODELL_LEERLAUF_MIN || 5);
const LLAMA_BINAER = process.env.SMEJJ_HAUSMODELL_LLAMA || "/opt/llama/llama-server";

const beginn = Date.now();
let letzterBezug = null;

const e2 = e2AusUmgebung();
const depot = new Depot({ e2, cacheVerzeichnis: CACHE_VERZEICHNIS, deckelBytes: CACHE_DECKEL_GB * 1024 ** 3 });
const motor = new Motor({
  binaer: LLAMA_BINAER,
  hafen: MOTOR_HAFEN,
  leerlaufMs: LEERLAUF_MIN * 60 * 1000,
  threads: Number(process.env.SMEJJ_HAUSMODELL_THREADS || Math.max(1, os.cpus().length - 1))
});
const schlange = new Warteschlange({
  deckel: 1,
  maxWartend: Number(process.env.SMEJJ_HAUSMODELL_MAX_WARTEND || 24),
  wartefristMs: Number(process.env.SMEJJ_HAUSMODELL_WARTEFRIST_MS || 120_000)
});

if (!SCHLUESSEL) {
  // Fail-closed: ein Dienst ohne Schluessel ist eine offene KI-Spur im Netz.
  console.error("[hausmodell] SMEJJ_HAUSMODELL_KEY fehlt — Dienst startet nicht.");
  process.exit(1);
}

const server = http.createServer((anfrage, antwort) => {
  behandle(anfrage, antwort).catch((fehler) => {
    console.error(`[hausmodell] unbehandelt: ${fehler.message}`);
    sendeJson(antwort, fehler.status || 500, { error: { message: fehler.message, type: "hausmodell_fehler" } });
  });
});

server.headersTimeout = 620_000;
server.requestTimeout = 620_000;
server.listen(HAFEN, "0.0.0.0", () => {
  // 0.0.0.0, nicht "::": Zeaburs internes Netz ist IPv4 (Lehre vom Bild-Maler).
  console.log(`[hausmodell] horcht auf 0.0.0.0:${HAFEN}`);
  console.log(`[hausmodell] Cache ${CACHE_VERZEICHNIS} (Deckel ${CACHE_DECKEL_GB} GB), Leerlauf ${LEERLAUF_MIN} min`);
  console.log(`[hausmodell] Standardmodell ${standardModell().id}`);
});

async function behandle(anfrage, antwort) {
  const url = new URL(anfrage.url, `http://${anfrage.headers.host || "127.0.0.1"}`);
  const pfad = url.pathname.replace(/\/+$/, "") || "/";

  if (pfad === "/health" || pfad === "/") return gesundheit(antwort);

  if (!schluesselStimmt(anfrage)) {
    return sendeJson(antwort, 401, { error: { message: "Schluessel fehlt oder ist falsch", type: "unauthorized" } });
  }

  if (pfad === "/v1/models" && anfrage.method === "GET") return modelle(antwort);
  if (pfad === "/verwaltung/zustand" && anfrage.method === "GET") return zustand(antwort);
  if (pfad === "/verwaltung/entladen" && anfrage.method === "POST") return entladen(antwort);
  if (pfad === "/verwaltung/vorwaermen" && anfrage.method === "POST") return vorwaermen(anfrage, antwort);
  if ((pfad === "/v1/chat/completions" || pfad === "/v1/completions") && anfrage.method === "POST") {
    return inferenz(anfrage, antwort, pfad);
  }

  return sendeJson(antwort, 404, { error: { message: `unbekannter Pfad: ${pfad}`, type: "not_found" } });
}

/** Zeitkonstanter Vergleich: verhindert, dass die Antwortzeit den Schluessel verraet. */
function schluesselStimmt(anfrage) {
  const kopf = anfrage.headers.authorization || "";
  const geliefert = kopf.startsWith("Bearer ") ? kopf.slice(7) : anfrage.headers["x-hausmodell-key"] || "";
  if (!geliefert || geliefert.length !== SCHLUESSEL.length) return false;
  let unterschied = 0;
  for (let i = 0; i < SCHLUESSEL.length; i += 1) unterschied |= SCHLUESSEL.charCodeAt(i) ^ geliefert.charCodeAt(i);
  return unterschied === 0;
}

function gesundheit(antwort) {
  const speicher = process.memoryUsage();
  sendeJson(antwort, 200, {
    ok: true,
    dienst: "smejj-hausmodell",
    laeuftSeitS: Math.round((Date.now() - beginn) / 1000),
    motor: motor.bericht(),
    schlange: schlange.bericht(),
    // Beweis fuer die Betreiber-Regel "0 MB im Leerlauf": im Zustand STOPPED
    // haelt nur noch der Node-Prozess selbst Speicher, das Modell keinen.
    modellImRam: motor.zustand !== ZUSTAENDE.GESTOPPT,
    nodeRssMb: Math.round(speicher.rss / 1e6),
    freierSystemSpeicherMb: Math.round(os.freemem() / 1e6),
    letzterBezug
  });
}

function modelle(antwort) {
  sendeJson(antwort, 200, {
    object: "list",
    data: alleLaufModelle().map((m) => ({
      id: m.id,
      object: "model",
      owned_by: "smejj.com",
      anzeige: m.anzeige,
      format: m.format,
      size_bytes: m.sizeBytes,
      ram_schaetzung_mb: m.ramSchaetzungMb,
      standard: Boolean(m.standard)
    }))
  });
}

async function zustand(antwort) {
  const cache = await depot.cacheStand().catch((f) => ({ fehler: f.message }));
  sendeJson(antwort, 200, { motor: motor.bericht(), schlange: schlange.bericht(), cache, letzterBezug });
}

async function entladen(antwort) {
  const lief = await motor.stoppen("verwaltung");
  sendeJson(antwort, 200, { entladen: lief, zustand: motor.zustand, freierSystemSpeicherMb: Math.round(os.freemem() / 1e6) });
}

async function vorwaermen(anfrage, antwort) {
  const koerper = await liesJson(anfrage).catch(() => ({}));
  const modell = findeLaufModell(koerper.model);
  if (!modell) return sendeJson(antwort, 400, { error: { message: `unbekanntes Modell: ${koerper.model}`, type: "invalid_request_error" } });
  const begonnen = Date.now();
  const bezug = await depot.bereitstellen(modell);
  letzterBezug = { modell: modell.id, quelle: bezug.quelle, bytes: bezug.bytes, dauerMs: Date.now() - begonnen, am: new Date().toISOString() };
  sendeJson(antwort, 200, { ok: true, ...letzterBezug });
}

async function inferenz(anfrage, antwort, pfad) {
  const koerper = await liesJson(anfrage);
  const modell = findeLaufModell(koerper.model);
  if (!modell) {
    return sendeJson(antwort, 400, {
      error: { message: `unbekanntes Modell: ${koerper.model}. Bekannt: ${alleLaufModelle().map((m) => m.id).join(", ")}`, type: "invalid_request_error" }
    });
  }

  const kennung = `${modell.id}-${Date.now().toString(36)}`;
  try {
    await schlange.einreihen(async () => {
      const begonnen = Date.now();
      const bezug = await depot.bereitstellen(modell);
      if (bezug.quelle !== "ssd-cache") {
        letzterBezug = { modell: modell.id, quelle: bezug.quelle, bytes: bezug.bytes, dauerMs: Date.now() - begonnen, am: new Date().toISOString() };
      }
      await motor.sicherstellen(modell, bezug.pfad);

      motor.anfrageBeginnt();
      try {
        await leiteWeiter(pfad, koerper, antwort, modell);
      } finally {
        motor.anfrageEndet();
      }
    }, { kennung });
  } catch (fehler) {
    if (antwort.headersSent) {
      antwort.end();
      return;
    }
    const status = fehler.status || 502;
    sendeJson(antwort, status, { error: { message: fehler.message, type: "hausmodell_fehler" } });
  }
}

/** Reicht die Anfrage an llama-server durch — auch als Datenstrom (stream: true). */
async function leiteWeiter(pfad, koerper, antwort, modell) {
  const nachOben = { ...koerper, model: modell.id };
  const antwortVomMotor = await fetch(`${motor.basisUrl}${pfad}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(nachOben),
    signal: AbortSignal.timeout(Number(process.env.SMEJJ_HAUSMODELL_INFERENZ_MS || 600_000))
  });

  antwort.writeHead(antwortVomMotor.status, {
    "content-type": antwortVomMotor.headers.get("content-type") || "application/json",
    "cache-control": "no-store",
    "x-hausmodell-modell": modell.id,
    "x-hausmodell-kaltstart-ms": String(motor.letzterStartMs ?? 0)
  });

  if (!antwortVomMotor.body) {
    antwort.end();
    return;
  }
  for await (const stueck of antwortVomMotor.body) antwort.write(Buffer.from(stueck));
  antwort.end();
}

function liesJson(anfrage) {
  return new Promise((loese, verwirf) => {
    const stuecke = [];
    let bytes = 0;
    anfrage.on("data", (stueck) => {
      bytes += stueck.length;
      if (bytes > 4 * 1024 * 1024) {
        verwirf(Object.assign(new Error("koerper_zu_gross"), { status: 413 }));
        anfrage.destroy();
        return;
      }
      stuecke.push(stueck);
    });
    anfrage.on("end", () => {
      try {
        loese(stuecke.length ? JSON.parse(Buffer.concat(stuecke).toString("utf8")) : {});
      } catch {
        verwirf(Object.assign(new Error("json_kaputt"), { status: 400 }));
      }
    });
    anfrage.on("error", verwirf);
  });
}

function sendeJson(antwort, status, wert) {
  const text = JSON.stringify(wert);
  antwort.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  antwort.end(text);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[hausmodell] ${signal} — faehrt herunter`);
    motor.stoppen(signal).finally(() => server.close(() => process.exit(0)));
  });
}
