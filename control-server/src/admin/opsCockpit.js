// smejj.com — Cockpit: die eine Seite, die sagt, ob gerade etwas zu tun ist.
//
// WARUM DIESE DATEI EINMAL NEU GESCHRIEBEN WURDE (2026-08-14):
// Sie lieferte bis heute erfundene Zahlen — ttftMs: 42, apiP95Ms: 118,
// lcpSekunden: 0.85, benchmarkPassRate: 1.0, dpoStatus "active_24_7". Feste
// Konstanten im Code, die sich nie aendern konnten: die Seite haette
// "118 ms" gezeigt, waehrend der Server steht. Die Ansicht setzte noch eins
// drauf und schrieb "100% Uptime" und "Pass Rate 100.0 %" direkt ins HTML.
//
// Der Betreiber hat am 2026-08-12 entschieden, dass genau das hier nicht
// passiert (docs/approvals/2026-08-12-ampel-ehrlich-messen.md: "die Ampel
// MISST, sie stempelt nicht"), und am 2026-08-14 die Neufassung freigegeben.
//
// REGEL FUER JEDE ERWEITERUNG: Ein Feld kommt in diese Antwort, wenn eine
// Messung dahintersteht. Sonst gehoert es in `nichtGemessen` — mit dem Grund,
// warum es fehlt. Eine Kennzahl, die man nicht messen kann, wegzulassen ist
// ehrlich; sie zu erfinden ist es nie.

import { autopilotUebersicht } from "./opsAutopiloten.js";
import { kontingentUebersicht } from "./opsKontingent.js";
import { auslieferungUebersicht } from "./opsAuslieferung.js";
import { mrrBeiStripe } from "./opsUmsatz.js";
import { readUserIndexFresh } from "./userIndex.js";
import { readAuditPage } from "./auditLog.js";
import { listApprovals } from "./approvalStore.js";

// ---- "Die eine Seite, die du morgens ansiehst" (Design-Vorschlag, 2026-08-23) ----
//
// Vier Zahlen oben, Dienste links, Protokoll rechts — alles aus den Modulen,
// die es schon gibt (Auslieferung, Umsatz, Nutzer-Index, Audit, Freigaben).
// Die Dienste-Tabelle stellt NEBEN die Antwort des Dienstes den letzten
// ECHTEN Lauf des zugehoerigen Autopiloten: "kein Herzschlag, aber gelaufen"
// sieht man so in einer Sekunde (der Fall, der einmal in die Irre fuehrte).
//
// mitNetz: nur die Route setzt es; Tests rufen ohne und bekommen die alte,
// netzlose Antwort — kein Test haengt an smejj.com oder Stripe.
const DIENST_AUTOPILOT = Object.freeze({
  control: "container-puls", bruecke: "brueckenwaechter", video: "multimodal-engine", maus: null, bild: null, frontend: null, waechter: "brueckenwaechter"
});

function heuteGemessen(a, jetztMs) {
  const utcTag = new Date(jetztMs).toISOString().slice(0, 10);
  return (a.tage || []).some((t) => t.tag === utcTag && ((t.ok || 0) + (t.fehler || 0)) > 0);
}

/** Grau, obwohl er melden SOLL und heute nichts gemessen wurde — dieselbe Regel wie die Autopiloten-Seite. */
export function ohneSignal(ap, jetztMs) {
  return ap.autopiloten.filter((a) => a.ampel === "grau" && a.messung === "heartbeat" && !heuteGemessen(a, jetztMs));
}

function letzterEchterLauf(ap, id) {
  const a = id ? ap.autopiloten.find((x) => x.id === id) : null;
  if (!a) return null;
  return { autopilot: a.name, nummer: a.nummer || null, ampel: a.ampel, am: a.letzterLauf?.am || null, status: a.letzterLauf?.status || null, grund: a.ampelGrund || null };
}

async function sicher(fn, leer) {
  try { return await fn(); } catch (fehler) { return { ...leer, fehler: String(fehler?.message || fehler).slice(0, 100) }; }
}

async function morgenLage({ env, jetztMs, fetchImpl, ap, startzeitMs, leseDienste, leseMrr, leseIndex, leseAudit, leseFreigaben }) {
  const [dienste, mrr, index, audit, freigaben] = await Promise.all([
    sicher(() => leseDienste({ env, fetchImpl, jetztMs, startzeitMs }), { ok: false, dienste: [] }),
    sicher(() => leseMrr({ env, fetchImpl }), { gemessen: false, cent: 0, abos: 0 }),
    sicher(() => leseIndex({ env, fetchImpl }), { ok: false, entries: [] }),
    // 50 statt 8: die Sicherheitsalarme (security.alarm) werden wie auf der
    // alten Seite A ueber die letzten 50 Eintraege gezaehlt; gezeigt werden 8.
    sicher(() => leseAudit({ limit: 50, env, fetchImpl, nowMs: jetztMs }), { ok: false, entries: [] }),
    sicher(() => leseFreigaben({ env, fetchImpl, nowMs: jetztMs, limit: 20 }), { ok: false, approvals: [] })
  ]);
  const konten = index.ok ? (index.entries || []) : [];
  const wocheAb = jetztMs - 7 * 86400000;
  const stumm = ohneSignal(ap, jetztMs);
  const werkstatt = letzterEchterLauf(ap, "werkstatt-autopilot");
  const nachweis = letzterEchterLauf(ap, "nachweis-kette");
  const diensteZeilen = (dienste.dienste || []).map((d) => ({
    id: d.id, name: d.name, bautAus: d.bautAus, antwortMs: d.antwortMs ?? null, zustand: d.zustand, satz: d.satz,
    letzterLauf: letzterEchterLauf(ap, DIENST_AUTOPILOT[d.id] || null)
  }));
  diensteZeilen.push({ id: "speicher", name: "Speicher IDrive e2", bautAus: "lesen und schreiben", antwortMs: null,
    zustand: nachweis ? (nachweis.ampel === "gruen" ? "erreichbar" : nachweis.ampel === "rot" ? "nicht-erreichbar" : "unbekannt") : "unbekannt",
    satz: nachweis ? "Schreibprobe: " + (nachweis.grund || nachweis.ampel) : "Nachweis-Wächter nicht in der Registry.", letzterLauf: nachweis });
  diensteZeilen.push({ id: "nachtbau", name: "Nachtbau (Werkstatt)", bautAus: "Control Server + Mac", antwortMs: null,
    zustand: werkstatt ? (werkstatt.ampel === "gruen" ? "erreichbar" : werkstatt.ampel === "rot" ? "nicht-erreichbar" : "unbekannt") : "unbekannt",
    satz: werkstatt && werkstatt.ampel === "grau" && werkstatt.am ? "Kein Herzschlag gerade — aber gelaufen: " + werkstatt.am : (werkstatt ? werkstatt.grund : "—"), letzterLauf: werkstatt });
  const gemessen = (dienste.dienste || []).filter((d) => Number.isFinite(d.antwortMs));
  return {
    nutzer: { erreichbar: index.ok === true, gesamt: konten.length, neuDieseWoche: konten.filter((n) => Date.parse(n.createdAt || 0) >= wocheAb).length, grund: index.ok ? null : (index.error || index.fehler || "Index nicht lesbar") },
    umsatz: { gemessen: mrr.gemessen === true, cent: mrr.cent || 0, waehrung: mrr.waehrung || "eur", abos: mrr.abos || 0, grund: mrr.gemessen ? null : (mrr.grund || mrr.fehler || "Stripe nicht lesbar") },
    antwortzeit: gemessen.length
      ? { gemessen: true, langsamsterMs: Math.max(...gemessen.map((d) => d.antwortMs)), langsamster: gemessen.sort((a, b) => b.antwortMs - a.antwortMs)[0].name, dienste: gemessen.length, satz: "Gesundheitsabfragen der Dienste, eben gemessen — nicht die Antwortzeit des Chats." }
      : { gemessen: false, satz: "Kein Dienst hat geantwortet." },
    ohneSignal: { anzahl: stumm.length, namen: stumm.slice(0, 5).map((a) => a.name), gesamt: ap.autopiloten.length },
    dienste: diensteZeilen,
    protokoll: { erreichbar: audit.ok === true, eintraege: (audit.entries || []).slice(0, 8).map((x) => ({ am: x.at, aktion: x.action, wer: x.actorEmail || null, ziel: x.target || null })), grund: audit.ok ? null : (audit.error || audit.fehler || null) },
    alarme: (() => {
      const liste = (audit.entries || []).filter((x) => x && x.action === "security.alarm");
      return { anzahl: liste.length, geprueft: (audit.entries || []).length, letzter: liste[0] ? { am: liste[0].at, ziel: liste[0].target || null, grund: liste[0].reason || null } : null };
    })(),
    vierAugen: { erreichbar: freigaben.ok !== false, offen: (freigaben.approvals || []).filter((a) => a.status === "pending").map((a) => ({ id: a.id, aktion: a.action, ziel: a.target, angefragtVon: a.requestedBy, angefragtAm: a.requestedAt })) }
  };
}

/**
 * Die Lage in einem Satz, plus die Zahlen, die wirklich gemessen sind.
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function cockpitUebersicht({
  jetztMs = Date.now(), env = process.env, mitNetz = false, fetchImpl = fetch, startzeitMs = null,
  leseDienste = auslieferungUebersicht, leseMrr = mrrBeiStripe, leseIndex = readUserIndexFresh, leseAudit = readAuditPage, leseFreigaben = listApprovals
} = {}) {
  const ap = autopilotUebersicht({ jetztMs });
  const kontingent = await kontingentUebersicht({ env });
  const morgen = mitNetz
    ? await morgenLage({ env, jetztMs, fetchImpl, ap, startzeitMs, leseDienste, leseMrr, leseIndex, leseAudit, leseFreigaben })
    : null;

  const gesamt = ap.autopiloten.length;
  const rot = ap.rot || 0;
  const gelb = ap.gelb || 0;
  const grau = ap.autopiloten.filter((a) => a.ampel === "grau").length;

  // Der Satz, den man liest, bevor man irgendetwas anklickt.
  //
  // DIE FALLE, die diese Reihenfolge verhindert: "kein Rot und kein Gelb" ist
  // NICHT dasselbe wie "alles in Ordnung". Nach jedem Neustart des Servers
  // sind alle Ampeln grau, weil noch kein Herzschlag eingegangen ist — und
  // jeder Push deployt Control. Ein Cockpit, das in diesem Moment "Nichts zu
  // tun" meldet, behauptet Gesundheit aus dem Fehlen von Messungen. Genau
  // diese Verwechslung hat den Nachtbau schon einmal 30 Phantom-Aufgaben
  // erzeugen lassen. Ohne ein einziges Gruen sagt die Seite deshalb, dass sie
  // nichts weiss.
  const blind = (ap.gruen || 0) === 0 && gesamt > 0;

  const lage = rot > 0
    ? {
      status: "kritisch",
      satz: `${rot} ${rot === 1 ? "Automatik ist" : "Automatiken sind"} ausgefallen.`,
      naechsterSchritt: "Auf der Autopiloten-Seite steht im Register »Braucht dich«, welche es sind."
    }
    : gelb > 0
      ? {
        status: "warnung",
        satz: `${gelb} ${gelb === 1 ? "Automatik ist" : "Automatiken sind"} verspätet — noch kein Ausfall.`,
        naechsterSchritt: "Auf der Autopiloten-Seite steht im Register »Braucht dich«, welche es sind."
      }
      : blind
        ? {
          status: "unbekannt",
          satz: "Von keiner Automatik liegt gerade eine Messung vor.",
          naechsterSchritt: "Kurz nach einem Neustart des Servers ist das normal — die meisten melden sich binnen 35 Minuten. "
            + "Bleibt es danach so, stimmt etwas nicht."
        }
        : {
          status: "ruhig",
          satz: "Kein Ausfall, keine Verspätung.",
          naechsterSchritt: "Nichts zu tun."
        };

  return {
    ok: true,
    zeitpunkt: new Date(jetztMs).toISOString(),
    morgen,

    lage,

    automatiken: {
      gesamt,
      gruen: ap.gruen || 0,
      gelb,
      rot,
      grau,
      wartung: ap.wartung || 0,
      // Grau ist KEIN gruen: ohne Herzschlag ist unbekannt, ob die Automatik
      // laeuft. Der Satz sagt das, damit "26 von 36 gruen" nicht als "10 sind
      // kaputt" missverstanden wird — und auch nicht als "alles gut".
      hinweis: grau > 0
        ? `Von ${grau} ${grau === 1 ? "Automatik liegt" : "Automatiken liegt"} keine Messung vor — bei Wochen- und Nacht-Automatiken ist das der Normalfall.`
        : "Von jeder Automatik liegt eine Messung vor."
    },

    // Durchgereicht wie geliefert, samt der Ehrlichkeits-Felder der Quelle
    // (`vollstaendig`, `hinweis`, `quelle`, `ausCache`). Nichts davon wird
    // hier geglaettet: ein Mindestwert bleibt als Mindestwert erkennbar.
    speicher: kontingent && kontingent.ok
      ? {
        ok: true,
        bytesGesamt: kontingent.bytesGesamt ?? null,
        paketBytes: kontingent.paketBytes ?? null,
        auslastungProzent: kontingent.auslastungProzent ?? null,
        ampel: kontingent.ampel || null,
        objekteGesamt: kontingent.objekteGesamt ?? null,
        // null heisst hier "nichts zu zahlen", nicht "0,00 USD zugesagt" —
        // die Quelle unterscheidet das bewusst, also reichen wir es so durch.
        mehrkostenUsdProMonat: kontingent.mehrkostenUsdProMonat ?? null,
        vollstaendig: kontingent.vollstaendig === true,
        hinweis: kontingent.hinweis || null,
        quelle: kontingent.quelle || null,
        gemessenAm: kontingent.gemessenAm || null,
        alterSekunden: kontingent.alterSekunden ?? null
      }
      : { ok: false, error: (kontingent && kontingent.error) || "speicher_nicht_messbar" },

    // Was diese Seite BEWUSST nicht behauptet. Die Ansicht zeigt diese Liste
    // im Klartext an — ein Betreiber soll sehen, wo eine Zahl fehlt, statt
    // eine erfundene zu glauben.
    nichtGemessen: [
      {
        feld: "Antwortzeit des Chats (erster Token, p95)",
        warum: "Oben steht die Antwortzeit der Gesundheitsabfragen — nicht der Chat. Für den ersten Token gibt es keine laufende Messung; Stichproben liegen in docs/benchmarks/."
      },
      {
        feld: "Ladezeit der Seite (LCP, CLS)",
        warum: "Wird nirgends erhoben. Dafür bräuchte es eine Messung im Browser der Nutzer."
      },
      {
        feld: "Benchmark-Quote des Modells",
        warum: "Der Modell-Eval-Lauf ist ein eigener Vorgang (npm run eval:models) und schreibt kein Ergebnis, das diese Seite abfragen könnte."
      },
      {
        feld: "Monatliche Kosten",
        warum: "Der Serverpreis ist ein Vertragswert, keine Messung; die Mehrkosten für Speicher stehen auf der Speicher-Seite mit Quellenangabe."
      }
    ]
  };
}
