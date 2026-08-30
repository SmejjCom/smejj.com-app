#!/usr/bin/env node
// smejj.com — Stopp/Play auf einem emulierten Handy messen (375 px, Touch).
//
// WARUM DIESES SKRIPT: Stopp und Play wurden am Schreibtisch mit der Maus
// bewiesen (2026-08-19). Am Telefon gelten aber andere Bedingungen, und zwei
// davon koennen die Bedienung still unbrauchbar machen:
//
//   1. Das Arbeits-Viereck ist 11 px gross. Es traegt ein unsichtbares
//      Klickfeld von 45 px (::before, inset -17px) — die Touch-Regel verlangt
//      44 px. Ob das am Telefon wirklich ankommt, entscheidet die Position
//      zur Laufzeit: code-flaeche.js misst die Textzeile und setzt
//      --start-arbeit-top. Sitzt das Viereck am Rand, kann das Klickfeld
//      teilweise ausserhalb des Feldes liegen.
//   2. Ein Finger ist kein Mauszeiger. `resize_window` auf 375 px macht aus
//      einem Desktop-Browser KEIN Touch-Geraet (`pointer: fine` bleibt wahr).
//      Erst Emulation.setTouchEmulationEnabled plus setEmulatedMedia coarse
//      loesen die Handy-Zweige der Stylesheets aus — dieselbe Lehre wie in
//      measure_touch_targets_app.mjs.
//
// Getippt wird darum mit ECHTEN Touch-Ereignissen (Input.dispatchTouchEvent),
// nicht mit element.click(): ein .click() trifft immer und wuerde genau die
// Fehler verdecken, um die es hier geht (so blieb am 2026-08-19 ein zu
// kleines Trefferfeld unentdeckt).
//
// Aufruf:
//   node scripts/testing/messe_stopp_play_handy.mjs
//   node scripts/testing/messe_stopp_play_handy.mjs --url https://smejj.com/ --json

import { launchChrome, openPage, sleep } from "./cdp-client.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const URL_UNTER_TEST = flag("url", "https://smejj.com/");
const ALS_JSON = args.includes("--json");
const MINDESTGROESSE = 44; // Touch-Regel der Charta

async function auswerten(page, ausdruck) {
  const antwort = await page("Runtime.evaluate", {
    expression: ausdruck, awaitPromise: true, returnByValue: true
  });
  if (antwort?.exceptionDetails) {
    throw new Error(antwort.exceptionDetails.exception?.description || "Auswertung fehlgeschlagen");
  }
  return antwort?.result?.value;
}

/** Ein echter Fingertipp auf einen Punkt — kein element.click(). */
async function tippe(page, x, y) {
  const punkte = [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12, force: 1 }];
  await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: punkte });
  await sleep(60);
  await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

// Baut einen laufenden Chat-Zustand OHNE Server nach: eine Antwort-Blase mit
// Text und das Strom-Signal auf "laeuft". Damit ist der Test unabhaengig von
// Modellwartezeiten und Kontingenten — gemessen wird die BEDIENUNG, nicht das
// Modell. Der echte Ende-zu-Ende-Weg ist am 2026-08-19 bereits bewiesen.
const AUFBAU = `(async () => {
  localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }));
  // Die Einfuehrung fuer NEUE Nutzer (fuehrung.js) legt eine Blase ueber die
  // Startseite und verdeckt dabei die linke Haelfte des Trefferfeldes —
  // beim ersten Messlauf 2026-08-20 hat genau das den Fingertipp geschluckt.
  // Das ist ein eigener Befund (unten als zweiter Lauf gemessen) und darf die
  // Messung des Normalzustands nicht verfaelschen.
  localStorage.setItem("smejj.fuehrung.v1", "gesehen");
  document.getElementById("fuehrungBlase")?.remove();
  if (location.pathname !== "/") { location.href = "/"; return "navigiert"; }
  const log = document.querySelector("#startLog");
  if (!log) return "kein log";
  log.hidden = false;
  document.querySelector("#start")?.classList.add("has-start-chat");
  const frage = document.createElement("article");
  frage.className = "entry user";
  frage.textContent = "Eine Frage, die eine lange Antwort ausloest.";
  const antwort = document.createElement("article");
  antwort.className = "entry assistant";
  antwort.textContent = "Die Antwort laeuft gerade und ist noch nicht fertig";
  log.append(frage, antwort);
  return "aufgebaut";
})()`;

const STROM = (laufen) => `window.dispatchEvent(new CustomEvent("smejj:chat-strom", { detail: { laufen: ${laufen} } })), "ok"`;

/** Liest Lage und Groesse des Trefferfeldes eines Arbeits-Vierecks. */
const LAGE = (id) => `(() => {
  const v = document.getElementById(${JSON.stringify(id)});
  if (!v) return null;
  const r = v.getBoundingClientRect();
  const vor = getComputedStyle(v, "::before");
  const rand = Math.abs(parseFloat(vor.insetBlockStart || vor.top || "0")) || 0;
  return {
    sichtbar: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight,
    mitteX: r.x + r.width / 2, mitteY: r.y + r.height / 2,
    sichtbarePx: Math.round(r.width),
    trefferPx: Math.round(r.width + 2 * rand),
    rolle: v.getAttribute("role"),
    an: v.classList.contains("an"),
    gestoppt: v.classList.contains("gestoppt"),
    imFeld: (() => {
      const feld = document.querySelector("#start .prompt-glass");
      if (!feld) return null;
      const f = feld.getBoundingClientRect();
      return r.top >= f.top && r.bottom <= f.bottom && r.left >= f.left && r.right <= f.right;
    })()
  };
})()`;

/**
 * Wartet, bis ein Arbeits-Viereck verdrahtet ist, und meldet, wie lange das
 * NACH dem Eintreffen seiner Datei gedauert hat.
 *
 * Warum getrennt gemessen wird: die reine Ladezeit haengt am Netz (auf dieser
 * Leitung schwankte sie zwischen 0,8 s und 11 s) und sagt nichts ueber die
 * Bauart. Aussagekraeftig ist nur der VERZUG nach der Datei — er zeigt, ob
 * das Verdrahten auf eine Importkette wartet. Wer stattdessen nach fester
 * Wartezeit misst, prueft die Leitung und nennt es Ergebnis.
 */
async function warteAufVerdrahtung(page, id, maxMs = 20000) {
  const bis = Date.now() + maxMs;
  while (Date.now() < bis) {
    const da = await auswerten(page, `document.getElementById(${JSON.stringify(id)})?.getAttribute("role") === "button"`);
    if (da) break;
    await sleep(200);
  }
  return auswerten(page, `(() => {
    const v = document.getElementById(${JSON.stringify(id)});
    const datei = performance.getEntriesByType("resource").find((r) => r.name.includes("chat-stopp.js"));
    return JSON.stringify({
      verdrahtet: v?.getAttribute("role") === "button",
      dateiMs: datei ? Math.round(datei.responseEnd) : null
    });
  })()`);
}

const client = await launchChrome();
const befunde = [];
const merke = (name, ok, text) => befunde.push({ name, ok, text });

try {
  const page = await openPage(client);
  await page("Page.enable");
  await page("Runtime.enable");
  await page("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await page("Emulation.setEmulatedMedia", {
    features: [{ name: "pointer", value: "coarse" }, { name: "any-pointer", value: "coarse" }]
  });
  await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await page("Page.navigate", { url: URL_UNTER_TEST });
  await sleep(3200);
  for (let versuch = 0; versuch < 6; versuch += 1) {
    if (await auswerten(page, AUFBAU) === "aufgebaut") break;
    await sleep(1200);
  }
  await sleep(900);

  if (!(await auswerten(page, `matchMedia("(pointer: coarse)").matches`))) {
    throw new Error("Emulation griff nicht: pointer ist nicht coarse — die Messung waere wertlos.");
  }

  // Erst warten, dann urteilen — sonst misst der Test die Leitung.
  const bereit = JSON.parse(await warteAufVerdrahtung(page, "startArbeit"));
  merke("Stopp-Knopf wird ueberhaupt verdrahtet", bereit.verdrahtet === true,
    bereit.verdrahtet ? `Datei nach ${bereit.dateiMs} ms` : "auch nach 20 s nicht");

  // --- 1. Ruhezustand: das Viereck ist da, sitzt im Feld, ist kein Klickziel
  await auswerten(page, STROM(0));
  await sleep(400);
  const frei = await auswerten(page, LAGE("startArbeit"));
  merke("Viereck ist am Telefon sichtbar", Boolean(frei?.sichtbar), frei ? `${frei.sichtbarePx} px bei (${Math.round(frei.mitteX)}, ${Math.round(frei.mitteY)})` : "nicht gefunden");
  merke("Viereck sitzt INNERHALB des Schreibfeldes", frei?.imFeld === true, String(frei?.imFeld));
  merke("Viereck ist als Knopf angemeldet", frei?.rolle === "button", String(frei?.rolle));

  // --- 2. Trefferfeld gegen die Touch-Regel
  merke(`Trefferfeld ist mindestens ${MINDESTGROESSE} px`, (frei?.trefferPx || 0) >= MINDESTGROESSE, `${frei?.trefferPx} px (sichtbar ${frei?.sichtbarePx} px)`);

  // --- 3. Stopp per echtem Fingertipp, bewusst NEBEN die Mitte
  await auswerten(page, STROM(1));
  await sleep(500);
  const arbeitet = await auswerten(page, LAGE("startArbeit"));
  merke("Viereck leuchtet, sobald gearbeitet wird", arbeitet?.an === true, `an=${arbeitet?.an}`);

  // 15 px daneben — wer nur die Mitte trifft, misst das Trefferfeld nicht.
  await tippe(page, arbeitet.mitteX - 15, arbeitet.mitteY + 12);
  await sleep(700);
  const nachStopp = await auswerten(page, LAGE("startArbeit"));
  merke("Fingertipp 15 px NEBEN der Mitte stoppt", nachStopp?.gestoppt === true, `gestoppt=${nachStopp?.gestoppt}`);

  // --- 4. Play-Zustand leuchtet weiter
  const leuchtet = await auswerten(page, `(() => {
    const v = document.getElementById("startArbeit");
    const nach = getComputedStyle(v, "::after");
    return JSON.stringify({ eigen: getComputedStyle(v).backgroundColor, dreieck: nach.backgroundColor, form: String(nach.clipPath).slice(0, 24) });
  })()`);
  const l = JSON.parse(leuchtet);
  merke("Play-Zustand leuchtet (Viereck gefuellt)", l.eigen !== "rgba(0, 0, 0, 0)", l.eigen);
  merke("Play zeigt ein Dreieck", l.form.startsWith("polygon"), l.form);

  // --- 5. Play per Fingertipp loest den Abbruch
  await tippe(page, nachStopp.mitteX + 14, nachStopp.mitteY - 13);
  await sleep(700);
  const nachPlay = await auswerten(page, LAGE("startArbeit"));
  merke("Fingertipp auf Play hebt den Abbruch auf", nachPlay?.gestoppt === false, `gestoppt=${nachPlay?.gestoppt}`);

  // --- 6. Das Trefferfeld darf das Schreibfeld nicht blockieren
  const feldFrei = await auswerten(page, `(() => {
    const feld = document.getElementById("startMessage");
    const r = feld.getBoundingClientRect();
    const punkt = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return punkt === feld || feld.contains(punkt) ? "frei" : (punkt?.id || punkt?.className || "fremd");
  })()`);
  merke("Mitte des Schreibfeldes bleibt tippbar", feldFrei === "frei", String(feldFrei));

  // --- 6b. ERSTBESUCH: blockiert die Einfuehrung den Stopp-Knopf?
  //
  // Die richtige Frage ist NICHT "verdeckt die Blase etwas" — das tut jede
  // Einfuehrung, sie ist sichtbar und man kann sie wegtippen. Rot ist es
  // erst, wenn sie das Trefferfeld verdeckt, WAEHREND gearbeitet wird: dann
  // sucht der Nutzer den Stopp-Knopf, tippt auf die Blase, und weil ein Tipp
  // AUF die Blase sie nicht schliesst, passiert gar nichts.
  // Gemessen wird darum mit laufendem Strom (fuehrung.js beendet sich dann).
  const erstbesuch = await auswerten(page, `(async () => {
    localStorage.removeItem("smejj.fuehrung.v1");
    const m = await import("/assets/fuehrung.js?v=1").catch(() => null);
    if (!m?.initFuehrung) return "kein modul";
    m.initFuehrung();
    await new Promise((f) => setTimeout(f, 2200));
    // Jetzt faengt eine Antwort an — ab hier MUSS der Stopp-Knopf frei sein.
    window.dispatchEvent(new CustomEvent("smejj:chat-strom", { detail: { laufen: 1 } }));
    await new Promise((f) => setTimeout(f, 400));
    const v = document.getElementById("startArbeit");
    const r = v.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    let verdeckt = 0, geprueft = 0;
    for (let dx = -20; dx <= 20; dx += 5) for (let dy = -20; dy <= 20; dy += 5) {
      geprueft += 1;
      const el = document.elementFromPoint(cx + dx, cy + dy);
      if (el?.closest?.("#fuehrungBlase")) verdeckt += 1;
    }
    const blase = document.getElementById("fuehrungBlase");
    return JSON.stringify({ blaseDa: Boolean(blase), verdeckt, geprueft });
  })()`);
  if (typeof erstbesuch === "string" && erstbesuch.startsWith("{")) {
    const e = JSON.parse(erstbesuch);
    merke("Erstbesuch: Einfuehrung blockiert den Stopp-Knopf nicht, sobald gearbeitet wird", e.verdeckt === 0,
      e.blaseDa ? `${e.verdeckt} von ${e.geprueft} Punkten verdeckt` : "keine Blase");
  }
  await auswerten(page, `document.getElementById("fuehrungBlase")?.remove(), localStorage.setItem("smejj.fuehrung.v1","gesehen"), "ok"`);
  await sleep(300);

  // --- 7. Code-Bereich: dieselben Zusagen
  await auswerten(page, `history.pushState({}, "", "/code"), dispatchEvent(new PopStateEvent("popstate")), "ok"`);
  await sleep(1500);
  await warteAufVerdrahtung(page, "codeArbeit", 10000);
  await auswerten(page, STROM(1));
  await sleep(500);
  const code = await auswerten(page, LAGE("codeArbeit"));
  merke("Code: Viereck sichtbar und leuchtet", Boolean(code?.sichtbar && code?.an), `sichtbar=${code?.sichtbar} an=${code?.an}`);
  merke(`Code: Trefferfeld mindestens ${MINDESTGROESSE} px`, (code?.trefferPx || 0) >= MINDESTGROESSE, `${code?.trefferPx} px`);
  if (code?.sichtbar) {
    await tippe(page, code.mitteX - 14, code.mitteY + 13);
    await sleep(700);
    const codeStopp = await auswerten(page, LAGE("codeArbeit"));
    merke("Code: Fingertipp neben der Mitte stoppt", codeStopp?.gestoppt === true, `gestoppt=${codeStopp?.gestoppt}`);
  }
} finally {
  await client.close?.();
}

const rot = befunde.filter((b) => !b.ok);
if (ALS_JSON) {
  console.log(JSON.stringify({ url: URL_UNTER_TEST, geraet: "375x812 mobil, Touch", befunde, rot: rot.length }, null, 2));
} else {
  console.log(`\nStopp/Play am Handy (375x812, Touch) — ${URL_UNTER_TEST}\n`);
  for (const b of befunde) console.log(`  ${b.ok ? "OK  " : "ROT "} ${b.name}  [${b.text}]`);
  console.log(`\n${befunde.length - rot.length}/${befunde.length} in Ordnung.\n`);
}
process.exit(rot.length ? 1 : 0);
