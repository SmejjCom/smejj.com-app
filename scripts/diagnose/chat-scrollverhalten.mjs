#!/usr/bin/env node
// smejj.com — wie verhaelt sich der Chatverlauf, wenn wirklich etwas drinsteht?
//
// WARUM ES DIESES SKRIPT BRAUCHT (2026-09-11): messe_responsive.mjs misst die
// LEERE App — 152 Messpunkte gruen, aber kein einziger mit Chatinhalt. Und im
// verborgenen Browser-Fenster sind Layoutmessungen wertlos: #startLog meldete
// clientHeight 70 bei scrollHeight 240543, html und body meldeten 0. Wer so
// misst, misst das Fenster, nicht die App.
//
// Hier faehrt ein ECHTES Chrome-Fenster mit echter Geraete-Emulation vier
// Breiten durch, legt eine Unterhaltung mit den vier Inhalten an, die Layouts
// erfahrungsgemaess zerreissen, und fragt drei Dinge:
//
//   1. Laeuft der Verlauf seitlich ueber? (langes Wort, breite Tabelle, Code)
//   2. Springt er bei einer neuen Nachricht ans Ende? (Auto-Scroll)
//   3. Bleibt das Eingabefeld erreichbar, statt vom Verlauf verdeckt zu werden?
//
// GRENZE DIESER MESSUNG, ehrlich notiert: Der Selbsttest (--selbsttest) schiebt
// den Verlauf um 300 px aus dem Endanschlag. Tablet und Laptop melden das
// zuverlaessig, die beiden Handy-Breiten NICHT — dort zieht offenbar noch etwas
// anderes nach. Auf Handy ist diese Messung also weniger empfindlich, als ihr
// gruenes Ergebnis vermuten laesst.
//
// Aufruf: node scripts/diagnose/chat-scrollverhalten.mjs [--url https://smejj.com/]
//         node scripts/diagnose/chat-scrollverhalten.mjs --selbsttest
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";

const BREITEN = [
  { name: "Handy klein", breite: 320, hoehe: 568, handy: true },
  { name: "Handy", breite: 375, hoehe: 812, handy: true },
  { name: "Tablet hoch", breite: 768, hoehe: 1024, handy: true },
  { name: "Laptop", breite: 1280, hoehe: 800, handy: false }
];

// Die vier Inhalte, die Chatlayouts zerreissen. Bewusst KEINE Zufallstexte:
// jeder steht fuer einen Fehler, den es wirklich schon gab.
const PROBEN = [
  { was: "langes Wort", text: "Donaudampfschifffahrtselektrizitaetenhauptbetriebswerkbauunterbeamtengesellschaft".repeat(2) },
  { was: "nackte Adresse", text: "https://beispiel.de/" + "a".repeat(180) },
  { was: "breite Tabelle", text: "| Spalte eins | Spalte zwei | Spalte drei | Spalte vier | Spalte fuenf |\n|---|---|---|---|---|\n| Wert eins lang | Wert zwei lang | Wert drei lang | Wert vier lang | Wert fuenf lang |" },
  { was: "Codeblock", text: "```js\nconst sehrLangeZeile = { schluessel: \"ein Wert, der weit ueber die Breite eines Handys hinausgeht und nicht umbrechen darf\" };\n```" }
];

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

/** Wartet, bis der Speicher der Seite erreichbar ist (vor dem Anmelden). */
async function warteAufAnmeldbar(page, hoechstensMs = 25000) {
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
  throw new Error(`Die Seite wurde nicht bereit (${grund}).`);
}

/** Wartet, bis die Seite wirklich die gemessene Adresse traegt. */
async function warteAufHerkunft(page, hoechstensMs = 25000) {
  const ende = Date.now() + hoechstensMs;
  while (Date.now() < ende) {
    const bereit = await auswerten(page, 'document.readyState === "complete" && !!document.getElementById("startMessage")');
    if (bereit) return true;
    await sleep(300);
  }
  throw new Error("Die Seite wurde nicht fertig — Eingabefeld fehlt.");
}

/**
 * Legt die Unterhaltung DIREKT im Verlauf an, ohne Server.
 *
 * Absicht: gemessen wird das LAYOUT, nicht die Antwortqualitaet. Ein echter
 * Sendevorgang haenge sonst an Anmeldung, Kontingent und Tagesform des
 * Dienstes — und eine Messung, die aus fremden Gruenden ausfaellt, ist keine.
 */
const BAUE_VERLAUF = (proben) => `(() => {
  const log = document.getElementById("startLog");
  if (!log) return "kein Verlauf";
  log.hidden = false;
  document.getElementById("start")?.classList.add("has-start-chat");
  // Viermal durch: ein Verlauf, der nicht laenger ist als sein Fenster, SCROLLT
  // nicht — und dann misst man Auto-Scroll an etwas, das sich nie bewegt.
  // Genau daran ist der erste Selbsttest gescheitert (er sah nichts und meldete
  // gruen).
  const alle = [];
  for (let runde = 0; runde < 4; runde++) alle.push(...${JSON.stringify(proben)});
  for (const probe of alle) {
    const frage = document.createElement("article");
    frage.className = "entry user";
    frage.textContent = "Zeig mir: " + probe.was;
    const antwort = document.createElement("article");
    antwort.className = "entry assistant";
    antwort.dataset.probe = probe.was;
    antwort.textContent = probe.text;
    log.append(frage, antwort);
  }
  return "gebaut";
})()`;

const MISS_UEBERLAUF = `(() => {
  const breite = document.documentElement.clientWidth;
  const schlimm = [];
  for (const el of document.querySelectorAll("#startLog .entry, #startLog .entry *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const ueber = Math.round(r.right - breite);
    if (ueber > 2) schlimm.push({
      probe: el.closest("[data-probe]")?.dataset.probe || "?",
      was: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
      ueberMs: ueber
    });
  }
  return {
    seitenUeberlauf: Math.round(document.documentElement.scrollWidth - breite),
    elemente: schlimm.slice(0, 6)
  };
})()`;

const MISS_SCROLL = `(() => {
  const log = document.getElementById("startLog");
  if (!log) return { fehler: "kein Verlauf" };
  const scroller = log.scrollHeight > log.clientHeight + 10 ? log
    : [...document.querySelectorAll("#start, .home-feed, .workspace, body")].find((e) => e && e.scrollHeight > e.clientHeight + 10) || document.scrollingElement;
  const rest = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  const feld = document.getElementById("startMessage")?.getBoundingClientRect();
  return {
    scroller: scroller.id || String(scroller.className || scroller.tagName),
    scrollbar: scroller.scrollHeight > scroller.clientHeight + 10,
    restNachUnten: Math.round(rest),
    feldSichtbar: !!feld && feld.top >= 0 && feld.bottom <= window.innerHeight + 1,
    feldUnterkante: feld ? Math.round(window.innerHeight - feld.bottom) : null
  };
})()`;

// WICHTIG: hier wird der ECHTE Weg der App gefahren (addEntry aus
// app-helfer.js), nicht sein Nachbau. Die erste Fassung dieses Skripts rief
// selbst `scrollIntoView({ block: "end" })` mit dem Kommentar "derselbe Weg wie
// addEntry" — nach der Korrektur in addEntry stimmte das nicht mehr, und die
// Messung pruefte den alten Fehler statt den neuen Stand. Wer den Weg nachbaut,
// misst seinen Nachbau.
const ANS_ENDE_UND_NEUE_NACHRICHT = `(async () => {
  const log = document.getElementById("startLog");
  const scroller = log.scrollHeight > log.clientHeight + 10 ? log
    : [...document.querySelectorAll("#start, .home-feed, .workspace, body")].find((e) => e && e.scrollHeight > e.clientHeight + 10) || document.scrollingElement;
  scroller.scrollTop = scroller.scrollHeight;   // Nutzer ist unten
  const vorher = Math.round(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight);
  // DIE ECHTE LAGE HERSTELLEN: Beim Senden laeuft sofort ein Strom, und
  // verlauf-unten.js haelt sich dann bewusst zurueck ("waehrend des Stroms
  // haelt chat-stream.js die Sicht selbst"). Ohne dieses Ereignis rettet der
  // Beobachter nach 120 ms JEDEN Weg — auch den falschen — und die Messung
  // waere gruen, egal was addEntry tut. Genau daran ist der erste Selbsttest
  // dieses Skripts aufgefallen.
  window.dispatchEvent(new CustomEvent("smejj:chat-strom", { detail: { laufen: 1 } }));
  const helfer = await import("/assets/app-helfer.js?v=3");
  const neu = helfer.addEntry("Eine frische Nachricht, die unten ankommen muss.", "user", "#startLog");
  await new Promise((r) => setTimeout(r, 250));
  // Der Selbsttest schiebt den Verlauf absichtlich aus dem Endanschlag. Die
  // Messung MUSS das melden — sonst misst sie nichts und meldet trotzdem gruen.
  if (window.__smejjSelbsttest) scroller.scrollTop = Math.max(0, scroller.scrollTop - 300);
  window.dispatchEvent(new CustomEvent("smejj:chat-strom", { detail: { laufen: 0 } }));
  // Der "Rest" allein ist noch kein Fehler: unter dem Verlauf kann Polster
  // liegen. Entscheidend ist, was der NUTZER sieht — steht die frische
  // Nachricht ganz im Bild, und verdeckt die Bedienzone sie nicht?
  const r = neu.getBoundingClientRect();
  const zone = document.querySelector(".prompt-glass, .composer, #startComposer")?.getBoundingClientRect();
  const obergrenze = zone ? Math.min(zone.top, window.innerHeight) : window.innerHeight;
  return {
    scrollt: scroller.scrollHeight > scroller.clientHeight + 10,
    restVorher: vorher,
    restNachher: Math.round(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight),
    nachrichtGanzImBild: r.top >= -1 && r.bottom <= obergrenze + 1,
    verdecktUmPx: Math.max(0, Math.round(r.bottom - obergrenze)),
    obenAbgeschnittenPx: Math.max(0, Math.round(-r.top))
  };
})()`;

async function main() {
  const url = arg("--url", "https://smejj.com/");
  const alsJson = process.argv.includes("--json");
  // --selbsttest schiebt den Verlauf absichtlich aus dem Endanschlag; die
  // Messung MUSS das melden. Eine Messung, die nicht beweisen kann, dass sie
  // ueberhaupt etwas sieht, ist nur noch gruen.
  //
  // Die erste Fassung liess den Selbsttest stattdessen den ALTEN Scrollweg
  // fahren (scrollIntoView statt addEntry) und erwartete Rot. Das war ein
  // Irrtum: der Unterschied zwischen beiden Wegen zeigt sich hier mal mit 152,
  // mal mit 3, mal mit 0 px — abhaengig von Layoutruhe und Zeitpunkt. Ein
  // Selbsttest, der mal rot und mal gruen ist, beweist gar nichts.
  const selbsttest = process.argv.includes("--selbsttest");
  const chrome = await launchChrome();
  const befunde = [];
  try {
    for (const lage of BREITEN) {
      const page = await openPage(chrome);
      await page("Page.enable");
      await page("Runtime.enable");
      await page("Emulation.setDeviceMetricsOverride", {
        width: lage.breite, height: lage.hoehe, deviceScaleFactor: 2, mobile: lage.handy
      });
      if (lage.handy) await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      // Erst eine oertliche Anmeldung setzen — ohne sie zeigt smejj.com nur die
      // Werbeseite, und es gaebe gar keinen Chat zu messen (derselbe Weg wie in
      // messe_responsive.mjs). Kein Zugang, kein Geheimnis: nur der Schalter,
      // den die App selbst im Browser fuehrt.
      await page("Page.navigate", { url });
      await warteAufAnmeldbar(page);
      await auswerten(page, ANMELDEN);
      await page("Page.navigate", { url });
      await warteAufHerkunft(page);
      await sleep(1200);
      if (selbsttest) await auswerten(page, "window.__smejjSelbsttest = true");
      const gebaut = await auswerten(page, BAUE_VERLAUF(PROBEN));
      await sleep(900);
      const ueberlauf = await auswerten(page, MISS_UEBERLAUF);
      const scroll = await auswerten(page, MISS_SCROLL);
      const autoScroll = await auswerten(page, ANS_ENDE_UND_NEUE_NACHRICHT);
      befunde.push({ lage: lage.name, breite: lage.breite, gebaut, ueberlauf, scroll, autoScroll });
    }
  } finally {
    await chrome.close();
  }

  if (alsJson) { console.log(JSON.stringify(befunde, null, 2)); return; }

  console.log(`\nChat-Scrollverhalten auf ${url} — ${BREITEN.length} Breiten, je ${PROBEN.length} Proben\n`);
  let fehler = 0;
  for (const b of befunde) {
    const zeilen = [];
    if (b.ueberlauf.seitenUeberlauf > 2) zeilen.push(`Seite laeuft ${b.ueberlauf.seitenUeberlauf} px seitlich ueber`);
    for (const e of b.ueberlauf.elemente) zeilen.push(`${e.probe}: ${e.was} ragt ${e.ueberMs} px hinaus`);
    if (!b.scroll.feldSichtbar) zeilen.push(`Eingabefeld nicht sichtbar (Unterkante ${b.scroll.feldUnterkante})`);
    // Die STABILE Frage: steht der Verlauf danach am Ende? Die Pixel-Verdeckung
    // allein schwankte von Lauf zu Lauf (Schriften, Layoutruhe) und taugte nicht
    // als Kriterium — der Selbsttest war damit mal rot, mal gruen. Der Rest zum
    // Ende ist eindeutig: beim falschen Weg blieben 78 px stehen, beim richtigen
    // bleibt 0.
    if (!b.autoScroll.scrollt) zeilen.push("MESSUNG UNGUELTIG — der Verlauf scrollt gar nicht, Auto-Scroll ist hier nicht pruefbar");
    else if (b.autoScroll.restNachher > 24) zeilen.push(`Verlauf steht ${b.autoScroll.restNachher} px vor dem Ende — die neue Nachricht ist nicht ganz da`);
    else if (!b.autoScroll.nachrichtGanzImBild && b.autoScroll.verdecktUmPx > 24) zeilen.push(`neue Nachricht ${b.autoScroll.verdecktUmPx} px von der Bedienzone verdeckt`);
    fehler += zeilen.length;
    console.log(`  ${b.lage.padEnd(14)} ${String(b.breite).padStart(4)}  ${zeilen.length ? "" : "in Ordnung"}`);
    for (const z of zeilen) console.log(`      - ${z}`);
  }
  if (selbsttest) {
    const erkannt = fehler > 0;
    console.log(erkannt
      ? `\nSELBSTTEST BESTANDEN — der verschobene Verlauf wurde gemeldet (${fehler} Befunde).\n`
      : "\nSELBSTTEST GESCHEITERT — ein absichtlich verschobener Verlauf sah gruen aus. Die Messung ist blind.\n");
    process.exitCode = erkannt ? 0 : 1;
    return;
  }
  console.log(fehler === 0
    ? "\nKein seitlicher Ueberlauf, das Eingabefeld bleibt erreichbar, neue Nachrichten landen unten.\n"
    : `\n${fehler} Befund(e) — siehe oben.\n`);
  process.exitCode = fehler === 0 ? 0 : 1;
}

main().catch((fehler) => {
  console.error(`Messung fehlgeschlagen: ${fehler.message}`);
  process.exitCode = 1;
});
