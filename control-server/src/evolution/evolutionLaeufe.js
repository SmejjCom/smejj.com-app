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
import { fuehreEngineSelbsttestAus, evolutionUebersicht, entnimmZuwachs, AKTIONSARTEN } from "./aiEvolutionEngine.js";
import { merkeAufgaben, listeAufgaben, setzeZustand, schliesseErloschene, zaehleAufgaben, ZUSTAENDE } from "./aufgabenAblage.js";
import { merkeKennzahlen, holeKennzahlen } from "./kennzahlenAblage.js";
import { fuehreRadarAus, holeKandidaten, fuehreRadarSelbsttestAus, BEOBACHTET } from "./konkurrenzRadar.js";
import {
  fuehreDetectorSelbsttestAus, erkenneLuecken, baueLueckenAufgaben,
  pruefeBelege, SMEJJ_FAEHIGKEITEN, KONKURRENZ_STAND
} from "./missingFunctionDetector.js";
import { fuehreSupervisorSelbsttestAus, pruefeAbnahme, MAX_ABGABEN } from "./autopilotSupervisor.js";

/**
 * Schreibt den gesammelten Zuwachs weg — Kennzahlen UND Aufgaben.
 *
 * DIESE FUNKTION IST DER GRUND, WARUM DER KREISLAUF GESCHLOSSEN IST. Bis zum
 * 2026-08-14 erkannte die Engine Aufgaben und vergass sie beim naechsten
 * Deploy; der Aktionszaehler begann bei jedem Push wieder bei null. Genau
 * einmal je Durchgang wandert beides in die Ablage.
 *
 * Sie wird vom Autopilot-Laeufer aufgerufen, NICHT aus erfasseAktion: der
 * heisse Pfad jeder KI-Antwort bleibt frei von Netzaufrufen.
 */
export async function schreibeEvolutionAblage({
  zuwachsLader = entnimmZuwachs, kennzahlen = merkeKennzahlen,
  aufgaben = merkeAufgaben, erloschene = schliesseErloschene,
  env = process.env, jetztMs = Date.now()
} = {}) {
  const zuwachs = zuwachsLader();
  const teile = [];

  const k = await kennzahlen({ jeArt: zuwachs.jeArt }, { env, jetztMs });
  if (k.ok && k.geschrieben) teile.push(`${zuwachs.messungen} Messungen auf ${k.tag} gebucht`);
  else if (!k.ok) teile.push(`Kennzahlen NICHT geschrieben (${k.grund})`);

  if (zuwachs.aufgaben.length) {
    const a = await aufgaben(zuwachs.aufgaben, { env, jetztMs });
    teile.push(`${a.neu} neue Aufgabe(n), ${a.wiedergesehen} wiedergesehen${a.fehler ? `, ${a.fehler} nicht geschrieben` : ""}`);
  }

  // Erloschene schliessen: nur mit genug frischen Messungen, sonst waere
  // "nicht wieder aufgetreten" bloss "es wurde kaum gemessen".
  const e = await erloschene({ klassenSeither: zuwachs.klassen, messungenSeither: zuwachs.messungen, env, jetztMs });
  if (e.geschlossen) teile.push(`${e.geschlossen} Aufgabe(n) durch Messung erloschen`);

  // IMMER mit Zahlen melden, auch wenn nichts zu buchen war. Der erste Entwurf
  // sagte "nichts Neues zu buchen" — und der Supervisor hat diese Ampel prompt
  // als Erfolgsmeldung ohne einen einzigen Beleg angezeigt (gemessen
  // 2026-08-14, beim allerersten Durchgang). Er hatte recht.
  return {
    ok: k.ok !== false,
    meldung: teile.join("; ")
      || `nichts zu buchen: 0 Messungen und 0 Aufgaben seit dem letzten Takt (${zuwachs.klassen.size} Fehlerklassen gesehen)`
  };
}

/**
 * Nr. 37 — AI Evolution Engine.
 *
 * Meldet die ehrlichste Zahl, die das System über sich selbst hat: den
 * Abdeckungsgrad. Wie viel vom laufenden KI-Betrieb sieht überhaupt jemand an?
 */
export async function laufEvolutionEngine({ uebersicht = evolutionUebersicht, dauerhaft = holeKennzahlen, ablage = zaehleAufgaben, env = process.env } = {}) {
  const qualitaet = fuehreQualitaetSelbsttestAus();
  if (!qualitaet.bestanden) {
    return { ok: false, meldung: `Quality-Engine erkennt bekannte Fehler nicht mehr: ${qualitaet.fehler.slice(0, 2).join("; ")}` };
  }
  const engine = fuehreEngineSelbsttestAus({});
  if (!engine.bestanden) {
    return { ok: false, meldung: `Evolution-Layer defekt: ${engine.fehler.slice(0, 2).join("; ")}` };
  }
  const typen = medientypen();
  // Welche Aktionsarten haben noch KEINEN Prüfer? Das ist die Ausbau-Liste —
  // und sie gehört in die Meldung, nicht in eine Schublade.
  const ohnePruefer = AKTIONSARTEN.filter((a) => !typen.includes(a));
  const basis = `Selbsttest ${qualitaet.geprueft}/${qualitaet.geprueft} Medientypen bestanden; ${typen.length} Prüfer angemeldet`;

  // Seit 2026-08-14 zählt der DAUERHAFTE Stand, nicht der des laufenden
  // Prozesses: sonst meldete diese Ampel nach jedem Deploy "noch nichts
  // gemessen", obwohl den ganzen Tag gemessen wurde.
  const k = await dauerhaft({ tage: 30, env }).catch((f) => ({ ok: false, grund: String(f?.message || f).slice(0, 80) }));
  const a = await ablage({ env }).catch((f) => ({ ok: false, grund: String(f?.message || f).slice(0, 80) }));
  const anhang = ohnePruefer.length ? ` — ohne Prüfer: ${ohnePruefer.join(", ")}` : "";

  if (!k.ok) {
    // Ablage stumm = ehrlich rot. Ein Prüfer, dessen Gedächtnis fehlt, misst
    // zwar noch, aber niemand kann es nachlesen.
    return { ok: false, meldung: `${basis}; Kennzahlen-Ablage NICHT lesbar: ${k.grund || "ohne Grund"}${anhang}` };
  }
  if (!k.aktionen) {
    const roh = uebersicht({});
    return {
      ok: true,
      meldung: `${basis}; noch keine KI-Aktion in der Ablage`
        + (roh.aktionen ? ` (${roh.aktionen} im laufenden Prozess, wird im nächsten Takt gebucht)` : "")
        + anhang
    };
  }
  return {
    ok: true,
    meldung: `${basis}; ${k.aktionen} Aktionen an ${k.tage} Tag(en), ${k.abdeckung} % gemessen, `
      + `Note ${k.qualitaetsNote}/100`
      + (a.ok ? `; Aufgaben: ${a.offen} offen von ${a.gesamt}` : `; Aufgaben-Ablage nicht lesbar (${a.grund || "ohne Grund"})`)
      + anhang
  };
}

// Zwischen zwei Radar-Läufen liegt eine Woche: Anbieter kündigen nicht
// stündlich an, und jede Anfrage kostet Suchkontingent. 6,5 Tage statt 7,
// damit ein Lauf nicht Woche für Woche später wandert.
const RADAR_ABSTAND_MS = 6.5 * 24 * 60 * 60 * 1000;

/**
 * Nr. 04 — Konkurrenz-Radar, seit 2026-08-14 mit ECHTEM Quellenscan.
 *
 * Vorher war dieser Autopilot ein Lebenszeichen aus dem Dienst
 * smejj-autopilot-jobs ("echter Quellenscan noch nicht angebunden") — grün,
 * ohne je gesucht zu haben. Jetzt sucht er wirklich und legt KANDIDATEN mit
 * Quelle ab: Suchtreffer, keine bestätigten Funktionen. Die Deutung
 * ("das ist eine Funktion, die uns fehlt") trifft der Betreiber.
 */
export async function laufKonkurrenzRadar({
  mitNetz = true, suche = null, radar = fuehreRadarAus, bestand = holeKandidaten,
  env = process.env, jetztMs = Date.now()
} = {}) {
  const selbsttest = fuehreRadarSelbsttestAus({ jetztMs });
  if (!selbsttest.bestanden) {
    return { ok: false, meldung: `Radar-Filter erkennt bekannte Fälle nicht mehr: ${selbsttest.fehler.slice(0, 2).join("; ")}` };
  }

  const gelesen = await bestand({ env });
  if (!gelesen.ok) return { ok: false, meldung: `Selbsttest ${selbsttest.geprueft}/${selbsttest.geprueft}, aber die Radar-Ablage ist nicht lesbar: ${gelesen.grund}` };

  const letzteMs = gelesen.letzterLauf ? Date.parse(gelesen.letzterLauf) : NaN;
  const frisch = Number.isFinite(letzteMs) && jetztMs - letzteMs < RADAR_ABSTAND_MS;
  if (frisch) {
    const tage = Math.round((jetztMs - letzteMs) / 86_400_000);
    return {
      ok: true,
      meldung: `Selbsttest ${selbsttest.geprueft}/${selbsttest.geprueft}; letzter Scan vor ${tage} Tag(en): `
        + `${gelesen.kandidaten.length} Kandidat(en) aus ${gelesen.laeufe} Lauf/Läufen`
        + (gelesen.stummeQuellen.length ? `, ${gelesen.stummeQuellen.length} Quelle(n) waren stumm` : "")
    };
  }
  if (!mitNetz || typeof suche !== "function") {
    return { ok: true, meldung: `Selbsttest bestanden; Scan fällig, läuft im nächsten Netz-Takt (${gelesen.kandidaten.length} Kandidaten im Bestand)` };
  }

  const lauf = await radar({ suche, jetztMs, env });
  if (!lauf.ok) {
    return { ok: false, meldung: `Scan gescheitert: ALLE ${lauf.stummeQuellen?.length || 0} Quellen stumm — ${lauf.stummeQuellen?.[0]?.grund || "ohne Grund"}` };
  }
  return {
    ok: true,
    meldung: `${lauf.kandidaten.length} Kandidat(en) bei ${BEOBACHTET.length - (lauf.stummeQuellen.length)} von ${BEOBACHTET.length} Anbietern gefunden`
      + (lauf.stummeQuellen.length ? `; stumm: ${lauf.stummeQuellen.map((s) => s.anbieter).join(", ")}` : "")
      + (lauf.abgelegt ? "" : `; NICHT abgelegt (${lauf.ablageGrund})`)
      + " — Kandidaten sind Suchtreffer mit Quelle, keine bestätigten Funktionen"
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
export async function laufSupervisor({ abgaben = null, autopiloten = [], dateiExistiert = null, warteschlange = listeAufgaben, zustandSetzer = setzeZustand, env = process.env } = {}) {
  const selbsttest = fuehreSupervisorSelbsttestAus();
  if (!selbsttest.bestanden) {
    return { ok: false, meldung: `Supervisor ist keine Kontrolle mehr: ${selbsttest.fehler.slice(0, 2).join("; ")}` };
  }

  const pauschale = findePauschalmeldungen(autopiloten);
  const anhang = pauschale.length
    ? ` — ACHTUNG: ${pauschale.length} grüne Ampel(n) melden Erfolg ohne eine einzige Zahl (${pauschale.slice(0, 2).join(", ")})`
    : "";

  // Die Warteschlange kommt seit 2026-08-14 aus der ABLAGE: jede Aufgabe im
  // Zustand "abgegeben" traegt ihre Behauptung und ihre Belege bei sich. Ohne
  // Ablage gab es hier nie etwas zu pruefen — der Supervisor war eine
  // Kontrolle ohne Gegenstand.
  let zuPruefen = abgaben;
  let ablageStumm = null;
  if (zuPruefen === null) {
    const gelesen = await warteschlange({ env });
    if (!gelesen.ok) ablageStumm = gelesen.grund || "ohne Grund";
    zuPruefen = (gelesen.aufgaben || [])
      .filter((a) => a.status === ZUSTAENDE.ABGEGEBEN)
      .map((a) => ({ aufgabe: a, behauptung: a.behauptung, belege: a.belege, abgabeNr: Number(a.abgabeNr || 1) }));
  }

  if (ablageStumm) {
    // Fail-closed: eine stumme Warteschlange ist NICHT dasselbe wie eine leere.
    return { ok: false, meldung: `Selbsttest bestanden, aber die Aufgaben-Ablage ist nicht lesbar: ${ablageStumm}${anhang}` };
  }

  if (!zuPruefen.length) {
    return {
      ok: true,
      meldung: `Selbsttest ${selbsttest.geprueft}/${selbsttest.geprueft} bestanden (blind UND blockierend geprüft); `
        + `keine Abgabe zur Abnahme offen${anhang}`
    };
  }

  const ergebnisse = [];
  for (const a of zuPruefen) {
    const urteil = pruefeAbnahme({ ...a, dateiExistiert });
    ergebnisse.push(urteil);
    // Das Urteil wird ZURUECKGESCHRIEBEN — ein Supervisor, dessen Entscheidung
    // niemand festhaelt, hat nichts entschieden.
    if (a.aufgabe?.id) {
      const zustand = urteil.abgenommen ? ZUSTAENDE.ERLEDIGT : (urteil.eskaliert ? ZUSTAENDE.GESCHEITERT : ZUSTAENDE.LAUFEND);
      await zustandSetzer(a.aufgabe.id, zustand, {
        grund: urteil.meldung,
        beleg: { kriterien: urteil.kriterien, abgabeNr: urteil.abgabeNr },
        env
      }).catch(() => {});
    }
  }
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
