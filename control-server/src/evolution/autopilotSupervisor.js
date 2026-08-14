// smejj.com — Autopilot-Supervisor: die unabhängige Abnahme.
//
// WARUM ES DIESE DATEI GIBT: Am 2026-08-12 stellte sich heraus, dass 29
// Autopiloten "grün" meldeten, ohne je gelaufen zu sein — sie stempelten sich
// selbst. Die Ampel wurde daraufhin auf gemessene Herzschläge umgestellt. Die
// zweite Hälfte des Problems blieb aber offen: Ein Autopilot, der eine AUFGABE
// bekommt, kann weiterhin "erledigt" sagen. Niemand sieht nach.
//
// Dieser Supervisor sieht nach. Er ist bewusst KEIN Autopilot, der auch Arbeit
// macht — er tut nichts anderes als prüfen, und er prüft nichts von dem, was er
// selbst gebaut hat.
//
// DIE EINE REGEL: EINE BEHAUPTUNG IST KEIN BEWEIS. Jedes Kriterium fällt durch,
// solange der Beleg fehlt. Nicht "unklar, also durchwinken", sondern "kein
// Beleg, also nicht abgenommen". Ein Prüfer, der im Zweifel zustimmt, ist
// dasselbe wie kein Prüfer — nur teurer.
//
// Die Belege sind bewusst DATEN, keine Prosa: Dateilisten, Testzähler,
// HTTP-Antworten. Ein Freitext "habe alles getestet" erfüllt kein Kriterium.

/** Wie oft darf ein Autopilot dieselbe Aufgabe erfolglos abgeben, bevor ein
 *  Mensch gerufen wird? Drei — dieselbe Bremse wie bei der Selbstheilung. */
export const MAX_ABGABEN = 3;

const FEHLT = "kein Beleg vorgelegt — eine Behauptung ist kein Beweis";

const TEST_DATEI = /\.test\.(js|mjs)$/;

/**
 * Die Abnahme-Kriterien. Reihenfolge = Prüfreihenfolge; jedes liefert
 * {erfuellt, grund}. `pflicht: false` heisst: gilt nur unter Bedingung
 * (z.B. Leistung erst ab Risiko "hoch") — nie "darf man weglassen".
 */
export const KRITERIEN = Object.freeze([
  {
    id: "bezug",
    name: "Bezieht sich die Abgabe auf DIESE Aufgabe?",
    pruefe: ({ aufgabe, behauptung }) => {
      if (!behauptung) return { erfuellt: false, grund: "keine Abgabe vorgelegt" };
      if (!behauptung.aufgabeId) return { erfuellt: false, grund: "Abgabe nennt keine Aufgaben-ID" };
      if (String(behauptung.aufgabeId) !== String(aufgabe?.id)) {
        return { erfuellt: false, grund: `Abgabe gehört zu ${behauptung.aufgabeId}, geprüft wird ${aufgabe?.id}` };
      }
      return { erfuellt: true, grund: `Abgabe zu ${behauptung.aufgabeId}` };
    }
  },
  {
    id: "aenderung-belegt",
    name: "Wurde wirklich etwas geändert?",
    pruefe: ({ belege, dateiExistiert }) => {
      const dateien = belege?.dateien || [];
      if (!dateien.length) return { erfuellt: false, grund: FEHLT + " (keine geänderte Datei genannt)" };
      const fehlend = dateien.filter((d) => dateiExistiert && !dateiExistiert(d));
      if (fehlend.length) return { erfuellt: false, grund: `genannte Datei(en) gibt es nicht: ${fehlend.slice(0, 3).join(", ")}` };
      return { erfuellt: true, grund: `${dateien.length} Datei(en) geändert` };
    }
  },
  {
    id: "richtige-stelle",
    name: "Wurde die RICHTIGE Funktion geändert?",
    pruefe: ({ aufgabe, belege }) => {
      const ziel = String(aufgabe?.betrifft || "").trim();
      if (!ziel) return { erfuellt: false, grund: "die Aufgabe sagt selbst nicht, was sie betrifft — nicht abnehmbar" };
      const heuhaufen = [...(belege?.dateien || []), ...(belege?.symbole || [])].join(" ").toLowerCase();
      // Der Bezug muss SICHTBAR sein: entweder im Pfad oder in einem genannten
      // Symbol. Sonst ist "ich habe das Richtige geändert" wieder nur ein Satz.
      if (!heuhaufen.includes(ziel.toLowerCase())) {
        return { erfuellt: false, grund: `weder Pfad noch Symbol enthält "${ziel}" — vermutlich an der falschen Stelle gearbeitet` };
      }
      return { erfuellt: true, grund: `"${ziel}" kommt in den geänderten Stellen vor` };
    }
  },
  {
    id: "tests-vorhanden",
    name: "Gibt es Tests zur Änderung?",
    pruefe: ({ belege }) => {
      const kandidaten = [...(belege?.dateien || []), ...(belege?.tests?.dateien || [])];
      const tests = kandidaten.filter((d) => TEST_DATEI.test(String(d)));
      if (!tests.length) return { erfuellt: false, grund: "keine Testdatei unter den Änderungen" };
      return { erfuellt: true, grund: `${tests.length} Testdatei(en): ${tests.slice(0, 2).join(", ")}` };
    }
  },
  {
    id: "tests-gruen",
    name: "Laufen die Tests durch?",
    pruefe: ({ belege }) => {
      const t = belege?.tests;
      if (!t || !Number.isFinite(Number(t.gelaufen))) return { erfuellt: false, grund: FEHLT + " (kein Testlauf)" };
      if (Number(t.gelaufen) === 0) return { erfuellt: false, grund: "0 Tests gelaufen — eine leere Suite beweist nichts" };
      if (Number(t.gescheitert) > 0) return { erfuellt: false, grund: `${t.gescheitert} von ${t.gelaufen} Tests rot` };
      return { erfuellt: true, grund: `${t.gelaufen} Tests, 0 rot` };
    }
  },
  {
    id: "keine-regression",
    name: "Ist nichts anderes kaputtgegangen?",
    pruefe: ({ belege }) => {
      const r = belege?.regression;
      if (!r?.geprueft) return { erfuellt: false, grund: FEHLT + " (Regressionslauf fehlt)" };
      if (Number(r.neueFehler) > 0) return { erfuellt: false, grund: `${r.neueFehler} neue Fehler ausserhalb der Änderung` };
      return { erfuellt: true, grund: "Regressionslauf ohne neue Fehler" };
    }
  },
  {
    id: "leistung",
    name: "Ist es nicht langsamer geworden?",
    pflicht: false,
    pruefe: ({ aufgabe, belege }) => {
      const p = belege?.performance;
      const nurBeiHochrisiko = String(aufgabe?.risiko || "") !== "hoch";
      if (!p) {
        return nurBeiHochrisiko
          ? { erfuellt: true, grund: "nicht gemessen — bei diesem Risiko nicht verlangt", entfaellt: true }
          : { erfuellt: false, grund: FEHLT + " (bei hohem Risiko ist die Messung Pflicht)" };
      }
      if (Number.isFinite(Number(p.grenzeMs)) && Number(p.dauerMs) > Number(p.grenzeMs)) {
        return { erfuellt: false, grund: `${p.dauerMs} ms über der Grenze von ${p.grenzeMs} ms` };
      }
      return { erfuellt: true, grund: `${p.dauerMs} ms innerhalb der Grenze` };
    }
  },
  {
    id: "live",
    name: "Ist die Funktion wirklich live?",
    pruefe: ({ aufgabe, belege }) => {
      if (aufgabe?.nurLokal) return { erfuellt: true, grund: "Aufgabe betrifft nichts Ausgeliefertes", entfaellt: true };
      const l = belege?.live;
      if (!l?.geprueft) return { erfuellt: false, grund: FEHLT + " (kein Live-Nachweis)" };
      if (!l.erreichbar) return { erfuellt: false, grund: `live nicht erreichbar${l.grund ? `: ${l.grund}` : ""}` };
      return { erfuellt: true, grund: `live bestätigt${l.version ? ` (${l.version})` : ""}` };
    }
  },
  {
    id: "vollstaendig",
    name: "Wurde die ganze Aufgabe erfüllt?",
    pruefe: ({ aufgabe, behauptung }) => {
      const ziele = aufgabe?.teilziele || [];
      if (!ziele.length) return { erfuellt: true, grund: "keine Teilziele gesetzt", entfaellt: true };
      const erledigt = new Set((behauptung?.erledigt || []).map(String));
      const offen = ziele.filter((z) => !erledigt.has(String(z)));
      if (offen.length) return { erfuellt: false, grund: `${offen.length} Teilziel(e) offen: ${offen.slice(0, 3).join(", ")}` };
      return { erfuellt: true, grund: `alle ${ziele.length} Teilziele belegt` };
    }
  }
]);

/**
 * Die Abnahme. Fail-closed: fehlt ein Beleg, ist die Aufgabe NICHT erledigt.
 *
 * @param {object} eingabe
 * @param {object} eingabe.aufgabe Die ursprüngliche Aufgabe (id, betrifft, risiko, teilziele)
 * @param {object} eingabe.behauptung Was der Autopilot meldet ({aufgabeId, autopilot, erledigt})
 * @param {object} eingabe.belege Harte Belege ({dateien, symbole, tests, regression, performance, live})
 * @param {(pfad:string)=>boolean} [eingabe.dateiExistiert] Prüft, ob eine genannte Datei da ist
 * @param {number} [eingabe.abgabeNr] Die wievielte Abgabe zu dieser Aufgabe?
 */
export function pruefeAbnahme({ aufgabe, behauptung, belege = {}, dateiExistiert = null, abgabeNr = 1 } = {}) {
  const ergebnisse = KRITERIEN.map((k) => {
    let r;
    try {
      r = k.pruefe({ aufgabe, behauptung, belege, dateiExistiert });
    } catch (fehler) {
      // Ein gefallenes Kriterium ist ein NICHT erfülltes Kriterium — nie ein
      // stillschweigend übersprungenes.
      r = { erfuellt: false, grund: `Prüfung gefallen: ${String(fehler?.message || fehler).slice(0, 80)}` };
    }
    return { id: k.id, name: k.name, erfuellt: Boolean(r.erfuellt), entfaellt: Boolean(r.entfaellt), grund: r.grund };
  });

  const durchgefallen = ergebnisse.filter((r) => !r.erfuellt);
  const abgenommen = durchgefallen.length === 0;
  const eskaliert = !abgenommen && abgabeNr >= MAX_ABGABEN;

  return {
    aufgabeId: aufgabe?.id || null,
    autopilot: behauptung?.autopilot || null,
    abgenommen,
    erfuellt: ergebnisse.filter((r) => r.erfuellt).length,
    gesamt: ergebnisse.length,
    kriterien: ergebnisse,
    durchgefallen: durchgefallen.map((r) => r.id),
    abgabeNr,
    eskaliert,
    // Wohin die Aufgabe als Nächstes geht — der Supervisor entscheidet nicht,
    // WIE repariert wird, nur WER dran ist.
    zurueckAn: abgenommen ? null : (eskaliert ? "betreiber" : (behauptung?.autopilot || aufgabe?.zustaendig || "werkstatt-autopilot")),
    meldung: abgenommen
      ? `Abgenommen: ${ergebnisse.length}/${ergebnisse.length} Kriterien belegt.`
      : eskaliert
        ? `NICHT abgenommen (${durchgefallen.length} offen) und ${abgabeNr}. Versuch — geht an den Betreiber: ${durchgefallen.map((r) => r.grund).slice(0, 2).join("; ")}`
        : `NICHT abgenommen: ${durchgefallen.map((r) => `${r.id} (${r.grund})`).slice(0, 3).join("; ")}`
  };
}

/**
 * Selbsttest — der wichtigste in diesem Ordner. Er beweist beides:
 * eine LEERE Erfolgsmeldung fällt durch, eine VOLLSTÄNDIG belegte geht durch.
 * Fällt dieser Test, ist der Supervisor eine Attrappe — und dann ist die
 * ganze Kette dahinter wertlos.
 */
export function fuehreSupervisorSelbsttestAus() {
  const fehler = [];
  const aufgabe = {
    id: "ev-test01", betrifft: "qualitaetsEngine", risiko: "niedrig",
    zustaendig: "werkstatt-autopilot", teilziele: ["prüfer gebaut", "test geschrieben"]
  };

  // 1. Die reine Behauptung: "ist erledigt", ohne einen einzigen Beleg.
  const nurBehauptung = pruefeAbnahme({
    aufgabe,
    behauptung: { aufgabeId: "ev-test01", autopilot: "werkstatt-autopilot", erledigt: ["prüfer gebaut", "test geschrieben"] },
    belege: {}
  });
  if (nurBehauptung.abgenommen) fehler.push("blosse Behauptung ohne Belege wurde ABGENOMMEN — der Supervisor ist blind");

  // 2. Der vollständig belegte Fall muss durchgehen.
  const belegt = pruefeAbnahme({
    aufgabe,
    behauptung: { aufgabeId: "ev-test01", autopilot: "werkstatt-autopilot", erledigt: ["prüfer gebaut", "test geschrieben"] },
    belege: {
      dateien: ["control-server/src/evolution/qualitaetsEngine.js", "control-server/src/evolution/evolution.test.js"],
      tests: { gelaufen: 12, gescheitert: 0 },
      regression: { geprueft: true, neueFehler: 0 },
      live: { geprueft: true, erreichbar: true, version: "v1" }
    },
    dateiExistiert: () => true
  });
  if (!belegt.abgenommen) {
    fehler.push(`vollständig belegte Abgabe wurde ABGELEHNT (${belegt.durchgefallen.join(", ")}) — der Supervisor blockiert alles`);
  }

  // 3. Falsche Stelle: Tests grün, aber am Thema vorbei gearbeitet.
  const falscheStelle = pruefeAbnahme({
    aufgabe,
    behauptung: { aufgabeId: "ev-test01", autopilot: "werkstatt-autopilot", erledigt: ["prüfer gebaut", "test geschrieben"] },
    belege: {
      dateien: ["control-server/src/admin/opsEmail.js", "control-server/src/admin/opsEmail.test.js"],
      tests: { gelaufen: 5, gescheitert: 0 },
      regression: { geprueft: true, neueFehler: 0 },
      live: { geprueft: true, erreichbar: true }
    },
    dateiExistiert: () => true
  });
  if (falscheStelle.abgenommen) fehler.push("Änderung an der falschen Stelle wurde abgenommen");

  // 4. Rote Tests dürfen nie durchgehen.
  const roteTests = pruefeAbnahme({
    aufgabe,
    behauptung: { aufgabeId: "ev-test01", autopilot: "werkstatt-autopilot", erledigt: ["prüfer gebaut", "test geschrieben"] },
    belege: {
      dateien: ["control-server/src/evolution/qualitaetsEngine.js", "control-server/src/evolution/evolution.test.js"],
      tests: { gelaufen: 12, gescheitert: 1 },
      regression: { geprueft: true, neueFehler: 0 },
      live: { geprueft: true, erreichbar: true }
    },
    dateiExistiert: () => true
  });
  if (roteTests.abgenommen) fehler.push("Abgabe mit rotem Test wurde abgenommen");

  // 5. Eskalation nach drei Versuchen.
  const dritterVersuch = pruefeAbnahme({ aufgabe, behauptung: { aufgabeId: "ev-test01" }, belege: {}, abgabeNr: 3 });
  if (dritterVersuch.zurueckAn !== "betreiber") fehler.push("nach drei erfolglosen Abgaben wurde nicht eskaliert");

  return { bestanden: fehler.length === 0, fehler, geprueft: 5 };
}
