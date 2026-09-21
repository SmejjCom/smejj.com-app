// smejj ai radar — die externe Wissensbasis (Auftrag Punkt 2 und 3).
//
// Rein, ohne I/O: hier steht die FORM eines Wissenseintrags und die Regel,
// was passiert, wenn derselbe Sachverhalt erneut auftaucht. Wo die Eintraege
// liegen, entscheidet der Autopilot (Ablage auf IDrive e2).
//
// DREI ZUSTAENDE, die der Auftrag ausdruecklich trennt:
//   gefunden   ein Treffer der Suche  (nur im Laufprotokoll)
//   geprueft   Guete bewertet, mit einer zweiten Quelle abgeglichen
//   gespeichert ein Eintrag in dieser Basis
// Ob smejj ihn spaeter WIRKLICH in einer Antwort benutzt hat, steht hier
// bewusst NICHT — das misst nur ein Abruf-Test, nicht die Ablage.
//
// VERSIONEN statt Ueberschreiben: Jede Aenderung schreibt eine neue Fassung mit
// Vorgaenger. So bleibt nachvollziehbar, was wann galt, und eine falsche
// Uebernahme laesst sich zuruecknehmen (zurueckNehmen), ohne Geschichte zu
// faelschen.
import { createHash } from "node:crypto";

export const PRUEFSTATUS = Object.freeze({
  GEPRUEFT: "geprueft",            // mindestens zwei unabhaengige Quellen ODER eine Primaerquelle
  EINZELQUELLE: "einzelquelle",    // nur eine Quelle, ausdruecklich so gekennzeichnet
  UNSICHER: "unsicher",            // Geruecht/unbelegt markiert
  WIDERSPRUCH: "widerspruch"       // steht gegen einen vorhandenen Eintrag
});

export const VERGLEICH = Object.freeze({ NEU: "neu", DUPLIKAT: "duplikat", AENDERUNG: "aenderung", WIDERSPRUCH: "widerspruch" });

/** Kennung eines Sachverhalts: Thema + die tragenden Woerter der Aussage. */
export function sachverhaltsSchluessel(themaId, aussage) {
  const worte = String(aussage || "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s.-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !FUELLWORT.has(w))
    .slice(0, 12)
    .sort();
  return createHash("sha256").update(`${themaId}|${worte.join(" ")}`).digest("hex").slice(0, 20);
}

const FUELLWORT = new Set([
  "this", "that", "with", "from", "have", "will", "your", "their", "there", "about", "which", "using", "more",
  "eine", "einen", "einem", "eines", "oder", "aber", "auch", "nach", "ueber", "über", "durch", "diese", "dieser", "wird", "werden"
]);

/** Wie aehnlich sind zwei Aussagen? 0 bis 1, Wortmengen-Schnitt (Jaccard). */
export function aehnlichkeit(a, b) {
  const menge = (t) => new Set(String(t || "").toLowerCase().replace(/[^a-z0-9äöüß\s]/g, " ").split(/\s+/).filter((w) => w.length > 3));
  const A = menge(a);
  const B = menge(b);
  if (!A.size || !B.size) return 0;
  let schnitt = 0;
  for (const w of A) if (B.has(w)) schnitt += 1;
  return schnitt / (A.size + B.size - schnitt);
}

// Zahlen und Verneinungen sind die Stellen, an denen aus "dasselbe nochmal"
// ein "etwas anderes" wird: "9 Euro" gegen "12 Euro", "unterstuetzt" gegen
// "unterstuetzt nicht".
const ZAHL = /\d+(?:[.,]\d+)?/g;
const VERNEINUNG = /\b(not|no longer|kein|keine|nicht|ohne)\b/i;

/**
 * Vergleicht eine NEUE Aussage mit dem, was schon gespeichert ist.
 * @returns {{art: string, bezug: object|null, grund: string}}
 */
export function vergleiche(neueAussage, vorhandene = []) {
  let bester = null;
  let besteAehnlichkeit = 0;
  for (const alt of vorhandene) {
    const wert = aehnlichkeit(neueAussage, alt?.aussage);
    if (wert > besteAehnlichkeit) { besteAehnlichkeit = wert; bester = alt; }
  }
  if (!bester || besteAehnlichkeit < 0.35) return { art: VERGLEICH.NEU, bezug: null, grund: "kein aehnlicher Eintrag" };

  const zahlenNeu = String(neueAussage).match(ZAHL)?.join(",") || "";
  const zahlenAlt = String(bester.aussage).match(ZAHL)?.join(",") || "";
  const verneintNeu = VERNEINUNG.test(neueAussage);
  const verneintAlt = VERNEINUNG.test(bester.aussage);

  if (verneintNeu !== verneintAlt) {
    return { art: VERGLEICH.WIDERSPRUCH, bezug: bester, grund: "eine Fassung verneint, die andere nicht" };
  }
  if (zahlenNeu !== zahlenAlt) {
    return { art: VERGLEICH.AENDERUNG, bezug: bester, grund: `Zahlen geaendert (${zahlenAlt || "keine"} -> ${zahlenNeu || "keine"})` };
  }
  if (besteAehnlichkeit >= 0.8) return { art: VERGLEICH.DUPLIKAT, bezug: bester, grund: `Aehnlichkeit ${(besteAehnlichkeit * 100).toFixed(0)} %` };
  return { art: VERGLEICH.AENDERUNG, bezug: bester, grund: `Formulierung geaendert (Aehnlichkeit ${(besteAehnlichkeit * 100).toFixed(0)} %)` };
}

/**
 * Der Pruefstatus eines Sachverhalts aus seinen Belegen.
 * Zwei Quellen mit VERSCHIEDENEN Wirtsnamen zaehlen als Bestaetigung — zwei
 * Adressen derselben Seite sind EINE Quelle.
 */
export function pruefstatusAus(belege = [], { widerspruch = false } = {}) {
  if (widerspruch) return PRUEFSTATUS.WIDERSPRUCH;
  const hosts = new Set(belege.map((b) => String(b?.host || "")).filter(Boolean));
  const unsicher = belege.some((b) => (b?.markierungen || []).some((m) => m === "geruecht" || m === "unbelegt"));
  const primaer = belege.some((b) => b?.guete === "primaerquelle");
  if (primaer && !unsicher) return PRUEFSTATUS.GEPRUEFT;
  if (hosts.size >= 2 && !unsicher) return PRUEFSTATUS.GEPRUEFT;
  if (unsicher) return PRUEFSTATUS.UNSICHER;
  return PRUEFSTATUS.EINZELQUELLE;
}

/** Baut einen neuen Wissenseintrag (Fassung 1). */
export function baueEintrag({ themaId, bereich, aussage, belege = [], jetzt = new Date().toISOString(), widerspruch = false, id = null }) {
  const text = String(aussage || "").replace(/\s+/g, " ").trim();
  return {
    id: id || `wissen_${sachverhaltsSchluessel(themaId, text)}`,
    schluessel: sachverhaltsSchluessel(themaId, text),
    themaId,
    bereich,
    aussage: text,
    belege: belege.map((b) => ({
      url: b.url, host: b.host, titel: b.titel, guete: b.guete,
      veroeffentlicht: b.veroeffentlicht ?? null, abgerufenAm: b.abgerufenAm, markierungen: b.markierungen || []
    })),
    pruefstatus: pruefstatusAus(belege, { widerspruch }),
    fassung: 1,
    vorgaenger: null,
    zurueckgenommen: false,
    erstelltAm: jetzt,
    aktualisiertAm: jetzt
  };
}

/** Schreibt eine neue Fassung eines vorhandenen Eintrags fort. */
export function neueFassung(alt, { aussage, belege, jetzt = new Date().toISOString(), widerspruch = false }) {
  const text = String(aussage || alt.aussage).replace(/\s+/g, " ").trim();
  return {
    ...alt,
    aussage: text,
    belege: (belege && belege.length ? belege : alt.belege).map((b) => ({ ...b })),
    pruefstatus: pruefstatusAus(belege && belege.length ? belege : alt.belege, { widerspruch }),
    fassung: Number(alt.fassung || 1) + 1,
    vorgaenger: { fassung: alt.fassung, aussage: alt.aussage, pruefstatus: alt.pruefstatus, aktualisiertAm: alt.aktualisiertAm },
    zurueckgenommen: false,
    aktualisiertAm: jetzt
  };
}

/**
 * Nimmt eine Uebernahme zurueck: die vorige Fassung gilt wieder, der Eintrag
 * behaelt seine Geschichte. Ohne Vorgaenger wird er stillgelegt statt geloescht
 * — geloeschte Eintraege koennte niemand mehr nachvollziehen.
 */
export function zurueckNehmen(eintrag, { grund = "", jetzt = new Date().toISOString() } = {}) {
  if (eintrag?.vorgaenger) {
    return {
      ...eintrag,
      aussage: eintrag.vorgaenger.aussage,
      pruefstatus: eintrag.vorgaenger.pruefstatus,
      fassung: Number(eintrag.fassung || 1) + 1,
      vorgaenger: { fassung: eintrag.fassung, aussage: eintrag.aussage, pruefstatus: eintrag.pruefstatus, aktualisiertAm: eintrag.aktualisiertAm },
      zurueckgenommen: false,
      zurueckgenommenGrund: String(grund).slice(0, 200),
      aktualisiertAm: jetzt
    };
  }
  return { ...eintrag, zurueckgenommen: true, zurueckgenommenGrund: String(grund).slice(0, 200), aktualisiertAm: jetzt };
}

/** Was darf der Agent lesen? Nur Gueltiges — und Unsicheres nur mit Kennzeichnung. */
export function fuerAbruf(eintraege = [], { maxAlterTage = 365, jetztMs = Date.now() } = {}) {
  const aeltesteMs = jetztMs - maxAlterTage * 86_400_000;
  return eintraege
    .filter((e) => e && !e.zurueckgenommen && e.aussage)
    .filter((e) => {
      const zeit = Date.parse(e.aktualisiertAm || e.erstelltAm || "");
      return !Number.isFinite(zeit) || zeit >= aeltesteMs;
    })
    .sort((a, b) => String(b.aktualisiertAm || "").localeCompare(String(a.aktualisiertAm || "")));
}
