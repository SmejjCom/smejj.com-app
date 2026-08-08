// smejj.com — Bruecken-Waechter als eigenstaendiger Dienst.
//
// WARUM ER JETZT ALLEIN LAEUFT (Befund 2026-08-07): Der Waechter wohnte im
// Prozess von `smejj-training-loop`. Dieser Dienst wurde am 2026-08-02
// stillgelegt — und damit war auch der Waechter still, ohne dass es jemandem
// auffiel. Fuenf Tage lang behaupteten die Projektnotizen weiter Dauerbetrieb.
//
// DIE LEHRE, die diesen Dienst begruendet: Ein Waechter darf nicht im Bauch
// eines Dienstes wohnen, der aus ganz anderen Gruenden abgeschaltet wird.
// Er ueberlebt sonst genau die Entscheidung, mit der niemand ihn gemeint hat.
//
// WAS ER TUT UND WAS NICHT: Er fragt in festen Abstaenden die oeffentliche
// Adresse der Chat-Bruecke ab (dieselbe, die ein Nutzer benutzt) und meldet
// jeden ZUSTANDSWECHSEL. Er repariert nichts, startet nichts neu und faellt
// niemandem zur Last: keine Modellaufrufe, kein Objektspeicher, keine
// Zugangsdaten ausser dem eigenen Herzschlag-Schluessel.
//
// ZWEI MELDEWEGE, absichtlich getrennt:
//   1. Herzschlag an die Autopiloten-Ampel — beweist, dass DER WAECHTER lebt.
//      Bleibt er aus, faerbt die Ampel ihn nach der Schonfrist rot.
//   2. Ausfall-Meldung ueber `meldeUrl` (optional) — sagt, dass DIE BRUECKE
//      tot ist. Das sind zwei verschiedene Aussagen; ein Waechter, der beim
//      eigenen Tod schweigt, ist die gefaehrlichere Luecke.
import http from "node:http";
import { createBrueckenWaechter } from "./brueckenWaechter.js";

const PORT = Number(process.env.PORT || 8080);
// 0.0.0.0, nicht 127.0.0.1: Salad und Zeabur erreichen den Dienst sonst nicht
// (dieselbe Falle wie beim Sprachserver, 2026-07-31 teuer gelernt).
const HOST = process.env.SMEJJ_HOST || "0.0.0.0";
const TAKT_MS = Math.max(30_000, Number(process.env.SMEJJ_WAECHTER_TAKT_MS || 60_000));
const HERZSCHLAG_URL = process.env.SMEJJ_AUTOPILOT_HEARTBEAT_URL
  || "https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/autopilot/heartbeat";
const HERZSCHLAG_SCHLUESSEL = process.env.SMEJJ_AUTOPILOT_KEY || "";
// Die Ampel erwartet den Herzschlag alle 10 Minuten (Schonfrist 20). Oefter
// waere Laerm, seltener liesse einen Ausfall zu lange unentdeckt.
const HERZSCHLAG_MS = Math.max(60_000, Number(process.env.SMEJJ_WAECHTER_HERZSCHLAG_MS || 5 * 60_000));

const waechter = createBrueckenWaechter({
  url: process.env.SMEJJ_BRUECKE_HEALTH_URL || undefined,
  schwelle: Number(process.env.SMEJJ_WAECHTER_SCHWELLE || 3),
  meldeUrl: process.env.SMEJJ_WAECHTER_MELDE_URL || ""
});

let letzterHerzschlag = null;
let herzschlagFehler = 0;

/**
 * Herzschlag an die Autopiloten-Ampel. Verschluckt jeden Fehler: ein
 * Meldeweg, der klemmt, darf den Waechter nicht stoeren — genau die Regel,
 * die auch fuer seine eigenen Abfragen gilt.
 */
async function herzschlag() {
  if (!HERZSCHLAG_SCHLUESSEL) return;
  const stand = waechter.stand();
  // Der Waechter meldet SICH als gesund, solange er prueft. Ob die Bruecke
  // gesund ist, steht in der Meldung — nicht im Status. Sonst wuerde ein
  // Brueckenausfall den Waechter selbst als kaputt anzeigen, und man suchte
  // am falschen Ende.
  const meldung = stand.erreichbar === false
    ? `Bruecke AUSGEFALLEN seit ${stand.laufenderAusfall?.seit || "?"}`
    : stand.erreichbar === true
      ? `Bruecke gesund (${stand.letzteVersion || "?"}), ${stand.gesamtPruefungen} Pruefungen`
      : "Waechter gestartet, erste Pruefung steht aus";
  try {
    const antwort = await fetch(HERZSCHLAG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "brueckenwaechter",
        key: HERZSCHLAG_SCHLUESSEL,
        status: "ok",
        meldung: meldung.slice(0, 100)
      }),
      signal: AbortSignal.timeout(20_000)
    });
    if (antwort.ok) { letzterHerzschlag = new Date().toISOString(); herzschlagFehler = 0; }
    else herzschlagFehler += 1;
  } catch {
    herzschlagFehler += 1;
  }
}

async function takt() {
  try {
    await waechter.pruefe();
  } catch {
    // createBrueckenWaechter wirft nie; dieser Fang ist die zweite Sicherung.
  }
}

const server = http.createServer((req, res) => {
  const pfad = (req.url || "/").split("?")[0];
  const antwort = (status, koerper) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(koerper, null, 2));
  };
  if (pfad === "/health") {
    return antwort(200, {
      ok: true,
      dienst: "smejj-brueckenwaechter",
      version: "1.0.0",
      taktMs: TAKT_MS,
      herzschlagAktiv: Boolean(HERZSCHLAG_SCHLUESSEL),
      letzterHerzschlag,
      herzschlagFehler
    });
  }
  if (pfad === "/bruecke") return antwort(200, waechter.stand());
  antwort(404, { ok: false, error: "not_found", pfade: ["/health", "/bruecke"] });
});

server.listen(PORT, HOST, () => {
  console.log(`[bruecken-waechter] hoert auf http://${HOST}:${PORT} — Takt ${TAKT_MS} ms`);
  if (!HERZSCHLAG_SCHLUESSEL) {
    console.log("[bruecken-waechter] SMEJJ_AUTOPILOT_KEY fehlt — kein Herzschlag, die Ampel bleibt grau.");
  }
  takt();
  herzschlag();
});

// KEIN unref(): genau dieser Timer ist der Dienst. Unref'ed haelt er die
// Ereignisschleife nicht und der Prozess koennte sich beenden — die Falle,
// die im Training-Loop schon einmal zugeschlagen hat.
setInterval(takt, TAKT_MS);
setInterval(herzschlag, HERZSCHLAG_MS);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[bruecken-waechter] ${signal} — beende sauber.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
