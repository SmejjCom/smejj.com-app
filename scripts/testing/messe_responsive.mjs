#!/usr/bin/env node
// smejj.com — misst die GANZE App auf allen Bildschirmbreiten (Aufgabe 100).
//
// Verhaeltnis zu measure_touch_targets_app.mjs: das misst EINE Breite (375 px)
// und fragt nur nach der Groesse der Knoepfe. Damit blieb alles zwischen Handy
// und Schreibtisch ungemessen — 600 px, 768 px, 1024 px sind bis heute nie
// nachgesehen worden, obwohl die Regeln in start-styles.css genau dort
// umschalten. Dieses Skript schliesst die Luecke: es faehrt jede Ansicht durch
// acht Breiten und fragt nach dem einen Fehler, den man auf dem Geraet sofort
// spuert und am Schreibtisch nie sieht — die Seite laeuft seitlich ueber.
//
// Warum echte Emulation und kein CSS-Lesen: `resize_window` allein macht aus
// dem Schreibtisch-Browser kein Tablet (`pointer: fine` bleibt wahr), die
// Handy-Zweige greifen dann gar nicht. Hier setzt Emulation Geraetemasse UND
// Zeigertyp — siehe [[smejj-handy-test-echte-tipps]].
//
// Aufruf:
//   node scripts/testing/messe_responsive.mjs
//   node scripts/testing/messe_responsive.mjs --url https://smejj.com/ --json
//   node scripts/testing/messe_responsive.mjs --selbsttest

import { launchChrome, openPage, sleep } from "./cdp-client.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const URL_UNTER_TEST = flag("url", "http://127.0.0.1:3000/");
const ALS_JSON = args.includes("--json");
// Selbsttest: zwingt der App zur Laufzeit eine feste Mindestbreite auf und
// ERWARTET Verstoesse. Findet er keine, misst dieses Skript nicht scharf genug.
const SELBSTTEST = args.includes("--selbsttest");
const NUR_BREITE = flag("breite", "");

// Acht Geraeteklassen. Die vier schmalen mit Zeiger "coarse" (Finger), die
// vier breiten mit "fine" (Maus) — sonst misst man am Schreibtisch die
// Handy-Regeln oder umgekehrt.
const GERAETE = [
  { name: "Handy klein 320",   breite: 320,  hoehe: 568,  mobil: true,  skala: 2 },
  { name: "Handy 375",         breite: 375,  hoehe: 812,  mobil: true,  skala: 3 },
  { name: "Handy gross 430",   breite: 430,  hoehe: 932,  mobil: true,  skala: 3 },
  { name: "Tablet hoch 768",   breite: 768,  hoehe: 1024, mobil: true,  skala: 2 },
  { name: "Tablet quer 1024",  breite: 1024, hoehe: 768,  mobil: true,  skala: 2 },
  { name: "Laptop 1280",       breite: 1280, hoehe: 800,  mobil: false, skala: 1 },
  { name: "Schreibtisch 1440", breite: 1440, hoehe: 900,  mobil: false, skala: 1 },
  { name: "Breitbild 1920",    breite: 1920, hoehe: 1080, mobil: false, skala: 1 }
];

// Ansichten aus public/view-routes.js.
const ANSICHTEN = [
  ["Startseite", "/"],
  ["Suche", "/search"], ["Websites", "/websites"], ["smejj Claw", "/smejj-claw"],
  ["smejjBot", "/smejjBot"], ["Verlauf", "/chat-history"], ["Browser", "/browser"],
  ["Coding", "/code"], ["Projekte", "/projects"], ["Dateien", "/files"],
  ["Speicher", "/storage"], ["Gedaechtnis", "/memory"], ["Modelle", "/ai"],
  ["Kosten", "/cost"], ["Status", "/status"], ["Einstellungen", "/settings"],
  ["Konto", "/profile"], ["Arbeitsbereiche", "/bereiche"], ["Papierkorb", "/papierkorb"]
];

// Begruendete Ausnahmen — jede mit Grund, sonst ist es eine stille Absenkung.
const AUSNAHMEN = [
  { auswahl: ".msg-menu", grund: "Ueberlagerung; wird beim Oeffnen ausgerichtet, im Ruhezustand geparkt" }
];

// Nur fuer den Abschneide-Befund: ein Eingabefeld, dessen Text laenger ist als
// der Kasten, scrollt intern — das ist die Bauart von input/textarea/select und
// kein Layoutfehler. Ihre AUSSENmasse zaehlen weiter voll mit (Befund 1), sonst
// wuerde ein zu breites Feld hier verschwinden.
const AUSNAHMEN_INNENLAUF = [
  { auswahl: "input, textarea, select", grund: "scrollen ihren eigenen Text von Haus aus" }
];

// Der eigentliche Befund. Zwei Fragen je Ansicht:
//   1. Laeuft das Dokument seitlich ueber? (das spuert man sofort: die Seite
//      wackelt beim Wischen, Text steht ausserhalb.)
//   2. Wenn ja: WELCHES Element ist schuld? Gemeldet wird nur das oberste —
//      Kinder erben die Breite ihres Elternteils, eine Liste aller waere Laerm.
const MESSUNG = `(() => {
  const ausnahmen = ${JSON.stringify(AUSNAHMEN.map((a) => a.auswahl))};
  const grenze = innerWidth + 1;
  const scrollbar = document.documentElement.scrollWidth > grenze;
  const kennungVon = (el) => (el.id ? "#" + el.id : el.tagName.toLowerCase())
    + (typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\\s+/)[0] : "");

  const sichtbar = (el, stil) => !(stil.visibility === "hidden" || stil.display === "none"
    || Number(stil.opacity) === 0 || el.hasAttribute("hidden") || el.closest("[hidden]")
    || ausnahmen.some((a) => el.matches(a) || el.closest(a)));

  // Geparkte Ueberlagerungen (Schublade links, Browser-Flaeche rechts, die
  // Fuehrungsblase, Nur-fuer-Vorleser-Ueberschriften) liegen mit Absicht
  // ausserhalb und werden erst beim Oeffnen hereingefahren. Sie stehen nicht
  // im Textfluss und machen die Seite nicht breit.
  const imFluss = (el, stil) => {
    if (stil.position === "fixed" || stil.position === "absolute") return false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.position === "fixed" || ps.position === "absolute") return false;
    }
    return true;
  };

  // Befund 1: steht Inhalt ueber dem rechten Rand? Gemeldet wird nur das
  // oberste betroffene Element — Kinder erben die Breite, eine Liste aller
  // waere Laerm.
  const ueberstand = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right <= grenze && r.left >= -1) continue;
    const stil = getComputedStyle(el);
    if (!sichtbar(el, stil) || !imFluss(el, stil)) continue;
    let geborgen = false;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX !== "visible") { geborgen = true; break; }
      const pr = p.getBoundingClientRect();
      if (pr.right > grenze || pr.left < -1) { geborgen = true; break; }
    }
    if (geborgen) continue;
    ueberstand.push({
      kennung: kennungVon(el), breite: Math.round(r.width), rechts: Math.round(r.right),
      text: (el.getAttribute("aria-label") || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 40)
    });
    if (ueberstand.length >= 6) break;
  }

  // Befund 2: wird Inhalt STILL abgeschnitten? Ein Behaelter mit
  // overflow-x: hidden verbirgt den Fehler vor Befund 1 — auf dem Geraet fehlt
  // dann einfach die rechte Haelfte, ohne Bildlaufleiste und ohne Hinweis.
  // overflow-x: auto/scroll ist Absicht (Tabellen, Chip-Reihen) und faellt hier
  // nicht auf; Abschneiden mit Auslassungspunkten ebenso wenig.
  const abgeschnitten = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (!el.clientWidth) continue;
    const ueber = el.scrollWidth - el.clientWidth;
    // Zwei Schwellen, weil die Fehlerbilder verschieden empfindlich sind.
    // Still abgeschnittener Inhalt faellt erst bei einem spuerbaren Rest auf,
    // und knapp darunter liegen Schatten und Rundungen — 24 px halten das
    // ruhig. Ein Seitenbehaelter dagegen darf ueberhaupt nicht wandern: die
    // Schublade lief am 2026-08-22 um 14 px, und mit der groben Schwelle blieb
    // der Waechter stumm, obwohl der Text sichtbar an der Kante abbrach. Wer
    // hier nur die Schublade in die Auswahl aufnimmt und die Schwelle
    // vergisst, baut einen Schutz, der nichts schuetzt.
    const stil = getComputedStyle(el);
    const schneidet = stil.overflowX === "hidden" || stil.overflowX === "clip";
    // Seitlich scrollen darf ein INNERER Behaelter (Tabelle, Code-Block,
    // Chip-Reihe) — die ganze Seitenflaeche darf es nicht. Wenn die Ansicht
    // selbst seitlich scrollt, ist das Layout nicht umgebrochen, sondern nur
    // weggeschoben; auf dem Handy wackelt dann alles beim Wischen.
    // Die Schublade steht dabei den Seitenflaechen gleich: sie hat eine feste
    // Breite und ist eine Navigation, keine Tabelle. Am 2026-08-22 lief dort
    // "Browser bedienen" 3 px hinter die Kante — zu sehen war nur ein Text, der
    // ohne Auslassungspunkte endete, und der Waechter schwieg, weil er den
    // seitlichen Bildlauf eines INNEREN Behaelters fuer Absicht hielt.
    const scrolltAlsSeite = (stil.overflowX === "auto" || stil.overflowX === "scroll")
      && el.matches(".view, .premium-view, main, .shell, #start, body, .sidebar, .sidebar .nav");
    if (!schneidet && !scrolltAlsSeite) continue;
    if (ueber <= (scrolltAlsSeite ? 4 : 24)) continue;
    if (schneidet && stil.textOverflow === "ellipsis") continue;
    // Ein Eingabefeld, dessen Text laenger ist als der Kasten, scrollt intern —
    // das ist die normale Bauart von input/textarea/select und kein Layoutfehler.
    if (el.matches("input, textarea, select")) continue;
    // Hier gilt NICHT die Fluss-Pruefung. Die Schublade haengt an fixed,
    // und der Filter warf damit die ganze Navigation aus der Messung — der
    // Waechter schwieg zu einem Fehler, den man auf dem Bildschirm sah. Fuer
    // diesen Befund zaehlt etwas anderes: liegt der Behaelter sichtbar im
    // Fenster? Geparkte Ueberlagerungen liegen ausserhalb und fallen so
    // weiterhin heraus, ohne dass echte fixierte Flaechen mit ihnen gehen.
    const rr = el.getBoundingClientRect();
    const imFenster = rr.width > 2 && rr.right > 0 && rr.left < innerWidth;
    if (!sichtbar(el, stil) || !imFenster) continue;
    abgeschnitten.push({ kennung: kennungVon(el), fehlt: ueber, sichtbar: el.clientWidth, art: schneidet ? "abgeschnitten" : "seitlicher Bildlauf" });
    if (abgeschnitten.length >= 6) break;
  }

  const flaeche = document.querySelector(".view.is-active, .premium-view.is-active") || document.querySelector("#start");

  return JSON.stringify({
    fensterbreite: innerWidth,
    flaechenbreite: flaeche ? flaeche.clientWidth : 0,
    dokumentbreite: document.documentElement.scrollWidth,
    scrollbar,
    ueberstand,
    abgeschnitten
  });
})()`;

// Echte Inhalte statt leerer Ansichten. Ohne sie misst man das Geruest und
// nennt es Ergebnis: die klassischen Ueberlaeufer sind eine lange Adresse ohne
// Leerzeichen, ein breiter Code-Block und eine Tabelle mit vielen Spalten —
// alles Dinge, die im Chat taeglich vorkommen und in einer leeren Ansicht
// niemals auftauchen.
const INHALT_AUFBAUEN = `(() => {
  const log = document.querySelector("#startLog");
  if (!log) return "kein log";
  if (log.querySelector(".responsive-inhalt")) return "aufgebaut";
  log.hidden = false;
  document.querySelector("#start")?.classList.add("has-start-chat");

  const frage = document.createElement("article");
  frage.className = "entry user responsive-inhalt";
  frage.textContent = "Bitte pruefe https://smejj.example.com/sehr/langer/pfad/ohne-leerzeichen/der-nicht-umbricht?parameter=alpha&zweiter=beta#anker";

  const antwort = document.createElement("article");
  antwort.className = "entry assistant responsive-inhalt";
  antwort.innerHTML = [
    "<p>Ein Absatz mit einem sehr langen Wort: Donaudampfschifffahrtselektrizitaetenhauptbetriebswerkbauunterbeamtengesellschaft.</p>",
    "<pre><code>const sehrLangeZeileOhneUmbruch = zusammensetzen(alphaBetaGamma, deltaEpsilonZeta, etaThetaIota, kappaLambdaMy);</code></pre>",
    "<table><thead><tr><th>Modell</th><th>Eingabe</th><th>Ausgabe</th><th>Dauer</th><th>Kosten</th><th>Bemerkung</th></tr></thead>",
    "<tbody><tr><td>smejj 1.0</td><td>128000</td><td>4096</td><td>12,4 s</td><td>0,0031 USD</td><td>tiefe Spur, Zwischenspeicher warm</td></tr></tbody></table>"
  ].join("");

  log.append(frage, antwort);
  return "aufgebaut";
})()`;

// Meldet sich an, ohne echten Server-Login: die Anmelde-Pflicht schickt sonst
// jede Messung auf /auth/login/ und man misst die Anmeldeseite achtmal.
const ANMELDEN = `(() => {
  localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }));
  return "ok";
})()`;

// Selbsttest-Probe: ein zu breites Element mitten in die sichtbare Ansicht.
// Genau so entsteht der Fehler in echt (eine Tabelle, ein Code-Block, ein Bild
// mit fester Breite). Eine per Stylesheet erzwungene Mindestbreite taugte
// nicht: `.shell` schlaegt `main` bei gleichem !important schon ueber die
// Spezifitaet, die Probe kam nie an und der Selbsttest war still gruen.
const PROBE_EINSETZEN = `(() => {
  document.querySelectorAll(".responsive-selbsttest").forEach((el) => el.remove());
  const ziel = document.querySelector(".view.is-active, .premium-view.is-active")
    || document.querySelector("#start") || document.querySelector("main");
  if (!ziel) return 0;
  const probe = document.createElement("div");
  probe.className = "responsive-selbsttest";
  probe.style.cssText = "width: 2400px; height: 24px; background: red;";
  ziel.append(probe);
  return 1;
})()`;

async function auswerten(page, ausdruck) {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression: ausdruck, returnByValue: true, awaitPromise: true
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text || "Auswertung fehlgeschlagen");
  return result.value;
}

// Wartet, bis die Seite WIRKLICH steht — nicht bis die Uhr abgelaufen ist.
//
// Warum: gegen die Live-Seite schwankt die Ladezeit auf dieser Leitung
// zwischen 0,8 und 11 Sekunden. Eine feste Wartezeit misst darum mal die
// fertige Seite und mal eine halbfertige. Beim ersten Nachtlauf der
// Oberflaechenwache am 2026-08-22 kamen so drei Knoepfe mit 21x16 px heraus,
// die in Wahrheit 44 px gross sind — eine Wache, die ohne Grund rot meldet,
// liest bald niemand mehr.
//
// Gewartet wird auf zwei Dinge: das Dokument ist fertig, UND das Layout
// bewegt sich nicht mehr. Die Signatur ist die Summe der Masse aller
// sichtbaren Bedienelemente; bleibt sie zweimal im Abstand von 350 ms gleich,
// steht die Seite. Laeuft die Geduld ab, wird trotzdem gemessen — mit Vermerk.
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

async function ansichtOeffnen(page, pfad) {
  await auswerten(page, `(() => { history.pushState({}, "", ${JSON.stringify(pfad)}); dispatchEvent(new PopStateEvent("popstate")); })()`);
  await sleep(350);
  if (!(await warteBisRuhig((x) => auswerten(page, x)))) {
    console.error(`  HINWEIS: ${pfad} kam in 20 s nicht zur Ruhe — gemessen wird trotzdem, der Befund kann von der Ladezeit stammen.`);
  }
  if (pfad === "/") {
    await auswerten(page, INHALT_AUFBAUEN);
    await sleep(300);
  }
}

const geraeteliste = NUR_BREITE
  ? GERAETE.filter((g) => String(g.breite) === String(NUR_BREITE))
  : GERAETE;
if (!geraeteliste.length) throw new Error(`Keine Geraeteklasse mit Breite ${NUR_BREITE}.`);

const client = await launchChrome();
const verstoesse = [];
const zeilen = [];
try {
  const page = await openPage(client);
  await page("Page.enable");
  await page("Runtime.enable");
  await page("Page.navigate", { url: URL_UNTER_TEST });
  await sleep(2500);
  await auswerten(page, ANMELDEN);
  await page("Page.navigate", { url: URL_UNTER_TEST });
  await sleep(2800);

  for (const g of geraeteliste) {
    await page("Emulation.setDeviceMetricsOverride", {
      width: g.breite, height: g.hoehe, deviceScaleFactor: g.skala, mobile: g.mobil
    });
    const zeiger = g.mobil ? "coarse" : "fine";
    await page("Emulation.setEmulatedMedia", {
      features: [{ name: "pointer", value: zeiger }, { name: "any-pointer", value: zeiger }]
    });
    await page("Emulation.setTouchEmulationEnabled", { enabled: g.mobil, maxTouchPoints: g.mobil ? 5 : 1 });
    await sleep(500);

    // Frisch laden statt nur die Groesse zu aendern. Ein blosses Umstellen der
    // Geraetemasse traegt den Zustand der vorigen Breite mit: Flaechen, die auf
    // dem Handy angedockt wurden, blieben auf dem Tablet angedockt, und die
    // Messung meldete dann Ueberlaeufe, die kein Geraet je zeigt. Ein echtes
    // Geraet laedt die Seite in seiner Groesse — genau das hier.
    await page("Page.navigate", { url: URL_UNTER_TEST });
    await sleep(800);
    await warteBisRuhig((x) => auswerten(page, x));

    if (!(await auswerten(page, `matchMedia("(pointer: ${zeiger})").matches`))) {
      throw new Error(`Emulation griff nicht: pointer ist nicht ${zeiger} — die Messung waere wertlos.`);
    }
    if (SELBSTTEST) await auswerten(page, PROBE_EINSETZEN);

    for (const [name, pfad] of ANSICHTEN) {
      await ansichtOeffnen(page, pfad);
      if (SELBSTTEST) await auswerten(page, PROBE_EINSETZEN);
      const d = JSON.parse(await auswerten(page, MESSUNG));
      zeilen.push({ geraet: g.name, ansicht: name, ...d });
      if (d.scrollbar || d.ueberstand.length) {
        const wer = d.ueberstand.map((s) => `${s.kennung} (${s.breite} px, bis ${s.rechts})`).join(", ")
          || "kein einzelnes Element — Dokument selbst zu breit";
        verstoesse.push(`${g.name} / ${name}: laeuft ueber, ${d.dokumentbreite} statt ${d.fensterbreite} px — ${wer}`);
      }
      for (const a of d.abgeschnitten) {
        verstoesse.push(a.art === "abgeschnitten"
          ? `${g.name} / ${name}: ${a.kennung} schneidet ${a.fehlt} px still ab (sichtbar ${a.sichtbar} px)`
          : `${g.name} / ${name}: ${a.kennung} scrollt seitlich, ${a.fehlt} px zu breit (sichtbar ${a.sichtbar} px)`);
      }
    }
  }
} finally {
  await client.close();
}

const ergebnis = {
  url: URL_UNTER_TEST,
  geraete: geraeteliste.map((g) => `${g.breite}x${g.hoehe} ${g.mobil ? "coarse" : "fine"}`),
  ansichten: ANSICHTEN.length,
  gemessen: zeilen.length,
  ausnahmen: [...AUSNAHMEN, ...AUSNAHMEN_INNENLAUF],
  verstoesse
};

if (ALS_JSON) {
  console.log(JSON.stringify({ ...ergebnis, zeilen }, null, 2));
} else {
  console.log(`Responsive-Messung auf ${URL_UNTER_TEST} — ${zeilen.length} Messpunkte`);
  for (const g of geraeteliste) {
    const meine = zeilen.filter((z) => z.geraet === g.name);
    const kaputt = meine.filter((z) => z.scrollbar || z.ueberstand.length || z.abgeschnitten.length);
    console.log(`  ${g.name.padEnd(20)} ${String(meine.length).padStart(2)} Ansichten — ${kaputt.length ? `${kaputt.length} laufen ueber` : "alle in Ordnung"}`);
  }
  for (const a of [...AUSNAHMEN, ...AUSNAHMEN_INNENLAUF]) console.log(`  Ausnahme ${a.auswahl}: ${a.grund}`);
  console.log(verstoesse.length ? `  VERSTOESSE:\n    ${verstoesse.join("\n    ")}` : "  Keine Ansicht laeuft ueber und nichts wird still abgeschnitten.");
}

if (SELBSTTEST) {
  console.log(`  Selbsttest: 2400-px-Probe eingesetzt, ${verstoesse.length} Verstoss(e) erkannt.`);
  if (!verstoesse.length) {
    console.log("  SELBSTTEST FEHLGESCHLAGEN — die Messung ist nicht scharf genug.");
    process.exitCode = 1;
  } else {
    console.log("  Selbsttest bestanden.");
    process.exitCode = 0;
  }
} else {
  process.exitCode = verstoesse.length ? 1 : 0;
}
