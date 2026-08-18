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
 * Platz, den der Symbol-Index im Budget einer Datei bekommen darf.
 *
 * GEMESSEN an src/server.js (49.585 Zeichen, 27 Symbole): der Index wiegt
 * 498 Zeichen, also 1 % der Datei. Fuer diesen einen Prozent weiss das Modell,
 * WAS in der ausgelassenen Mitte steht, statt nur DASS dort etwas fehlt — es
 * kann gezielt nachfragen ("zeig mir handleAgent") statt zu raten oder die
 * Existenz einer Funktion zu bestreiten, die es schlicht nicht gesehen hat.
 */
const INDEX_MAX_ZEICHEN = 600;
/** Unter diesem Budget ist der Index den Platz nicht wert. */
const INDEX_AB_BUDGET = 2_000;
const INDEX_MAX_SYMBOLE = 40;

// Bewusst konservativ: lieber ein Symbol uebersehen als eine Zeile falsch als
// Definition ausgeben. Erfasst werden die Formen, die in diesem Projekt
// vorkommen — Funktionen, Klassen und als Pfeilfunktion zugewiesene Konstanten,
// jeweils nur am Zeilenanfang (verschachtelte Helfer bleiben aussen vor).
const SYMBOL_MUSTER = /^\s{0,4}(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^\s{0,4}(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)|^\s{0,4}(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]{0,200}\)\s*=>)/gm;

/**
 * Namen der Definitionen in einem Textstueck — fuer den Symbol-Index.
 * @param {string} text
 * @returns {string[]} Namen in Reihenfolge des Auftretens, ohne Doppelte.
 */
export function extrahiereSignaturen(text) {
  const inhalt = String(text ?? "");
  if (!inhalt) return [];
  const namen = [];
  const gesehen = new Set();
  for (const treffer of inhalt.matchAll(SYMBOL_MUSTER)) {
    const name = treffer[1] || treffer[2] || treffer[3];
    if (!name || gesehen.has(name)) continue;
    gesehen.add(name);
    namen.push(name);
  }
  return namen;
}

/** Baut den Index-Text und haelt ihn unter INDEX_MAX_ZEICHEN. */
function indexText(namen) {
  if (namen.length === 0) return "";
  const genommen = [];
  let laenge = 0;
  for (const name of namen.slice(0, INDEX_MAX_SYMBOLE)) {
    const zuwachs = name.length + 2;
    if (laenge + zuwachs > INDEX_MAX_ZEICHEN - 40) break;
    genommen.push(name);
    laenge += zuwachs;
  }
  if (genommen.length === 0) return "";
  const rest = namen.length - genommen.length;
  return ` Darin definiert: ${genommen.join(", ")}${rest > 0 ? ` und ${rest} weitere` : ""}.`;
}

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
  const marke = (fehlt, index) =>
    `\n\n[... ${fehlt} Zeichen ausgelassen.${index} Frage nach, wenn du diesen Teil brauchst ...]\n\n`;
  // Der Index bekommt festen Platz im Budget, nicht obendrauf — sonst wuerde
  // die Diaet ihn selbst wieder auffressen. Bleibt Platz uebrig, weil die Datei
  // wenige Symbole hat, faellt das Ergebnis eben kleiner aus als erlaubt.
  const indexPlatz = grenze >= INDEX_AB_BUDGET ? INDEX_MAX_ZEICHEN : 0;
  const platz = grenze - marke(text.length, "").length - indexPlatz;
  const kopf = Math.max(0, Math.ceil(platz * 0.65));
  const fuss = Math.max(0, platz - kopf);
  const weggelassen = text.length - kopf - fuss;
  // Nur die WEGGELASSENE Mitte indizieren: was in Kopf und Fuss steht, sieht
  // das Modell ohnehin — es zweimal zu nennen waere bezahlter Platz fuer nichts.
  const mitte = text.slice(kopf, fuss > 0 ? text.length - fuss : text.length);
  const index = indexPlatz > 0 ? indexText(extrahiereSignaturen(mitte)) : "";
  return {
    text: `${text.slice(0, kopf)}${marke(weggelassen, index)}${fuss > 0 ? text.slice(-fuss) : ""}`,
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
