#!/usr/bin/env node
// smejj.com — sieht smejj wirklich mit? (Punkt 7 des A-bis-Z-Auftrags)
//
// Der Videomodus der Sprachwelle nimmt ein Bild von der Kamera auf und schickt
// es durch den vorhandenen Bild-Anhang-Weg. Ohne Kamera ist davon nichts
// pruefbar — und "nichts passiert" sieht aus wie "geht nicht" (die
// Attrappen-Falle vom 10.09., als der Kamera-Knopf sein Modul NIE lud).
//
// DER TRICK: Chrome bekommt eine KUENSTLICHE Kamera
// (--use-fake-device-for-media-stream, rollendes Testbild) und darf sie ohne
// Rueckfrage benutzen. Damit liefert getUserMedia einen echten Videostrom.
//
// Eigenes, schlankes Werkzeug statt eines Anbaus an sprachwelle-gespraech.mjs:
// der volle Lauf kam auf einem ausgelasteten Rechner nicht mehr durch (31
// Chrome-Prozesse), dieser hier laeuft in Sekunden. Ein kleines Werkzeug, das
// laeuft, ist mehr wert als ein grosses, das haengt.
//
// VIER Fragen, in dieser Reihenfolge:
//   1. Oeffnet der Sprachmodus, und ist der Kamera-Knopf da?
//   2. Laedt der Knopf sein Modul? (genau hier war die Attrappe)
//   3. Kommt ein Videostrom mit echten Massen an?
//   4. Verdeckt das Overlay die Bedienzone? (Fund vom 11.09., SW v839)
//
// Aufruf: node scripts/diagnose/sprachwelle-video.mjs [--url https://smejj.com/]
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";

const arg = (name, standard) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : standard;
};

async function auswerten(page, ausdruck, wo = "?") {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression: ausdruck, awaitPromise: true, returnByValue: true
  });
  if (exceptionDetails) {
    // Der nackte Text ist meist nur "Uncaught" — erst die Beschreibung sagt,
    // WAS schiefging.
    const grund = exceptionDetails.exception?.description || exceptionDetails.text;
    throw new Error(`[${wo}] ${String(grund || "Auswertung fehlgeschlagen").split("\n")[0].slice(0, 160)}`);
  }
  return result?.value;
}

const ANMELDEN = `(() => {
  localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }));
  return "ok";
})()`;

const OEFFNE = `(() => { document.getElementById("startSend")?.click(); return "geklickt"; })()`;

// Woran erkennt man, dass der Sprachmodus laeuft?
//
// NICHT an `voiceModeOverlay.hidden`: die erste Fassung meldete "Sprachmodus
// NICHT offen, 0 Module" — und im selben Atemzug einen vorhandenen
// Kamera-Knopf, ein geladenes Modul und ein Bild mit 640x480. Ein Widerspruch,
// der die MESSUNG entlarvt, nicht die App: der Knopf wird von
// voice-overlay-ui.js gebaut, er KANN ohne Sprachmodus gar nicht da sein.
//
// Der belastbare Beweis ist der Knopf selbst. Die Modulzahl bleibt als
// Beiwerk stehen — nach einem Seitenwechsel ist die Ressourcen-Zeitleiste
// leer, und daraus darf man nichts schliessen.
const ZUSTAND = `(() => {
  const ov = document.getElementById("voiceModeOverlay");
  const knopf = document.querySelector("[data-kamera-start]");
  return {
    laeuft: Boolean(knopf),
    overlayHidden: ov ? ov.hidden : null,
    knopfDa: Boolean(knopf),
    voiceModule: performance.getEntriesByType("resource").filter((e) => e.name.includes("voice")).length
  };
})()`;

const KAMERA_KLICK = `(() => {
  const k = document.querySelector("[data-kamera-start]");
  if (!k) return "kein Knopf";
  k.click();
  return "geklickt";
})()`;

// KEIN Regex mit Schraegstrichen in diesem Text: er steht in einem
// Template-String, und aus /\/kamera\.js/ wird beim Parsen "//kamera.js/" —
// ein Zeilenkommentar, der die naechste Zeile verschluckt. Der Browser meldete
// dann "SyntaxError: Unexpected token const", und ich suchte am falschen Ende.
const MESSEN = `(() => {
  const video = document.querySelector("video");
  const ov = document.getElementById("kameraOverlay");
  const geladen = performance.getEntriesByType("resource")
    .some((e) => e.name.split("?")[0].endsWith("/kamera.js"));
  // VERDECKT heisst: wer auf das Element tippt, trifft etwas anderes. Ein
  // Vergleich von Rechtecken sagt NICHTS darueber, was obenauf liegt — er
  // meldete beide Bedienelemente als verdeckt, obwohl sie ueber dem Overlay
  // liegen. Richtig ist die Frage, die auch ein Finger stellt.
  const verdeckt = [];
  for (const id of ["voiceModeClose", "voiceModeInput"]) {
    const el = document.getElementById(id);
    if (!el || !(el.offsetWidth || el.offsetHeight)) continue;
    const b = el.getBoundingClientRect();
    const treffer = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    if (treffer && treffer !== el && !el.contains(treffer) && !treffer.contains(el)) {
      verdeckt.push(id + " (dort liegt " + (treffer.id || treffer.tagName.toLowerCase()) + ")");
    }
  }
  return {
    geladen, videoDa: Boolean(video),
    masse: video ? [video.videoWidth || 0, video.videoHeight || 0] : null,
    overlaySichtbar: Boolean(ov) && Boolean(ov.offsetWidth || ov.offsetHeight),
    verdeckt, sicht: [innerWidth, innerHeight]
  };
})()`;

async function main() {
  const url = arg("--url", "https://smejj.com/");
  const alsJson = process.argv.includes("--json");
  const chrome = await launchChrome({
    extraArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
  });
  let aufraeumen = () => { chrome.close().catch(() => {}); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { aufraeumen(); process.exit(130); });

  let zustand = null;
  let befund = null;
  try {
    const page = await openPage(chrome);
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page("Page.navigate", { url });
    await sleep(4000);
    await auswerten(page, ANMELDEN, "anmelden");
    await page("Page.navigate", { url });
    await sleep(4500);
    await auswerten(page, OEFFNE, "sprachmodus");
    await sleep(3000);
    zustand = await auswerten(page, ZUSTAND, "zustand");
    await auswerten(page, KAMERA_KLICK, "kamera");
    // SECHS Sekunden: mit 2,5 s meldete die Messung "Modul NICHT geladen" und
    // gleichzeitig ein Bild mit 640x480 — ein Widerspruch, der sie entlarvte.
    // Das Modul wird nachgeladen, die Kamera braucht ihre Zeit, und eine zu
    // knappe Frist erfindet einen Fehler, den es nicht gibt.
    await sleep(6000);
    befund = await auswerten(page, MESSEN, "messen");
  } finally {
    aufraeumen = () => {};
    await chrome.close();
  }

  if (alsJson) { console.log(JSON.stringify({ zustand, befund }, null, 2)); return; }

  console.log(`\nSprachwelle mit Video auf ${url}\n`);
  console.log(`  Sprachmodus       ${zustand?.laeuft ? "laeuft" : "laeuft NICHT"} (Kamera-Knopf ${zustand?.knopfDa ? "da" : "FEHLT"}, ${zustand?.voiceModule ?? 0} Module in der Zeitleiste)`);
  console.log(`  kamera.js         ${befund?.geladen ? "geladen" : "NICHT geladen"}`);
  console.log(`  Videobild         ${befund?.masse ? `${befund.masse[0]}x${befund.masse[1]}` : "keins"}`);
  console.log(`  Kamera-Overlay    ${befund?.overlaySichtbar ? "sichtbar" : "nicht sichtbar"}`);
  console.log(`  Verdeckt          ${befund?.verdeckt?.length ? befund.verdeckt.join(", ") : "nichts"}`);

  const befunde = [];
  if (!zustand?.laeuft) befunde.push("der Sprachmodus laeuft nicht — kein Kamera-Knopf vorhanden");
  if (!befund?.geladen) befunde.push("der Kamera-Knopf laedt sein Modul nicht — eine Attrappe wie am 10.09.");
  if (!befund?.videoDa) befunde.push("kein Video-Element");
  else if (!(befund.masse?.[0] > 0)) befunde.push("das Video hat keine Masse — es kommt kein Bild an");
  if (!befund?.overlaySichtbar) befunde.push("das Kamera-Overlay ist nicht sichtbar");
  for (const v of befund?.verdeckt || []) befunde.push(`das Kamera-Overlay verdeckt ${v}`);
  if (!befund?.sicht || befund.sicht[1] < 100) befunde.push("MESSUNG UNGUELTIG — das Fenster hat keine Hoehe");

  console.log("");
  for (const b of befunde) console.log(`  - ${b}`);
  console.log(befunde.length === 0
    ? "smejj sieht wirklich mit: Modul geladen, Bild da, Bedienzone frei.\n"
    : `${befunde.length} Befund(e) — siehe oben.\n`);
  process.exitCode = befunde.length === 0 ? 0 : 1;
}

main().catch((fehler) => {
  console.error(`Messung fehlgeschlagen: ${fehler.message}`);
  process.exitCode = 1;
});
