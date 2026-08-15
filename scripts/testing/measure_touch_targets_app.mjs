#!/usr/bin/env node
// smejj.com — Touch-Ziele der GANZEN App auf einem emulierten Handy messen.
//
// Verhaeltnis zu measure_touch_targets.mjs: das dort misst genau die
// Chat-Aktionsleiste, sehr genau und mit Selbsttest. Es hat aber eine Luecke,
// die am 2026-08-09 sichtbar wurde: waehrend die Leiste dort gruen war, lagen
// 23 von 30 Elementen der Startseite und 107 in den 15 Ansichten unter 44 px,
// ohne dass irgendein Check angeschlagen haette. Dieses Skript schliesst die
// Luecke — es misst jedes sichtbare bedienbare Element.
//
// Warum ein Browser mit echter Emulation und kein statischer CSS-Test:
// `resize_window` auf 375 px macht aus einem Desktop-Browser KEIN Touch-Geraet
// (`pointer: fine` bleibt wahr), und die Handy-Zweige der Stylesheets greifen
// dann gar nicht. Hier setzen Emulation.setDeviceMetricsOverride (mobile) und
// setEmulatedMedia (pointer/any-pointer coarse) das echte Verhalten.
//
// Aufruf:
//   node scripts/testing/measure_touch_targets_app.mjs
//   node scripts/testing/measure_touch_targets_app.mjs --url https://smejj.com/ --json
//   node scripts/testing/measure_touch_targets_app.mjs --selbsttest

import { launchChrome, openPage, sleep } from "./cdp-client.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const URL_UNTER_TEST = flag("url", "https://smejj.com/");
const ALS_JSON = args.includes("--json");
// Selbsttest: nimmt die Handy-Regeln zur Laufzeit heraus und ERWARTET
// Verstoesse. Findet er dann keine, misst dieses Skript nicht scharf genug und
// der ganze Check waere wertlos.
const SELBSTTEST = args.includes("--selbsttest");
const MIN_ZIEL = 44;

// Ansichten aus public/view-routes.js. Der Wechsel laeuft ueber pushState plus
// popstate: ein Klick durchs Menue erreicht nicht jede Ansicht, und die
// Anmelde-Pflicht steht einem echten Seitenwechsel im Weg.
const ANSICHTEN = [
  ["papierkorb", "/papierkorb"],
  ["Suche", "/search"], ["Websites", "/websites"], ["smejj Claw", "/smejj-claw"],
  ["Automatisierung", "/automation"],
  ["Verlauf", "/chat-history"], ["Browser", "/browser"], ["Coding", "/code"],
  ["Projekte", "/projects"], ["Dateien", "/files"], ["Speicher", "/storage"],
  ["Gedaechtnis", "/memory"], ["Modelle", "/ai"], ["Kosten", "/cost"],
  ["Status", "/status"], ["Einstellungen", "/settings"], ["Konto", "/profile"]
];

// Begruendete Ausnahmen. Jede braucht einen Grund — eine Ausnahmeliste ohne
// Begruendung ist eine stille Absenkung des Ziels.
const AUSNAHMEN = [
  {
    auswahl: "#profilePictureInput",
    grund: "per CSS verborgener File-Input; bedient wird der sichtbare Knopf daneben"
  }
];

const AUSWAHL = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=menuitem], [role=tab], [role=switch]";

const MESSUNG = (nurAktiveAnsicht) => `(() => {
  const aktiv = ${nurAktiveAnsicht} ? document.querySelector(".view.is-active, .premium-view.is-active") : null;
  const wurzel = aktiv || document.body;
  const ausnahmen = ${JSON.stringify(AUSNAHMEN.map((a) => a.auswahl))};
  const klein = [];
  let gezaehlt = 0;
  for (const el of wurzel.querySelectorAll(${JSON.stringify(AUSWAHL)})) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const stil = getComputedStyle(el);
    if (stil.visibility === "hidden" || stil.display === "none" || Number(stil.opacity) === 0) continue;
    if (el.hasAttribute("hidden") || el.closest("[hidden]")) continue;
    gezaehlt += 1;
    if (r.width >= ${MIN_ZIEL} && r.height >= ${MIN_ZIEL}) continue;
    if (ausnahmen.some((a) => el.matches(a))) continue;
    const name = (el.getAttribute("aria-label") || el.title || el.value || el.textContent || "")
      .replace(/\\s+/g, " ").trim().slice(0, 34);
    const kennung = (el.id ? "#" + el.id : el.tagName.toLowerCase())
      + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/)[0] : "");
    klein.push({ groesse: Math.round(r.width) + "x" + Math.round(r.height), kennung, name });
  }
  return JSON.stringify({
    ansicht: aktiv ? (aktiv.id || "?") : (${nurAktiveAnsicht} ? "KEINE aktive Ansicht" : "start"),
    gezaehlt,
    klein,
    // Eine Ansicht, die ueber den rechten Rand laeuft, ist genauso kaputt wie
    // ein zu kleiner Knopf — und entsteht oft beim Vergroessern (Grid-Items
    // haben min-width: auto und wachsen mit ihrem breitesten Kind).
    ueberlauf: wurzel.getBoundingClientRect().right > innerWidth + 1
  });
})()`;

// Baut einen echten Chat-Zustand auf der Startseite nach.
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
  return "aufgebaut";
})()`;

// Entfernt genau die Regeln, die die Ziele auf 44 px halten. Danach MUSS es weh
// tun — sonst misst dieses Skript nicht scharf genug.
const SCHUTZ_ENTFERNEN = `(() => {
  let getroffen = 0;
  for (const sheet of document.styleSheets) {
    let regeln; try { regeln = sheet.cssRules; } catch { continue; }
    for (const regel of regeln) {
      if (regel.type !== CSSRule.MEDIA_RULE) continue;
      if (!String(regel.conditionText || regel.media.mediaText).includes("600px")) continue;
      for (const innen of regel.cssRules) {
        if (!innen.style) continue;
        for (const eigenschaft of ["min-height", "height", "min-width", "width"]) {
          if (innen.style.getPropertyValue(eigenschaft)) {
            innen.style.removeProperty(eigenschaft);
            getroffen += 1;
          }
        }
      }
    }
  }
  return getroffen;
})()`;

async function auswerten(page, ausdruck) {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression: ausdruck, returnByValue: true, awaitPromise: true
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text || "Auswertung fehlgeschlagen");
  return result.value;
}

// Der Aufbau kann mitten in eine Weiterleitung geraten (die Anmelde-Pflicht
// schickt Abgemeldete auf /auth/login/). Deshalb mit Geduld wiederholen.
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
  await page("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await page("Emulation.setEmulatedMedia", {
    features: [{ name: "pointer", value: "coarse" }, { name: "any-pointer", value: "coarse" }]
  });
  await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await page("Page.navigate", { url: URL_UNTER_TEST });
  await sleep(2800);
  await aufbauen(page);
  await sleep(900);

  if (!(await auswerten(page, `matchMedia("(pointer: coarse)").matches`))) {
    throw new Error("Emulation griff nicht: pointer ist nicht coarse — die Messung waere wertlos.");
  }

  let entfernt = 0;
  if (SELBSTTEST) {
    entfernt = await auswerten(page, SCHUTZ_ENTFERNEN);
    if (!entfernt) throw new Error("Selbsttest: keine 600-px-Regel gefunden — Stylesheet unerwartet aufgebaut.");
    await sleep(400);
  }

  const bereiche = [];

  // 1-3: Startseite in drei Zustaenden. Das meiste wird erst nach einem Tap
  // sichtbar; wer nur den Ruhezustand misst, uebersieht Menues.
  bereiche.push(["Startseite", JSON.parse(await auswerten(page, MESSUNG(false)))]);

  await auswerten(page, `document.querySelector('#startLog .msg-act[data-act="menu"]')?.click()`);
  await sleep(500);
  bereiche.push(["Startseite, Nachrichten-Menue offen", JSON.parse(await auswerten(page, MESSUNG(false)))]);
  await auswerten(page, `document.querySelector(".msg-menu")?.remove()`);

  await auswerten(page, `document.querySelector("#appMenuButton")?.click()`);
  await sleep(700);
  bereiche.push(["Startseite, linkes Menue offen", JSON.parse(await auswerten(page, MESSUNG(false)))]);
  await auswerten(page, `document.querySelector("#appMenuButton")?.click()`);
  await sleep(500);

  // 4ff: jede Ansicht einzeln.
  for (const [name, pfad] of ANSICHTEN) {
    await auswerten(page, `(() => { history.pushState({}, "", ${JSON.stringify(pfad)}); dispatchEvent(new PopStateEvent("popstate")); })()`);
    await sleep(1000);
    bereiche.push([name, JSON.parse(await auswerten(page, MESSUNG(true)))]);
  }

  const verstoesse = [];
  for (const [name, d] of bereiche) {
    if (d.ansicht === "KEINE aktive Ansicht") {
      verstoesse.push(`${name}: Ansicht liess sich nicht oeffnen — nicht gemessen`);
      continue;
    }
    if (d.ueberlauf) verstoesse.push(`${name}: laeuft ueber den rechten Rand`);
    for (const t of d.klein) {
      verstoesse.push(`${name}/${t.kennung} "${t.name}": ${t.groesse} px, gefordert ${MIN_ZIEL}`);
    }
  }

  const ergebnis = {
    url: URL_UNTER_TEST,
    geraet: "375x812, mobile, pointer coarse",
    bereiche: bereiche.map(([name, d]) => ({ name, gezaehlt: d.gezaehlt, unterZiel: d.klein.length, ueberlauf: d.ueberlauf })),
    ausnahmen: AUSNAHMEN,
    verstoesse
  };

  if (ALS_JSON) {
    console.log(JSON.stringify(ergebnis, null, 2));
  } else {
    console.log(`Touch-Ziele der App auf ${URL_UNTER_TEST} (${MIN_ZIEL} px, 375x812, pointer coarse)`);
    for (const b of ergebnis.bereiche) {
      const rest = b.unterZiel ? `${b.unterZiel} unter ${MIN_ZIEL}` : "in Ordnung";
      console.log(`  ${b.name.padEnd(36)} ${String(b.gezaehlt).padStart(3)} bedienbar — ${rest}${b.ueberlauf ? ", LAEUFT UEBER" : ""}`);
    }
    for (const a of AUSNAHMEN) console.log(`  Ausnahme ${a.auswahl}: ${a.grund}`);
    console.log(verstoesse.length ? `  VERSTOESSE:\n    ${verstoesse.join("\n    ")}` : "  Alle Touch-Ziele eingehalten.");
  }

  if (SELBSTTEST) {
    console.log(`  Selbsttest: ${entfernt} Regel-Eigenschaft(en) entfernt, ${verstoesse.length} Verstoss(e) erkannt.`);
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
