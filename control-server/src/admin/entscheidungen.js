// smejj.com — "Deine Entscheidungen": aus Messungen werden Vorschlaege mit Ja/Nein.
//
// WARUM ES DIESE DATEI GIBT (Betreiber-Befund 16.09.2026): Der Radar fand
// Schlagzeilen, der Luecken-Sucher fand Funktionsluecken, die Werkstatt zaehlte
// Aufgaben — aber NIEMAND legte dem Betreiber je eine Frage vor. Die Radar-Seite
// zeigte nur den Bericht vom 05.08., dessen Vorschlaege alle umgesetzt sind;
// die frischen Funde lagen unter "AI Evolution" als Tabelle ohne Knopf. Der
// Satz des Betreibers war deshalb richtig: "Ich sehe keine Freigaben von meiner
// Seite, ich sehe keine neuen Funktionen vorgeschlagen."
//
// Drei Regeln, die diese Datei einhaelt:
//
//   1. NICHTS WIRD ERFUNDEN. Jeder Vorschlag hat eine Quelle, die man nachlesen
//      kann (Funktionsregister, Konkurrenz-Stand mit Datum, Radar-Treffer mit
//      Link). Ein Vorschlag ohne Beleg waere eine Meinung mit Knopf.
//   2. EIN JA IST EINE AUFGABE, kein Eintrag im Browser-Speicher. Die alte
//      Radar-Seite legte die Entscheidung in localStorage ab — sie war mit dem
//      naechsten Browser weg und niemand konnte danach handeln. Jetzt entsteht
//      beim Ja eine echte Aufgabe (Modul Y, sichtbar unter /admin/aufgaben/)
//      MIT Plan: Schritte, Test, Nachweis.
//   3. EIN NEIN BLEIBT STEHEN. Abgelehnte Vorschlaege verschwinden nicht,
//      sondern stehen mit Grund und Datum unten — sonst schlaegt derselbe
//      Vorschlag beim naechsten Scan wieder auf wie neu.
import { createRecordStore } from "./recordStore.js";
import { erfasseAufgabe } from "./aufgaben.js";
import { erkenneLuecken, baueLueckenAufgaben, KONKURRENZ_STAND, SMEJJ_FAEHIGKEITEN } from "../evolution/missingFunctionDetector.js";
import { holeKandidaten } from "../evolution/konkurrenzRadar.js";
import { offeneRechercheFunktionen, RECHERCHE_STAND } from "../evolution/radarRecherche.js";

const store = createRecordStore("admin/entscheidungen");

export const WAHLEN = Object.freeze(["ja", "nein", "spaeter"]);

/** Wie viele frische Radar-Treffer hoechstens zur Entscheidung kommen. */
const MAX_RADAR = 8;
/** Notizlaenge in Modul Y. Der Plan wird darauf zugeschnitten, nicht abgehackt. */
const MAX_NOTIZ = 400;

const zeit = (ms) => new Date(ms).toISOString();

/** Aus einer beliebigen Kennung eine, die als Dateiname taugt. */
function schluesselAus(vorschlagId) {
  return `ent_${String(vorschlagId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}`;
}

/** Kurzer, stabiler Fingerabdruck einer Radar-Zeile — ohne Krypto-Abhaengigkeit. */
function kurzHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function vorschlagAusLuecke(luecke, aufgabe) {
  const anbieter = (luecke.anbieter || []).join(", ") || "mindestens einem Anbieter";
  return {
    id: `luecke-${luecke.id}`,
    titel: luecke.name,
    quelle: "Konkurrenzlücke",
    quelleKurz: `Funktions-Abgleich, Stand ${KONKURRENZ_STAND.stand}`,
    konkurrent: `${anbieter} haben das. ${luecke.beschreibung || luecke.name}.`,
    wirHeute: `smejj.com hat es nicht — im Fähigkeitsregister gibt es keinen Eintrag "${luecke.id}".`,
    aenderung: `"${luecke.name}" bauen und an einen echten Nutzerweg anschließen.`,
    aufwand: aufgabe
      ? `Priorität ${aufgabe.prioritaet} (Nutzen-Score ${aufgabe.score}). Zuständig: Werkstatt. `
        + `Fertig ist es erst, wenn dieser Test läuft: ${aufgabe.testanforderung}`
      : "Aufwand noch nicht bewertet.",
    beleg: `Quelle: ${luecke.quelle || KONKURRENZ_STAND.herkunft}`,
    url: luecke.url || "",
    plan: aufgabe ? aufgabe.testanforderung : ""
  };
}

function vorschlagAusBaustein(funktion) {
  return {
    id: `baustein-${funktion.id}`,
    titel: `${funktion.name} fertig machen`,
    quelle: "Baustein ohne Wirkung",
    quelleKurz: "Funktions-Abgleich: vorhanden, aber im Produkt nicht aufgerufen",
    konkurrent: `${(funktion.anbieter || []).join(", ") || "Die Konkurrenz"} bietet das als fertige Funktion an.`,
    wirHeute: `Der Baustein liegt im Code (${funktion.beleg || "Beleg im Register"}), wird in der App aber nirgends aufgerufen. `
      + "Für Nutzer existiert die Funktion damit nicht.",
    aenderung: "Den vorhandenen Baustein an die Oberfläche anschließen und einen echten Nutzerweg messen.",
    aufwand: "Meist kleiner als neu bauen — der Kern steht schon. Risiko: mittel, weil der Baustein nie unter Last lief.",
    beleg: funktion.autopilot ? `Gemeldet von Autopilot ${funktion.autopilot}` : "Gemeldet vom Funktions-Abgleich",
    url: "",
    plan: ""
  };
}

/**
 * Ein Fund aus der Radar-Recherche: belegt mit Quelle und Datum, aber noch
 * NICHT im bestaetigten Konkurrenz-Stand. Genau dazwischen lag die Luecke —
 * der Radar lieferte Schlagzeilen, der Stand war vom 14.08.
 */
function vorschlagAusRecherche(funktion) {
  const anbieter = (funktion.anbieter || []).join(", ") || "mindestens ein Anbieter";
  const gesperrt = funktion.quelleGesperrt
    ? " Die Herstellerseite war beim Abruf gesperrt (403), die Zeile stützt sich auf Suchtreffer-Auszüge derselben Seite."
    : "";
  return {
    id: `recherche-${funktion.id}`,
    titel: funktion.name,
    quelle: "Radar-Recherche",
    quelleKurz: `${RECHERCHE_STAND.stand} · ${anbieter} · seit ${funktion.seit}`,
    konkurrent: `${anbieter} haben das seit ${funktion.seit}. ${funktion.warum}${gesperrt}`,
    wirHeute: "Noch nicht im bestätigten Konkurrenz-Stand (der ist vom "
      + KONKURRENZ_STAND.stand + ") — und bei smejj.com gibt es dafür keinen Eintrag im Fähigkeitsregister.",
    aenderung: `"${funktion.name}" als bestätigte Konkurrenzfunktion eintragen und bauen.`,
    aufwand: "Vor dem Bauen einmal prüfen, ob die Quelle noch stimmt. Danach: eigener Nutzerweg, "
      + "der messbar durchläuft — ohne den gilt die Funktion nicht als vorhanden.",
    beleg: `Quelle: ${funktion.quelle}`,
    url: funktion.quelle,
    plan: `Ein echter Nutzerweg für "${funktion.name}" muss messbar durchlaufen (E2E).`
  };
}

function vorschlagAusRadar(kandidat) {
  const titel = String(kandidat.titel || "").slice(0, 140);
  return {
    id: `radar-${kurzHash(`${kandidat.anbieter}|${kandidat.url || titel}`)}`,
    titel: `${kandidat.anbieter}: ${titel}`,
    quelle: "Radar-Treffer",
    quelleKurz: `gesehen am ${String(kandidat.gesehenAm || "").slice(0, 10)} · Bereich ${kandidat.bereich || "allgemein"}`,
    konkurrent: titel,
    wirHeute: "Ungeprüft. Der Radar hat die Schlagzeile gefunden, niemand hat verglichen, ob wir das können.",
    aenderung: "Prüfen, was dahinter steckt. Wenn es zählt, wird daraus eine Aufgabe mit Plan.",
    aufwand: "Prüfung: klein (unter einem Tag). Den Bau-Aufwand kann erst die Prüfung nennen.",
    beleg: kandidat.url ? `Quelle: ${kandidat.url}` : "Quelle: öffentliche Release-Notes",
    url: kandidat.url || "",
    plan: ""
  };
}

/**
 * Alle Vorschlaege, die aus den laufenden Messungen entstehen — OHNE die
 * Entscheidungen. Getrennt gehalten, damit der Test sie ohne Ablage pruefen kann.
 */
export async function baueVorschlaege({ env = process.env, radarBestand = holeKandidaten } = {}) {
  const radar = await radarBestand({ env }).catch((fehler) => ({ ok: false, grund: String(fehler?.message || fehler).slice(0, 120) }));
  const kandidaten = radar.ok ? (radar.kandidaten || []) : [];
  const { luecken, nurBaustein } = erkenneLuecken({ radarKandidaten: kandidaten });
  const aufgaben = baueLueckenAufgaben(luecken);
  const jeLuecke = new Map(aufgaben.map((a) => [a.betrifft, a]));

  // Was der bestaetigte Stand und das eigene Register schon kennen, kommt nicht
  // noch einmal als Recherche-Fund — sonst stuende dieselbe Funktion zweimal da.
  const bekannt = new Set([
    ...(KONKURRENZ_STAND.funktionen || []).map((f) => f.id),
    ...SMEJJ_FAEHIGKEITEN.map((f) => f.id)
  ]);

  const vorschlaege = [
    ...luecken.map((l) => vorschlagAusLuecke(l, jeLuecke.get(l.id))),
    ...nurBaustein.filter((f) => f.beiKonkurrenz).map(vorschlagAusBaustein),
    ...offeneRechercheFunktionen({ bekannteIds: bekannt }).map(vorschlagAusRecherche),
    ...kandidaten.slice(0, MAX_RADAR).map(vorschlagAusRadar)
  ];

  return {
    vorschlaege,
    radarLetzterLauf: radar.ok ? (radar.letzterLauf || null) : null,
    radarStumm: radar.ok ? null : (radar.grund || "Radar-Ablage nicht lesbar"),
    konkurrenzStand: KONKURRENZ_STAND.stand,
    konkurrenzHerkunft: KONKURRENZ_STAND.herkunft
  };
}

/** Die abgelegten Entscheidungen, je Vorschlag die jeweils letzte. */
export async function ladeEntscheidungen({ env = process.env } = {}) {
  const ergebnis = await store.liste({ env });
  if (!ergebnis.ok) return { ok: false, grund: ergebnis.error || "Entscheidungs-Ablage nicht lesbar", jeVorschlag: new Map() };
  const jeVorschlag = new Map();
  // Neueste zuerst (recordStore sortiert nach createdAt) — der erste Treffer je
  // Vorschlag ist damit der aktuelle Stand.
  for (const d of ergebnis.datensaetze) {
    if (d && d.vorschlagId && !jeVorschlag.has(d.vorschlagId)) jeVorschlag.set(d.vorschlagId, d);
  }
  return { ok: true, jeVorschlag, total: ergebnis.total };
}

/**
 * Die ganze Seite: offene Vorschlaege zuerst, entschiedene darunter.
 * Ein Vorschlag, der spaeter entschieden wurde, kommt wieder nach oben — sonst
 * heisst "später" in der Praxis "nie".
 */
export async function entscheidungsUebersicht({ env = process.env, jetztMs = Date.now(), radarBestand = holeKandidaten } = {}) {
  const basis = await baueVorschlaege({ env, radarBestand });
  const abgelegt = await ladeEntscheidungen({ env });

  const offen = [];
  const entschieden = [];
  for (const v of basis.vorschlaege) {
    const e = abgelegt.jeVorschlag.get(v.id) || null;
    const eintrag = {
      ...v,
      entscheidung: e ? e.wahl : null,
      entschiedenAm: e ? e.entschiedenAm : null,
      entschiedenVon: e ? e.entschiedenVon : null,
      notiz: e ? e.notiz || "" : "",
      aufgabeId: e ? e.aufgabeId || null : null
    };
    if (!e || e.wahl === "spaeter") offen.push(eintrag);
    else entschieden.push(eintrag);
  }

  return {
    ok: true,
    stand: zeit(jetztMs),
    konkurrenzStand: basis.konkurrenzStand,
    konkurrenzHerkunft: basis.konkurrenzHerkunft,
    radarLetzterLauf: basis.radarLetzterLauf,
    radarStumm: basis.radarStumm,
    ablageStumm: abgelegt.ok ? null : abgelegt.grund,
    zaehler: {
      gesamt: basis.vorschlaege.length,
      offen: offen.filter((v) => !v.entscheidung).length,
      spaeter: offen.filter((v) => v.entscheidung === "spaeter").length,
      ja: entschieden.filter((v) => v.entscheidung === "ja").length,
      nein: entschieden.filter((v) => v.entscheidung === "nein").length
    },
    offen,
    entschieden,
    hinweis: "Ein Ja legt sofort eine Aufgabe mit Plan an (Aufgaben-Seite). Ein Nein bleibt mit Grund stehen, "
      + "damit derselbe Vorschlag nicht beim nächsten Scan wieder als neu erscheint."
  };
}

/**
 * Der Plan, der beim Ja entsteht. Vier Schritte, weil die Verbesserungskette
 * genau hier riss: "Planen" hatte bisher niemanden (Master-Audit 15.09.).
 */
export function planText(vorschlag) {
  const schritte = [
    `1. Prüfen: ${vorschlag.konkurrent}`.slice(0, 120),
    `2. Bauen: ${vorschlag.aenderung}`.slice(0, 140),
    `3. Test: ${vorschlag.plan || "ein echter Nutzerweg muss messbar durchlaufen (E2E)"}`.slice(0, 150),
    "4. Live stellen und Nachweis an die Aufgabe hängen."
  ];
  return schritte.join("\n").slice(0, MAX_NOTIZ);
}

/**
 * Ja / Nein / Später festhalten. Beim Ja entsteht eine Aufgabe mit Plan.
 *
 * @param {{vorschlagId: string, wahl: string, notiz?: string}} eingabe
 */
export async function entscheide(eingabe = {}, { actor, env = process.env, jetztMs = Date.now(), radarBestand = holeKandidaten, aufgabeAnlegen = erfasseAufgabe } = {}) {
  const wahl = String(eingabe.wahl || "").trim().toLowerCase();
  if (!WAHLEN.includes(wahl)) return { ok: false, error: "entscheidung_wahl_unbekannt", erlaubt: WAHLEN };

  const vorschlagId = String(eingabe.vorschlagId || "").trim();
  if (!vorschlagId) return { ok: false, error: "entscheidung_vorschlag_fehlt" };

  // Gegen die aktuelle Liste pruefen: ein Ja auf einen Vorschlag, den es nicht
  // mehr gibt, waere eine Aufgabe fuer ein Problem, das keiner gemessen hat.
  const basis = await baueVorschlaege({ env, radarBestand });
  const vorschlag = basis.vorschlaege.find((v) => v.id === vorschlagId);
  if (!vorschlag) return { ok: false, error: "entscheidung_vorschlag_unbekannt", hinweis: "Der Vorschlag steht nicht mehr in der Messung. Seite neu laden." };

  const notiz = String(eingabe.notiz || "").trim().slice(0, MAX_NOTIZ);
  // Ein Nein ohne Grund ist spaeter nicht von "vergessen" zu unterscheiden —
  // dieselbe Regel wie beim Abschluss einer Aufgabe (Modul Y).
  if (wahl === "nein" && notiz.length < 5) {
    return { ok: false, error: "entscheidung_grund_noetig", hinweis: "Bitte in einem Satz sagen, warum nicht. Mindestens 5 Zeichen." };
  }

  let aufgabe = null;
  if (wahl === "ja") {
    const angelegt = await aufgabeAnlegen({
      titel: `Vorschlag: ${vorschlag.titel}`.slice(0, 160),
      notiz: planText(vorschlag),
      bereich: "produkt",
      zustaendig: "werkstatt"
    }, { actor, env, jetztMs });
    // Ohne Aufgabe kein Ja: ein "freigegeben" ohne Aufgabe waere genau der
    // Zustand, den der Betreiber beklagt hat — entschieden und trotzdem nichts.
    if (!angelegt.ok) return { ok: false, error: "entscheidung_aufgabe_fehlgeschlagen", hinweis: angelegt.hinweis || angelegt.error };
    aufgabe = angelegt.aufgabe;
  }

  const datensatz = {
    id: schluesselAus(vorschlagId),
    vorschlagId,
    wahl,
    titel: vorschlag.titel,
    quelle: vorschlag.quelle,
    notiz,
    aufgabeId: aufgabe ? aufgabe.id : null,
    entschiedenAm: zeit(jetztMs),
    entschiedenVon: actor?.email || "",
    createdAt: zeit(jetztMs)
  };
  await store.schreib(datensatz, { env, nowMs: jetztMs });

  return { ok: true, entscheidung: datensatz, aufgabe };
}

export function __clearEntscheidungenForTests() { store.__leeren(); }
