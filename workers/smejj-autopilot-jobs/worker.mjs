// smejj.com — Autopilot-Jobs als eigenstaendiger Zeabur-Dauerdienst.
//
// WARUM (Betreiber-Freigabe 2026-08-11, docs/approvals/2026-08-11-zeabur-
// autopilot-jobs.md): Der Mac laesst im Schlaf cron-Laeufe komplett aus.
// Dieser Dienst wohnt auf dem bezahlten Dauerserver und holt einen verpassten
// Tageslauf sogar nach einem Neustart nach (istFaellig prueft den Kalendertag,
// nicht die Minute).
//
// ERSTER JOB: Codeberg-Spiegel (taeglich, Standard 11:20 UTC = 4:20 Mac-Zeit).
// Die Qualitaetsmessung folgt als eigener Schritt.
//
// DIESELBEN REGELN WIE BEIM BRUECKEN-WAECHTER: 0.0.0.0 binden (Zeabur erreicht
// den Dienst sonst nicht), KEIN unref auf dem Takt (der Timer IST der Dienst),
// jeder Meldeweg verschluckt seine Fehler selbst.
import http from "node:http";
import { istFaellig, spiegelLauf, herzschlagSenden, schluesselFuer } from "./spiegelJob.mjs";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.SMEJJ_HOST || "0.0.0.0";
const SPIEGEL_UTC = process.env.SMEJJ_SPIEGEL_UTC || "11:20";
const TAKT_MS = 60_000;

const stand = {
  dienst: "smejj-autopilot-jobs",
  version: "1.0.0",
  spiegel: {
    zeitplanUtc: SPIEGEL_UTC,
    letzterTag: null,        // UTC-Kalendertag des letzten Starts
    laeuftSeit: null,
    letzterLauf: null        // { am, ok, meldung, dauerMs, herzschlagHttp }
  }
};

let spiegelAktiv = false;

async function spiegelAusfuehren(ausloeser) {
  if (spiegelAktiv) return { ok: false, meldung: "laeuft bereits" };
  spiegelAktiv = true;
  stand.spiegel.laeuftSeit = new Date().toISOString();
  // Der Tag wird VOR dem Lauf gemerkt: auch ein abstuerzender Lauf darf am
  // selben Tag nicht endlos neu starten (die Ampel meldet den Fehler ohnehin).
  stand.spiegel.letzterTag = new Date().toISOString().slice(0, 10);
  console.log(`[autopilot-jobs] Spiegel-Lauf startet (${ausloeser})`);
  try {
    const ergebnis = await spiegelLauf({ log: console.log });
    const herzschlagHttp = await herzschlagSenden({
      id: "codeberg-spiegel",
      ok: ergebnis.ok,
      meldung: ergebnis.meldung,
      dauerMs: ergebnis.dauerMs
    });
    stand.spiegel.letzterLauf = {
      am: new Date().toISOString(),
      ok: ergebnis.ok,
      meldung: ergebnis.meldung,
      dauerMs: ergebnis.dauerMs,
      herzschlagHttp
    };
    console.log(`[autopilot-jobs] Spiegel fertig: ok=${ergebnis.ok} (${ergebnis.meldung}), Herzschlag HTTP ${herzschlagHttp}`);
    if (!ergebnis.ok) console.log("[autopilot-jobs] Protokoll (Ende): " + String(ergebnis.protokoll || "").slice(-1500));
    return ergebnis;
  } finally {
    spiegelAktiv = false;
    stand.spiegel.laeuftSeit = null;
  }
}

function takt() {
  if (istFaellig({ jetztMs: Date.now(), uhrzeitUtc: SPIEGEL_UTC, letzterTag: stand.spiegel.letzterTag })) {
    spiegelAusfuehren("zeitplan").catch(() => {});
  }
}

const server = http.createServer((req, res) => {
  const pfad = (req.url || "/").split("?")[0];
  const antwort = (status, koerper) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(koerper, null, 2));
  };
  if (pfad === "/health") return antwort(200, { ok: true, ...stand });
  if (pfad === "/lauf/spiegel" && req.method === "POST") {
    // Von-Hand-Start, abgesichert mit demselben Schluessel wie der Herzschlag —
    // wer den kennt, darf ohnehin die Ampel dieses Autopiloten faerben.
    let koerper = "";
    req.on("data", (stueck) => { koerper += stueck; if (koerper.length > 4096) req.destroy(); });
    req.on("end", async () => {
      let daten = {};
      try { daten = JSON.parse(koerper || "{}"); } catch { /* leer */ }
      const erwartet = schluesselFuer("codeberg-spiegel");
      if (!erwartet || daten.key !== erwartet) return antwort(403, { ok: false, error: "key_invalid" });
      if (spiegelAktiv) return antwort(409, { ok: false, error: "laeuft_bereits" });
      spiegelAusfuehren("von-hand").catch(() => {});
      antwort(202, { ok: true, gestartet: true });
    });
    return;
  }
  antwort(404, { ok: false, pfade: ["/health", "POST /lauf/spiegel"] });
});

server.listen(PORT, HOST, () => {
  console.log(`[autopilot-jobs] hoert auf http://${HOST}:${PORT} — Spiegel taeglich ${SPIEGEL_UTC} UTC`);
  takt(); // Neustart nach der Uhrzeit? Dann sofort nachholen.
});

setInterval(takt, TAKT_MS);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[autopilot-jobs] ${signal} — beende sauber.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
