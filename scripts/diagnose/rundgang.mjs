#!/usr/bin/env node
// smejj.com — der A-bis-Z-Rundgang: jede Ansicht betreten und hinsehen, was
// kaputt ist (Punkte 10 bis 13 des Auftrags).
//
// Was die anderen Werkzeuge NICHT beantworten: messe_responsive.mjs fragt nach
// seitlichem Ueberlauf, designsystem-einheit.mjs nach Streuung,
// chat-scrollverhalten.mjs nach dem Chat. Keines fragt die einfachste Frage
// eines Benutzers: "Ist diese Seite in Ordnung, wenn ich sie oeffne?"
//
// Gemessen wird je Ansicht:
//   * Fehler in der Konsole (window.onerror, unhandledrejection, console.error)
//   * Netzanfragen, die scheitern — 401 zaehlt NICHT, das ist ohne Anmeldung
//     der Normalfall und kein Mangel (Lehre 10.09.: 401 heisst "lebt, will
//     aber eine Anmeldung")
//   * Leere Ansicht: kein sichtbarer Text, keine Bedienelemente
//   * Sichtbare Fehlertexte ("Fehler", "ging schief", "nicht gefunden" …)
//
// MEHRFACH (Punkt 13): Der Rundgang laeuft standardmaessig zweimal. Ein Fehler,
// der nur im ERSTEN Lauf auftritt, ist ein Startfehler; einer, der nur im
// zweiten kommt, haengt am Zwischenspeicher. Beides ist wichtiger als die
// Summe.
//
// Aufruf: node scripts/diagnose/rundgang.mjs [--url https://smejj.com/] [--runden 2] [--json]
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";

const ANSICHTEN = [
  ["Startseite", "/"], ["Suche", "/search"], ["Websites", "/websites"],
  ["smejj Claw", "/smejj-claw"], ["smejjBot", "/smejjBot"], ["Verlauf", "/chat-history"],
  ["Browser", "/browser"], ["Coding", "/code"], ["Projekte", "/projects"],
  ["Dateien", "/files"], ["Speicher", "/storage"], ["Gedaechtnis", "/memory"],
  ["Modelle", "/ai"], ["Kosten", "/cost"], ["Status", "/systemzustand"],
  ["Einstellungen", "/settings"], ["Konto", "/profile"],
  ["Arbeitsbereiche", "/bereiche"], ["Papierkorb", "/papierkorb"]
];

// Begruendete Ausnahmen — jede mit Grund, sonst ist es eine stille Absenkung.
const ERWARTET = [
  { muster: /401/, grund: "ohne Anmeldung der Normalfall — 401 heisst 'lebt, will aber eine Anmeldung'" },
  { muster: /Failed to load resource.*40[13]/i, grund: "dito, aus Browsersicht formuliert" }
];

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
    throw new Error(`[${wo}] ${String(grund || "Auswertung fehlgeschlagen").split("\n")[0].slice(0, 160)}`);
  }
  return result?.value;
}

const ANMELDEN = `(() => {
  localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }));
  return "ok";
})()`;

// Faenger, die VOR dem Betreten der Ansicht stehen muessen — sonst entgeht
// ihnen genau der Fehler beim Aufbau, auf den es ankommt.
const FAENGER_SETZEN = `(() => {
  if (window.__smejjRundgang) { window.__smejjRundgang.fehler.length = 0; window.__smejjRundgang.netz.length = 0; return "zurueckgesetzt"; }
  const halde = { fehler: [], netz: [] };
  window.__smejjRundgang = halde;
  window.addEventListener("error", (e) => {
    halde.fehler.push(String(e.message || e.error || "Fehler").slice(0, 150));
  });
  window.addEventListener("unhandledrejection", (e) => {
    halde.fehler.push("unbehandelt: " + String(e.reason?.message || e.reason || "?").slice(0, 130));
  });
  const alt = console.error;
  console.error = (...teile) => { halde.fehler.push(teile.map((t) => String(t)).join(" ").slice(0, 150)); return alt.apply(console, teile); };
  const echt = window.fetch;
  window.fetch = async (...args) => {
    const adresse = String(args[0]?.url || args[0] || "");
    try {
      const antwort = await echt(...args);
      if (!antwort.ok) halde.netz.push(antwort.status + " " + adresse.slice(0, 90));
      return antwort;
    } catch (f) {
      halde.netz.push("Netzfehler " + adresse.slice(0, 90));
      throw f;
    }
  };
  return "gesetzt";
})()`;

const SAMMLE = `(() => {
  const halde = window.__smejjRundgang || { fehler: [], netz: [] };
  // document.body kann NULL sein, waehrend ein Seitenwechsel laeuft. Bei
  // /chat-history liefert GitHub Pages die 404-Seite, die ihrerseits in die App
  // umleitet — genau dann hat die erste Fassung gemessen und meldete
  // "TypeError: reading 'innerText' of null" plus "Ansicht wirkt leer". Beides
  // war MEIN Messfehler, nicht die App: in Runde 2 war die Umleitung im
  // Zwischenspeicher und alles gruen.
  if (!document.body) return { fehler: [], netz: [], textLaenge: -1, bedienelemente: -1, fehlertexte: [], ansichtId: "", imWechsel: true };
  const aktiv = document.querySelector("section.view.is-active, .premium-view.is-active") || document.body;
  const text = (aktiv.innerText || "").trim();
  const bedienbar = aktiv.querySelectorAll("button, a, input, textarea, select");
  let sichtbareBedienelemente = 0;
  for (const el of bedienbar) if (el.offsetWidth || el.offsetHeight) sichtbareBedienelemente++;
  // Sichtbare Fehlertexte — die Woerter, mit denen diese App Fehler benennt.
  const muster = /(etwas ging schief|ein fehler|fehlgeschlagen|nicht gefunden|konnte nicht|unbekannter fehler)/i;
  const treffer = [];
  for (const el of aktiv.querySelectorAll("*")) {
    if (el.children.length || !(el.offsetWidth || el.offsetHeight)) continue;
    const t = (el.textContent || "").trim();
    if (t && muster.test(t)) treffer.push(t.slice(0, 70));
  }
  return {
    fehler: [...new Set(halde.fehler)].slice(0, 6),
    netz: [...new Set(halde.netz)].slice(0, 6),
    textLaenge: text.length,
    bedienelemente: sichtbareBedienelemente,
    fehlertexte: [...new Set(treffer)].slice(0, 3),
    ansichtId: (document.querySelector("section.view.is-active") || {}).id || ""
  };
})()`;

const istErwartet = (zeile) => ERWARTET.find((e) => e.muster.test(zeile));

// Ein Rundgang, der ueberall "in Ordnung" meldet, kann zweierlei bedeuten: die
// App ist heil — oder die Messung sieht nichts. Der Unterschied ist alles.
//
// --selbsttest streut in JEDER Ansicht drei Schaeden ein: einen Konsolenfehler,
// eine gescheiterte Anfrage und einen sichtbaren Fehlertext. Alle drei MUESSEN
// gemeldet werden. (Dieselbe Lehre wie beim Waechter fuer doppelte Module am
// 10.09., der "4 Module geprueft" meldete statt 98.)
const SCHADEN_STREUEN = `(async () => {
  console.error("SELBSTTEST: ein kuenstlicher Konsolenfehler");
  try { await fetch("/gibtesnicht-selbsttest-" + Date.now()); } catch { /* zaehlt auch */ }
  const kasten = document.createElement("p");
  kasten.textContent = "Etwas ging schief (Selbsttest)";
  (document.querySelector("section.view.is-active") || document.body).append(kasten);
  return "gestreut";
})()`;

async function eineRunde(page, url, nummer, selbsttest = false) {
  const ergebnisse = [];
  for (const [name, pfad] of ANSICHTEN) {
    await page("Page.navigate", { url: `${url.replace(/\/$/, "")}${pfad}` });
    await sleep(700);
    await auswerten(page, ANMELDEN, "anmelden").catch(() => {});
    await auswerten(page, FAENGER_SETZEN, "faenger").catch(() => {});
    await sleep(2200);
    // Auf ein fertiges Dokument warten — sonst misst man den Wechsel, nicht die
    // Ansicht. Bis zu vier Versuche, dann gilt der Stand als er ist.
    for (let i = 0; i < 4; i++) {
      const fertig = await auswerten(page, '(() => Boolean(document.body) && document.readyState !== "loading")()', "warten").catch(() => false);
      if (fertig) break;
      await sleep(600);
    }
    if (selbsttest) await auswerten(page, SCHADEN_STREUEN, "selbsttest").catch(() => {});
    const stand = await auswerten(page, SAMMLE, `sammeln ${name}`).catch((f) => ({ fehler: [String(f.message).slice(0, 120)], netz: [], textLaenge: 0, bedienelemente: 0, fehlertexte: [] }));
    ergebnisse.push({ runde: nummer, name, pfad, ...stand });
  }
  return ergebnisse;
}

async function main() {
  const url = arg("--url", "https://smejj.com/");
  const runden = Math.max(1, Number(arg("--runden", "2")) || 2);
  const alsJson = process.argv.includes("--json");
  const selbsttest = process.argv.includes("--selbsttest");
  const chrome = await launchChrome();
  let aufraeumen = () => { chrome.close().catch(() => {}); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { aufraeumen(); process.exit(130); });

  const alle = [];
  try {
    const page = await openPage(chrome);
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    for (let runde = 1; runde <= runden; runde++) alle.push(...(await eineRunde(page, url, runde, selbsttest)));
  } finally {
    aufraeumen = () => {};
    await chrome.close();
  }

  if (alsJson) { console.log(JSON.stringify(alle, null, 2)); return; }

  console.log(`\nA-bis-Z-Rundgang auf ${url} — ${ANSICHTEN.length} Ansichten, ${runden} Runden\n`);
  const befunde = [];
  const ausnahmen = new Set();
  for (const [name] of ANSICHTEN) {
    const laeufe = alle.filter((a) => a.name === name);
    const zeilen = [];
    for (const lauf of laeufe) {
      for (const f of lauf.fehler) {
        const frei = istErwartet(f);
        if (frei) { ausnahmen.add(`${f.slice(0, 40)} — ${frei.grund}`); continue; }
        zeilen.push(`Runde ${lauf.runde}: ${f}`);
      }
      for (const n of lauf.netz) {
        const frei = istErwartet(n);
        if (frei) { ausnahmen.add(`${n.slice(0, 40)} — ${frei.grund}`); continue; }
        zeilen.push(`Runde ${lauf.runde}: Anfrage ${n}`);
      }
      for (const t of lauf.fehlertexte) zeilen.push(`Runde ${lauf.runde}: sichtbarer Fehlertext "${t}"`);
      // -1 heisst "mitten im Seitenwechsel gemessen" — daraus darf man nichts
      // schliessen, weder gut noch schlecht.
      if (lauf.imWechsel) continue;
      if (lauf.textLaenge < 40 && lauf.bedienelemente < 3) zeilen.push(`Runde ${lauf.runde}: Ansicht wirkt leer (${lauf.textLaenge} Zeichen, ${lauf.bedienelemente} Bedienelemente)`);
    }
    const nurErsteRunde = zeilen.length > 0 && zeilen.every((z) => z.startsWith("Runde 1"));
    const stand = zeilen.length === 0 ? "in Ordnung" : `${zeilen.length} Befund(e)${nurErsteRunde && runden > 1 ? " — NUR in Runde 1, also ein Startfehler" : ""}`;
    console.log(`  ${name.padEnd(16)} ${stand}`);
    for (const z of [...new Set(zeilen)].slice(0, 4)) console.log(`      - ${z}`);
    befunde.push(...zeilen);
  }

  if (selbsttest) {
    // Erwartet wird ALLES: Konsolenfehler, gescheiterte Anfrage, Fehlertext —
    // und zwar in jeder Ansicht. Findet der Rundgang weniger, ist er blind.
    const proAnsicht = ANSICHTEN.filter(([name]) => befunde.some((b) => alle.find((a) => a.name === name && (a.fehler.length || a.netz.length || a.fehlertexte.length))));
    const vollstaendig = proAnsicht.length === ANSICHTEN.length;
    console.log("");
    console.log(vollstaendig
      ? `SELBSTTEST BESTANDEN — alle ${ANSICHTEN.length} Ansichten meldeten den eingestreuten Schaden.`
      : `SELBSTTEST GESCHEITERT — nur ${proAnsicht.length} von ${ANSICHTEN.length} Ansichten meldeten ihn. Der Rundgang ist blind.`);
    process.exitCode = vollstaendig ? 0 : 1;
    return;
  }

  console.log("");
  for (const a of [...ausnahmen].slice(0, 3)) console.log(`  Ausnahme: ${a}`);
  console.log(befunde.length === 0
    ? `\nAlle ${ANSICHTEN.length} Ansichten oeffnen sauber, in ${runden} Runden.\n`
    : `\n${befunde.length} Befund(e) ueber ${runden} Runden — siehe oben.\n`);
  process.exitCode = befunde.length === 0 ? 0 : 1;
}

main().catch((fehler) => {
  console.error(`Rundgang fehlgeschlagen: ${fehler.message}`);
  process.exitCode = 1;
});
