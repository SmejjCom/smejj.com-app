import http from "node:http";
import { istFaellig, spiegelLauf, herzschlagSenden, schluesselFuer } from "./spiegelJob.mjs";
import {
  istFaelligUtc,
  istWochenJobFaellig,
  qualitaetsmessungLauf,
  voiceRegionCheckLauf,
  konkurrenzRadarLauf,
  autopilotWaechterLauf
} from "./jobs.mjs";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.SMEJJ_HOST || "0.0.0.0";
const SPIEGEL_UTC = process.env.SMEJJ_SPIEGEL_UTC || "11:20";
const QUALITAET_UTC_1 = process.env.SMEJJ_QUALITAET_UTC_1 || "07:10";
const QUALITAET_UTC_2 = process.env.SMEJJ_QUALITAET_UTC_2 || "19:10";
const VOICE_REGION_UTC = process.env.SMEJJ_VOICE_REGION_UTC || "09:04";
const KONKURRENZ_UTC = process.env.SMEJJ_KONKURRENZ_UTC || "06:00";
const TAKT_MS = 60_000;

let letzterWaechterLaufMs = 0;
let waechterAktiv = false;

const stand = {
  dienst: "smejj-autopilot-jobs",
  version: "1.4.0",
  jobs: {
    spiegel: { zeitplanUtc: SPIEGEL_UTC, letzterTag: null, laeuftSeit: null, letzterLauf: null },
    qualitaetsmessung: { zeitplanUtc: `${QUALITAET_UTC_1}, ${QUALITAET_UTC_2}`, letzterTag: null, laeuftSeit: null, letzterLauf: null },
    voiceRegionCheck: { zeitplanUtc: VOICE_REGION_UTC, letzterTag: null, laeuftSeit: null, letzterLauf: null },
    konkurrenzRadar: { zeitplanUtc: `Mo ${KONKURRENZ_UTC}`, letzterTag: null, laeuftSeit: null, letzterLauf: null },
    waechter: { zeitplan: "15-Minuten-Takt", letzterLauf: null }
  }
};

let spiegelAktiv = false;
let qualitaetAktiv = false;
let voiceAktiv = false;
let konkurrenzAktiv = false;

async function waechterAusfuehren(ausloeser) {
  if (waechterAktiv) return { ok: false, meldung: "laeuft bereits" };
  waechterAktiv = true;
  letzterWaechterLaufMs = Date.now();
  console.log(`[autopilot-jobs] Wächter-Lauf startet (${ausloeser})`);
  try {
    const ergebnis = await autopilotWaechterLauf({ log: console.log });
    stand.jobs.waechter.letzterLauf = { am: new Date().toISOString(), ...ergebnis };
    return ergebnis;
  } finally {
    waechterAktiv = false;
  }
}

async function spiegelAusfuehren(ausloeser) {
  if (spiegelAktiv) return { ok: false, meldung: "laeuft bereits" };
  spiegelAktiv = true;
  stand.jobs.spiegel.laeuftSeit = new Date().toISOString();
  stand.jobs.spiegel.letzterTag = new Date().toISOString().slice(0, 10);
  console.log(`[autopilot-jobs] Spiegel-Lauf startet (${ausloeser})`);
  try {
    const ergebnis = await spiegelLauf({ log: console.log });
    const herzschlagHttp = await herzschlagSenden({
      id: "codeberg-spiegel",
      ok: ergebnis.ok,
      meldung: ergebnis.meldung,
      dauerMs: ergebnis.dauerMs
    });
    stand.jobs.spiegel.letzterLauf = { am: new Date().toISOString(), ok: ergebnis.ok, meldung: ergebnis.meldung, dauerMs: ergebnis.dauerMs, herzschlagHttp };
    return ergebnis;
  } finally {
    spiegelAktiv = false;
    stand.jobs.spiegel.laeuftSeit = null;
  }
}

async function qualitaetAusfuehren(ausloeser) {
  if (qualitaetAktiv) return { ok: false, meldung: "laeuft bereits" };
  qualitaetAktiv = true;
  stand.jobs.qualitaetsmessung.laeuftSeit = new Date().toISOString();
  stand.jobs.qualitaetsmessung.letzterTag = new Date().toISOString().slice(0, 10);
  console.log(`[autopilot-jobs] Qualitätsmessung startet (${ausloeser})`);
  try {
    const ergebnis = await qualitaetsmessungLauf({ log: console.log });
    stand.jobs.qualitaetsmessung.letzterLauf = { am: new Date().toISOString(), ...ergebnis };
    return ergebnis;
  } finally {
    qualitaetAktiv = false;
    stand.jobs.qualitaetsmessung.letzterLaufSeit = null;
  }
}

async function voiceRegionAusfuehren(ausloeser) {
  if (voiceAktiv) return { ok: false, meldung: "laeuft bereits" };
  voiceAktiv = true;
  stand.jobs.voiceRegionCheck.laeuftSeit = new Date().toISOString();
  stand.jobs.voiceRegionCheck.letzterTag = new Date().toISOString().slice(0, 10);
  console.log(`[autopilot-jobs] Voice-Region-Prüfung startet (${ausloeser})`);
  try {
    const ergebnis = await voiceRegionCheckLauf({ log: console.log });
    stand.jobs.voiceRegionCheck.letzterLauf = { am: new Date().toISOString(), ...ergebnis };
    return ergebnis;
  } finally {
    voiceAktiv = false;
    stand.jobs.voiceRegionCheck.laeuftSeit = null;
  }
}

async function konkurrenzRadarAusfuehren(ausloeser) {
  if (konkurrenzAktiv) return { ok: false, meldung: "laeuft bereits" };
  konkurrenzAktiv = true;
  stand.jobs.konkurrenzRadar.laeuftSeit = new Date().toISOString();
  stand.jobs.konkurrenzRadar.letzterTag = new Date().toISOString().slice(0, 10);
  console.log(`[autopilot-jobs] Konkurrenz-Radar startet (${ausloeser})`);
  try {
    const ergebnis = await konkurrenzRadarLauf({ log: console.log });
    stand.jobs.konkurrenzRadar.letzterLauf = { am: new Date().toISOString(), ...ergebnis };
    return ergebnis;
  } finally {
    konkurrenzAktiv = false;
    stand.jobs.konkurrenzRadar.laeuftSeit = null;
  }
}

function takt() {
  const jetztMs = Date.now();
  if (jetztMs - letzterWaechterLaufMs >= 15 * 60 * 1000) {
    waechterAusfuehren("15min-takt").catch(() => {});
  }
  if (istFaellig({ jetztMs, uhrzeitUtc: SPIEGEL_UTC, letzterTag: stand.jobs.spiegel.letzterTag })) {
    spiegelAusfuehren("zeitplan").catch(() => {});
  }
  if (istFaelligUtc({ jetztMs, uhrzeitUtc: QUALITAET_UTC_1, letzterTag: stand.jobs.qualitaetsmessung.letzterTag }) ||
      istFaelligUtc({ jetztMs, uhrzeitUtc: QUALITAET_UTC_2, letzterTag: stand.jobs.qualitaetsmessung.letzterTag })) {
    qualitaetAusfuehren("zeitplan").catch(() => {});
  }
  if (istFaelligUtc({ jetztMs, uhrzeitUtc: VOICE_REGION_UTC, letzterTag: stand.jobs.voiceRegionCheck.letzterTag })) {
    voiceRegionAusfuehren("zeitplan").catch(() => {});
  }
  if (istWochenJobFaellig({ jetztMs, wochentagUtc: 1, uhrzeitUtc: KONKURRENZ_UTC, letzterTag: stand.jobs.konkurrenzRadar.letzterTag })) {
    konkurrenzRadarAusfuehren("zeitplan").catch(() => {});
  }
}

function extrahiereSchluesselUndAusfuehren(req, res, apId, ausfuehrenFn, antwort) {
  let koerper = "";
  req.on("data", (stueck) => { koerper += stueck; if (koerper.length > 4096) req.destroy(); });
  req.on("end", async () => {
    let daten = {};
    try { daten = JSON.parse(koerper || "{}"); } catch { /* leer */ }
    const erwartet = schluesselFuer(apId);
    if (!erwartet || daten.key !== erwartet) return antwort(403, { ok: false, error: "key_invalid" });
    ausfuehrenFn("von-hand").catch(() => {});
    antwort(202, { ok: true, gestartet: true });
  });
}

const server = http.createServer((req, res) => {
  const pfad = (req.url || "/").split("?")[0];
  const antwort = (status, koerper) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(koerper, null, 2));
  };
  if (pfad === "/health") return antwort(200, { ok: true, ...stand });
  if (req.method === "POST") {
    if (pfad === "/lauf/waechter") return extrahiereSchluesselUndAusfuehren(req, res, "qualitaetsmessung", waechterAusfuehren, antwort);
    if (pfad === "/lauf/spiegel") return extrahiereSchluesselUndAusfuehren(req, res, "codeberg-spiegel", spiegelAusfuehren, antwort);
    if (pfad === "/lauf/qualitaet") return extrahiereSchluesselUndAusfuehren(req, res, "qualitaetsmessung", qualitaetAusfuehren, antwort);
    if (pfad === "/lauf/voice-region") return extrahiereSchluesselUndAusfuehren(req, res, "voice-region-check", voiceRegionAusfuehren, antwort);
    if (pfad === "/lauf/konkurrenz-radar") return extrahiereSchluesselUndAusfuehren(req, res, "konkurrenz-radar", konkurrenzRadarAusfuehren, antwort);
  }
  antwort(404, { ok: false, pfade: ["/health", "POST /lauf/waechter", "POST /lauf/spiegel", "POST /lauf/qualitaet", "POST /lauf/voice-region", "POST /lauf/konkurrenz-radar"] });
});

server.listen(PORT, HOST, () => {
  console.log(`[autopilot-jobs] hoert auf http://${HOST}:${PORT} — Zeabur Autopilot Jobs active`);
  takt();
});

setInterval(takt, TAKT_MS);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[autopilot-jobs] ${signal} — beende sauber.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
