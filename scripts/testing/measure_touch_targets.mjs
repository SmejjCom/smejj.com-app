#!/usr/bin/env node
// smejj.com — Touch-Ziele der Chat-Aktionsleiste auf einem emulierten Handy messen.
//
// Warum ein eigenes Skript: `resize_window` auf 375 px macht aus einem Desktop-
// Browser KEIN Touch-Geraet. `pointer: fine` bleibt wahr, und der Zweig, der auf
// echten Handys greift, wird nie ausgeloest. Ein Fehler dort ist im normalen
// Browsertest unsichtbar — genau so blieb am 2026-07-28 unbemerkt, dass Flexbox
// die Knoepfe von 42 auf 37 px quetscht.
//
// Dieses Skript setzt ueber das DevTools-Protokoll wirklich
// Emulation.setEmulatedMedia mit pointer/any-pointer = coarse und
// Emulation.setDeviceMetricsOverride mit mobile = true. Damit gilt die
// @media-(pointer: coarse)-Voreinstellung echt, und die gemessenen Groessen sind
// die, die ein Handy sieht.
//
// Ein iOS-Simulator waere die naechstbessere Stufe; auf diesem Rechner sind nur
// Xcode Command Line Tools installiert (kein simctl), deshalb dieser Weg.
//
// Aufruf:
//   node scripts/testing/measure_touch_targets.mjs
//   node scripts/testing/measure_touch_targets.mjs --url http://localhost:3000/ --json

import { launchChrome, openPage, sleep } from "./cdp-client.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const URL_UNTER_TEST = flag("url", "https://smejj.com/");
const ALS_JSON = args.includes("--json");
// Selbsttest: nimmt den Schutz zur Laufzeit heraus und ERWARTET Verstoesse.
// Findet er dann keine, misst dieses Skript nicht scharf genug und der ganze
// Check waere wertlos — deshalb ist die Gegenprobe eingebaut statt nur einmal
// von Hand gemacht.
const SELBSTTEST = args.includes("--selbsttest");
const MIN_ZIEL = 42;
const MIN_SCHRITT = 34;

// Entfernt genau die zwei Eigenschaften, die die Knoepfe vor dem Quetschen
// schuetzen (flex-wrap auf der Leiste, flex: 0 0 auto auf dem Knopf).
const SCHUTZ_ENTFERNEN = `(() => {
  let getroffen = 0;
  for (const sheet of document.styleSheets) {
    let regeln; try { regeln = sheet.cssRules; } catch { continue; }
    for (const regel of regeln) {
      if (!regel.selectorText || !regel.style) continue;
      if (regel.selectorText.includes(".msg-actions") && regel.style.flexWrap) {
        regel.style.removeProperty("flex-wrap"); getroffen += 1;
      }
      if (regel.selectorText.includes(".msg-act") && regel.style.flex) {
        regel.style.removeProperty("flex"); getroffen += 1;
      }
    }
  }
  return getroffen;
})()`;

// Baut einen echten Chat-Zustand nach: Anmeldung lokal, eine Frage, eine
// Antwort mit Fassungen. Laeuft IM Browser.
const AUFBAU = `(async () => {
  localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }));
  if (location.pathname !== "/") { location.href = "/"; return "navigiert"; }
  const log = document.querySelector("#startLog");
  if (!log) return "kein log";
  log.hidden = false;
  document.querySelector("#start")?.classList.add("has-start-chat");
  const frage = document.createElement("article");
  frage.className = "entry user";
  frage.textContent = "Eine Frage mit ausreichend Text fuer eine realistische Blase.";
  const antwort = document.createElement("article");
  antwort.className = "entry assistant";
  antwort.textContent = "Eine Antwort mit ausreichend Text, damit die Leiste realistisch sitzt.";
  log.append(frage, antwort);
  const messages = await import("/assets/chat-messages.js?v=1");
  messages.addVersion(antwort, { raw: "Fassung A", html: "<p>Fassung A</p>" });
  messages.addVersion(antwort, { raw: "Fassung B", html: "<p>Fassung B</p>" });
  return "aufgebaut";
})()`;

const MESSUNG = `(() => {
  const log = document.querySelector("#startLog");
  const leisten = Array.from(log.querySelectorAll(".msg-actions"));
  const messeLeiste = (bar) => {
    const box = bar.getBoundingClientRect();
    const logBox = log.getBoundingClientRect();
    const knoepfe = Array.from(bar.querySelectorAll(".msg-act")).map((b) => {
      const r = b.getBoundingClientRect();
      return {
        aktion: b.dataset.act,
        breite: Math.round(r.width),
        hoehe: Math.round(r.height),
        versionsschritt: b.classList.contains("msg-version-step")
      };
    });
    return {
      rolle: bar.classList.contains("is-user") ? "user" : "assistant",
      knoepfe,
      leisteHoehe: Math.round(box.height),
      zeilen: Math.max(1, Math.round(box.height / 42)),
      laeuftUeber: box.right > logBox.right + 1 || box.left < logBox.left - 1
    };
  };
  return JSON.stringify({
    viewport: innerWidth + "x" + innerHeight,
    zeiger: {
      fine: matchMedia("(pointer: fine)").matches,
      coarse: matchMedia("(pointer: coarse)").matches,
      anyCoarse: matchMedia("(any-pointer: coarse)").matches
    },
    leisten: leisten.map(messeLeiste)
  });
})()`;

async function auswerten(page, ausdruck) {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression: ausdruck,
    returnByValue: true,
    awaitPromise: true
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text || "Auswertung fehlgeschlagen");
  return result.value;
}

// Der Aufbau kann mitten in eine Weiterleitung geraten (die Anmelde-Pflicht
// schickt Abgemeldete auf /auth/login/, danach zurueck auf "/"). Deshalb mit
// Geduld wiederholen statt beim ersten Fehlschlag abzubrechen.
async function aufbauen(page) {
  let letzterFehler = "";
  for (let versuch = 0; versuch < 6; versuch += 1) {
    try {
      const antwort = await auswerten(page, AUFBAU);
      if (antwort === "aufgebaut") return;
      letzterFehler = String(antwort);
    } catch (fehler) {
      letzterFehler = fehler.message;
    }
    await sleep(1200);
  }
  throw new Error(`Chat-Zustand liess sich nicht aufbauen (${letzterFehler}).`);
}

const client = await launchChrome();
try {
  const page = await openPage(client);
  await page("Page.enable");
  await page("Runtime.enable");
  // Echtes Handy: Geraetemasse UND Zeigertyp.
  await page("Emulation.setDeviceMetricsOverride", {
    width: 375, height: 812, deviceScaleFactor: 3, mobile: true
  });
  await page("Emulation.setEmulatedMedia", {
    features: [{ name: "pointer", value: "coarse" }, { name: "any-pointer", value: "coarse" }]
  });
  await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await page("Page.navigate", { url: URL_UNTER_TEST });
  await sleep(2500);
  await aufbauen(page);
  let entfernt = 0;
  if (SELBSTTEST) {
    entfernt = await auswerten(page, SCHUTZ_ENTFERNEN);
    if (!entfernt) throw new Error("Selbsttest: keine Schutzregel gefunden — Stylesheet unerwartet aufgebaut.");
  }
  await sleep(900);

  const roh = await auswerten(page, MESSUNG);
  const messung = JSON.parse(roh);

  const verstoesse = [];
  if (!messung.zeiger.coarse) verstoesse.push("Emulation griff nicht: pointer ist nicht coarse");
  for (const leiste of messung.leisten) {
    if (leiste.laeuftUeber) verstoesse.push(`${leiste.rolle}: Leiste laeuft aus dem Log`);
    for (const knopf of leiste.knoepfe) {
      const soll = knopf.versionsschritt ? MIN_SCHRITT : MIN_ZIEL;
      if (knopf.breite < soll || knopf.hoehe < soll) {
        verstoesse.push(`${leiste.rolle}/${knopf.aktion}: ${knopf.breite}x${knopf.hoehe} px, gefordert ${soll}`);
      }
    }
  }

  const ergebnis = { url: URL_UNTER_TEST, geraet: "375x812, mobile, pointer coarse", ...messung, verstoesse };
  if (ALS_JSON) {
    console.log(JSON.stringify(ergebnis, null, 2));
  } else {
    console.log(`Touch-Ziele auf ${URL_UNTER_TEST}`);
    console.log(`  Viewport ${messung.viewport}, pointer coarse: ${messung.zeiger.coarse}`);
    for (const leiste of messung.leisten) {
      const groessen = leiste.knoepfe.map((k) => `${k.aktion} ${k.breite}x${k.hoehe}`).join(", ");
      console.log(`  ${leiste.rolle}: ${groessen}`);
      console.log(`    Leiste ${leiste.leisteHoehe} px hoch (${leiste.zeilen} Zeile(n)), Ueberlauf: ${leiste.laeuftUeber}`);
    }
    console.log(verstoesse.length ? `  VERSTOESSE:\n    ${verstoesse.join("\n    ")}` : "  Alle Touch-Ziele eingehalten.");
  }
  if (SELBSTTEST) {
    // Umgekehrte Erwartung: ohne Schutz MUSS es weh tun.
    console.log(`  Selbsttest: ${entfernt} Schutzregel(n) entfernt, ${verstoesse.length} Verstoss(e) erkannt.`);
    if (!verstoesse.length) {
      console.log("  SELBSTTEST FEHLGESCHLAGEN — die Messung ist nicht scharf genug.");
      process.exitCode = 1;
    } else {
      console.log("  Selbsttest bestanden: der Waechter erkennt den bekannten Fehler.");
      process.exitCode = 0;
    }
  } else {
    process.exitCode = verstoesse.length ? 1 : 0;
  }
} finally {
  client.close();
}
