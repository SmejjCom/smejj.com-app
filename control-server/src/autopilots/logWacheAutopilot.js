// smejj.com — Log-Wache (Autopilot Nr. 45): liest, was der Prozess über sich
// selbst sagt — und macht ein STILLES Sterben sichtbar.
//
// WARUM ES SIE GIBT: Der Control-Server ist mehrfach still gestorben; erst
// ein Instanz-Neustart heilte ihn (Modul-Gedächtnis "Control stirbt still").
// Kein Log wurde ausgewertet, kein Muster erkannt. Diese Wache sammelt die
// Fehlersignale des eigenen Prozesses in einem Ringpuffer und wertet sie im
// Takt aus: unbehandelte Ausnahmen, abgewiesene Promises, bekannte
// Todes-Muster (Speicher, Ports, Verbindungsabrisse).
//
// GRENZE, ehrlich: Sie sieht nur den EIGENEN Prozess. Die Logs der übrigen
// Dienste (Brücke, Maler, Video) liest sie nicht — deren Zustand messen die
// Dienst-Sonden über /health. Was hier rot wird, ist der Control-Server.

const RING_MAX = 300;
const ring = [];
let unbehandelteAusnahmen = 0;
let abgewieseneVersprechen = 0;
let wacheAktiv = false;
let letzterLaufMs = 0;

/** Bekannte Todes- und Störmuster mit Klartext-Namen. */
export const STOER_MUSTER = Object.freeze([
  { name: "Speicher erschöpft", muster: /out of memory|heap out of memory|ENOMEM/i },
  { name: "Port belegt", muster: /EADDRINUSE/i },
  { name: "Verbindung abgerissen", muster: /ECONNRESET|ECONNREFUSED|socket hang up/i },
  { name: "DNS-Auflösung tot", muster: /EAI_AGAIN|ENOTFOUND/i },
  { name: "Datei-Handles erschöpft", muster: /EMFILE|ENFILE/i },
  { name: "unbehandelte Ausnahme", muster: /uncaughtException|unhandledRejection/i }
]);

/** Nimmt eine Fehlerzeile in den Ringpuffer. Öffentlich für die Prozess-Haken. */
export function notiereFehlerzeile(zeile, { jetztMs = Date.now() } = {}) {
  ring.push({ am: jetztMs, zeile: String(zeile || "").slice(0, 300) });
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
}

/**
 * Hängt die Wache an die Prozess-Ereignisse. Wird EINMAL beim Serverstart
 * gerufen; sie beendet den Prozess nie selbst und ändert das Verhalten der
 * bestehenden Handler nicht (nur zusätzliche Listener).
 */
export function registriereProzessWache({ prozess = process } = {}) {
  if (wacheAktiv) return false;
  wacheAktiv = true;
  prozess.on("uncaughtException", (fehler) => {
    unbehandelteAusnahmen += 1;
    notiereFehlerzeile(`uncaughtException: ${String(fehler?.message || fehler)}`);
  });
  prozess.on("unhandledRejection", (grund) => {
    abgewieseneVersprechen += 1;
    notiereFehlerzeile(`unhandledRejection: ${String(grund?.message || grund)}`);
  });
  prozess.on("warning", (warnung) => {
    notiereFehlerzeile(`warning: ${String(warnung?.message || warnung)}`);
  });
  return true;
}

/**
 * Wertet Fehlerzeilen aus: welche Störmuster kommen vor, wie oft?
 * Getrennt von jeder Außenwelt, damit der Selbsttest sie prüfen kann.
 */
export function werteZeilenAus(zeilen = []) {
  const funde = new Map();
  for (const eintrag of zeilen) {
    const text = typeof eintrag === "string" ? eintrag : String(eintrag?.zeile || "");
    for (const { name, muster } of STOER_MUSTER) {
      if (muster.test(text)) funde.set(name, (funde.get(name) || 0) + 1);
    }
  }
  return { funde: [...funde.entries()].map(([name, anzahl]) => ({ name, anzahl })), gesamt: zeilen.length };
}

/** Selbsttest: kaputte UND gesunde Zeilen müssen richtig beurteilt werden. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = werteZeilenAus([
    "FATAL ERROR: Reached heap limit — JavaScript heap out of memory",
    "Error: listen EADDRINUSE: address already in use :::8080",
    "uncaughtException: Cannot read properties of undefined"
  ]);
  if (kaputt.funde.length < 3) fehler.push(`kaputte Zeilen: nur ${kaputt.funde.length}/3 Störmuster erkannt`);
  const gesund = werteZeilenAus([
    "[verbrauch] {\"tag\":\"2026-08-24\"}",
    "Durchgang beendet: 30/33 Läufe gelungen"
  ]);
  if (gesund.funde.length !== 0) fehler.push("gesunde Zeilen lösen fälschlich einen Fund aus");
  return { bestanden: fehler.length === 0, fehler };
}

/** Nur für Tests: Puffer und Zähler zurücksetzen. */
export function _logWacheZuruecksetzen() {
  ring.length = 0;
  unbehandelteAusnahmen = 0;
  abgewieseneVersprechen = 0;
  letzterLaufMs = 0;
}

/**
 * Der Lauf im Takt: Selbsttest, dann die echten Zeilen SEIT DEM LETZTEN Lauf.
 * Funde machen die Ampel rot — sie sind Störungen des eigenen Prozesses, und
 * genau die blieben bisher unsichtbar, bis der Dienst stand.
 */
export function laufLogWache({ jetztMs = Date.now(), speicher = process.memoryUsage } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Log-Wache erkennt bekannte Störmuster nicht mehr: ${probe.fehler.join("; ")}` };
  }
  const seit = letzterLaufMs;
  letzterLaufMs = jetztMs;
  const frisch = ring.filter((e) => e.am > seit);
  const auswertung = werteZeilenAus(frisch);

  // Der Blick nach vorn: Heap-Auslastung ist das früheste Signal des
  // Speicher-Todes. >92 % vom Limit ist bereits ein Befund, kein Stilrat.
  let heapHinweis = "";
  try {
    const mu = speicher();
    const heapMb = Math.round(mu.heapUsed / 1048576);
    const rssMb = Math.round(mu.rss / 1048576);
    heapHinweis = `Heap ${heapMb} MB, RSS ${rssMb} MB`;
  } catch { heapHinweis = "Speicherwerte nicht lesbar"; }

  if (!wacheAktiv) {
    return { ok: false, meldung: "Prozess-Haken NICHT registriert — die Wache sieht nichts (registriereProzessWache fehlt im Serverstart)" };
  }
  if (auswertung.funde.length) {
    const liste = auswertung.funde.map((f) => `${f.anzahl}x ${f.name}`).join(", ");
    return { ok: false, meldung: `${frisch.length} Fehlerzeile(n) seit dem letzten Lauf: ${liste} — ${heapHinweis}` };
  }
  const bilanz = unbehandelteAusnahmen + abgewieseneVersprechen;
  return {
    ok: true,
    meldung: `Selbsttest 2/2; keine Störmuster seit dem letzten Lauf `
      + `(${frisch.length} Zeilen geprüft, seit Start ${bilanz} unbehandelte Signale) — ${heapHinweis}`
  };
}
