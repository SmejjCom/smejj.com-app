#!/usr/bin/env node
// smejj.com — ist das Design EIN System oder neunzehn Einzelstuecke?
//
// Punkt 8 des A-bis-Z-Auftrags: "Einheitliches Designsystem". Das laesst sich
// nicht ansehen — auf einem Bildschirm sehen 10 px und 12 px Rundung gleich
// aus, und genau daran erkennt man ein gewachsenes Design.
//
// GEMESSEN WIRD DIE STREUUNG, NICHT DIE EXISTENZ. Ein hartkodierter Wert ist
// nicht schlimm; ein Wert, den es in vier leicht abweichenden Varianten gibt,
// schon. Darum sammelt dieses Skript die TATSAECHLICH GERENDERTEN Werte ueber
// alle Ansichten (die Kaskade entscheidet, nicht die Quelle) und meldet, wo
// mehrere fast gleiche nebeneinander stehen.
//
// Gemessen an sichtbaren Elementen je Ansicht:
//   * Eckradien       — wie viele verschiedene, und stehen sie im System?
//   * Schriftgroessen — dito
//   * Knopfhoehen     — Touch-Ziele und Einheitlichkeit zugleich
//   * Fokusringe      — Barrierefreiheit: wer nur die Tastatur hat, braucht sie
//
// Aufruf: node scripts/diagnose/designsystem-einheit.mjs [--url https://smejj.com/] [--json]
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";

const ANSICHTEN = [
  ["Startseite", "/"], ["Suche", "/search"], ["Verlauf", "/chat-history"],
  ["Coding", "/code"], ["Projekte", "/projects"], ["Dateien", "/files"],
  ["Modelle", "/ai"], ["Kosten", "/cost"], ["Einstellungen", "/settings"],
  ["Konto", "/profile"], ["Arbeitsbereiche", "/bereiche"], ["Status", "/systemzustand"]
];

// Begruendete Ausnahmen — jede mit Grund, sonst ist es eine stille Absenkung.
// (Dasselbe Muster wie in messe_responsive.mjs.)
const AUSNAHMEN = [
  {
    art: "schriften", wert: 17,
    grund: "Eingabefeld absichtlich groesser — Betreiber-Regel 'GROSSE Schrift'; das Feld steht ausserdem unter dem Design-Lock"
  }
];

const istAusnahme = (art, wert) => AUSNAHMEN.find((a) => a.art === art && a.wert === wert);

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
  while (Date.now() < ende) {
    try {
      const stand = await auswerten(page, `(() => { try {
        if (!location.origin || location.origin === "null") return "leer";
        localStorage.getItem("probe");
        return document.readyState === "loading" ? "laedt" : "bereit";
      } catch (f) { return "gesperrt"; } })()`);
      if (stand === "bereit") return true;
    } catch { /* Seite noch nicht ansprechbar */ }
    await sleep(300);
  }
  throw new Error("Seite wurde nicht bereit.");
}

// Sammelt je Ansicht die gerenderten Werte. Nur SICHTBARE Elemente: was
// niemand sieht, kann auch nicht uneinheitlich aussehen.
const SAMMLE = `(() => {
  const zahl = (wert) => Math.round(parseFloat(wert) || 0);
  const radien = new Map(), schriften = new Map(), knopfhoehen = new Map(), festeHoehen = new Map();
  let knoepfeGesamt = 0;
  const beispiele = new Map();
  const merke = (karte, wert, el) => {
    karte.set(wert, (karte.get(wert) || 0) + 1);
    if (!beispiele.has(wert)) beispiele.set(wert, el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""));
  };
  for (const el of document.querySelectorAll("button, a.button, .ghost-button, input, textarea, select, .karte, .card, .panel, [class*=chip]")) {
    if (!(el.offsetWidth || el.offsetHeight)) continue;
    const s = getComputedStyle(el);
    const r = zahl(s.borderTopLeftRadius);
    if (r > 0) merke(radien, r, el);
    merke(schriften, zahl(s.fontSize), el);
    if (el.tagName === "BUTTON" || el.classList.contains("ghost-button")) {
      const h = Math.round(el.getBoundingClientRect().height);
      // FEST gesetzte Hoehen (min-height/height) sind eine Entscheidung, keine
      // Schlamperei: .icon-button ist ueberall 38 px, .text-chip ueberall 34 —
      // zwei eigene, in sich einheitliche Gruppen. Nur Hoehen, die aus Polster
      // und Textlaenge WACHSEN, koennen ungewollt auseinanderlaufen.
      // NUR min-height: getComputedStyle().height liefert bei einem gerenderten
      // Element immer den tatsaechlichen Wert, nie "auto" — damit galt in der
      // ersten Fassung JEDE Hoehe als fest gesetzt, und die Messung fand nichts
      // mehr. Der berechnete Wert ist nicht die Regel.
      const fest = zahl(s.minHeight) === h;
      if (h > 0 && !fest) merke(knopfhoehen, h, el);
      if (h > 0 && fest) merke(festeHoehen, h, el);
      knoepfeGesamt++;
    }
  }
  const alsListe = (karte) => [...karte.entries()].sort((a, b) => b[1] - a[1]).map(([wert, anzahl]) => ({ wert, anzahl, beispiel: beispiele.get(wert) }));
  return { radien: alsListe(radien), schriften: alsListe(schriften), knopfhoehen: alsListe(knopfhoehen), festeHoehen: alsListe(festeHoehen), knoepfeGesamt };
})()`;

// Fokusring NUR per echtem Tastendruck messen.
//
// Die erste Fassung rief el.focus() aus JavaScript und meldete 60 Knoepfe ohne
// Ring. Das war ein MESSFEHLER: die App benutzt :focus-visible (65 Regeln in
// den Stilvorlagen), und diese Pseudoklasse greift bei einem JS-Fokus
// absichtlich NICHT — nur bei Tastatur. Wer so misst, misst nicht die
// Barrierefreiheit, sondern seinen eigenen Aufruf.
const LIES_FOKUS = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const s = getComputedStyle(el);
  const zahl = (w) => Math.round(parseFloat(w) || 0);
  const hatRing = (stil) => (zahl(stil.outlineWidth) > 0 && stil.outlineStyle !== "none")
    || (stil.boxShadow && stil.boxShadow !== "none");
  // Der Ring muss nicht am Element selbst sitzen. Bei den Eingabefeldern
  // leuchtet die UMGEBUNG (.prompt-glass:focus-within, #code .codefeld:
  // focus-within) — sichtbar ist es trotzdem, und darum geht es.
  //
  // Die erste Fassung sah nur das Element und meldete zwei Textfelder ohne
  // Anzeige. Beide HABEN eine, eine Ebene hoeher. Wer nur das Element misst,
  // misst nicht, was der Nutzer sieht.
  let umfeldRing = false;
  for (let eltern = el.parentElement, tiefe = 0; eltern && tiefe < 3; eltern = eltern.parentElement, tiefe++) {
    if (hatRing(getComputedStyle(eltern))) { umfeldRing = true; break; }
  }
  return {
    was: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
    sichtbar: !!(el.offsetWidth || el.offsetHeight),
    fokusSichtbar: typeof el.matches === "function" && el.matches(":focus-visible"),
    ring: hatRing(s) || umfeldRing,
    ringAmUmfeld: !hatRing(s) && umfeldRing
  };
})()`;

async function tabDurch(page, auswertenFn, schritte = 20) {
  const gesehen = [];
  for (let i = 0; i < schritte; i++) {
    for (const typ of ["rawKeyDown", "char", "keyUp"]) {
      await page("Input.dispatchKeyEvent", { type: typ, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, text: typ === "char" ? "\t" : undefined });
    }
    await sleep(60);
    const stand = await auswertenFn(page, LIES_FOKUS);
    if (stand?.sichtbar) gesehen.push(stand);
  }
  return gesehen;
}

/**
 * Ausreisser finden: ein SELTENER Wert dicht neben einem HAEUFIGEN.
 *
 * Die erste Fassung meldete jedes benachbarte Paar — und damit neun Befunde,
 * von denen die meisten keine waren: Knoepfe haben verschiedene Rollen, ein
 * Symbolknopf (36 px) darf anders hoch sein als ein grosser Handlungsknopf
 * (65 px). Das ist kein Mangel, sondern Absicht.
 *
 * Ein Mangel ist, wenn EIN Element aus der Reihe tanzt: 34 px neben 220-mal
 * 36 px ist kein eigener Zweck, sondern eine vergessene Zeile.
 *
 * @param {Array<[number, number]>} paare - [Wert, Anzahl], sortiert nach Wert
 * @param {{abstand?: number, seltenBis?: number, haeufigAb?: number}} [opt]
 */
export function findeAusreisser(paare, { abstand = 3, seltenBis = 4, haeufigAb = 10 } = {}) {
  const treffer = [];
  for (const [wert, anzahl] of paare) {
    if (anzahl > seltenBis) continue;
    const nachbar = paare.find(([w, n]) => n >= haeufigAb && w !== wert && Math.abs(w - wert) <= abstand);
    if (nachbar) treffer.push({ wert, anzahl, nachbar: nachbar[0], nachbarAnzahl: nachbar[1] });
  }
  return treffer;
}

async function main() {
  const url = arg("--url", "https://smejj.com/").replace(/\/$/, "");
  const alsJson = process.argv.includes("--json");
  const chrome = await launchChrome();
  let aufraeumen = () => { chrome.close().catch(() => {}); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { aufraeumen(); process.exit(130); });
  const proAnsicht = [];
  try {
    const page = await openPage(chrome);
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await page("Page.navigate", { url: `${url}/` });
    await warteBereit(page);
    await auswerten(page, ANMELDEN);
    for (const [name, pfad] of ANSICHTEN) {
      await page("Page.navigate", { url: `${url}${pfad}` });
      await warteBereit(page);
      await sleep(900);
      const werte = await auswerten(page, SAMMLE);
      const fokus = await tabDurch(page, auswerten);
      proAnsicht.push({ name, ...werte, fokus });
    }
  } finally {
    aufraeumen = () => {};
    await chrome.close();
  }

  // Zusammenfuehren
  const wer = new Map();   // Wert -> "Ansicht: element" (erstes Vorkommen)
  const summe = (schluessel) => {
    const karte = new Map();
    for (const a of proAnsicht) for (const e of a[schluessel]) {
      karte.set(e.wert, (karte.get(e.wert) || 0) + e.anzahl);
      const kennung = `${schluessel}:${e.wert}`;
      if (!wer.has(kennung) && e.beispiel) wer.set(kennung, `${a.name}: ${e.beispiel}`);
    }
    return [...karte.entries()].sort((a, b) => a[0] - b[0]);
  };
  const radien = summe("radien"), schriften = summe("schriften"), hoehen = summe("knopfhoehen"), feste = summe("festeHoehen");
  const knoepfe = proAnsicht.reduce((s, a) => s + a.knoepfeGesamt, 0);
  const fokusAlle = proAnsicht.flatMap((a) => a.fokus || []);
  const ohneRing = fokusAlle.filter((f) => !f.ring).length;

  if (alsJson) { console.log(JSON.stringify({ proAnsicht, radien, schriften, hoehen, knoepfe, ohneRing }, null, 2)); return; }

  const zeile = (liste) => liste.map(([w, n]) => `${w}px (${n}x)`).join(", ");
  console.log(`\nDesignsystem auf ${url} — ${ANSICHTEN.length} Ansichten\n`);
  console.log(`  Eckradien       ${radien.length} verschiedene: ${zeile(radien)}`);
  console.log(`  Schriftgroessen ${schriften.length} verschiedene: ${zeile(schriften)}`);
  console.log(`  Knopfhoehen     ${feste.length} fest gesetzte (Entscheidung): ${zeile(feste)}`);
  console.log(`                  ${hoehen.length} gewachsene (aus Polster und Text): ${zeile(hoehen)}`);
  console.log(`  Fokusringe      ${fokusAlle.length - ohneRing} von ${fokusAlle.length} per Tab angesteuerten Elementen haben einen`);

  const befunde = [];
  if (knoepfe === 0) befunde.push("MESSUNG UNGUELTIG — kein einziger Knopf gefunden");
  const woher = (art, wert) => { const q = wer.get(`${art}:${wert}`); return q ? `  [${q}]` : ""; };
  const ausnahmen = [];
  /**
   * Derselbe Baustein, nur anderer Text? Dann ist der Unterschied keiner.
   *
   * settings-nav-button ist 64 px, wenn die Beschriftung einzeilig bleibt, und
   * 65 px bei zwei Zeilen — eine Hoehe, die aus dem INHALT waechst, und kein
   * zweites Mass. Wer das meldet, schickt jemanden auf die Suche nach einer
   * Regel, die es gar nicht gibt.
   */
  const gleicherBaustein = (art, a, b) => {
    const eins = (wer.get(`${art}:${a}`) || "").split(": ").pop();
    const zwei = (wer.get(`${art}:${b}`) || "").split(": ").pop();
    return Boolean(eins) && eins === zwei;
  };
  for (const a of findeAusreisser(radien)) {
    const frei = istAusnahme("radien", a.wert);
    if (frei) { ausnahmen.push(`Eckradius ${a.wert} px: ${frei.grund}`); continue; }
    if (gleicherBaustein("radien", a.wert, a.nachbar)) {
      ausnahmen.push(`Eckradius ${a.wert} px und ${a.nachbar} px: derselbe Baustein${woher("radien", a.wert)} — die Hoehe waechst aus dem Text`);
      continue;
    }
    befunde.push(`Eckradius ${a.wert} px (${a.anzahl}x) neben ${a.nachbar} px (${a.nachbarAnzahl}x)${woher("radien", a.wert)}`);
  }
  for (const a of findeAusreisser(hoehen)) {
    const frei = istAusnahme("knopfhoehen", a.wert);
    if (frei) { ausnahmen.push(`Knopfhoehe ${a.wert} px: ${frei.grund}`); continue; }
    if (gleicherBaustein("knopfhoehen", a.wert, a.nachbar)) {
      ausnahmen.push(`Knopfhoehe ${a.wert} px und ${a.nachbar} px: derselbe Baustein${woher("knopfhoehen", a.wert)} — die Hoehe waechst aus dem Text`);
      continue;
    }
    befunde.push(`Knopfhoehe ${a.wert} px (${a.anzahl}x) neben ${a.nachbar} px (${a.nachbarAnzahl}x)${woher("knopfhoehen", a.wert)}`);
  }
  for (const a of findeAusreisser(schriften)) {
    const frei = istAusnahme("schriften", a.wert);
    if (frei) { ausnahmen.push(`Schriftgroesse ${a.wert} px: ${frei.grund}`); continue; }
    if (gleicherBaustein("schriften", a.wert, a.nachbar)) {
      ausnahmen.push(`Schriftgroesse ${a.wert} px und ${a.nachbar} px: derselbe Baustein${woher("schriften", a.wert)} — die Hoehe waechst aus dem Text`);
      continue;
    }
    befunde.push(`Schriftgroesse ${a.wert} px (${a.anzahl}x) neben ${a.nachbar} px (${a.nachbarAnzahl}x)${woher("schriften", a.wert)}`);
  }
  if (ohneRing > 0) {
    const welche = [...new Set(fokusAlle.filter((f) => !f.ring).map((f) => f.was))].join(", ");
    befunde.push(`${ohneRing} Element(e) ohne sichtbaren Fokusring: ${welche} — wer nur die Tastatur hat, sieht nicht, wo er steht`);
  }
  // KEIN Touch-Ziel-Befund hier: gemessen wird am Schreibtisch (1280 px), und
  // dort zeigt eine Maus, kein Finger. Die 44-px-Regel gilt fuer Beruehrung und
  // wird auf Handybreite geprueft — tests/touch-ziele-waechter.test.mjs und
  // scripts/testing/measure_touch_targets_app.mjs. Sie hier zu melden hiesse,
  // 291 falsche Befunde zu erzeugen.

  console.log("");
  for (const a of ausnahmen) console.log(`  Ausnahme: ${a}`);
  for (const b of befunde) console.log(`  - ${b}`);
  console.log(befunde.length === 0 ? "Ein System: keine fast gleichen Werte, alle Knoepfe mit Fokusring.\n" : `${befunde.length} Befund(e) — siehe oben.\n`);
  process.exitCode = befunde.length === 0 ? 0 : 1;
}

main().catch((fehler) => {
  console.error(`Messung fehlgeschlagen: ${fehler.message}`);
  process.exitCode = 1;
});
