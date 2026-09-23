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
import { PRUEFSTATUS, VERGLEICH, baueEintrag, fuerAbruf, neueFassung, pruefstatusAus, vergleiche } from "../../../src/radar/wissensbasis.js";
import { lueckenAnalyse, themenAusLuecken } from "../../../src/radar/wissensluecken.js";
import { darfHintergrundLaufen, vorrangStand } from "./radarVorrang.js";

export const WISSEN_ABLAGE = "radar/wissen";
export const LAUF_ABLAGE = "radar/laeufe";
export const KONFIG_ABLAGE = "radar/konfiguration";

const wissenStore = createRecordStore(WISSEN_ABLAGE, { maximal: 2000 });
// Nutzungssignale der eigenen Ablage (bereits PII-bereinigt, siehe
// userFeedbackFlywheelAutopilot). Sie bleiben IM HAUS — nach draussen geht nur
// ein Begriff aus der festen Liste in wissensluecken.js.
const signalStore = createRecordStore("self-improvement/user-feedback-events", { maximal: 300 });
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
  grund = "takt",
  vorrangPruefung = darfHintergrundLaufen,
  signale = signalStore
} = {}) {
  const begonnenAm = jetzt;
  // Die Dauer wird an der ECHTEN Uhr gemessen, nicht an `jetzt` — das ist in
  // Tests ein gesetzter Zeitpunkt und ergaebe negative Laufzeiten.
  const startMs = Date.now();
  const konfig = await leseKonfig({ env, store: stores.konfig });
  const grenzen = grenzenAus(env, konfig);
  const laeufe = await listeOderNull(stores.laeufe, env);
  const erlaubnis = darfLaufen({ grenzen, laeufe, jetzt, env, konfig, laeuftSchon: laeuftGerade });

  if (!erlaubnis.erlaubt) {
    return protokoll({ begonnenAm, ok: false, grund: erlaubnis.grund, rest: erlaubnis.rest, gestartetWegen: grund });
  }

  // VORRANG (Auftrag Punkt 7): Chat, Coding, Stimme und Bildschirmfreigabe
  // gehen vor. Der Takt verschiebt sich dann einfach; von Hand ausgeloeste
  // Laeufe (Adminknopf) laufen trotzdem — dort wartet ein Mensch davor.
  if (grund === "takt") {
    const vorrang = vorrangPruefung({ jetztMs: Date.parse(jetzt) || Date.now() });
    if (!vorrang.erlaubt) {
      // ABGELEGT (23.09.2026): vorher kehrte der verschobene Lauf ohne Spur
      // zurueck — der Tagesbericht zaehlte "Dem Nutzer gewichen" darum immer 0.
      // Ohne Anfragen, also ohne Budget; der Takt versucht es beim naechsten Tick.
      const verschoben = protokoll({ begonnenAm, ok: true, grund: vorrang.grund, rest: erlaubnis.rest, gestartetWegen: grund, vorrang: vorrangStand() });
      try { await stores.laeufe.schreib(verschoben, { env, timeoutMs: 8000 }); } catch { verschoben.protokollAbgelegt = false; }
      return verschoben;
    }
  }

  laeuftGerade = true;
  // Wissensluecken aus der eigenen Nutzung: nur Begriffe aus der festen Liste,
  // nie Nutzertext (wissensluecken.js). Neue Themen ergaenzen sich damit
  // selbst — innerhalb der Themen- und Budgetgrenzen, wie im Auftrag erlaubt.
  const ergaenzt = await themenAusLueckenErgaenzen({ env, konfig, stores, signale });
  const themen = themenListe(ergaenzt.konfig);
  const letzteLaeufe = letzteThemenLaeufe(laeufe);
  const faellig = faelligeThemen(themen, letzteLaeufe, Date.parse(jetzt)).slice(0, maxThemen);
  const budgetAnfragen = anfragenFuerLauf(grenzen, erlaubnis.rest);

  const vorhandene = (await listeOderNull(stores.wissen, env)) || [];
  const protokollThemen = [];
  let anfragen = 0;
  let quellenGeprueft = 0;
  const gespeicherteIds = [];
  const gegenpruefung = [];

  try {
    for (const thema of faellig) {
      if (anfragen >= budgetAnfragen) break;
      const eintragThema = {
        id: thema.id, titel: thema.titel, bereich: thema.bereich,
        grund: `faellig (alle ${thema.intervallStunden} h, Prioritaet ${thema.prioritaet})`,
        anfragen: 0, funde: 0, geprueft: 0, gespeichert: 0, verworfen: []
      };
      const anfrage = thema.anfragen[0];
      // EINE begrenzte Wiederholung (Auftrag Punkt 7): ein Aussetzer der
      // Suche ist haeufig, eine Schleife waere teuer. Mehr als zwei Versuche
      // gibt es nicht, und der zweite zaehlt aufs Budget wie der erste.
      let treffer = null;
      for (let versuch = 1; versuch <= 2 && treffer === null; versuch += 1) {
        if (anfragen >= budgetAnfragen) break;
        try {
          const ergebnis = await suche(anfrage, { limit: 6 });
          treffer = Array.isArray(ergebnis?.results) ? ergebnis.results : [];
          anfragen += 1;
          eintragThema.anfragen = versuch;
        } catch (fehler) {
          eintragThema.fehler = `Versuch ${versuch}: ${String(fehler?.message || fehler).slice(0, 120)}`;
          anfragen += 1;
          eintragThema.anfragen = versuch;
        }
      }
      if (treffer === null) {
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
    // Gegenpruefung (23.09.2026): Einzelquellen bekommen mit dem Restbudget eine
    // gezielte zweite Suche. Findet sie eine unabhaengige Bestaetigung, steigt
    // der Pruefstatus; sonst wird der Versuch vermerkt (naechster in 7 Tagen).
    gegenpruefung.push(...await gegenpruefen({ env, jetzt, suche, stores, vorhandene, rest: budgetAnfragen - anfragen, zaehle: () => { anfragen += 1; } }));
  } finally {
    laeuftGerade = false;
  }

  const lauf = protokoll({
    begonnenAm,
    ok: true,
    grund: null,
    dauerMs: Date.now() - startMs,
    themenErgaenzt: ergaenzt.neue,
    luecken: ergaenzt.analyse,
    gegenpruefung,
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

/**
 * Haengt Themen aus erkannten Wissensluecken an die Konfiguration — hoechstens
 * zwei je Lauf. Faellt die Signal-Ablage aus, bleibt alles beim Alten: eine
 * stumme Ablage darf den Radar nicht anhalten (und erst recht nichts erfinden).
 */
async function themenAusLueckenErgaenzen({ env, konfig, stores, signale = signalStore }) {
  try {
    const texte = await lueckenSignale({ env, store: signale });
    if (!texte) return { konfig, neue: [], analyse: null };
    const vorhandeneIds = themenListe(konfig).map((t) => t.id);
    const analyse = lueckenAnalyse(texte, { vorhandeneIds });
    const neue = themenAusLuecken(texte, { vorhandeneIds });
    if (!neue.length) return { konfig, neue: [], analyse };
    const erweitert = { ...(konfig || {}), themen: [...((konfig || {}).themen || []), ...neue] };
    await schreibeKonfig(erweitert, { env, store: stores.konfig });
    return { konfig: erweitert, neue: neue.map((t) => ({ id: t.id, titel: t.titel, herkunft: t.herkunft })), analyse };
  } catch {
    return { konfig, neue: [], analyse: null };
  }
}

/** Die Texte der Daumen-runter-Signale — bleiben im Haus. null = Ablage stumm. */
async function lueckenSignale({ env, store = signalStore }) {
  const liste = await store.liste({ env });
  if (!liste?.ok) return null;
  // "regenerate" sendet das Frontend (noch) nicht; es bleibt vorgesehen.
  // EINE Frage = EIN Signal, egal wie oft neu erzeugt und verworfen (live
  // 23.09.2026: 13 Signale, alle dieselbe Frage mit wechselnden Antworten).
  const jeFrage = new Map();
  for (const d of liste.datensaetze || []) {
    if (d?.signalType !== "thumbs_down" && d?.signalType !== "regenerate") continue;
    const frage = String(d.promptVoll || d.promptSample || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!jeFrage.has(frage)) jeFrage.set(frage, `${d.promptVoll || d.promptSample || ""} ${d.antwortSample || ""}`);
  }
  return [...jeFrage.values()];
}

/** Fuer den Adminbereich: was wuerden die Wissensluecken JETZT ergeben? (ohne zu schreiben) */
export async function lueckenStand({ env = process.env, store = signalStore, konfigStore: ks = konfigStore } = {}) {
  const texte = await lueckenSignale({ env, store }).catch(() => null);
  if (!texte) return { lesbar: false };
  const konfig = await leseKonfig({ env, store: ks });
  return { lesbar: true, ...lueckenAnalyse(texte, { vorhandeneIds: themenListe(konfig).map((t) => t.id) }) };
}

const GEGENPRUEFUNG_ABSTAND_MS = 7 * 86_400_000;

/** Suchworte aus einer (oeffentlichen) Aussage: die tragenden Woerter, keine Fuellwoerter. */
export function suchworteAus(aussage, max = 8) {
  const gesehen = new Set();
  const worte = [];
  for (const w of String(aussage || "").split(/[^\p{L}\p{N}.-]+/u)) {
    const sauber = w.replace(/^[.-]+|[.-]+$/g, "");
    const klein = sauber.toLowerCase();
    if ((sauber.length < 5 && !/\d/.test(sauber)) || gesehen.has(klein)) continue;
    gesehen.add(klein);
    worte.push(sauber);
    if (worte.length >= max) break;
  }
  return worte.join(" ");
}

async function gegenpruefen({ env, jetzt, suche, stores, vorhandene, rest, zaehle, max = 2 }) {
  const jetztMs = Date.parse(jetzt) || Date.now();
  const kandidaten = fuerAbruf(vorhandene, { jetztMs })
    .filter((e) => e.pruefstatus === PRUEFSTATUS.EINZELQUELLE)
    .filter((e) => !(e.gegenpruefung?.am && jetztMs - Date.parse(e.gegenpruefung.am) < GEGENPRUEFUNG_ABSTAND_MS))
    .reverse() // aelteste zuerst
    .slice(0, Math.max(0, Math.min(max, rest)));
  const ergebnisse = [];
  for (const e of kandidaten) {
    const anfrage = suchworteAus(e.aussage);
    if (!anfrage) continue;
    let treffer;
    try {
      const antwort = await suche(anfrage, { limit: 6 });
      treffer = Array.isArray(antwort?.results) ? antwort.results : [];
    } catch (fehler) {
      ergebnisse.push({ id: e.id, ergebnis: "suche_fehlgeschlagen", fehler: String(fehler?.message || fehler).slice(0, 80) });
      zaehle();
      continue;
    }
    zaehle();
    const eigeneHosts = new Set((e.belege || []).map((b) => b.host));
    let bestaetigung = null;
    for (const fund of treffer) {
      if (!pruefeFremdtext(fund).ok) continue;
      const b = bewerteFund({ url: fund?.url, title: entschaerfe(fund?.title, { maxZeichen: 160 }), snippet: entschaerfe(fund?.snippet || fund?.body, { maxZeichen: 400 }) }, { jetzt });
      if (!b.tauglich || eigeneHosts.has(b.host)) continue;
      // "unbelegt" heisst nur: der Auszug nennt selbst keine Quelle ("laut ...").
      // Fuer eine BESTAETIGUNG zaehlt, dass eine zweite, unabhaengige Seite
      // dasselbe berichtet — gemessen live 23.09.2026: sechs Fachseiten zu
      // "Lockdown Mode" trugen alle "unbelegt" und bestaetigten dennoch dasselbe.
      // Geruecht und Werbung bleiben Ausschlussgruende.
      if ((b.markierungen || []).some((m) => m === "geruecht" || m === "werbung")) continue;
      // Eine KOPIE desselben Textes (Syndikation, Zweitverwertung) ist keine
      // unabhaengige Bestaetigung — gleiches Thema ja, fast gleicher Wortlaut nein.
      if (aehnlichesThema(b.auszug, e.aussage) && !istKopie(b.auszug, e.aussage)) { bestaetigung = b; break; }
    }
    let neu;
    if (bestaetigung) {
      const belege = [...(e.belege || []), {
        url: bestaetigung.url, host: bestaetigung.host, titel: bestaetigung.titel, guete: bestaetigung.guete,
        veroeffentlicht: bestaetigung.veroeffentlicht ?? null, abgerufenAm: bestaetigung.abgerufenAm,
        markierungen: (bestaetigung.markierungen || []).filter((m) => m !== "unbelegt").concat("bestaetigung")
      }];
      neu = { ...e, belege, pruefstatus: pruefstatusAus(belege), aktualisiertAm: jetzt,
        gegenpruefung: { am: jetzt, ergebnis: "bestaetigt", host: bestaetigung.host, url: bestaetigung.url } };
    } else {
      neu = { ...e, gegenpruefung: { am: jetzt, ergebnis: "keine_zweite_quelle", funde: treffer.length } };
    }
    try {
      await stores.wissen.schreib(neu, { env, timeoutMs: 8000 });
      const stelle = vorhandene.findIndex((x) => x.id === e.id);
      if (stelle >= 0) vorhandene[stelle] = neu;
      ergebnisse.push({ id: e.id, aussage: e.aussage.slice(0, 100), ergebnis: neu.gegenpruefung.ergebnis, pruefstatus: neu.pruefstatus, host: neu.gegenpruefung.host || null });
    } catch (fehler) {
      ergebnisse.push({ id: e.id, ergebnis: "ablage_fehler", fehler: String(fehler?.message || fehler).slice(0, 80) });
    }
  }
  return ergebnisse;
}

function protokoll(felder) {
  return {
    id: neueKennung("radarlauf"),
    art: "radar-lauf",
    dauerMs: null,
    themenErgaenzt: [],
    themen: [],
    anfragen: 0,
    quellenGeprueft: 0,
    gespeicherteIds: [],
    gegenpruefung: [],
    luecken: null,
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

/**
 * Uebernommener Wortlaut? Eine gemeinsame Folge von mindestens `n` Woertern am
 * Stueck verraet eine Kopie (Syndikation, Zweitverwertung). Ein eigener Bericht
 * teilt Schluesselwoerter, aber selten zehn Woerter in derselben Reihenfolge.
 */
export function istKopie(a, b, n = 10) {
  const worte = (t) => String(t || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const A = worte(a);
  const B = worte(b);
  if (A.length < n || B.length < n) return false;
  const folgen = new Set();
  for (let i = 0; i + n <= A.length; i += 1) folgen.add(A.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= B.length; i += 1) if (folgen.has(B.slice(i, i + n).join(" "))) return true;
  return false;
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
    wissenEinzelquelle: fuerAbruf(wissen || []).filter((e) => e.pruefstatus === PRUEFSTATUS.EINZELQUELLE).length,
    vorrang: vorrangStand(),
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
