// smejj.com — Abo-Umsatz-Wache (Autopilot Nr. 69), Betreiber-Freigabe
// 2026-08-30 ("Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig.").
//
// WARUM ES SIE GIBT: Die Kosten-Seite wird von Nr. 55 bewacht — die Einnahmen-
// seite von niemandem. Ein Abo, das seit Wochen nicht bezahlt wird (past_due),
// ist im Modul E eine Liste zum Abarbeiten; aber wer schaut täglich drauf?
// Diese Wache misst die Abo-Ablage (billing/customers/, gespeichert aus
// Stripe) im Takt und macht Handlungsbedarf zur Ampel.
//
// GRENZE, ausdrücklich: Sie liest nur den eigenen Spiegel in IDrive e2 —
// Beträge, Zahlungsmittel und Rechnungen liegen bei Stripe und gehören dorthin
// (dieselbe Grenze wie Modul E). Sie schreibt nichts nach Stripe, mahnt nicht,
// sperrt niemanden: past_due heißt "Nutzer ansprechen", und das ist eine
// Entscheidung des Betreibers.
import { createRecordStore } from "../admin/recordStore.js";
import { abrechnungUebersicht } from "../admin/opsAbrechnung.js";

/** Die Ablage der Trend-Karte — vorher/nachher der Zahlenden, gelesen vom nächsten Lauf. */
export const ABO_UMSATZ_ABLAGE = "autopiloten/abo-umsatz";

/** Ab wie vielen Zahlenden ein starker Rückgang als Alarm gilt (darunter ist die Zahl zu klein für Statistik). */
export const TREND_MINDEST_ZAHLEND = 5;
/** Ein Rückgang um mehr als diesen Anteil ist rot. */
export const TREND_STURZ_ANTEIL = 0.2;

/**
 * Bewertet die Abo-Lage. Getrennt testbar (kaputt + gesund):
 *   - Ablage/Listing kaputt -> rot (Umsatz blind ist schlimmer als Umsatz schlecht)
 *   - Handlungsbedarf (past_due/unpaid) > 0 -> rot
 *   - Zahlende stürzen um mehr als 20 % ab (ab 5 Zahlenden vorher) -> rot
 *   - abgeschnitten (über 300 Einträge) -> rot: dann ist die Messung unvollständig
 *   - Testmodus-Einträge werden BENANNT, nicht bestraft — sie sind bekannt
 */
export function beurteileAbos({ uebersicht, vorherZahlend = null } = {}) {
  if (!uebersicht?.ok) {
    return { ok: false, grund: `Abo-Ablage nicht lesbar (${uebersicht?.error || "unbekannt"}) — Umsatz und Zahlungsausfälle sind unbewacht` };
  }
  if (uebersicht.abgeschnitten) {
    return { ok: false, grund: "Abo-Listing abgeschnitten (mehr als 300 Einträge) — die Messung ist unvollständig, bis das Limit steigt" };
  }
  const zahlend = Number(uebersicht.zahlend) || 0;
  const handlungsbedarf = Number(uebersicht.handlungsbedarf) || 0;
  if (handlungsbedarf > 0) {
    return { ok: false, grund: `${handlungsbedarf} Abo(s) mit Zahlung offen oder unbezahlt (past_due/unpaid) — Nutzer ansprechen, Stripe versucht weiter`, zahlend, handlungsbedarf };
  }
  if (Number.isFinite(vorherZahlend) && vorherZahlend >= TREND_MINDEST_ZAHLEND && zahlend < vorherZahlend * (1 - TREND_STURZ_ANTEIL)) {
    return { ok: false, grund: `Zahlende Abos gestürzt: ${vorherZahlend} -> ${zahlend} (−${Math.round((1 - zahlend / vorherZahlend) * 100)} %)`, zahlend, handlungsbedarf };
  }
  return { ok: true, zahlend, handlungsbedarf: 0, testmodus: Number(uebersicht.testmodus) || 0, total: Number(uebersicht.total) || 0 };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Proben, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = beurteileAbos({ uebersicht: { ok: false, error: "listing_http_403" } });
  if (kaputt.ok) fehler.push("unlesbare Abo-Ablage muss rot sein");
  const pastDue = beurteileAbos({ uebersicht: { ok: true, abgeschnitten: false, zahlend: 10, handlungsbedarf: 2, testmodus: 0, total: 12 } });
  if (pastDue.ok) fehler.push("past_due-Abos müssen rot sein");
  const sturz = beurteileAbos({ uebersicht: { ok: true, abgeschnitten: false, zahlend: 7, handlungsbedarf: 0, testmodus: 0, total: 20 }, vorherZahlend: 10 });
  if (sturz.ok) fehler.push("ein Sturz von 10 auf 7 Zahlende muss rot sein");
  const kleinerSturz = beurteileAbos({ uebersicht: { ok: true, abgeschnitten: false, zahlend: 3, handlungsbedarf: 0, testmodus: 0, total: 8 }, vorherZahlend: 4 });
  if (!kleinerSturz.ok) fehler.push("unter 5 Zahlenden ist Statistik nicht erlaubt — kleine Schwankung bleibt grün");
  const stabil = beurteileAbos({ uebersicht: { ok: true, abgeschnitten: false, zahlend: 10, handlungsbedarf: 0, testmodus: 1, total: 11 }, vorherZahlend: 10 });
  if (!stabil.ok) fehler.push("stabile Zahlende müssen grün sein");
  if (stabil.testmodus !== 1) fehler.push("Testmodus-Einträge müssen benannt werden, nicht verschwinden");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: vorherige Trend-Karte lesen (für den Vergleich), dann die
 * echte Abo-Ablage, dann die neue Karte schreiben. ROT bei Zahlungsausfällen,
 * Sturz der Zahlenden oder unlesbarer/abgeschnittener Ablage.
 *
 * @param {{env?: object, jetztMs?: number, leser?: Function, kartenAblage?: object}} eingabe
 *   leser (Signatur wie abrechnungUebersicht) und kartenAblage austauschbar.
 */
export async function laufAboUmsatz({
  env = process.env,
  jetztMs = Date.now(),
  leser = abrechnungUebersicht,
  kartenAblage = null
} = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Abo-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }
  const ablage = kartenAblage || createRecordStore(ABO_UMSATZ_ABLAGE, { maximal: 10 });
  let vorherZahlend = null;
  try {
    const alte = await ablage.liste({ limit: 1, env });
    if (alte.ok && alte.datensaetze?.[0]) vorherZahlend = Number(alte.datensaetze[0].zahlend);
  } catch { /* ohne Vorwert kein Trend — kein Fehler, nur weniger Aussage */ }

  let uebersicht;
  try {
    uebersicht = await leser({ env, jetztMs });
  } catch (error) {
    return { ok: false, meldung: `Abo-Ablage unlesbar: ${String(error?.message || error).slice(0, 140)}` };
  }
  const urteil = beurteileAbos({ uebersicht, vorherZahlend });

  let karteStatus = "Karte nicht abgelegt";
  try {
    await ablage.schreib({
      id: "letzte-karte",
      art: "abo-umsatz-karte",
      zahlend: urteil.zahlend ?? 0,
      handlungsbedarf: urteil.handlungsbedarf ?? Number(uebersicht?.handlungsbedarf) ?? 0,
      testmodus: urteil.testmodus ?? 0,
      vorherZahlend,
      createdAt: new Date(jetztMs).toISOString()
    }, { env, timeoutMs: 5000 });
    karteStatus = "Trend-Karte abgelegt";
  } catch {
    karteStatus = "Trend-Karte NICHT abgelegt (Ablage gestört)";
  }

  if (!urteil.ok) {
    return { ok: false, meldung: `Abos & Umsatz: ${urteil.grund}; ${karteStatus}` };
  }
  const test = urteil.testmodus > 0 ? `, ${urteil.testmodus} im Testmodus (bewusst getrennt)` : "";
  return {
    ok: true,
    meldung: `Selbsttest 6/6; ${urteil.zahlend} zahlende Abos von ${urteil.total}${test}`
      + `${vorherZahlend !== null ? `; Trend: vorher ${vorherZahlend}` : "; Trend: erster Lauf"}; ${karteStatus}`
  };
}
