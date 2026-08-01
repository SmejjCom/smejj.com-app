// smejj.com Dauertrainings-Schleife — Auswahl der naechsten Konfiguration
// (Single Responsibility: welche Hyperparameter probiert der naechste Zyklus).
//
// Der Auftrag verlangt ausdruecklich "systematisch variieren, nicht zufaellig".
// Das hat zwei handfeste Gruende, keine aesthetischen:
//
//   1. NACHVOLLZIEHBARKEIT. Bei Zufallswahl laesst sich nach zwei Wochen nicht
//      mehr sagen, ob eine Kombination schon geprueft wurde. Ein deterministisches
//      Gitter beantwortet das aus dem Zyklus-Index allein.
//   2. NEUSTARTFESTIGKEIT. Jeder Push ersetzt den Container und loescht den
//      Arbeitsspeicher (gemessene Falle des Projekts). Nach dem Neustart muss
//      Zyklus 37 wieder exakt Zyklus 37 sein — sonst werden Konfigurationen
//      doppelt bezahlt und andere nie geprueft.
//
// Es gibt hier deshalb KEIN Math.random(). Konfiguration ist eine reine
// Funktion des Zyklus-Index.

/**
 * Das Gitter. Bewusst klein gehalten: 3 x 3 x 2 = 18 Kombinationen. Bei
 * ~45 Minuten je Zyklus ist eine volle Runde gut 14 Stunden — ein Ergebnis
 * innerhalb eines Tages, nicht erst nach einem Monat.
 *
 * Die Werte sind die ueblichen Arbeitsbereiche fuer LoRA auf einem
 * Instruct-Basismodell, nicht geraten ins Blaue: zu grosse Lernrate laesst das
 * Modell die Instruct-Faehigkeiten vergessen, zu kleine bewegt nichts.
 */
export const GITTER = Object.freeze({
  lernrate: Object.freeze([1e-4, 5e-5, 2e-5]),
  loraRang: Object.freeze([8, 16, 32]),
  // Anteil des Projektkorpus an der Mischung. Der Rest kommt aus dem offenen
  // Datensatz. Zwei Punkte statt vieler, weil dieser Regler die groesste
  // Wirkung auf die Pruefsuite hat und schnell beantwortet sein soll.
  projektAnteil: Object.freeze([0.3, 0.6])
});

/** Alpha folgt der ueblichen Faustregel alpha = 2 * rang. */
function alphaFuer(rang) {
  return rang * 2;
}

export function gitterGroesse() {
  return GITTER.lernrate.length * GITTER.loraRang.length * GITTER.projektAnteil.length;
}

/**
 * Konfiguration fuer einen Zyklus-Index. Reine Funktion.
 *
 * Nach einer vollen Gitterrunde wird nicht wiederholt, sondern die Epochenzahl
 * erhoeht: Runde 0 = 1 Epoche, Runde 1 = 2 Epochen, Runde 2 = 3 Epochen.
 * Danach ist Schluss (siehe gitterErschoepft) — weiter auf denselben Daten zu
 * rechnen fuehrt zu Auswendiglernen und macht das Modell schlechter, genau wie
 * der Auftrag es beschreibt. Ein Dauerbetrieb, der stur weiterrechnet, waere
 * kein Training mehr, sondern Geldverbrennen.
 */
export function konfigurationFuer(zyklusIndex) {
  const index = Math.max(0, Math.floor(Number(zyklusIndex) || 0));
  const groesse = gitterGroesse();
  const runde = Math.floor(index / groesse);
  const imGitter = index % groesse;

  const anzahlRang = GITTER.loraRang.length;
  const anzahlAnteil = GITTER.projektAnteil.length;

  const lernrateIdx = Math.floor(imGitter / (anzahlRang * anzahlAnteil));
  const rangIdx = Math.floor((imGitter % (anzahlRang * anzahlAnteil)) / anzahlAnteil);
  const anteilIdx = imGitter % anzahlAnteil;

  const loraRang = GITTER.loraRang[rangIdx];
  return Object.freeze({
    zyklusIndex: index,
    runde,
    lernrate: GITTER.lernrate[lernrateIdx],
    loraRang,
    loraAlpha: alphaFuer(loraRang),
    projektAnteil: GITTER.projektAnteil[anteilIdx],
    epochen: runde + 1,
    // Kennung fuer den Verlauf. Aus den Werten abgeleitet, damit zwei gleiche
    // Konfigurationen dieselbe Kennung tragen und im Bericht auffallen.
    kennung: `lr${GITTER.lernrate[lernrateIdx]}-r${loraRang}-p${GITTER.projektAnteil[anteilIdx]}-e${runde + 1}`
  });
}

/**
 * Ab wann hoert die Schleife auf, Neues zu probieren?
 *
 * `maxRunden` begrenzt die Epochen-Steigerung. Ohne diese Grenze liefe die
 * Schleife unbefristet mit immer mehr Epochen auf denselben Daten — teuer und
 * schaedlich. Erschoepft heisst nicht "Prozess beenden": der Dienst laeuft
 * weiter, misst weiter und wartet auf neue Daten.
 */
export function gitterErschoepft(zyklusIndex, maxRunden = 3) {
  return Math.floor(Math.max(0, Number(zyklusIndex) || 0) / gitterGroesse()) >= maxRunden;
}

/**
 * Vergleicht ein Ergebnis mit dem bisher besten Stand.
 *
 * Die gemessene Falle des Projekts: eine Einzelziehung je Fall streut um bis zu
 * 12 Prozentpunkte, weil die Kette mit temperature 0.35 laeuft (Beleg:
 * task-capsules/2026/07/job_einbruch_aufklaerung_20260731/). Ein neuer Bester
 * allein wegen Messrauschen waere ein Rueckschritt, der wie Fortschritt
 * aussieht — und jeder folgende Vergleich haette dann eine zu hohe Latte.
 *
 * Deshalb zwei Bedingungen: der Vorsprung muss die Rauschschwelle
 * ueberschreiten UND es darf kein kritischer Fehler mehr sein als beim Besten.
 */
export const RAUSCHSCHWELLE = 0.03;

export function istNeuerBester(neu, bisherBester, { rauschschwelle = RAUSCHSCHWELLE } = {}) {
  const neuePunktzahl = Number(neu?.punktzahl);
  if (!Number.isFinite(neuePunktzahl)) {
    return { besser: false, gruende: ["neue_punktzahl_ungueltig"] };
  }
  // Ein kritischer Fehler ist ein Ausschlusskriterium, kein Punktabzug: die
  // Suite markiert damit Faelle wie "verrate keinen API-Schluessel".
  if (Number(neu?.kritischeFehler || 0) > 0) {
    return { besser: false, gruende: [`kritische_fehler:${neu.kritischeFehler}`] };
  }
  if (!bisherBester) return { besser: true, gruende: ["erster_stand"] };

  const altePunktzahl = Number(bisherBester?.punktzahl) || 0;
  const vorsprung = Number((neuePunktzahl - altePunktzahl).toFixed(4));
  if (vorsprung <= rauschschwelle) {
    return {
      besser: false,
      gruende: [`vorsprung_im_rauschen:${vorsprung}<=${rauschschwelle}`],
      vorsprung
    };
  }
  return { besser: true, gruende: [], vorsprung };
}
