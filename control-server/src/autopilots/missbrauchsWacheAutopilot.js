// smejj.com — Missbrauchs-Wache (Autopilot Nr. 51): sieht den ECHTEN
// Anfrageverkehr und erkennt, was kein einzelner Rate-Limiter sieht —
// Dauerfeuer eines Absenders, Anmelde-Stürme, botartige Muster.
//
// Die Bremse (rateLimiter.js) dämpft je Route; NIEMAND zählte bisher über
// alle Routen hinweg. Diese Wache bekommt jede API-Anfrage einmal gezeigt
// (ein Aufruf in src/server.js) und führt 10-Minuten-Fenster je Absender.
//
// DATENSPARSAM MIT ABSICHT: Gespeichert wird der Absender-Schlüssel (IP aus
// den Proxy-Köpfen), eine Pfadklasse und ein Zähler — nie der Pfad selbst,
// nie ein Körper, nie eine Sitzung. Die Wache soll Missbrauch sehen, nicht
// Nutzer beobachten.

const FENSTER_MS = 10 * 60 * 1000;
const MAX_ABSENDER = 5_000;

// Zwei Fenster reichen: das laufende und das letzte volle.
let fenster = { start: 0, absender: new Map() };
let vorheriges = null;
let gesamtSeitStart = 0;
// Zusammenspiel-Audit 2026-08-24: der Deckel war da, aber sein Erreichen
// blieb stumm — genau die "stille Quelle", die sonst überall benannt wird.
let deckelErreicht = false;

/** Schwellen je 10-Minuten-Fenster. Bewusst großzügig — hier geht es um Missbrauch, nicht um Vielnutzer. */
export const SCHWELLEN = Object.freeze({
  anfragenJeAbsender: 900,   // 1,5 Anfragen je Sekunde über 10 Minuten — kein Mensch
  anmeldungenJeAbsender: 40  // 40 Anmelde-Anfragen in 10 Minuten — Adress-Rütteln
});

function pfadKlasse(pathname = "") {
  const p = String(pathname);
  if (p.startsWith("/api/auth/") || p.includes("magic-link") || p.includes("passkey")) return "anmeldung";
  if (p.startsWith("/api/chat") || p.startsWith("/api/agent")) return "chat";
  if (p.startsWith("/api/admin")) return "admin";
  return "sonstig";
}

/**
 * Wird für jede API-Anfrage einmal gerufen (src/server.js). Muss billig sein:
 * ein Map-Zugriff, zwei Zähler.
 */
export function beobachteAnfrage({ absender = "", pathname = "" } = {}, { jetztMs = Date.now() } = {}) {
  if (jetztMs - fenster.start >= FENSTER_MS) {
    vorheriges = fenster.absender.size ? fenster : vorheriges;
    fenster = { start: jetztMs, absender: new Map() };
  }
  const schluessel = String(absender || "unbekannt");
  let eintrag = fenster.absender.get(schluessel);
  if (!eintrag) {
    if (fenster.absender.size >= MAX_ABSENDER) {
      deckelErreicht = true; // Schutz vor Speicherwachstum — und ab jetzt ein GEMELDETER Befund
      return;
    }
    eintrag = { gesamt: 0, anmeldung: 0 };
    fenster.absender.set(schluessel, eintrag);
  }
  eintrag.gesamt += 1;
  if (pfadKlasse(pathname) === "anmeldung") eintrag.anmeldung += 1;
  gesamtSeitStart += 1;
}

/**
 * Wertet ein Fenster aus. Getrennt testbar (kaputt + gesund).
 * @param {Map<string, {gesamt: number, anmeldung: number}>} absender
 */
export function werteFensterAus(absender, { schwellen = SCHWELLEN } = {}) {
  const befunde = [];
  for (const [schluessel, z] of absender.entries()) {
    if (z.gesamt >= schwellen.anfragenJeAbsender) {
      befunde.push({ absender: schluessel, art: "dauerfeuer", anzahl: z.gesamt });
    } else if (z.anmeldung >= schwellen.anmeldungenJeAbsender) {
      befunde.push({ absender: schluessel, art: "anmelde-sturm", anzahl: z.anmeldung });
    }
  }
  return befunde.sort((a, b) => b.anzahl - a.anzahl);
}

/** Selbsttest: Dauerfeuer und Anmelde-Sturm MÜSSEN auffallen, normale Nutzung nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = werteFensterAus(new Map([
    ["1.2.3.4", { gesamt: 1200, anmeldung: 0 }],
    ["5.6.7.8", { gesamt: 90, anmeldung: 55 }]
  ]));
  if (kaputt.length !== 2) fehler.push(`kaputtes Fenster: ${kaputt.length}/2 Befunde erkannt`);
  if (kaputt[0]?.art !== "dauerfeuer") fehler.push("Dauerfeuer muss der schwerste Befund sein");
  const gesund = werteFensterAus(new Map([
    ["9.9.9.9", { gesamt: 300, anmeldung: 3 }],
    ["8.8.8.8", { gesamt: 15, anmeldung: 1 }]
  ]));
  if (gesund.length !== 0) fehler.push("normale Nutzung löst fälschlich einen Befund aus");
  return { bestanden: fehler.length === 0, fehler };
}

/** Nur für Tests. */
export function _missbrauchsWacheZuruecksetzen() {
  fenster = { start: 0, absender: new Map() };
  vorheriges = null;
  gesamtSeitStart = 0;
  deckelErreicht = false;
}

/**
 * Der Lauf im Takt: Selbsttest, dann laufendes UND letztes Fenster.
 * Befunde machen die Ampel rot — sie sind der Moment, in dem ein Mensch
 * über eine Sperre entscheiden soll (die Wache sperrt selbst NICHTS).
 */
export function laufMissbrauchsWache({ jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Missbrauchs-Wache beurteilt bekannte Muster falsch: ${probe.fehler.join("; ")}` };
  }
  if (deckelErreicht) {
    deckelErreicht = false; // einmal melden je Vorkommnis, dann frisch messen
    return {
      ok: false,
      meldung: `Absender-Deckel (${MAX_ABSENDER}) erreicht — mehr verschiedene Absender, als die Wache zählen kann: entweder ein verteilter Ansturm oder der Deckel ist zu klein. Ab hier gibt es blinde Flecken.`
    };
  }
  const befunde = [
    ...werteFensterAus(fenster.absender),
    ...(vorheriges ? werteFensterAus(vorheriges.absender) : [])
  ];
  if (befunde.length) {
    const top = befunde[0];
    return {
      ok: false,
      meldung: `${befunde.length} Missbrauchs-Befund(e): ${top.art} von ${top.absender} (${top.anzahl} Anfragen/10 min) — Wache sperrt nicht selbst, Entscheidung beim Betreiber`
    };
  }
  if (gesamtSeitStart === 0) {
    return { ok: true, meldung: "Selbsttest 3/3; noch keine API-Anfrage gesehen — Zähl-Haken frisch verdrahtet oder Dienst gerade gestartet" };
  }
  return {
    ok: true,
    meldung: `Selbsttest 3/3; ${fenster.absender.size} Absender im laufenden 10-min-Fenster, `
      + `${gesamtSeitStart} Anfragen seit Start, kein Missbrauchs-Muster`
  };
}
