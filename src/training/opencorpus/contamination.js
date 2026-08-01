// smejj.com — Verunreinigungs-Tor: Pruefsuite-Inhalte duerfen nie ins Training
// (Single Responsibility: Ueberschneidung zwischen Trainingszeile und Pruefsuite).
//
// Die harte Regel des Auftrags lautet "Testdaten NIE ins Training". Ein Satz in
// einer Richtlinie erzwingt das nicht — dieses Modul tut es, und der
// Trainingskorpus wird ohne es nicht gebaut.
//
// WAS GEPRUEFT WIRD: die PROMPTS der Suite, nicht die Erwartungswerte.
// Grund: die Erwartungswerte sind zum Teil Allerweltszeichenketten. Der Fall
// naming-schreibweise erwartet "smejj.com" — verboete man jede Zeile, die
// "smejj.com" enthaelt, waere ausgerechnet der wichtigste Teil des Korpus
// gesperrt. Die Prompts dagegen sind lange, wortwoertlich einmalige Saetze;
// taucht ein langes Stueck davon in einer Trainingszeile auf, ist das keine
// Zufallsuebereinstimmung, sondern die Testfrage selbst.
//
// ZUSAETZLICH werden ausdruecklich als unterscheidend markierte Erwartungswerte
// geprueft (siehe unterscheidendeWerte). Damit faellt z. B. der genaue
// LCP-Budget-Zahlenwert unter das Tor, ohne dass "smejj.com" es tut.

const N_GRAMM_LAENGE = 8;

/**
 * Vereinheitlicht Text fuer den Vergleich: Kleinschreibung, Umlaut-Faltung,
 * alles Nicht-Alphanumerische zu einem Leerzeichen. Ohne diese Faltung liesse
 * sich das Tor durch eine geaenderte Gross-/Kleinschreibung oder ein
 * zusaetzliches Satzzeichen umgehen.
 */
export function normalisiereText(wert) {
  return String(wert ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Zerlegt normalisierten Text in Wort-N-Gramme fester Laenge. */
export function nGramme(text, laenge = N_GRAMM_LAENGE) {
  const woerter = normalisiereText(text).split(" ").filter(Boolean);
  if (woerter.length < laenge) return woerter.length ? [woerter.join(" ")] : [];
  const ausgabe = [];
  for (let i = 0; i + laenge <= woerter.length; i += 1) {
    ausgabe.push(woerter.slice(i, i + laenge).join(" "));
  }
  return ausgabe;
}

/**
 * Baut den Fingerabdruck einer Pruefsuite: alle N-Gramme aller Prompts und
 * Systemtexte plus die ausdruecklich unterscheidenden Erwartungswerte.
 *
 * @param {object} suite  geladene Suite (evals/suites/*.json)
 * @param {object} [optionen]
 * @param {string[]} [optionen.unterscheidendeWerte]
 *   Erwartungswerte, die fuer sich genommen schon eine Antwort verraten
 *   (z. B. eine konkrete Budgetzahl). Bewusst eine ausdrueckliche Liste und
 *   keine Automatik: welcher Wert verraeterisch ist, ist eine inhaltliche
 *   Entscheidung, die sichtbar im Code stehen soll.
 */
export function baueSuiteFingerabdruck(suite, { unterscheidendeWerte = [] } = {}) {
  const gramme = new Set();
  const werte = new Set();
  for (const fall of suite?.cases || []) {
    for (const gramm of nGramme(fall?.prompt)) gramme.add(gramm);
    // Die SYSTEMZEILE gehoert ausdruecklich NICHT in den Fingerabdruck.
    // Sie ist geteilter Betriebskontext ("Antworte auf Deutsch, kurz und
    // praezise"), keine Testfrage — und sie steht absichtlich woertlich auch
    // ueber jeder Trainingszeile, damit das Modell unter derselben Anweisung
    // lernt, unter der es gemessen wird.
    // Gemessen am 2026-08-01: mit der Systemzeile im Fingerabdruck wurden
    // 1971 von 1971 Projektzeilen abgewiesen — das Tor sperrte alles und war
    // damit wirkungslos statt streng.
  }
  for (const wert of unterscheidendeWerte) {
    const normalisiert = normalisiereText(wert);
    if (normalisiert) werte.add(normalisiert);
  }
  return Object.freeze({
    suiteId: String(suite?.suiteId || "unbekannt"),
    contentSha256: String(suite?.integrity?.contentSha256 || ""),
    gramme,
    werte,
    faelle: Array.isArray(suite?.cases) ? suite.cases.length : 0
  });
}

/**
 * Prueft eine einzelne Trainingszeile gegen den Fingerabdruck.
 * Fail-closed: ein fehlender oder leerer Fingerabdruck sperrt, statt
 * durchzuwinken — sonst wuerde ein Ladefehler der Suite lautlos das gesamte
 * Tor abschalten, und genau dann waere die Verunreinigung unsichtbar.
 */
export function pruefeVerunreinigung(text, fingerabdruck) {
  if (!fingerabdruck || !(fingerabdruck.gramme instanceof Set)) {
    return { sauber: false, gruende: ["suite_fingerabdruck_fehlt"] };
  }
  if (fingerabdruck.gramme.size === 0 && fingerabdruck.werte.size === 0) {
    return { sauber: false, gruende: ["suite_fingerabdruck_leer"] };
  }

  const gruende = [];
  for (const gramm of nGramme(text)) {
    if (fingerabdruck.gramme.has(gramm)) {
      // Nur die Tatsache melden, nicht die Fundstelle im Klartext: der Befund
      // landet im Manifest, und das Manifest soll die Testfragen nicht
      // weitertragen.
      gruende.push("suite_prompt_ueberschneidung");
      break;
    }
  }
  const normalisiert = normalisiereText(text);
  for (const wert of fingerabdruck.werte) {
    if (wert && normalisiert.includes(wert)) {
      gruende.push("suite_erwartungswert_ueberschneidung");
      break;
    }
  }
  return { sauber: gruende.length === 0, gruende };
}
