// smejj.com — E-Mail-Zustell-Wache (Autopilot Nr. 66), Betreiber-Freigabe
// 2026-08-30 ("Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig.").
//
// WARUM ES SIE GIBT: Die Anmeldung über Magic-Link hängt vollständig an der
// Mail. Bricht die Zustellung, kann sich niemand mehr einloggen — und kein
// einziger der 64 bisherigen Autopiloten hat es gemerkt. Das Zustellprotokoll
// (mail/zustellung/, Freigabe 2026-07-29) schreibt jeden Versand auf; gelesen
// hat es bisher nur die Admin-Ansicht V. Diese Wache liest es im Takt und
// macht aus dem Protokoll eine Ampel.
//
// GRENZE, ausdrücklich: Sie verschickt KEINE Probe-Mails. Eine Probe wäre ein
// echter Versand an einen echten Postfach-Anbieter — Nebenwirkung und Kosten
// ohne Nutzervereinbarung. Gemessen wird der ECHTE Verkehr im Protokoll; gibt
// es keinen Verkehr, sagt die Wache das ehrlich, statt Gesundheit zu erfinden.
import { mailerConfig } from "../auth/mailer.js";
import { leseZustellungen } from "../auth/mailDeliveryLog.js";

/** Ab wie vielen Mails in Serie die Anmeldung als blockiert gilt. */
export const SERIE_ROT = 3;
/** Fehlerquote im Fenster, ab der rot gemeldet wird — und die Mindestzahl Mails dafür. */
export const QUOTE_ROT = 0.2;
export const QUOTE_MINDEST_MAILS = 5;

/**
 * Bewertet den Zustell-Log. Getrennt testbar (kaputt + gesund):
 *   - SMTP unkonfiguriert -> rot (jede Anmeldung-Mail wäre zum Scheitern verurteilt)
 *   - die letzten 3+ Versuche in Serie fehlgeschlagen -> rot
 *   - Fehlerquote >= 20 % ab 5 Mails im Fenster -> rot
 *   - kein Verkehr -> grün mit ehrlichem Vorbehalt ("nichts zu messen")
 * Die Einträge werden als newest-first erwartet — so liefert sie leseZustellungen.
 */
export function beurteileZustellLog({ konfiguriert, eintraege = [] } = {}) {
  if (!konfiguriert) {
    return { ok: false, grund: "SMTP ist nicht konfiguriert — jede Anmeldung-Mail schlägt fehl, bevor sie das Internet verlässt" };
  }
  const serie = (() => {
    let n = 0;
    for (const e of eintraege) {
      if (e?.zugestellt) break;
      n += 1;
    }
    return n;
  })();
  const gesamt = eintraege.length;
  const fehler = eintraege.filter((e) => !e?.zugestellt).length;
  if (serie >= SERIE_ROT) {
    const letzterGrund = eintraege.find((e) => !e?.zugestellt)?.grund || "unbekannt";
    return {
      ok: false,
      grund: `Die letzten ${serie} Mail-Versände in Serie fehlgeschlagen (zuletzt: ${letzterGrund}) — Anmeldungen kommen nicht durch`,
      gesamt, fehler, serie
    };
  }
  if (gesamt >= QUOTE_MINDEST_MAILS && fehler / gesamt >= QUOTE_ROT) {
    return {
      ok: false,
      grund: `Fehlerquote ${Math.round((fehler / gesamt) * 100)} % (${fehler} von ${gesamt} Mails) im Fenster`,
      gesamt, fehler, serie
    };
  }
  if (gesamt === 0) {
    return { ok: true, gesamt: 0, fehler: 0, serie: 0, grund: "kein Mailverkehr im Fenster — Zustellung ist nicht belegbar, aber auch nicht gestört" };
  }
  return { ok: true, gesamt, fehler, serie, grund: `${gesamt - fehler} von ${gesamt} Mails zugestellt` };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Proben, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const unkonfiguriert = beurteileZustellLog({ konfiguriert: false, eintraege: [] });
  if (unkonfiguriert.ok) fehler.push("unkonfiguriertes SMTP gilt fälschlich als gesund");
  const serie = beurteileZustellLog({
    konfiguriert: true,
    eintraege: [{ zugestellt: false, grund: "smtp_connect_failed" }, { zugestellt: false, grund: "x" }, { zugestellt: false, grund: "y" }]
  });
  if (serie.ok) fehler.push("drei Fehlschläge in Serie müssen rot sein");
  const quote = beurteileZustellLog({
    konfiguriert: true,
    eintraege: [
      { zugestellt: true }, { zugestellt: false }, { zugestellt: false }, { zugestellt: false },
      { zugestellt: true }, { zugestellt: true }, { zugestellt: false }
    ]
  });
  if (quote.ok) fehler.push("eine 57-%-Fehlerquote (4 von 7) muss rot sein");
  const gesund = beurteileZustellLog({
    konfiguriert: true,
    eintraege: [{ zugestellt: true }, { zugestellt: true }, { zugestellt: false, grund: "sporadisch" }]
  });
  if (!gesund.ok) fehler.push("überwiegend erfolgreiche Zustellung muss grün sein");
  const leer = beurteileZustellLog({ konfiguriert: true, eintraege: [] });
  if (!leer.ok) fehler.push("kein Verkehr ist kein Ausfall — grün mit Vorbehalt");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: SMTP-Konfiguration prüfen, dann die echten Zustell-
 * einträge der letzten 7 Tage lesen und bewerten. ROT bei unkonfiguriertem
 * SMTP, Serien-Fehlschlägen oder hoher Fehlerquote — alles Zustände, in denen
 * Anmeldungen gerade nicht durchkommen.
 *
 * @param {{env?: object, leser?: Function}} eingabe leser testtauglich
 *   austauschbar (Signatur wie leseZustellungen).
 */
export async function laufEmailZustell({ env = process.env, leser = leseZustellungen } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `E-Mail-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }
  const konfiguriert = mailerConfig(env) !== null;
  let ergebnis;
  try {
    ergebnis = await leser({ env, tage: 7, limit: 100 });
  } catch (error) {
    return { ok: false, meldung: `Zustellprotokoll unlesbar: ${String(error?.message || error).slice(0, 140)}` };
  }
  if (!ergebnis?.ok) {
    return { ok: false, meldung: `Zustellprotokoll nicht lesbar (${ergebnis?.error || "unbekannt"}) — der Nachweis der Anmeldung-Mails fehlt` };
  }
  const urteil = beurteileZustellLog({ konfiguriert, eintraege: ergebnis.eintraege || [] });
  if (!urteil.ok) {
    return { ok: false, meldung: `Mail-Zustellung gestört: ${urteil.grund}` };
  }
  return {
    ok: true,
    meldung: `Selbsttest 5/5; 7-Tage-Fenster: ${urteil.grund}`
      + `${urteil.serie > 0 ? `; letzte Serie: ${urteil.serie} Fehlversuch(e)` : ""}`
      + " — Magic-Link-Anmeldung hängt an dieser Kette"
  };
}
