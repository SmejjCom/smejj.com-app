// smejj ai radar — die zweite Schiene (Betreiber-Auftrag 21.09.2026).
//
// Die erste Schiene (Lernpaare + Training) bleibt unberuehrt. Diese hier
// RECHERCHIERT und erweitert eine EXTERNE Wissensbasis. Sie aendert keine
// Modellgewichte und reicht nichts ungeprueft an die Trainingsschiene weiter.
//
// Ablauf eines Laufs, in dieser Reihenfolge und mit Abbruch an jeder Stelle:
//   0. Darf ich?      Notaus, Budget, laeuft schon einer? (radarBudget.js)
//   1. Was ist faellig? Themen nach Intervall und Prioritaet (radarThemen.js)
//   2. Suchen          ueber die eigene Websuche, je Thema eine Anfrage
//   3. Fremdtext pruefen  Anweisungen im Text = verwerfen (injektionsschutz.js)
//   4. Quelle bewerten Primaerquelle/Presse/Forum, Datum, Geruecht/Werbung
//   5. Vergleichen     neu, Duplikat, Aenderung oder Widerspruch (wissensbasis.js)
//   6. Speichern       nur Geprueftes und Einzelquellen-Markiertes
//   7. Protokoll       WAS gefunden, geprueft, gespeichert, verworfen wurde
//
// Alles Aeussere ist einreichbar (suche, ablagen, jetzt) — damit die Kette in
// Tests ohne Netz und ohne Ablage vollstaendig durchlaufen kann.
import { createRecordStore, neueKennung } from "../admin/recordStore.js";
import { searchWebDetailed } from "../../../src/search/webSearch.js";
import { faelligeThemen, naechsteFaelligkeit, themenListe } from "../../../src/radar/radarThemen.js";
import { anfragenFuerLauf, darfLaufen, grenzenAus } from "../../../src/radar/radarBudget.js";
import { pruefeFremdtext, entschaerfe } from "../../../src/radar/injektionsschutz.js";
import { bewerteFund, nachGuete } from "../../../src/radar/quellenGuete.js";
import { PRUEFSTATUS, VERGLEICH, baueEintrag, fuerAbruf, neueFassung, vergleiche } from "../../../src/radar/wissensbasis.js";

export const WISSEN_ABLAGE = "radar/wissen";
export const LAUF_ABLAGE = "radar/laeufe";
export const KONFIG_ABLAGE = "radar/konfiguration";

const wissenStore = createRecordStore(WISSEN_ABLAGE, { maximal: 2000 });
const laufStore = createRecordStore(LAUF_ABLAGE, { maximal: 500 });
const konfigStore = createRecordStore(KONFIG_ABLAGE, { maximal: 5 });

/** Ein Lauf zur Zeit — im Prozess. Zwei Laeufe wuerden dasselbe Thema doppelt suchen. */
let laeuftGerade = false;
export function laeuftRadar() { return laeuftGerade; }

/** Die gespeicherte Konfiguration (Themen, Intervalle, Schalter). Fehlt sie: Standard. */
export async function leseKonfig({ env = process.env, store = konfigStore } = {}) {
  try {
    const liste = await store.liste({ env });
    if (!liste?.ok) return null;
    return (liste.datensaetze || []).find((d) => d?.id === "radar-konfig") || null;
  } catch {
    return null;
  }
}

export async function schreibeKonfig(konfig, { env = process.env, store = konfigStore, jetzt = new Date().toISOString() } = {}) {
  const satz = { ...konfig, id: "radar-konfig", aktualisiertAm: jetzt };
  await store.schreib(satz, { env, timeoutMs: 8000 });
  return satz;
}

async function listeOderNull(store, env) {
  try {
    const liste = await store.liste({ env });
    return liste?.ok ? (liste.datensaetze || []) : null;
  } catch {
    return null;
  }
}

/**
 * EIN Recherchelauf.
 * @param {{env?, jetzt?, suche?, stores?, maxThemen?, grund?}} eingabe
 * @returns {Promise<object>} das Laufprotokoll (auch bei Abbruch)
 */
export async function fuehreRadarLaufAus({
  env = process.env,
  jetzt = new Date().toISOString(),
  suche = searchWebDetailed,
  stores = { wissen: wissenStore, laeufe: laufStore, konfig: konfigStore },
  maxThemen = 3,
  grund = "takt"
} = {}) {
  const begonnenAm = jetzt;
  const konfig = await leseKonfig({ env, store: stores.konfig });
  const grenzen = grenzenAus(env, konfig);
  const laeufe = await listeOderNull(stores.laeufe, env);
  const erlaubnis = darfLaufen({ grenzen, laeufe, jetzt, env, konfig, laeuftSchon: laeuftGerade });

  if (!erlaubnis.erlaubt) {
    return protokoll({ begonnenAm, ok: false, grund: erlaubnis.grund, rest: erlaubnis.rest, gestartetWegen: grund });
  }

  laeuftGerade = true;
  const themen = themenListe(konfig);
  const letzteLaeufe = letzteThemenLaeufe(laeufe);
  const faellig = faelligeThemen(themen, letzteLaeufe, Date.parse(jetzt)).slice(0, maxThemen);
  const budgetAnfragen = anfragenFuerLauf(grenzen, erlaubnis.rest);

  const vorhandene = (await listeOderNull(stores.wissen, env)) || [];
  const protokollThemen = [];
  let anfragen = 0;
  let quellenGeprueft = 0;
  const gespeicherteIds = [];

  try {
    for (const thema of faellig) {
      if (anfragen >= budgetAnfragen) break;
      const eintragThema = {
        id: thema.id, titel: thema.titel, bereich: thema.bereich,
        grund: `faellig (alle ${thema.intervallStunden} h, Prioritaet ${thema.prioritaet})`,
        anfragen: 0, funde: 0, geprueft: 0, gespeichert: 0, verworfen: []
      };
      const anfrage = thema.anfragen[0];
      let treffer = [];
      try {
        const ergebnis = await suche(anfrage, { limit: 6 });
        treffer = Array.isArray(ergebnis?.results) ? ergebnis.results : [];
        anfragen += 1;
        eintragThema.anfragen = 1;
      } catch (fehler) {
        eintragThema.fehler = String(fehler?.message || fehler).slice(0, 160);
        protokollThemen.push(eintragThema);
        continue;
      }
      eintragThema.funde = treffer.length;

      const bewertet = [];
      for (const fund of treffer) {
        const sauber = pruefeFremdtext(fund);
        if (!sauber.ok) {
          eintragThema.verworfen.push({ url: fund?.url || "", titel: String(fund?.title || "").slice(0, 80), grund: sauber.grund });
          continue;
        }
        const bewertung = bewerteFund({
          url: fund?.url,
          title: entschaerfe(fund?.title, { maxZeichen: 160 }),
          snippet: entschaerfe(fund?.snippet || fund?.body, { maxZeichen: 400 })
        }, { jetzt });
        if (!bewertung.tauglich) {
          eintragThema.verworfen.push({ url: bewertung.url, titel: bewertung.titel, grund: bewertung.grund });
          continue;
        }
        bewertet.push(bewertung);
        quellenGeprueft += 1;
      }
      bewertet.sort(nachGuete);
      eintragThema.geprueft = bewertet.length;

      for (const bewertung of bewertet) {
        const belege = [bewertung, ...bewertet.filter((b) => b !== bewertung && b.host !== bewertung.host
          && aehnlichesThema(b.auszug, bewertung.auszug))].slice(0, 3);
        const urteil = vergleiche(bewertung.auszug, vorhandene.filter((e) => e.themaId === thema.id));

        if (urteil.art === VERGLEICH.DUPLIKAT) {
          eintragThema.verworfen.push({ url: bewertung.url, titel: bewertung.titel, grund: `duplikat (${urteil.grund})` });
          continue;
        }

        let eintrag;
        if (urteil.art === VERGLEICH.NEU) {
          eintrag = baueEintrag({ themaId: thema.id, bereich: thema.bereich, aussage: bewertung.auszug, belege, jetzt });
        } else {
          eintrag = neueFassung(urteil.bezug, {
            aussage: bewertung.auszug, belege, jetzt,
            widerspruch: urteil.art === VERGLEICH.WIDERSPRUCH
          });
          eintrag.aenderungsgrund = urteil.grund;
        }

        // Unsicheres wandert NICHT in die aktive Basis — es steht im Bericht
        // unter "verworfen", damit der Mensch es trotzdem sieht.
        if (eintrag.pruefstatus === PRUEFSTATUS.UNSICHER) {
          eintragThema.verworfen.push({ url: bewertung.url, titel: bewertung.titel, grund: `unsicher (${bewertung.markierungen.join(", ")})` });
          continue;
        }

        try {
          await stores.wissen.schreib(eintrag, { env, timeoutMs: 8000 });
          const stelle = vorhandene.findIndex((e) => e.id === eintrag.id);
          if (stelle >= 0) vorhandene[stelle] = eintrag; else vorhandene.push(eintrag);
          eintragThema.gespeichert += 1;
          gespeicherteIds.push(eintrag.id);
        } catch (fehler) {
          eintragThema.verworfen.push({ url: bewertung.url, titel: bewertung.titel, grund: `ablage_fehler: ${String(fehler?.message || fehler).slice(0, 60)}` });
        }
      }
      protokollThemen.push(eintragThema);
    }
  } finally {
    laeuftGerade = false;
  }

  const lauf = protokoll({
    begonnenAm,
    ok: true,
    grund: null,
    rest: erlaubnis.rest,
    gestartetWegen: grund,
    themen: protokollThemen,
    anfragen,
    quellenGeprueft,
    gespeicherteIds,
    vorschlaege: baueVorschlaege(protokollThemen, vorhandene),
    offeneFragen: offeneFragenAus(protokollThemen),
    naechsteFaelligkeitAm: naechsteFaelligkeit(themen, { ...letzteLaeufe, ...neueThemenZeiten(protokollThemen, jetzt) }, Date.parse(jetzt))
  });

  try {
    await stores.laeufe.schreib(lauf, { env, timeoutMs: 8000 });
  } catch {
    lauf.protokollAbgelegt = false;
  }
  return lauf;
}

function protokoll(felder) {
  return {
    id: neueKennung("radarlauf"),
    art: "radar-lauf",
    themen: [],
    anfragen: 0,
    quellenGeprueft: 0,
    gespeicherteIds: [],
    vorschlaege: [],
    offeneFragen: [],
    protokollAbgelegt: true,
    beendetAm: new Date().toISOString(),
    ...felder
  };
}

function letzteThemenLaeufe(laeufe) {
  const zeiten = {};
  for (const lauf of laeufe || []) {
    for (const t of lauf?.themen || []) {
      const alt = zeiten[t.id];
      if (!alt || String(lauf.begonnenAm) > alt) zeiten[t.id] = String(lauf.begonnenAm);
    }
  }
  return zeiten;
}

function neueThemenZeiten(protokollThemen, jetzt) {
  const zeiten = {};
  for (const t of protokollThemen) zeiten[t.id] = jetzt;
  return zeiten;
}

/** Grober Themenbezug zweier Auszuege — reicht fuer "bestaetigt dieselbe Sache?". */
function aehnlichesThema(a, b) {
  const worte = (t) => new Set(String(t || "").toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const A = worte(a);
  const B = worte(b);
  let schnitt = 0;
  for (const w of A) if (B.has(w)) schnitt += 1;
  return schnitt >= 3;
}

/**
 * Verbesserungsvorschlaege (Auftrag Punkt 6) — bewusst KONSERVATIV: ein
 * Vorschlag entsteht nur aus dem, was heute wirklich gespeichert wurde, und
 * traegt immer seine Quelle. Er aendert nichts, er schlaegt vor.
 */
function baueVorschlaege(protokollThemen, wissen) {
  const vorschlaege = [];
  for (const t of protokollThemen) {
    if (t.gespeichert > 0 && t.bereich === "konkurrenz") {
      const belege = wissen.filter((e) => e.themaId === t.id).slice(0, 3)
        .map((e) => ({ aussage: e.aussage.slice(0, 160), quellen: (e.belege || []).map((b) => b.url).slice(0, 2) }));
      vorschlaege.push({
        titel: `Pruefen, was "${t.titel}" fuer smejj bedeutet`,
        begruendung: belege,
        nutzen: "Funktionsluecke oder Preisnachteil frueh erkennen",
        kostenRisiko: "Pruefzeit; Umsetzung erst nach eigener Entscheidung",
        test: "Vergleichsfrage im Chat stellen und die Antwort gegen die Quelle pruefen"
      });
    }
    if (t.bereich === "sicherheit" && t.gespeichert > 0) {
      vorschlaege.push({
        titel: "Sicherheitsmeldung gegen die eigene Lage pruefen",
        begruendung: [{ aussage: `${t.gespeichert} neue Meldung(en) zu ${t.titel}`, quellen: [] }],
        nutzen: "Bekannte Luecken schliessen, bevor sie jemand ausnutzt",
        kostenRisiko: "Pruefzeit; ggf. Abhaengigkeit anheben",
        test: "npm audit und die betroffene Abhaengigkeit pruefen"
      });
    }
  }
  return vorschlaege.slice(0, 5);
}

function offeneFragenAus(protokollThemen) {
  const fragen = [];
  for (const t of protokollThemen) {
    if (t.funde > 0 && t.geprueft === 0) fragen.push(`Zu "${t.titel}" kam kein verwertbarer Fund — andere Suchworte noetig?`);
    if (t.fehler) fragen.push(`Suche zu "${t.titel}" scheiterte: ${t.fehler}`);
  }
  return fragen.slice(0, 5);
}

/** Der Stand fuer Ampel und Adminbereich. */
export async function radarStand({ env = process.env, stores = { wissen: wissenStore, laeufe: laufStore, konfig: konfigStore }, jetzt = new Date().toISOString() } = {}) {
  const konfig = await leseKonfig({ env, store: stores.konfig });
  const laeufe = await listeOderNull(stores.laeufe, env);
  const wissen = await listeOderNull(stores.wissen, env);
  const grenzen = grenzenAus(env, konfig);
  const erlaubnis = darfLaufen({ grenzen, laeufe, jetzt, env, konfig, laeuftSchon: laeuftGerade });
  const sortiert = [...(laeufe || [])].sort((a, b) => String(b.begonnenAm || "").localeCompare(String(a.begonnenAm || "")));
  const letzterErfolg = sortiert.find((l) => l.ok === true) || null;
  const themen = themenListe(konfig);

  return {
    eingeschaltet: konfig?.eingeschaltet !== false,
    zustand: laeuftGerade ? "recherchiert" : (erlaubnis.erlaubt ? "wartet" : zustandAus(erlaubnis.grund)),
    grund: erlaubnis.grund,
    letzterLauf: sortiert[0] ? { begonnenAm: sortiert[0].begonnenAm, ok: sortiert[0].ok, grund: sortiert[0].grund || null } : null,
    letzterErfolgAm: letzterErfolg?.begonnenAm || null,
    naechsteFaelligkeitAm: naechsteFaelligkeit(themen, letzteThemenLaeufe(laeufe || []), Date.parse(jetzt)),
    laeufeGesamt: (laeufe || []).length,
    laeufeLesbar: Array.isArray(laeufe),
    wissenGesamt: (wissen || []).length,
    wissenLesbar: Array.isArray(wissen),
    wissenAktiv: fuerAbruf(wissen || []).length,
    grenzen,
    verbrauch: erlaubnis.rest,
    themen: themen.map((t) => ({ id: t.id, titel: t.titel, bereich: t.bereich, intervallStunden: t.intervallStunden, prioritaet: t.prioritaet }))
  };
}

function zustandAus(grund) {
  if (grund === "notaus") return "pausiert";
  if (grund === "laeuft_bereits") return "recherchiert";
  if (grund === "budget_nicht_lesbar") return "fehler";
  return "pausiert";
}

/** Wissenseintraege als RAG-Chunks — nur Geprueftes, mit Quelle, Datum und Status. */
export async function ladeRadarChunks({ env = process.env, store = wissenStore, maxEintraege = 120 } = {}) {
  try {
    const liste = await listeOderNull(store, env);
    if (!Array.isArray(liste)) return [];
    const aktiv = fuerAbruf(liste).filter((e) => e.pruefstatus === PRUEFSTATUS.GEPRUEFT || e.pruefstatus === PRUEFSTATUS.EINZELQUELLE);
    return aktiv.slice(0, maxEintraege).map((e) => {
      const quelle = e.belege?.[0];
      const stand = quelle?.veroeffentlicht || "unbekannt";
      const hinweis = e.pruefstatus === PRUEFSTATUS.EINZELQUELLE ? " (nur EINE Quelle)" : "";
      return {
        id: `radar:${e.id}:${e.fassung}`,
        source: `smejj-ai-radar/${e.bereich}`,
        heading: e.aussage.slice(0, 80),
        text: `${e.aussage} (Stand ${stand}, abgerufen ${String(quelle?.abgerufenAm || "").slice(0, 10)}, `
          + `Quelle: ${quelle?.url || "unbekannt"}, Pruefstatus: ${e.pruefstatus}${hinweis})`
      };
    });
  } catch {
    return [];
  }
}
