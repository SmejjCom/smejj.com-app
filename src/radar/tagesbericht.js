// smejj ai radar — "Was hat smejj ai radar heute dazugelernt?" (Auftrag Punkt 5).
//
// Rein und ohne I/O: Der Bericht wird AUS DEN PROTOKOLLEN gebaut, die die
// Laeufe hinterlassen haben — er erzaehlt nichts, was nicht dort steht.
// Findet ein Tag nichts, sagt der Bericht genau das. Scheitert ein Lauf, steht
// der Fehler drin. Erfundene Lernerfolge gibt es hier nicht, und zwar
// bauartbedingt: es gibt kein Feld, in das eine Behauptung ohne Beleg passt.
import { BEREICHE } from "./radarThemen.js";

const tagVon = (iso) => String(iso || "").slice(0, 10);

/**
 * @param {{laeufe: array, eintraege: array, tag?: string}} eingabe
 *   laeufe    Laufprotokolle (aus der Ablage), eintraege die Wissenseintraege
 *   tag       YYYY-MM-DD; Standard: heute
 */
export function baueTagesbericht({ laeufe = [], eintraege = [], tag = new Date().toISOString().slice(0, 10) } = {}) {
  const tagesLaeufe = laeufe.filter((l) => tagVon(l?.begonnenAm) === tag);
  const tagesEintraege = eintraege.filter((e) => tagVon(e?.aktualisiertAm || e?.erstelltAm) === tag);

  const themen = tagesLaeufe.flatMap((l) => (l.themen || []).map((t) => ({
    id: t.id, titel: t.titel, bereich: t.bereich, grund: t.grund,
    anfragen: t.anfragen || 0, funde: t.funde || 0, geprueft: t.geprueft || 0,
    gespeichert: t.gespeichert || 0, verworfen: (t.verworfen || []).length
  })));

  const neu = tagesEintraege.filter((e) => Number(e.fassung) === 1 && !e.zurueckgenommen);
  const aktualisiert = tagesEintraege.filter((e) => Number(e.fassung) > 1 && !e.zurueckgenommen);
  const zurueckgenommen = tagesEintraege.filter((e) => e.zurueckgenommen);
  const widersprueche = tagesEintraege.filter((e) => e.pruefstatus === "widerspruch");
  const verworfen = tagesLaeufe.flatMap((l) => (l.themen || []).flatMap((t) => t.verworfen || []));
  const fehler = tagesLaeufe.filter((l) => l.ok === false).map((l) => ({ begonnenAm: l.begonnenAm, grund: l.grund || "unbekannt" }));

  const konkurrenz = tagesEintraege.filter((e) => e.bereich === "konkurrenz" && !e.zurueckgenommen);
  const vorschlaege = tagesLaeufe.flatMap((l) => l.vorschlaege || []);
  const offeneFragen = tagesLaeufe.flatMap((l) => l.offeneFragen || []);

  return {
    tag,
    laeufe: tagesLaeufe.length,
    anfragen: tagesLaeufe.reduce((s, l) => s + (Number(l.anfragen) || 0), 0),
    dauerMsGesamt: tagesLaeufe.reduce((s, l) => s + (Number(l.dauerMs) || 0), 0),
    themenErgaenzt: tagesLaeufe.flatMap((l) => l.themenErgaenzt || []),
    verschoben: tagesLaeufe.filter((l) => l.grund === "nutzer_hat_vorrang" || l.grund === "schonfrist_nach_nutzeranfrage").length,
    quellenGeprueft: tagesLaeufe.reduce((s, l) => s + (Number(l.quellenGeprueft) || 0), 0),
    themen,
    neu: neu.map(kurz),
    aktualisiert: aktualisiert.map((e) => ({ ...kurz(e), vorher: e.vorgaenger?.aussage || null })),
    zurueckgenommen: zurueckgenommen.map((e) => ({ ...kurz(e), grund: e.zurueckgenommenGrund || "" })),
    widersprueche: widersprueche.map(kurz),
    verworfen: verworfen.map((v) => ({ url: v.url || "", titel: v.titel || "", grund: v.grund || "unbekannt" })),
    konkurrenz: konkurrenz.map(kurz),
    vorschlaege,
    offeneFragen,
    fehler,
    // Die ehrliche Kurzfassung, die oben steht. Sie wird aus den Zahlen
    // gebildet, nicht formuliert.
    ueberschrift: ueberschriftAus({ laeufe: tagesLaeufe, neu, aktualisiert, fehler })
  };
}

function kurz(e) {
  return {
    id: e.id,
    bereich: e.bereich,
    themaId: e.themaId,
    aussage: e.aussage,
    pruefstatus: e.pruefstatus,
    fassung: e.fassung,
    quellen: (e.belege || []).map((b) => ({ url: b.url, host: b.host, guete: b.guete, veroeffentlicht: b.veroeffentlicht ?? null })),
    aktualisiertAm: e.aktualisiertAm
  };
}

function ueberschriftAus({ laeufe, neu, aktualisiert, fehler }) {
  if (!laeufe.length) return "Heute lief keine Recherche.";
  if (fehler.length && !neu.length && !aktualisiert.length) {
    return `Heute ${laeufe.length} Lauf(e), alle ohne Ergebnis: ${fehler[0].grund}.`;
  }
  if (!neu.length && !aktualisiert.length) {
    return `Heute ${laeufe.length} Lauf(e) — nichts Neues gefunden, das die Pruefung bestanden hat.`;
  }
  return `Heute ${neu.length} neue und ${aktualisiert.length} aktualisierte Erkenntnisse aus ${laeufe.length} Lauf(en).`;
}

/** Bericht nach Bereichen gegliedert — die Reihenfolge der Ansicht. */
export function nachBereichen(bericht) {
  const gruppen = new Map(BEREICHE.map((b) => [b, { bereich: b, neu: [], aktualisiert: [] }]));
  const einsortieren = (liste, feld) => {
    for (const e of liste) {
      const gruppe = gruppen.get(e.bereich) || gruppen.get("funktionen");
      gruppe[feld].push(e);
    }
  };
  einsortieren(bericht.neu || [], "neu");
  einsortieren(bericht.aktualisiert || [], "aktualisiert");
  return [...gruppen.values()].filter((g) => g.neu.length || g.aktualisiert.length);
}
