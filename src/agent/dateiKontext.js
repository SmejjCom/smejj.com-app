// smejj.com — Kontext-Diaet fuer angehaengte Dateien.
//
// DER BEFUND (gerechnet 2026-08-18 aus dem Code, nicht geschaetzt):
// handleAgent nimmt bis zu 8 Dateien und liest jede mit einer Grenze von
// 120.000 Zeichen. Eine GESAMTgrenze gab es nicht. Obergrenze also
// 960.000 Zeichen = rund 240.000 Eingabe-Tokens fuer EINE Anfrage:
//     glm-5.2        0,34 USD
//     Opus 5 / Sol   1,20 USD
// Und der Auto-Router schickt genau diesen Fall auf die teure Spur
// ("viel-kontext" -> Opus 5). Ein einziger Nutzer mit acht grossen Dateien
// kostet damit mehr als hundert normale Anfragen.
//
// Die Kostenrechnung vom 17.08. nennt die Kontext-Diaet als groessten Hebel
// (minus 50 bis 70 %), weil bei Coding-Anfragen der Eingabeteil dominiert.
// Der billigste Token ist der nicht gesendete.
//
// ZWEI REGELN, DIE HIER NICHT VERHANDELBAR SIND:
//
// 1. GESAMTBUDGET, nicht Grenze je Datei. Acht Dateien mit je "nur" 60.000
//    Zeichen sind immer noch eine halbe Million. Gedeckelt wird die Summe.
//
// 2. NIE STILL KUERZEN. Wer einem Modell ein Drittel einer Datei gibt und so
//    tut, als waere es die ganze, bekommt eine selbstsichere Antwort ueber
//    Code, den es nie gesehen hat. Jede Kuerzung traegt darum eine Zeile im
//    Klartext, die sagt, wieviel fehlt — das Modell kann dann nachfragen
//    statt zu raten. Dieselbe Haltung wie bei der Messung: geschaetzt und
//    gemessen werden nie vermischt.

/** Gesamtbudget ueber ALLE angehaengten Dateien (rund 15.000 Tokens). */
export const DATEIEN_GESAMT_ZEICHEN = 60_000;

/** Unterhalb dieser Groesse lohnt kein Kopf-Fuss-Schnitt — dann lieber ganz weg. */
const MINDEST_ANTEIL = 400;

/**
 * Verteilt ein Gesamtbudget auf Dateien — kleine zuerst, Rest wandert weiter.
 *
 * Warum nicht einfach gleichmaessig teilen: bei einer 200-Zeichen-Datei neben
 * einer 200.000-Zeichen-Datei bliebe die Haelfte des Budgets ungenutzt liegen,
 * waehrend die grosse Datei unnoetig hart beschnitten wird. Das
 * Wasserfuell-Verfahren gibt jeder Datei nur, was sie braucht, und verteilt
 * den Rest an die, die noch hungrig sind.
 *
 * @param {number[]} groessen Zeichenzahl je Datei, in Reihenfolge.
 * @param {number} gesamt Gesamtbudget in Zeichen.
 * @returns {number[]} Budget je Datei, in derselben Reihenfolge.
 */
export function verteileBudget(groessen, gesamt = DATEIEN_GESAMT_ZEICHEN) {
  const liste = (Array.isArray(groessen) ? groessen : []).map((wert, index) => ({
    index,
    groesse: Math.max(0, Number(wert) || 0)
  }));
  const ergebnis = new Array(liste.length).fill(0);
  let rest = Math.max(0, Number(gesamt) || 0);
  // Kleinste zuerst: nur so kann eine kleine Datei ihren Ueberschuss abgeben.
  const nachGroesse = [...liste].sort((a, b) => a.groesse - b.groesse);
  let offen = nachGroesse.length;
  for (const eintrag of nachGroesse) {
    const anteil = offen > 0 ? Math.floor(rest / offen) : 0;
    const zugeteilt = Math.min(eintrag.groesse, anteil);
    ergebnis[eintrag.index] = zugeteilt;
    rest -= zugeteilt;
    offen -= 1;
  }
  return ergebnis;
}

/**
 * Kuerzt einen Dateiinhalt auf sein Budget — Kopf UND Fuss bleiben.
 *
 * Warum beide Enden: oben stehen Importe und Signaturen, unten Export,
 * Hauptteil oder das Ende einer Klasse. Nur den Anfang zu behalten wuerde bei
 * jeder zweiten Datei genau die Stelle abschneiden, um die es geht.
 *
 * @returns {{text: string, gekuerzt: boolean, weggelassen: number}}
 */
export function kuerzeInhalt(inhalt, budget) {
  const text = String(inhalt ?? "");
  const grenze = Math.max(0, Number(budget) || 0);
  if (text.length <= grenze) return { text, gekuerzt: false, weggelassen: 0 };
  if (grenze < MINDEST_ANTEIL) {
    return {
      text: `[vollstaendig weggelassen — ${text.length} Zeichen, kein Platz im Kontextbudget]`,
      gekuerzt: true,
      weggelassen: text.length
    };
  }
  const marke = (fehlt) => `\n\n[... ${fehlt} Zeichen ausgelassen — frage nach, wenn du diesen Teil brauchst ...]\n\n`;
  const platz = grenze - marke(text.length).length;
  const kopf = Math.max(0, Math.ceil(platz * 0.65));
  const fuss = Math.max(0, platz - kopf);
  const weggelassen = text.length - kopf - fuss;
  return {
    text: `${text.slice(0, kopf)}${marke(weggelassen)}${fuss > 0 ? text.slice(-fuss) : ""}`,
    gekuerzt: true,
    weggelassen
  };
}

/**
 * Baut die Dateibloecke fuer den Prompt — mit Gesamtbudget und ehrlicher Marke.
 *
 * @param {Array<{name: string, inhalt: string}>} dateien
 * @param {number} gesamt Gesamtbudget in Zeichen.
 * @returns {{bloecke: string[], zeichen: number, gekuerzt: number, weggelassen: number}}
 */
export function baueDateibloecke(dateien, gesamt = DATEIEN_GESAMT_ZEICHEN) {
  const liste = (Array.isArray(dateien) ? dateien : []).filter((eintrag) => eintrag && typeof eintrag.name === "string");
  const budgets = verteileBudget(liste.map((eintrag) => String(eintrag.inhalt ?? "").length), gesamt);
  const bloecke = [];
  let zeichen = 0;
  let gekuerzt = 0;
  let weggelassen = 0;
  liste.forEach((eintrag, index) => {
    const ergebnis = kuerzeInhalt(eintrag.inhalt, budgets[index]);
    if (ergebnis.gekuerzt) {
      gekuerzt += 1;
      weggelassen += ergebnis.weggelassen;
    }
    const block = `--- ${eintrag.name} ---\n${ergebnis.text}`;
    zeichen += block.length;
    bloecke.push(block);
  });
  return { bloecke, zeichen, gekuerzt, weggelassen };
}
