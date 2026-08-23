// smejj.com — Willkommens-Wache (Autopilot Nr. 58): misst am ECHTEN
// Nutzer-Index, ob neue Nutzer ankommen und ob sie wiederkommen — die zwei
// Zahlen, an denen Wachstum wirklich hängt.
//
// Quelle ist der Nutzer-Index des Adminbereichs (userIndex.js): createdAt
// sagt, wann ein Konto entstand; lastSeenAt, wann es zuletzt eine Sitzung
// berührt hat. Kein Blick in Gespräche, nur Kopfdaten — dieselbe Regel wie
// in der Nutzer-Lage.
//
// EHRLICH: Ein alter Index trägt lastSeenAt noch nicht (erst der Neubau
// schreibt es). Solche Einträge werden als "nicht messbar" gezählt und
// benannt, nie als "kommt nicht wieder" gewertet.
import { readUserIndex } from "../admin/userIndex.js";

const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Rechnet die Willkommens-Lage aus Index-Einträgen. Getrennt testbar.
 * Wiederkehrer = Konto älter als 7 Tage, in den letzten 7 Tagen gesehen.
 */
export function berechneWillkommensLage(eintraege = [], { jetztMs = Date.now() } = {}) {
  const vor7Tagen = jetztMs - 7 * TAG_MS;
  let neue7Tage = 0;
  let bestandAeltere = 0;
  let wiederkehrer = 0;
  let ohneMesswert = 0;
  for (const e of eintraege) {
    const erstellt = Date.parse(e?.createdAt || "");
    if (Number.isFinite(erstellt) && erstellt >= vor7Tagen) {
      neue7Tage += 1;
      continue;
    }
    bestandAeltere += 1;
    const gesehen = Date.parse(e?.lastSeenAt || "");
    if (!Number.isFinite(gesehen)) { ohneMesswert += 1; continue; }
    if (gesehen >= vor7Tagen) wiederkehrer += 1;
  }
  const messbareAeltere = bestandAeltere - ohneMesswert;
  return {
    gesamt: eintraege.length,
    neue7Tage,
    bestandAeltere,
    wiederkehrer,
    ohneMesswert,
    wiederkehrQuote: messbareAeltere > 0 ? wiederkehrer / messbareAeltere : null
  };
}

/** Selbsttest: bekannte Verteilungen müssen exakt herauskommen. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const jetztMs = 100 * TAG_MS;
  const iso = (tageZurueck) => new Date(jetztMs - tageZurueck * TAG_MS).toISOString();
  const lage = berechneWillkommensLage([
    { createdAt: iso(1) },                                  // neu
    { createdAt: iso(3), lastSeenAt: iso(0) },              // neu (lastSeen egal)
    { createdAt: iso(30), lastSeenAt: iso(2) },             // Wiederkehrer
    { createdAt: iso(30), lastSeenAt: iso(20) },            // fern geblieben
    { createdAt: iso(30) }                                  // nicht messbar
  ], { jetztMs });
  if (lage.neue7Tage !== 2) fehler.push(`neue7Tage: ${lage.neue7Tage} statt 2`);
  if (lage.wiederkehrer !== 1) fehler.push(`wiederkehrer: ${lage.wiederkehrer} statt 1`);
  if (lage.ohneMesswert !== 1) fehler.push(`ohneMesswert: ${lage.ohneMesswert} statt 1`);
  if (lage.wiederkehrQuote !== 0.5) fehler.push(`wiederkehrQuote: ${lage.wiederkehrQuote} statt 0.5`);
  const leer = berechneWillkommensLage([], { jetztMs });
  if (leer.gesamt !== 0 || leer.wiederkehrQuote !== null) fehler.push("leerer Index muss 0/null liefern, nicht raten");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann der echte Index.
 */
export async function laufWillkommensWache({ indexLader = readUserIndex, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Willkommens-Wache rechnet bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  let index;
  try {
    index = await indexLader({});
  } catch (f) {
    return { ok: false, meldung: `Nutzer-Index nicht lesbar: ${String(f?.message || f).slice(0, 80)}` };
  }
  if (!index?.ok) {
    return { ok: false, meldung: `Nutzer-Index nicht verfügbar (${index?.error || "ohne Grund"}) — Willkommens-Lage nicht messbar` };
  }
  const lage = berechneWillkommensLage(index.entries || [], { jetztMs });
  const quoteText = lage.wiederkehrQuote === null
    ? "Wiederkehr noch nicht messbar"
    : `${Math.round(lage.wiederkehrQuote * 100)} % der älteren Konten in 7 Tagen wiedergekommen`;
  return {
    ok: true,
    meldung: `Selbsttest 5/5; ${lage.gesamt} Konten, ${lage.neue7Tage} neu in 7 Tagen, ${quoteText}`
      + (lage.ohneMesswert ? ` (${lage.ohneMesswert} ohne Messwert — Index-Neubau trägt lastSeenAt nach)` : "")
  };
}
