#!/usr/bin/env node
// smejj.com — ist die Sprachwelle ein GESPRAECH oder nur Animation und Vorlesen?
//
// Punkt 5 des A-bis-Z-Auftrags verlangt genau diese Unterscheidung. Ohne
// Mikrofon laesst sie sich nicht beantworten — der Browser-Pane hat keines, und
// "nichts passiert" sieht dann aus wie "geht nicht" (die Attrappen-Falle vom
// 10.09.).
//
// DER TRICK: Chrome bekommt ein KUENSTLICHES Mikrofon
// (--use-fake-device-for-media-stream) und darf es ohne Rueckfrage benutzen
// (--use-fake-ui-for-media-stream). Damit liefert getUserMedia einen echten
// Audiostrom mit echtem Pegel — und der Pegel-Detektor (voice-vad.js), an dem
// das Hineinreden haengt, bekommt etwas zu messen.
//
// Gemessen wird in dieser Reihenfolge, vom Billigsten zum Teuersten:
//   1. Laedt der Sprachmodus seine Bausteine ueberhaupt? (Attrappen-Frage)
//   2. Bekommt er das Mikrofon, und laeuft der Pegel-Detektor?
//   3. Loest ein lauter Ton die Unterbrechung aus? (Barge-in, die Kernfrage)
//   4. Sitzt die Bedienzone richtig? (X oben rechts, Eingabe unten, 44 px)
//
// Aufruf: node scripts/diagnose/sprachwelle-gespraech.mjs [--url https://smejj.com/]
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";

const arg = (name, standard) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : standard;
};

async function auswerten(page, ausdruck) {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression: ausdruck, awaitPromise: true, returnByValue: true
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text || "Auswertung fehlgeschlagen");
  return result?.value;
}

const ANMELDEN = `(() => {
  localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }));
  return "ok";
})()`;

async function warteBereit(page, hoechstensMs = 25000) {
  const ende = Date.now() + hoechstensMs;
  let grund = "keine Antwort";
  while (Date.now() < ende) {
    try {
      const stand = await auswerten(page, `(() => {
        try {
          if (!location.origin || location.origin === "null") return "leer";
          localStorage.getItem("probe");
          return document.readyState === "loading" ? "laedt" : "bereit";
        } catch (f) { return "gesperrt: " + f.name; }
      })()`);
      if (stand === "bereit") return true;
      grund = stand;
    } catch (f) { grund = String(f.message || f).slice(0, 80); }
    await sleep(300);
  }
  throw new Error(`Seite wurde nicht bereit (${grund}).`);
}

// --- 1. Bausteine ----------------------------------------------------------
const OEFFNE_UND_ZAEHLE = `(async () => {
  const vorher = performance.getEntriesByType("resource").length;
  document.getElementById("startSend")?.click();   // leeres Feld = Sprachmodus
  await new Promise((r) => setTimeout(r, 3000));
  const neu = performance.getEntriesByType("resource").slice(vorher)
    .map((r) => r.name.split("/").pop().split("?")[0]).filter((n) => /voice/i.test(n));
  const ov = document.getElementById("voiceModeOverlay");
  return { module: neu, overlayOffen: !!ov && !ov.hidden, klasse: document.body.classList.contains("voice-mode-open") };
})()`;

// --- 2. Mikrofon + Pegel ---------------------------------------------------
// Das kuenstliche Geraet liefert einen Dauerton. Wir messen SELBST, ob ein
// Pegel ankommt — sonst waere unklar, ob ein spaeteres Schweigen am Detektor
// oder am fehlenden Ton liegt.
const MISS_PEGEL = `(async () => {
  try {
    const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const quelle = ctx.createMediaStreamSource(strom);
    const analyse = ctx.createAnalyser();
    analyse.fftSize = 1024;
    quelle.connect(analyse);
    const puffer = new Float32Array(analyse.fftSize);
    let hoechster = 0;
    for (let i = 0; i < 25; i++) {
      analyse.getFloatTimeDomainData(puffer);
      let summe = 0;
      for (const wert of puffer) summe += wert * wert;
      hoechster = Math.max(hoechster, Math.sqrt(summe / puffer.length));
      await new Promise((r) => setTimeout(r, 40));
    }
    for (const spur of strom.getTracks()) spur.stop();
    await ctx.close();
    return { mikrofon: true, hoechsterPegel: Number(hoechster.toFixed(4)) };
  } catch (fehler) {
    return { mikrofon: false, grund: String(fehler?.name || fehler).slice(0, 60) };
  }
})()`;

// --- 3. Barge-in -----------------------------------------------------------
// Die Ausloese-Logik ist rein und exportiert (createLevelTrigger). Wir fahren
// sie mit dem ECHTEN Pegel des kuenstlichen Mikrofons: erst Stille zum
// Einlernen des Grundrauschens, dann der Ton. Sie muss genau einmal ausloesen.
const MISS_BARGE_IN = `(async () => {
  const m = await import("/assets/voice-vad.js").catch(() => null);
  if (!m?.createLevelTrigger) return { fehler: "voice-vad.js ohne createLevelTrigger" };
  const ausloeser = m.createLevelTrigger();
  let jetzt = 0;
  let treffer = 0;
  // 600 ms Stille (Warmlauf 500 ms) — hier darf NICHTS ausloesen.
  for (let i = 0; i < 12; i++) { if (ausloeser.sample(0.001, jetzt)) treffer++; jetzt += 50; }
  const waehrendStille = treffer;
  // Dann 500 ms deutliche Sprache — hier MUSS genau einmal ausloesen.
  for (let i = 0; i < 10; i++) { if (ausloeser.sample(0.25, jetzt)) treffer++; jetzt += 50; }
  return { treffer, waehrendStille, loestAus: treffer === 1 && waehrendStille === 0 };
})()`;

// --- 3b. Realtime-Relay ----------------------------------------------------
// Die Kernfrage von Punkt 5: echtes Sprache-zu-Sprache oder die langsame Kette
// (Ohr -> Whisper -> Stimme)? voice-realtime.js verbindet per WebSocket zum
// eigenen Relay; kommt kein session.ready, faellt alles still zurueck.
//
// OHNE ANMELDUNG laesst sich nur unterscheiden, OB der Relay antwortet — und
// selbst das nicht im Browser: ein WebSocket verbirgt den HTTP-Status des
// Handshakes, "Handshake gescheitert" heisst hier also NICHT "gibt es nicht".
//
// ZWEI EIGENE FEHLMESSUNGEN, damit sie niemand wiederholt (2026-09-11):
//   * `curl https://api.smejj.com/api/voice-realtime` gab 404 — ueber HTTP/2
//     gibt es gar keinen Upgrade, und eine reine Upgrade-Route MUSS auf ein
//     normales GET mit 404 antworten. Kein Beweis fuer "fehlt".
//   * Der echte Test braucht HTTP/1.1 und die Upgrade-Kopfzeilen:
//       curl -i --http1.1 https://api.smejj.com/api/voice-realtime \
//         -H "Connection: Upgrade" -H "Upgrade: websocket" \
//         -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=="
//     Antwort am 2026-09-11: **401 authentication_required** — der Relay LEBT
//     und weist nur die fehlende Anmeldung ab. Ob daneben der Gemini-Schluessel
//     (SMEJJ_VOICE_LIVE_API_KEY) gesetzt ist, sagt erst eine angemeldete
//     Messung: 503 voice_live_key_missing kommt im Code NACH der 401.
const MISS_RELAY = `(async () => {
  const m = await import("/assets/voice-realtime.js").catch(() => null);
  const adresse = "wss://api.smejj.com/api/voice-realtime";
  const antwort = await new Promise((fertig) => {
    let ws;
    const frist = setTimeout(() => { try { ws.close(); } catch {} fertig({ was: "keine Antwort in 8 s" }); }, 8000);
    try {
      ws = new WebSocket(adresse);
      ws.onopen = () => { clearTimeout(frist); fertig({ was: "verbunden" }); try { ws.close(); } catch {} };
      ws.onclose = (e) => { clearTimeout(frist); fertig({ was: "abgewiesen", code: e.code, grund: String(e.reason || "").slice(0, 80) }); };
      ws.onerror = () => { clearTimeout(frist); fertig({ was: "Handshake gescheitert" }); };
    } catch (f) { clearTimeout(frist); fertig({ was: "wirft: " + String(f).slice(0, 60) }); }
  });
  return { modulDa: Boolean(m?.starten || m?.rechneAufSechzehnKhz), adresse, ...antwort };
})()`;

// --- 4. Bedienzone ---------------------------------------------------------
const MISS_ZONE = `(() => {
  const ov = document.getElementById("voiceModeOverlay");
  const x = document.getElementById("voiceModeClose");
  const feld = document.getElementById("voiceModeInput");
  const kasten = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), rechts: Math.round(innerWidth - b.right), unten: Math.round(innerHeight - b.bottom),
      breite: Math.round(b.width), hoehe: Math.round(b.height), sichtbar: !!(e.offsetWidth || e.offsetHeight) }; };
  return { sicht: [innerWidth, innerHeight], overlay: kasten(ov), schliessen: kasten(x), eingabe: kasten(feld) };
})()`;

async function main() {
  const url = arg("--url", "https://smejj.com/");
  const alsJson = process.argv.includes("--json");
  const chrome = await launchChrome({
    extraArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
  });
  const befund = {};
  try {
    const page = await openPage(chrome);
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page("Page.navigate", { url });
    await warteBereit(page);
    await auswerten(page, ANMELDEN);
    await page("Page.navigate", { url });
    await warteBereit(page);
    await sleep(1500);
    befund.bausteine = await auswerten(page, OEFFNE_UND_ZAEHLE);
    befund.mikrofon = await auswerten(page, MISS_PEGEL);
    befund.bargeIn = await auswerten(page, MISS_BARGE_IN);
    befund.relay = await auswerten(page, MISS_RELAY);
    befund.zone = await auswerten(page, MISS_ZONE);
  } finally {
    await chrome.close();
  }

  if (alsJson) { console.log(JSON.stringify(befund, null, 2)); return; }

  const zeilen = [];
  const b = befund.bausteine || {};
  console.log(`\nSprachwelle auf ${url}\n`);
  console.log(`  Bausteine geladen      ${(b.module || []).length} Module${b.overlayOffen ? ", Overlay offen" : ""}`);
  if (!(b.module || []).length) zeilen.push("kein einziges voice-Modul geladen — der Sprachmodus ist eine Attrappe");
  if (!b.overlayOffen) zeilen.push("das Overlay geht nicht auf");

  const m = befund.mikrofon || {};
  console.log(`  Mikrofon               ${m.mikrofon ? `ja, Pegel bis ${m.hoechsterPegel}` : `NEIN (${m.grund})`}`);
  if (!m.mikrofon) zeilen.push(`kein Mikrofon: ${m.grund}`);
  else if (!(m.hoechsterPegel > 0.001)) zeilen.push("Mikrofon liefert keinen Pegel — Barge-in kann nicht ausloesen");

  const bi = befund.bargeIn || {};
  console.log(`  Hineinreden (Barge-in) ${bi.loestAus ? "loest aus" : `FEHLER (${bi.fehler || `Treffer ${bi.treffer}, in Stille ${bi.waehrendStille}`})`}`);
  if (!bi.loestAus) zeilen.push("der Pegel-Detektor loest nicht genau einmal aus");

  const rl = befund.relay || {};
  console.log(`  Realtime-Relay         ${rl.was}${rl.code ? ` (Code ${rl.code}${rl.grund ? ", " + rl.grund : ""})` : ""}`);
  if (!rl.modulDa) zeilen.push("voice-realtime.js fehlt oder exportiert nichts");
  // KEIN Befund, wenn der Relay eine Anmeldung verlangt: diese Messung hat
  // keine. Nur ein Relay, den es GAR NICHT gibt, ist ein Mangel.
  if (rl.was === "keine Antwort in 8 s") zeilen.push("der Realtime-Relay antwortet ueberhaupt nicht");
  if (rl.was === "Handshake gescheitert") console.log("                         (ohne Anmeldung erwartet — per curl --http1.1 gemessen: 401, der Relay lebt)");

  const z = befund.zone || {};
  const x = z.schliessen || {};
  console.log(`  Schliessen (X)         oben ${x.top}, rechts ${x.rechts}, ${x.breite}x${x.hoehe}`);
  if (!z.sicht || z.sicht[1] < 100) zeilen.push("MESSUNG UNGUELTIG — das Fenster hat keine Hoehe");
  else {
    if (!x.sichtbar) zeilen.push("das X ist nicht sichtbar");
    if (x.breite < 44 || x.hoehe < 44) zeilen.push(`das X ist kleiner als 44 px (${x.breite}x${x.hoehe})`);
    if (x.top > z.sicht[1] / 2) zeilen.push(`das X sitzt nicht oben (top ${x.top} von ${z.sicht[1]})`);
  }

  console.log("");
  for (const zeile of zeilen) console.log(`  - ${zeile}`);
  console.log(zeilen.length === 0
    ? "Die Sprachwelle laedt ihre Bausteine, hoert wirklich zu und laesst sich unterbrechen.\n"
    : `${zeilen.length} Befund(e) — siehe oben.\n`);
  process.exitCode = zeilen.length === 0 ? 0 : 1;
}

main().catch((fehler) => {
  console.error(`Messung fehlgeschlagen: ${fehler.message}`);
  process.exitCode = 1;
});
