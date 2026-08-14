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

/**
 * Die Lage in einem Satz, plus die Zahlen, die wirklich gemessen sind.
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function cockpitUebersicht({ jetztMs = Date.now(), env = process.env } = {}) {
  const ap = autopilotUebersicht({ jetztMs });
  const kontingent = await kontingentUebersicht({ env });

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
        feld: "Antwortzeit (erster Token, p95)",
        warum: "Es gibt keine laufende Messung im Control-Server. Einzelmessungen liegen in docs/benchmarks/, sie sind Stichproben und kein Live-Wert."
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
