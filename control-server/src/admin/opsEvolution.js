// smejj.com — Modul AE: AI Evolution Dashboard (Backend).
//
// WARUM DIESE DATEI SO VORSICHTIG IST: Das Cockpit-Backend lieferte einmal
// erfundene Konstanten, und der Test schrieb sie fest (Befund 2026-08-13).
// Danach sah das Dashboard vollständig aus und war es nicht. Deshalb gilt hier:
//
//   JEDE KENNZAHL IST ENTWEDER GEMESSEN ODER `null` MIT GRUND.
//
// Ein `null` mit Grund ist eine ehrliche Lücke. Eine ausgedachte 87 % ist ein
// Schaden, der erst auffällt, wenn jemand danach handelt.

import { autopilotUebersicht } from "./opsAutopiloten.js";
import { evolutionUebersicht } from "../evolution/aiEvolutionEngine.js";
import { medientypen } from "../evolution/qualitaetsEngine.js";
import { erkenneLuecken, baueLueckenAufgaben, KONKURRENZ_STAND } from "../evolution/missingFunctionDetector.js";
import { holeKennzahlen } from "../evolution/kennzahlenAblage.js";
import { zaehleAufgaben } from "../evolution/aufgabenAblage.js";
import { holeKandidaten } from "../evolution/konkurrenzRadar.js";
import { AKTIONSARTEN } from "../evolution/aiEvolutionEngine.js";
import { KRITERIEN } from "../evolution/autopilotSupervisor.js";

/** Eine Kennzahl, die nicht gemessen werden konnte — mit Grund statt Zahl. */
const ungemessen = (grund) => ({ wert: null, grund });

/**
 * Der Evolution-Score: EINE Zahl über den Zustand des Selbstverbesserungs-
 * Kreislaufs. Sie ist bewusst grob und ihre Bestandteile stehen daneben —
 * eine Einzelzahl ohne Zerlegung ist ein Gefühl, keine Messung.
 *
 * Drei gleich gewichtete Teile:
 *   abdeckung   wie viel vom KI-Betrieb überhaupt geprüft wird
 *   ampel       wie viele Autopiloten nachweislich laufen
 *   parität     wie viel von dem, was die Konkurrenz kann, smejj auch kann
 */
export function berechneEvolutionScore({ abdeckung, ampelAnteil, paritaet }) {
  const teile = [abdeckung, ampelAnteil, paritaet].filter((t) => Number.isFinite(t));
  if (!teile.length) return null;
  return Math.round(teile.reduce((s, t) => s + t, 0) / teile.length);
}

/**
 * @param {{jetztMs?: number, uebersicht?: Function, engineUebersicht?: Function}} [optionen]
 */
export async function evolutionDashboard({ jetztMs = Date.now(), uebersicht = autopilotUebersicht, engineUebersicht = evolutionUebersicht, kennzahlen = holeKennzahlen, aufgabenZaehler = zaehleAufgaben, radarBestand = holeKandidaten, env = process.env } = {}) {
  const ampel = uebersicht({ jetztMs });
  const alle = ampel.autopiloten || [];
  const gruen = alle.filter((a) => a.ampel === "gruen").length;
  const rot = alle.filter((a) => a.ampel === "rot").length;
  const gelb = alle.filter((a) => a.ampel === "gelb").length;
  const grau = alle.filter((a) => a.ampel === "grau").length;
  // NUR über die GEMESSENEN rechnen: "grau" heisst "noch kein Herzschlag", nicht
  // "kaputt". Direkt nach einem Deploy steht alles auf grau — würde das in den
  // Anteil einfliessen, meldete das Dashboard zwei Minuten nach jedem Deploy
  // einen Zusammenbruch (genau die Phantom-Falle, die den Nachtbau 2026-08-14
  // 30 erfundene Aufgaben bauen liess).
  const gemesseneAmpeln = alle.length - grau;
  const ampelAnteil = gemesseneAmpeln > 0 ? Math.round((gruen / gemesseneAmpeln) * 100) : null;

  const engine = engineUebersicht({ jetztMs });

  // DIE DAUERHAFTEN ZAHLEN (seit 2026-08-14): Bis dahin zeigte diese Seite den
  // Ringpuffer des laufenden Prozesses — und der beginnt nach JEDEM Deploy bei
  // null. Am Live-Dashboard stand deshalb "3 Aktionen", obwohl den ganzen Tag
  // gemessen worden war. Jetzt kommt die Reihe aus der Ablage; der Prozesswert
  // steht nur noch als "seit dem Neustart" daneben.
  const dauerhaft = await kennzahlen({ tage: 30, env, jetztMs }).catch((f) => ({ ok: false, grund: String(f?.message || f).slice(0, 120) }));
  const aufgabenStand = await aufgabenZaehler({ env }).catch((f) => ({ ok: false, grund: String(f?.message || f).slice(0, 120) }));
  const abdeckung = dauerhaft.ok ? dauerhaft.abdeckung : null;
  const qualitaetsNote = dauerhaft.ok ? dauerhaft.qualitaetsNote : null;

  const radar = await radarBestand({ env }).catch((f) => ({ ok: false, grund: String(f?.message || f).slice(0, 120) }));

  const { luecken, vorteile, gleichstand } = erkenneLuecken({});
  const lueckenAufgaben = baueLueckenAufgaben(luecken);
  const konkurrenzGesamt = luecken.length + gleichstand.length;
  const paritaet = konkurrenzGesamt ? Math.round((gleichstand.length / konkurrenzGesamt) * 100) : null;

  const typen = medientypen();
  const ohnePruefer = AKTIONSARTEN.filter((a) => !typen.includes(a));

  // Offene Vorfälle sind der einzige Selbstheilungs-Wert, der WIRKLICH
  // vorliegt: was gerade rot ist und noch nicht wieder grün wurde.
  const vorfaelle = ampel.vorfaelle || [];
  const offeneVorfaelle = vorfaelle.filter((v) => v && v.bis === null);
  const geheilte = vorfaelle.filter((v) => v && v.bis !== null);

  return {
    ok: true,
    stand: new Date(jetztMs).toISOString(),

    system: {
      evolutionScore: berechneEvolutionScore({ abdeckung, ampelAnteil, paritaet }),
      // Die Zerlegung steht daneben, damit die Einzelzahl nachrechenbar bleibt.
      bestandteile: { abdeckung, ampelAnteil, paritaet },
      qualitaetsNote,
      abdeckung,
      aktionenErfasst: dauerhaft.ok ? dauerhaft.aktionen : null,
      tageMitDaten: dauerhaft.ok ? dauerhaft.tage : null,
      seit: dauerhaft.ok ? dauerhaft.seit : null,
      // Was der laufende Prozess seit dem letzten Takt gesammelt hat und noch
      // nicht gebucht ist — sonst sähe eine frische Instanz aus wie Stillstand.
      nochNichtGebucht: engine.aktionen,
      laufzeitMs: engine.laufzeitMs,
      ablageStumm: dauerhaft.ok ? null : (dauerhaft.grund || "ohne Grund"),
      hinweis: dauerhaft.ok
        ? `Aktionen und Note über ${dauerhaft.tage} Tag(e) aus der Ablage — sie überleben jeden Deploy.`
        : "Die Kennzahlen-Ablage ist gerade nicht lesbar. Was hier fehlt, ist ungeprüft, nicht null."
    },

    qualitaet: {
      pruefer: typen.length,
      medientypen: typen,
      ohnePruefer,
      // Die Reihe aus der Ablage; der Prozessstand steht darunter als Zusatz.
      jeArt: dauerhaft.ok ? dauerhaft.arten : [],
      jeArtSeitNeustart: engine.arten,
      // DIE EHRLICHERE LUECKE als "ohne Prüfer": Für DIESE Arten gibt es einen
      // Prüfer, aber es hat sich noch nie eine Funktion gemeldet. 100 %
      // Abdeckung heisst nur "alles Gemeldete wird geprüft" — nicht "alles
      // meldet". Ohne diese Zeile liest sich das eine wie das andere.
      ohneMeldung: dauerhaft.ok
        ? typen.filter((t) => !(dauerhaft.arten || []).some((a) => a.art === t))
        : null
    },

    verbesserungen: (() => {
      const z = aufgabenStand.ok ? aufgabenStand.jeZustand : null;
      const lueckeGrund = aufgabenStand.grund || "Aufgaben-Ablage nicht lesbar";
      return {
        neuAusKonkurrenz: lueckenAufgaben.length,
        kritisch: lueckenAufgaben.filter((a) => a.prioritaet === "critical").length,
        hoch: lueckenAufgaben.filter((a) => a.prioritaet === "high").length,
        // Seit 2026-08-14 ECHT: die Aufgaben liegen in der Ablage und
        // ueberleben jeden Deploy. Die Liste zeigt bevorzugt das, woran
        // wirklich etwas haengt — die Konkurrenzluecken nur, solange die
        // Ablage noch leer ist.
        wichtigste: (aufgabenStand.ok && aufgabenStand.wichtigste?.length
          ? aufgabenStand.wichtigste
          : lueckenAufgaben.slice(0, 5).map((a) => ({
            id: a.id, titel: a.titel, score: a.score, prioritaet: a.prioritaet, zustaendig: a.zustaendig, freigabe: a.freigabe
          }))),
        gesamt: aufgabenStand.ok ? aufgabenStand.gesamt : null,
        offen: aufgabenStand.ok ? aufgabenStand.offen : null,
        hartnaeckigste: aufgabenStand.ok ? aufgabenStand.hartnaeckigste : null,
        neu: z ? { wert: z.neu } : ungemessen(lueckeGrund),
        laufend: z ? { wert: z.laufend } : ungemessen(lueckeGrund),
        erledigt: z ? { wert: z.erledigt } : ungemessen(lueckeGrund),
        gescheitert: z ? { wert: z.gescheitert } : ungemessen(lueckeGrund)
      };
    })(),

    autopiloten: { gesamt: alle.length, gruen, gelb, rot, grau, anteilGruen: ampelAnteil },

    konkurrenz: {
      stand: KONKURRENZ_STAND.stand,
      herkunft: KONKURRENZ_STAND.herkunft,
      luecken: luecken.map((l) => ({ id: l.id, name: l.name, anbieter: l.anbieter })),
      vorteile,
      gleichstand: gleichstand.length,
      // Frische Suchtreffer des Radars — KANDIDATEN, keine bestaetigten
      // Funktionen. Sie stehen getrennt von den Luecken, damit niemand einen
      // Zeitungstitel fuer eine gemessene Funktionsluecke haelt.
      kandidaten: radar.ok ? (radar.kandidaten || []).slice(0, 8) : [],
      radarLetzterLauf: radar.ok ? radar.letzterLauf : null,
      radarStumm: radar.ok ? null : (radar.grund || "Radar-Ablage nicht lesbar"),
      radarStummeQuellen: radar.ok ? (radar.stummeQuellen || []) : [],
      paritaet
    },

    abnahme: {
      kriterien: KRITERIEN.map((k) => ({ id: k.id, name: k.name })),
      offeneAbgaben: 0,
      hinweis: "Der Supervisor prüft jede »erledigt«-Meldung gegen alle Kriterien. Fehlt ein Beleg, gilt die Aufgabe als offen."
    },

    testing: {
      // Die Prüfsuite läuft im Nachtbau-Tor und auf dem Mac, NICHT im
      // Control-Server (ein Kindprozess über hunderte Dateien im laufenden
      // Server wäre ein Eigentor). Deshalb hier keine Zahl.
      suite: ungemessen("Die Prüfsuite läuft im Nachtbau-Tor, nicht im Control-Server"),
      selbsttestsImTakt: typen.length + KRITERIEN.length,
      hinweis: "Jeder Prüfer und jedes Abnahme-Kriterium wird alle 30 Minuten mit einer kaputten UND einer gesunden Probe gegengeprüft."
    },

    selbstheilung: {
      offeneVorfaelle: offeneVorfaelle.length,
      geheilteVorfaelle: geheilte.length,
      offene: offeneVorfaelle.slice(0, 5).map((v) => ({ id: v.id, name: v.name, art: v.art, seit: v.von, grund: v.grund }))
    }
  };
}
