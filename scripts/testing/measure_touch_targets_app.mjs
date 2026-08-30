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
  ["arbeitsbereiche", "/bereiche"],
  ["Suche", "/search"], ["Websites", "/websites"], ["smejj Claw", "/smejj-claw"],
  ["smejjBot", "/smejjBot"],
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
  },
  {
    auswahl: "#codeArbeit",
    grund: "11 px sichtbar ist Betreiber-Vorgabe (2026-08-18: 'das Viereck war gut, "
      + "Groesse, Platz und Form bleiben exakt'). Das Trefferfeld traegt ein "
      + "unsichtbares ::before und misst gemessene 43x43 px. Es sitzt aber nur "
      + "12 px vom rechten Feldrand, und dort schneidet die Ansicht es ab: von "
      + "acht Pruefpunkten treffen fuenf, die drei rechten laufen ins Leere. Ein "
      + "ZENTRIERTES 44-px-Feld ist an dieser Stelle nur zu haben, wenn der Punkt "
      + "wandert — und genau das ist ausgeschlossen. Der Startseiten-Zwilling "
      + "#startArbeit steht weiter innen und erfuellt das Ziel; er bleibt gemessen."
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
    // Ein Element kann KLEINER aussehen als es zu treffen ist: ein
    // unsichtbares ::before vergroessert die Klickflaeche, ohne das Bild zu
    // aendern. Genau so ist der Stopp-Punkt gebaut — 11 px sichtbar (so vom
    // Betreiber bestellt), 45 px fassbar (design-v11.css, inset: -17px).
    // Wer nur getBoundingClientRect misst, meldet ihn seit Monaten falsch rot
    // und verleitet dazu, ein bewusstes Designmass "zu reparieren".
    // Darum wird hier getippt statt gerechnet: acht Punkte am Rand eines
    // ${MIN_ZIEL}-px-Feldes um die Mitte. Treffen alle dasselbe Element, ist
    // das Ziel gross genug — liegt ein Nachbar darueber, faellt es durch.
    const mitteX = r.left + r.width / 2;
    const mitteY = r.top + r.height / 2;
    const rand = ${MIN_ZIEL} / 2 - 1;
    const punkte = [[-rand, -rand], [rand, -rand], [-rand, rand], [rand, rand],
                    [0, -rand], [0, rand], [-rand, 0], [rand, 0]];
    // elementsFromPoint (Plural) liefert den ganzen Stapel an einem Punkt.
    // Daraus lassen sich die zwei Fehlerbilder sauber trennen:
    //   liegt das Element ueberall IM Stapel -> die Klickflaeche ist gross
    //   genug; steht es dort nicht obenauf -> es ist VERDECKT, nicht zu klein.
    let obenauf = 0;
    let imStapel = 0;
    let darueber = "";
    for (const [dx, dy] of punkte) {
      const x = mitteX + dx;
      const y = mitteY + dy;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) break;
      const stapel = document.elementsFromPoint(x, y);
      const platz = stapel.findIndex((z) => z === el || el.contains(z));
      if (platz < 0) continue;
      imStapel += 1;
      if (platz === 0) { obenauf += 1; continue; }
      if (!darueber) {
        const z = stapel[0];
        darueber = (z.id ? "#" + z.id : z.tagName.toLowerCase())
          + (typeof z.className === "string" && z.className.trim()
              ? "." + z.className.trim().split(/\\s+/)[0] : "");
      }
    }
    if (obenauf === punkte.length) continue;
    const name = (el.getAttribute("aria-label") || el.title || el.value || el.textContent || "")
      .replace(/\\s+/g, " ").trim().slice(0, 34);
    const kennung = (el.id ? "#" + el.id : el.tagName.toLowerCase())
      + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/)[0] : "");
    klein.push({
      groesse: Math.round(r.width) + "x" + Math.round(r.height), kennung, name,
      // Ein Ziel mit ausreichend grosser Klickflaeche, das trotzdem nicht
      // ueberall trifft, ist verdeckt — nicht zu klein.
      // Nur wenn die Klickflaeche AN ALLEN Punkten reicht, ist Verdeckung die
      // Ursache. Sonst ist das Ziel schlicht zu klein und der Nachbar daneben
      // ist kein "Ueberlagerer".
      verdecktVon: imStapel === punkte.length ? darueber : ""
    });
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

// Wartet, bis die Seite WIRKLICH steht — nicht bis die Uhr abgelaufen ist.
// Begruendung und Bauart wie in messe_responsive.mjs: gegen die Live-Seite
// schwankt die Ladezeit auf dieser Leitung zwischen 0,8 und 11 Sekunden. Beim
// ersten Nachtlauf der Oberflaechenwache am 2026-08-22 meldete dieser Waechter
// drei Knoepfe mit 21x16 px, die in Wahrheit 44 px gross sind — gemessen wurde
// eine halbfertige Seite. Eine Wache, die ohne Grund rot meldet, liest bald
// niemand mehr.
async function warteBisRuhig(auswertenFn, hoechstensMs = 20000) {
  const SIGNATUR = [
    '(() => {',
    '  if (document.readyState !== "complete") return "laedt";',
    '  let summe = 0;',
    '  let anzahl = 0;',
    '  for (const el of document.querySelectorAll("button, a[href], input, select, textarea, [role=button]")) {',
    '    const r = el.getBoundingClientRect();',
    '    if (r.width < 1 || r.height < 1) continue;',
    '    anzahl += 1;',
    '    summe += Math.round(r.width) * 31 + Math.round(r.height) * 7 + Math.round(r.top);',
    '  }',
    '  return anzahl + ":" + summe;',
    '})()'
  ].join("\n");
  let vorher = "";
  const runden = Math.ceil(hoechstensMs / 350);
  for (let i = 0; i < runden; i += 1) {
    const jetzt = await auswertenFn(SIGNATUR);
    if (jetzt !== "laedt" && jetzt === vorher) return true;
    vorher = jetzt;
    await sleep(350);
  }
  return false;
}

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
  await sleep(800);
  await warteBisRuhig((x) => auswerten(page, x));
  await aufbauen(page);
  await warteBisRuhig((x) => auswerten(page, x));

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
    await sleep(350);
    if (!(await warteBisRuhig((x) => auswerten(page, x)))) {
      console.error(`  HINWEIS: ${name} kam in 20 s nicht zur Ruhe — der Befund kann von der Ladezeit stammen.`);
    }
    bereiche.push([name, JSON.parse(await auswerten(page, MESSUNG(true)))]);
  }

  const verstoesse = [];
  const hinweise = [];
  for (const [name, d] of bereiche) {
    if (d.ansicht === "KEINE aktive Ansicht") {
      verstoesse.push(`${name}: Ansicht liess sich nicht oeffnen — nicht gemessen`);
      continue;
    }
    if (d.ueberlauf) verstoesse.push(`${name}: laeuft ueber den rechten Rand`);
    for (const t of d.klein) {
      // Verdeckung ist ein Hinweis, kein Verstoss: bei offenem Menue liegt mit
      // Absicht etwas ueber dem Rest. Was davon ein Fehler ist, entscheidet
      // der Mensch — der Waechter wird davon nicht rot, sonst meldet er bei
      // jedem offenen Menue Alarm und man liest ihn bald nicht mehr.
      if (t.verdecktVon) {
        hinweise.push(`${name}/${t.kennung} "${t.name}": Klickflaeche reicht (${t.groesse} px sichtbar), liegt aber unter ${t.verdecktVon}`);
        continue;
      }
      verstoesse.push(`${name}/${t.kennung} "${t.name}": ${t.groesse} px, gefordert ${MIN_ZIEL}`);
    }
  }

  const ergebnis = {
    url: URL_UNTER_TEST,
    geraet: "375x812, mobile, pointer coarse",
    bereiche: bereiche.map(([name, d]) => ({ name, gezaehlt: d.gezaehlt, unterZiel: d.klein.length, ueberlauf: d.ueberlauf })),
    ausnahmen: AUSNAHMEN,
    hinweise,
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
    if (hinweise.length) console.log(`  HINWEISE (kein Verstoss):\n    ${hinweise.join("\n    ")}`);
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
