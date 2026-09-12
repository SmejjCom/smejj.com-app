#!/usr/bin/env node
// smejj.com — das Layout als INSTALLIERTE App (display-mode: standalone).
//
// Im Browser sitzt die Seite zwischen Adressleiste und Tableiste. Als
// installierte App liegt sie direkt unter Statusleiste, Dynamic Island und
// ueber dem Home-Balken — genau da entstanden die Fehler vom 07.09. und 08.09.
// (schwarzer Balken unten, Marke hinter der Uhrzeit).
//
// NACHTRAG 2026-09-12 — DIESES WERKZEUG IST DER UMWEG, NICHT DIE ANTWORT:
// Die Emulation greift nicht (das Werkzeug meldet sich unten selbst als
// UNGUELTIG). Der echte Weg laeuft ueber die INSTALLIERTE Android-App:
//   adb shell am start -n com.smejj.app/.LauncherActivity
//   adb forward tcp:9222 localabstract:chrome_devtools_remote
//   node scripts/diagnose/emulator/cdp.mjs 9222 eval "matchMedia('(display-mode: standalone)').matches"
// So gemessen: display-mode STANDALONE, 412x839 statt 412x783 im Browser
// (die Adressleiste faellt weg), kein seitlicher Ueberlauf, 32 sichtbare
// Knoepfe, safe-area oben/unten 0px auf dem Pixel. Das ist die Messung, die
// zaehlt — eine emulierte Anzeigeart ist keine installierte App.
//
// WARUM EMULATION UND NICHT DER SIMULATOR: Im iPhone-Simulator ist der Webclip
// derzeit NICHT installiert (Home-Screen zeigt kein smejj-Symbol), und das
// Simulator-Werkzeug verlangt `sudo xcode-select` — ein Befehl, den nur der
// Betreiber ausfuehren kann. Chrome kann `display-mode: standalone` und die
// Geraetemasse aber selbst stellen; damit ist das Layout pruefbar.
//
// Gemessen bei iPhone-17-Pro-Massen (393x852, Notch/Island oben, Home-Balken
// unten):
//   * Liegt etwas UNTER der Statusleiste (oberer Rand)?
//   * Liegt etwas UNTER dem Home-Balken (unterer Rand)?
//   * Ist das Eingabefeld erreichbar?
//   * Greifen die Safe-Area-Werte ueberhaupt?
//
// Aufruf: node scripts/diagnose/pwa-standalone.mjs
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";

// Werte des iPhone 17 Pro: 59 px Statusleiste/Island oben, 34 px Home-Balken.
const SICHER_OBEN = 59;
const SICHER_UNTEN = 34;

const arg = (name, standard) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : standard;
};

async function auswerten(page, ausdruck, wo = "?") {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression: ausdruck, awaitPromise: true, returnByValue: true
  });
  if (exceptionDetails) {
    const grund = exceptionDetails.exception?.description || exceptionDetails.text;
    throw new Error(`[${wo}] ${String(grund || "fehlgeschlagen").split("\n")[0].slice(0, 150)}`);
  }
  return result?.value;
}

const MESSEN = `(() => {
  const kasten = (auswahl) => {
    const el = document.querySelector(auswahl);
    if (!el || !(el.offsetWidth || el.offsetHeight)) return null;
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), unten: Math.round(innerHeight - b.bottom), hoehe: Math.round(b.height) };
  };
  const stil = getComputedStyle(document.documentElement);
  const zahl = (w) => Math.round(parseFloat(w) || 0);
  return {
    sicht: [innerWidth, innerHeight],
    standalone: matchMedia("(display-mode: standalone)").matches,
    sicherOben: zahl(stil.getPropertyValue("--sat") || stil.paddingTop),
    kopf: kasten("header, .kopf, .app-kopf, .glass-top"),
    eingabe: kasten("#startMessage"),
    bedienzone: kasten(".prompt-glass"),
    spur: kasten(".spur, nav"),
    // Was liegt ganz oben und ganz unten am Rand? Wenn dort ein Bedienelement
    // sitzt, ist es unter Island oder Home-Balken.
    obenAmRand: (() => { const t = document.elementFromPoint(Math.round(innerWidth / 2), 6); return t ? (t.id || t.className || t.tagName).toString().slice(0, 40) : null; })(),
    untenAmRand: (() => { const t = document.elementFromPoint(Math.round(innerWidth / 2), innerHeight - 6); return t ? (t.id || t.className || t.tagName).toString().slice(0, 40) : null; })()
  };
})()`;

async function main() {
  const url = arg("--url", "https://smejj.com/");
  const chrome = await launchChrome();
  let aufraeumen = () => { chrome.close().catch(() => {}); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { aufraeumen(); process.exit(130); });
  let stand = null;
  try {
    const page = await openPage(chrome);
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
    await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    // Das ist der Kern: die App glaubt, sie sei installiert.
    await page("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] });
    await page("Page.navigate", { url });
    await sleep(4000);
    await auswerten(page, `localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }))`, "anmelden");
    await page("Page.navigate", { url });
    // NACH der Navigation noch einmal setzen: setEmulatedMedia wird beim
    // Seitenwechsel zurueckgesetzt — genau wie die Offline-Emulation. Die
    // erste Fassung mass deshalb im normalen Browsermodus und haette ein
    // Standalone-Ergebnis behauptet, das keines war. Der Waechter unten
    // ("MESSUNG UNGUELTIG") hat es gefangen.
    await page("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] });
    await sleep(6000);
    stand = await auswerten(page, MESSEN, "messen");
  } finally {
    aufraeumen = () => {};
    await chrome.close();
  }

  console.log(`\nAls installierte App auf ${url} — iPhone 17 Pro (393x852)\n`);
  console.log(`  display-mode      ${stand.standalone ? "standalone (wie installiert)" : "NICHT standalone"}`);
  console.log(`  Eingabefeld       ${stand.eingabe ? `top ${stand.eingabe.top}, ${stand.eingabe.unten} px ueber der Kante` : "FEHLT"}`);
  console.log(`  Bedienzone        ${stand.bedienzone ? `${stand.bedienzone.unten} px ueber der Kante` : "fehlt"}`);
  console.log(`  ganz oben liegt   ${stand.obenAmRand || "nichts"}`);
  console.log(`  ganz unten liegt  ${stand.untenAmRand || "nichts"}`);

  const befunde = [];
  if (!stand.standalone) befunde.push("MESSUNG UNGUELTIG — die Seite laeuft nicht im Standalone-Modus");
  if (!stand.sicht || stand.sicht[1] < 100) befunde.push("MESSUNG UNGUELTIG — das Fenster hat keine Hoehe");
  if (!stand.eingabe) befunde.push("das Eingabefeld ist nicht sichtbar");
  else if (stand.eingabe.unten < 0) befunde.push(`das Eingabefeld liegt ${-stand.eingabe.unten} px UNTER der Bildkante`);
  if (stand.bedienzone && stand.bedienzone.unten < SICHER_UNTEN - 10) {
    befunde.push(`die Bedienzone endet nur ${stand.bedienzone.unten} px ueber der Kante — der Home-Balken braucht ${SICHER_UNTEN}`);
  }

  console.log("");
  for (const b of befunde) console.log(`  - ${b}`);
  console.log(befunde.length === 0
    ? "Als installierte App sitzt alles innerhalb der sicheren Flaechen.\n"
    : `${befunde.length} Befund(e) — siehe oben.\n`);
  process.exitCode = befunde.length === 0 ? 0 : 1;
}

main().catch((fehler) => {
  console.error(`Messung fehlgeschlagen: ${fehler.message}`);
  process.exitCode = 1;
});
