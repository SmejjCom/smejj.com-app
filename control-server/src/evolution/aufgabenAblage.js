// smejj.com — die Ablage der Verbesserungs-Aufgaben.
//
// WARUM ES SIE GIBT (Befund 2026-08-14, am Live-Dashboard abgelesen): Die
// Evolution-Engine ERKANNTE Aufgaben — und niemand hob sie auf. Sie lebten in
// einer Map im Prozess; jeder Deploy loeschte sie. Im Dashboard standen
// "laufend", "erledigt" und "fehlgeschlagen" ehrlich als Luecke da. Damit war
// der Kreislauf an genau einer Stelle offen: Befunde entstanden und
// verschwanden wieder, ohne dass jemals einer bearbeitet wurde.
//
// DIE REGEL, DIE DIESE DATEI TRAEGT: EINE AUFGABE WIRD NIE ZWEIMAL ANGELEGT.
// Die Aufgaben-ID ist ein Hash aus Art, Fehlerklasse und Betroffenem — derselbe
// Befund erzeugt immer dieselbe ID. Kommt er wieder, wird NICHT eine zweite
// Aufgabe geschrieben, sondern ein Zaehler erhoeht. So misst `gesehen`, wie
// hartnaeckig ein Problem ist, statt das Backlog zu fluten.
//
// WAS SIE BEWUSST NICHT TUT: Sie schreibt nichts im heissen Pfad. erfasseAktion
// sitzt in jeder KI-Antwort; ein S3-Schreibvorgang dort wuerde jede Antwort
// verzoegern. Stattdessen sammelt die Engine im Speicher, und der
// Autopilot-Laeufer schreibt einmal je Durchgang gebuendelt weg
// (schreibeOffene). Ein Neustart dazwischen kostet hoechstens die Aufgaben
// eines Taktes — und die entstehen beim naechsten Befund ohnehin erneut.

import { createRecordStore } from "../admin/recordStore.js";

const store = createRecordStore("evolution/aufgaben", { maximal: 500 });

/** Der Lebenslauf einer Aufgabe. Mehr Zustaende braucht niemand. */
export const ZUSTAENDE = Object.freeze({
  NEU: "neu",             // erkannt, niemand arbeitet daran
  LAUFEND: "laufend",     // ein Autopilot hat sie angenommen
  ABGEGEBEN: "abgegeben", // fertig gemeldet — wartet auf den Supervisor
  ERLEDIGT: "erledigt",   // vom Supervisor abgenommen ODER durch Messung erloschen
  GESCHEITERT: "gescheitert" // dreimal abgelehnt, beim Betreiber
});

// Schreiben darf den Durchgang nicht aufhalten: IDrive antwortet normal in
// Millisekunden, aber ein haengender Aufruf wuerde sonst den Takt blockieren
// (dieselbe Lehre wie beim S3-Zeitlimit von 2,5 s in den Hintergrundwegen).
const SCHREIB_ZEITLIMIT_MS = 4_000;

/**
 * Legt neue Aufgaben an — oder erhoeht den Zaehler bekannter.
 *
 * @param {Array} aufgaben wie sie verbesserungenAus()/baueLueckenAufgaben() liefern
 * @returns {Promise<{neu: number, wiedergesehen: number, fehler: number}>}
 */
export async function merkeAufgaben(aufgaben = [], { env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  let neu = 0;
  let wiedergesehen = 0;
  let fehler = 0;
  const jetzt = new Date(jetztMs).toISOString();

  for (const aufgabe of aufgaben) {
    if (!aufgabe?.id) { fehler += 1; continue; }
    try {
      const bekannt = await store.lies(aufgabe.id, { env, fetchImpl });
      if (bekannt) {
        // NIE den Zustand ueberschreiben: eine Aufgabe, an der jemand
        // arbeitet, faellt sonst bei jedem Takt auf "neu" zurueck.
        await store.schreib({
          ...bekannt,
          gesehen: Number(bekannt.gesehen || 1) + 1,
          zuletztGesehen: jetzt,
          // Der Score kann sich aendern (ein Fund haeuft sich): den neuesten
          // uebernehmen, damit die Rangfolge aktuell bleibt.
          score: Number.isFinite(aufgabe.score) ? aufgabe.score : bekannt.score
        }, { env, fetchImpl, timeoutMs: SCHREIB_ZEITLIMIT_MS });
        wiedergesehen += 1;
        continue;
      }
      await store.schreib({
        ...aufgabe,
        status: ZUSTAENDE.NEU,
        gesehen: 1,
        createdAt: jetzt,
        zuletztGesehen: jetzt,
        verlauf: [{ am: jetzt, zustand: ZUSTAENDE.NEU, grund: "erkannt" }]
      }, { env, fetchImpl, timeoutMs: SCHREIB_ZEITLIMIT_MS });
      neu += 1;
    } catch {
      // Eine unerreichbare Ablage darf den Takt nicht anhalten. Der Zaehler
      // steht im Bericht — stumm verschluckt wird nichts.
      fehler += 1;
    }
  }
  return { neu, wiedergesehen, fehler };
}

/**
 * Setzt den Zustand einer Aufgabe. Jeder Wechsel kommt mit Grund in den
 * Verlauf — sonst laesst sich spaeter nicht mehr sagen, WARUM etwas als
 * erledigt gilt.
 */
export async function setzeZustand(id, zustand, { grund = "", beleg = null, env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  const bekannt = await store.lies(id, { env, fetchImpl });
  if (!bekannt) return { ok: false, grund: `Aufgabe ${id} nicht in der Ablage` };
  if (!Object.values(ZUSTAENDE).includes(zustand)) return { ok: false, grund: `unbekannter Zustand ${zustand}` };
  const jetzt = new Date(jetztMs).toISOString();
  const verlauf = [...(bekannt.verlauf || []), { am: jetzt, zustand, grund: String(grund).slice(0, 200), ...(beleg ? { beleg } : {}) }];
  const neu = { ...bekannt, status: zustand, zuletztGeaendert: jetzt, verlauf: verlauf.slice(-20) };
  await store.schreib(neu, { env, fetchImpl, timeoutMs: SCHREIB_ZEITLIMIT_MS });
  return { ok: true, aufgabe: neu };
}

/**
 * Alle Aufgaben, frisch gelesen.
 *
 * @returns {Promise<{ok: boolean, aufgaben: Array, grund?: string}>}
 */
export async function listeAufgaben({ env = process.env, fetchImpl = fetch, limit = 500 } = {}) {
  try {
    const ergebnis = await store.liste({ env, fetchImpl, limit });
    if (!ergebnis.ok) return { ok: false, aufgaben: [], grund: ergebnis.error || "Ablage nicht lesbar" };
    return { ok: true, aufgaben: ergebnis.datensaetze || [] };
  } catch (fehler) {
    return { ok: false, aufgaben: [], grund: String(fehler?.message || fehler).slice(0, 120) };
  }
}

/**
 * Die Zahlen fuers Dashboard. Fail-closed: ist die Ablage nicht lesbar, kommt
 * `ok:false` mit Grund — NIE Nullen, die wie "nichts zu tun" aussehen.
 */
export async function zaehleAufgaben({ env = process.env, fetchImpl = fetch } = {}) {
  const gelesen = await listeAufgaben({ env, fetchImpl });
  if (!gelesen.ok) return { ok: false, grund: gelesen.grund };
  const jeZustand = {};
  for (const z of Object.values(ZUSTAENDE)) jeZustand[z] = 0;
  let hartnaeckigste = null;
  for (const a of gelesen.aufgaben) {
    const z = String(a.status || ZUSTAENDE.NEU);
    jeZustand[z] = (jeZustand[z] || 0) + 1;
    if (z !== ZUSTAENDE.ERLEDIGT && (!hartnaeckigste || Number(a.gesehen || 1) > Number(hartnaeckigste.gesehen || 1))) {
      hartnaeckigste = a;
    }
  }
  return {
    ok: true,
    gesamt: gelesen.aufgaben.length,
    jeZustand,
    offen: gelesen.aufgaben.filter((a) => a.status !== ZUSTAENDE.ERLEDIGT && a.status !== ZUSTAENDE.GESCHEITERT).length,
    hartnaeckigste: hartnaeckigste
      ? { id: hartnaeckigste.id, titel: hartnaeckigste.titel, gesehen: Number(hartnaeckigste.gesehen || 1), seit: hartnaeckigste.createdAt }
      : null,
    wichtigste: gelesen.aufgaben
      .filter((a) => a.status === ZUSTAENDE.NEU || a.status === ZUSTAENDE.LAUFEND)
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, 5)
      .map((a) => ({
        id: a.id, titel: a.titel, score: a.score, prioritaet: a.prioritaet,
        zustaendig: a.zustaendig, freigabe: a.freigabe, status: a.status, gesehen: Number(a.gesehen || 1)
      }))
  };
}

/**
 * Aufgaben, die seit ihrer Erkennung NICHT wieder aufgetreten sind, schliessen.
 *
 * WARUM DAS KEINE ABNAHME IST: Der Supervisor nimmt Arbeit ab — er prueft
 * Belege fuer eine Aenderung. Hier ist niemand taetig geworden; der Fund ist
 * schlicht nicht mehr aufgetreten. Das ist eine BEOBACHTUNG, und sie wird auch
 * so beschriftet ("durch Messung erloschen") samt der Zahl der Messungen, die
 * seither ohne diesen Fund liefen. Wer das spaeter liest, sieht sofort, dass
 * hier niemand etwas repariert hat.
 *
 * @param {{klassenSeither: Set<string>, mindestMessungen: number}} lage
 */
export async function schliesseErloschene({ klassenSeither, messungenSeither = 0, mindestMessungen = 20, env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  if (!(klassenSeither instanceof Set)) return { geschlossen: 0, grund: "keine Messlage uebergeben" };
  if (messungenSeither < mindestMessungen) {
    return { geschlossen: 0, grund: `erst ${messungenSeither} von ${mindestMessungen} noetigen Messungen seit dem letzten Schnitt` };
  }
  const gelesen = await listeAufgaben({ env, fetchImpl });
  if (!gelesen.ok) return { geschlossen: 0, grund: gelesen.grund };

  let geschlossen = 0;
  for (const a of gelesen.aufgaben) {
    if (a.status !== ZUSTAENDE.NEU) continue;
    // Nur eigene Mess-Befunde koennen erloeschen. Eine fehlende Funktion
    // verschwindet nicht dadurch, dass niemand danach fragt.
    if (a.quelle !== "Quality-Engine") continue;
    const schluessel = `${a.art}|${a.klasse}`;
    if (klassenSeither.has(schluessel)) continue;
    await setzeZustand(a.id, ZUSTAENDE.ERLEDIGT, {
      grund: "durch Messung erloschen — nicht repariert, sondern seither nicht mehr aufgetreten",
      beleg: { messungenOhneDiesenFund: messungenSeither, geprueftAm: new Date(jetztMs).toISOString() },
      env, fetchImpl, jetztMs
    });
    geschlossen += 1;
  }
  return { geschlossen };
}

/** Nur fuer Tests. */
export function _leereAblageFuerTest() { store.__leeren(); }
