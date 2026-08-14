// smejj.com — Die drei Läufe der Evolution-Engine für den Autopilot-Läufer.
//
// Sie wohnen HIER und nicht in autopilotLaeufer.js: die Datei steht bei 735
// Zeilen, die Hausregel liegt bei 800. Dieselbe Trennung wie bei
// autopilotSelbsttests.js.
//
// JEDER LAUF BEGINNT MIT SEINEM SELBSTTEST. Erst wenn der Prüfer bewiesen hat,
// dass er bekannte Fehler noch erkennt, darf er über Echtdaten urteilen —
// sonst ist "nichts gefunden" nicht von "kaputt" zu unterscheiden. Das ist
// dieselbe Reihenfolge wie beim Antwort-TÜV (Nr. 36).

import { fuehreQualitaetSelbsttestAus, medientypen } from "./qualitaetsEngine.js";
import { fuehreEngineSelbsttestAus, evolutionUebersicht, AKTIONSARTEN } from "./aiEvolutionEngine.js";
import {
  fuehreDetectorSelbsttestAus, erkenneLuecken, baueLueckenAufgaben,
  pruefeBelege, SMEJJ_FAEHIGKEITEN, KONKURRENZ_STAND
} from "./missingFunctionDetector.js";
import { fuehreSupervisorSelbsttestAus, pruefeAbnahme, MAX_ABGABEN } from "./autopilotSupervisor.js";

/**
 * Nr. 37 — AI Evolution Engine.
 *
 * Meldet die ehrlichste Zahl, die das System über sich selbst hat: den
 * Abdeckungsgrad. Wie viel vom laufenden KI-Betrieb sieht überhaupt jemand an?
 */
export function laufEvolutionEngine({ uebersicht = evolutionUebersicht } = {}) {
  const qualitaet = fuehreQualitaetSelbsttestAus();
  if (!qualitaet.bestanden) {
    return { ok: false, meldung: `Quality-Engine erkennt bekannte Fehler nicht mehr: ${qualitaet.fehler.slice(0, 2).join("; ")}` };
  }
  const engine = fuehreEngineSelbsttestAus({});
  if (!engine.bestanden) {
    return { ok: false, meldung: `Evolution-Layer defekt: ${engine.fehler.slice(0, 2).join("; ")}` };
  }
  const u = uebersicht({});
  const typen = medientypen();
  // Welche Aktionsarten haben noch KEINEN Prüfer? Das ist die Ausbau-Liste —
  // und sie gehört in die Meldung, nicht in eine Schublade.
  const ohnePruefer = AKTIONSARTEN.filter((a) => !typen.includes(a));
  const basis = `Selbsttest ${qualitaet.geprueft}/${qualitaet.geprueft} Medientypen bestanden; ${typen.length} Prüfer angemeldet`;
  if (!u.aktionen) {
    return {
      ok: true,
      meldung: `${basis}; seit dem letzten Neustart wurde noch keine KI-Aktion gemeldet`
        + (ohnePruefer.length ? ` (ohne Prüfer: ${ohnePruefer.join(", ")})` : "")
    };
  }
  return {
    ok: true,
    meldung: `${basis}; ${u.aktionen} Aktionen erfasst, ${u.abdeckung} % davon gemessen, `
      + `Qualitätsnote ${u.qualitaetsNote}/100`
      + (ohnePruefer.length ? ` — ohne Prüfer: ${ohnePruefer.join(", ")}` : "")
  };
}

/**
 * Nr. 38 — Missing Function Detector.
 *
 * Der Lauf prüft ZWEI Dinge: Sind die eigenen Fähigkeiten noch belegt (steht
 * die Datei noch im Quelltext?), und was können die anderen, das smejj nicht
 * kann? Eine verschwundene Beleg-Datei ist der ernstere Fund — dann hat sich
 * eine Fähigkeit still verabschiedet.
 */
export function laufMissingFunctionDetector({ dateien = [] } = {}) {
  const selbsttest = fuehreDetectorSelbsttestAus();
  if (!selbsttest.bestanden) {
    return { ok: false, meldung: `Detector erkennt bekannte Lücken nicht mehr: ${selbsttest.fehler.slice(0, 2).join("; ")}` };
  }
  const belege = pruefeBelege(SMEJJ_FAEHIGKEITEN, dateien);
  const { luecken, vorteile, gleichstand } = erkenneLuecken({});
  const aufgaben = baueLueckenAufgaben(luecken);
  const oben = aufgaben[0];

  if (!belege.ungeprueft && belege.unbelegt.length) {
    // Fail-closed: Eine Fähigkeit, deren Code verschwunden ist, ist keine
    // Fähigkeit mehr — auch wenn die Startseite sie noch bewirbt.
    return {
      ok: false,
      meldung: `${belege.unbelegt.length} Fähigkeit(en) ohne Beleg im Quelltext: `
        + belege.unbelegt.map((f) => f.id).slice(0, 3).join(", ")
        + ` — Stand ${KONKURRENZ_STAND.stand}, ${luecken.length} Lücken gegenüber der Konkurrenz`
    };
  }
  return {
    ok: true,
    meldung: `Selbsttest bestanden; ${gleichstand.length} Funktionen auf Augenhöhe, ${vorteile.length} eigene Vorteile, `
      + `${luecken.length} Lücken (Stand ${KONKURRENZ_STAND.stand}, handgepflegt)`
      + (oben ? ` — wichtigste: "${oben.titel}" (Score ${oben.score}, ${oben.prioritaet})` : "")
      + (belege.ungeprueft ? "; Beleg-Prüfung übersprungen (kein Quelltext gescannt)" : "")
  };
}

/**
 * Nr. 39 — Autopilot-Supervisor.
 *
 * Zwei Aufgaben in einem Lauf:
 *
 *  1. Der Selbsttest. Er ist hier wichtiger als anderswo: Ein Supervisor, der
 *     alles durchwinkt, ist schlimmer als keiner — er erzeugt Vertrauen ohne
 *     Deckung. Der Selbsttest beweist BEIDE Richtungen (blind und blockierend).
 *  2. Die Abnahme offener Abgaben. Solange die Werkstatt noch keine Abgaben
 *     einreicht, sagt der Lauf genau das — statt "0 Fehler" zu melden, was wie
 *     Erfolg aussähe.
 *
 * Zusätzlich prüft er die AMPEL-MELDUNGEN selbst: eine grüne Ampel, deren
 * Meldung keine einzige Zahl enthält und nur aus einem Pauschalwort besteht,
 * ist wieder das Muster der 29 Attrappen von 2026-08-12. Der Fund macht die
 * Ampel nicht rot — er steht in der Meldung, damit ihn niemand übersieht.
 */
export function laufSupervisor({ abgaben = [], autopiloten = [], dateiExistiert = null } = {}) {
  const selbsttest = fuehreSupervisorSelbsttestAus();
  if (!selbsttest.bestanden) {
    return { ok: false, meldung: `Supervisor ist keine Kontrolle mehr: ${selbsttest.fehler.slice(0, 2).join("; ")}` };
  }

  const pauschale = findePauschalmeldungen(autopiloten);
  const anhang = pauschale.length
    ? ` — ACHTUNG: ${pauschale.length} grüne Ampel(n) melden Erfolg ohne eine einzige Zahl (${pauschale.slice(0, 2).join(", ")})`
    : "";

  if (!abgaben.length) {
    return {
      ok: true,
      meldung: `Selbsttest ${selbsttest.geprueft}/${selbsttest.geprueft} bestanden (blind UND blockierend geprüft); `
        + `keine Abgabe zur Abnahme offen${anhang}`
    };
  }

  const ergebnisse = abgaben.map((a) => pruefeAbnahme({ ...a, dateiExistiert }));
  const abgenommen = ergebnisse.filter((r) => r.abgenommen).length;
  const eskaliert = ergebnisse.filter((r) => r.eskaliert);
  return {
    // Eine abgelehnte Abgabe ist KEIN Ausfall des Supervisors — er hat genau
    // seine Arbeit getan. Rot wird er nur, wenn er eskalieren muss.
    ok: eskaliert.length === 0,
    meldung: `Selbsttest bestanden; ${abgenommen}/${ergebnisse.length} Abgaben abgenommen`
      + (eskaliert.length ? `, ${eskaliert.length} nach ${MAX_ABGABEN} Versuchen an den Betreiber eskaliert` : "")
      + (ergebnisse.length - abgenommen > 0 ? ` — erster Grund: ${ergebnisse.find((r) => !r.abgenommen)?.meldung?.slice(0, 90)}` : "")
      + anhang
  };
}

/**
 * Grüne Ampeln, deren Meldung nichts belegt. Eng gefasst mit Absicht: nur
 * Meldungen OHNE jede Zahl UND kürzer als 40 Zeichen. Alles Weitere wäre
 * Geschmacksfrage, und ein Wächter, der Geschmack meldet, wird ignoriert.
 */
export function findePauschalmeldungen(autopiloten = []) {
  return autopiloten
    .filter((a) => a?.ampel === "gruen")
    .filter((a) => {
      // Die Ampel legt die Meldung unter letzterLauf ab (opsAutopiloten.js).
      const m = String(a.letzterLauf?.meldung || "");
      return m.length > 0 && m.length < 40 && !/\d/.test(m);
    })
    .map((a) => String(a.id || a.name || "?"));
}
