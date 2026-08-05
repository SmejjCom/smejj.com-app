// smejj.com — Projektwissen aus der eigenen Dokumentation zu Trainingszeilen
// (Single Responsibility: Markdown-Abschnitt -> Frage/Antwort-Paar).
//
// WARUM DIESES MODUL DER EIGENTLICHE HEBEL IST:
// Von den 14 Faellen in evals/suites/smejj-chat-core-v1.json pruefen etwa neun
// projektspezifisches Wissen und projektspezifisches Verweigern. Kein offener
// Datensatz der Welt enthaelt das LCP-Budget von smejj.com oder die
// 800-Zeilen-Regel. Diese Punkte sind nur ueber Erstpartei-Wissen erreichbar.
//
// DIE POLICY-FALLE, DIE HIER GELOEST WIRD:
// Der naheliegende Weg waere, ein Sprachmodell Frage/Antwort-Paare aus der
// Dokumentation formulieren zu lassen. Das ist verboten.
// SMEJJ_1_0_TRAINING_DATA_POLICY.md sperrt "Rohantworten ... von Z.ai-, Kimi-
// oder anderen Provider-APIs" — und der Assistent, der diesen Code schreibt,
// IST ein solches Modell. Von ihm formulierte Antworten waeren Distillation
// aus einem Fremdmodell, unabhaengig davon, wie gut sie klingen.
//
// Deshalb ist die Extraktion streng deterministisch und rein mechanisch:
//   - Die ANTWORT ist ein woertlicher Abschnitt aus der Dokumentation des
//     Betreibers. Kein Wort wird umformuliert, gekuerzt oder ergaenzt.
//   - Die FRAGE wird aus der Ueberschrift DESSELBEN Dokuments gebildet, nach
//     festen Schablonen. Auch die Ueberschrift ist Text des Betreibers.
// Es entsteht kein einziges Token, das aus einem Modell stammt.

import crypto from "node:crypto";

/** Abschnitte unter dieser Laenge tragen kein Wissen und wuerden nur rauschen. */
const MIN_ANTWORT_ZEICHEN = 80;
/** Deckel je Antwort. Laengere Abschnitte werden an einer Absatzgrenze beendet. */
const MAX_ANTWORT_ZEICHEN = 1200;
const MIN_UEBERSCHRIFT_ZEICHEN = 8;

/**
 * Fragen-Schablonen. Rein mechanisch: sie verwandeln die Ueberschrift in eine
 * Frage, ohne Inhalt hinzuzufuegen. Mehrere Formen je Abschnitt, damit das
 * Modell nicht auf eine einzige Formulierung konditioniert wird.
 *
 * Am 2026-08-05 von 3 auf 15 Formen erweitert (Betreiber-Freigabe im Chat,
 * Auftrag PROMPT_TRAINING_KORPUS_BLOCKER.md): drei starre Formen erzeugten
 * einen Verteilungsbruch gegen die 295 natuerlichen Fragen der Pruefsuite —
 * das Modell lernte "auf eine Ueberschrift den Abschnitt aufsagen" und wurde
 * MESSBAR schlechter (95,88 % -> 67,89 %). Die neuen Formen variieren Laenge
 * und Perspektive (Ich-Frage, Verbots-, Erlaubnisfrage, Szenario, englisch).
 * Die englische Form trainiert den Suite-Fall antwortsprache-deutsch:
 * englische Frage, deutsche Antwort.
 * Bewusst KEINE Folgenfragen ("Was passiert, wenn ..."): die woertliche
 * Abschnitts-Antwort beantwortet sie oft nicht — das waere der naechste
 * Verteilungsbruch.
 */
export const FRAGE_SCHABLONEN = Object.freeze([
  (t) => `Was gilt bei smejj.com zum Thema ${t}?`,
  (t) => `Erklaere kurz: ${t}`,
  (t) => `${t} — was ist dazu im Projekt festgelegt?`,
  (t) => `Welche Regeln gelten bei smejj.com fuer ${t}?`,
  (t) => `Ich arbeite gerade an ${t} — was muss ich beachten?`,
  (t) => `Darf ich bei ${t} einfach loslegen, oder gibt es Vorgaben?`,
  (t) => `Was ist bei smejj.com zu ${t} verboten oder eingeschraenkt?`,
  (t) => `Worauf muss ich bei ${t} achten?`,
  (t) => `Gib mir die wichtigsten Punkte zu ${t}.`,
  (t) => `Ein neues Teammitglied fragt nach ${t} — was gilt?`,
  (t) => `Wie ist ${t} bei smejj.com geregelt?`,
  (t) => `Kannst du mir kurz sagen, was zum Thema ${t} festgelegt ist?`,
  (t) => `${t} bei smejj.com — bitte kurz erklaeren.`,
  (t) => `What are the rules for ${t} at smejj.com?`,
  (t) => `Quick question: ${t} — was gilt?`
]);

/**
 * Zerlegt ein Markdown-Dokument in Abschnitte.
 * Ein Abschnitt ist eine Ueberschrift plus der Text bis zur naechsten
 * Ueberschrift gleicher oder hoeherer Ebene.
 *
 * Neben #-Ueberschriften werden `====`-gerahmte Titel erkannt
 * (Zeile aus Gleichheitszeichen, Titelzeile, Zeile aus Gleichheitszeichen) —
 * die Gliederungsform von MASTER_PROMPT.md. Gemessen am 2026-08-05: keine
 * einzige Bestandsquelle enthaelt solche Zeilen, die Erkennung ist darum
 * regressionsfrei immer aktiv.
 *
 * `optionen.textZaeuneTransparent` behandelt ```text-Zaeune als Prosa statt
 * als Code (MASTER_PROMPT.md traegt seinen gesamten Inhalt in einem
 * Kopier-Zaun). Bewusst opt-in je Datei: 24 Bestandsquellen nutzen
 * ```text fuer Beispielausgaben, die weiterhin Code bleiben muessen.
 * Nur innerhalb eines transparenten Zauns gelten zwei Zusatzformen:
 * GROSSBUCHSTABEN-Zeilen mit Doppelpunkt am Ende und `N)`-Eintraege.
 */
export function zerlegeMarkdown(text, optionen = {}) {
  const transparentErlaubt = optionen.textZaeuneTransparent === true;
  const zeilen = String(text || "").split(/\r?\n/);
  const abschnitte = [];
  let aktuell = null;
  let inCodeblock = false;
  let inTransparentZaun = false;

  const beginne = (ebene, ueberschrift) => {
    if (aktuell) abschnitte.push(aktuell);
    aktuell = { ebene, ueberschrift: String(ueberschrift).trim(), zeilen: [] };
  };

  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];

    if (/^```/.test(zeile)) {
      if (inTransparentZaun) { inTransparentZaun = false; continue; }
      if (!inCodeblock && transparentErlaubt && /^```text\s*$/.test(zeile)) {
        inTransparentZaun = true;
        continue;
      }
      inCodeblock = !inCodeblock;
      if (aktuell) aktuell.zeilen.push(zeile);
      continue;
    }

    if (!inCodeblock) {
      const md = /^(#{1,6})\s+(.+?)\s*$/.exec(zeile);
      if (md) { beginne(md[1].length, md[2]); continue; }

      const rahmen = /^={4,}\s*$/.test(zeile)
        && i + 2 < zeilen.length
        && zeilen[i + 1].trim().length > 0
        && !/^={4,}\s*$/.test(zeilen[i + 1])
        && /^={4,}\s*$/.test(zeilen[i + 2]);
      if (rahmen) { beginne(2, zeilen[i + 1]); i += 2; continue; }

      if (inTransparentZaun) {
        const caps = /:$/.test(zeile.trim()) && istGrossToken(zeile.trim().split(/\s+/)[0]);
        if (caps) { beginne(3, zeile.trim().replace(/:$/, "")); continue; }
        const nummer = /^(\d{1,2})\)\s+(.{4,})$/.exec(zeile);
        if (nummer) { beginne(3, nummer[2]); continue; }
      }
    }

    if (aktuell) aktuell.zeilen.push(zeile);
  }
  if (aktuell) abschnitte.push(aktuell);
  return abschnitte;
}

/** Erstes Wort einer Gliederungszeile: mindestens 4 Zeichen, alle gross. */
function istGrossToken(token) {
  return /^[A-Z0-9ÄÖÜ][A-Z0-9ÄÖÜ\-]{3,}$/.test(String(token || ""));
}

/**
 * Bereinigt Markdown-Auszeichnung zu Fliesstext, OHNE den Wortlaut zu aendern.
 * Entfernt werden nur Auszeichnungszeichen (Sterne, Backticks, Linkklammern),
 * nie Woerter. Tabellen und Codebloecke werden verworfen statt verstuemmelt:
 * eine halb entstellte Tabelle waere schlechteres Trainingsmaterial als keine.
 */
export function zuFliesstext(zeilen) {
  const behalten = [];
  let inCodeblock = false;
  for (const zeile of zeilen) {
    if (/^```/.test(zeile)) { inCodeblock = !inCodeblock; continue; }
    if (inCodeblock) continue;
    if (/^\s*\|/.test(zeile)) continue;
    behalten.push(zeile);
  }
  return behalten
    .join("\n")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Kuerzt an einer Absatz- oder Satzgrenze, nie mitten im Wort. */
function kuerze(text, max) {
  if (text.length <= max) return text;
  const schnitt = text.slice(0, max);
  const absatz = schnitt.lastIndexOf("\n\n");
  if (absatz > max * 0.4) return schnitt.slice(0, absatz).trim();
  const satz = Math.max(schnitt.lastIndexOf(". "), schnitt.lastIndexOf(".\n"));
  return (satz > max * 0.4 ? schnitt.slice(0, satz + 1) : schnitt).trim();
}

/**
 * Baut aus einem Dokument die Trainingszeilen.
 *
 * @param {object} eingabe
 * @param {string} eingabe.pfad     Repository-relativer Pfad (wird zur Familie)
 * @param {string} eingabe.inhalt   Markdown-Rohtext
 * @param {string} eingabe.systemText Systemzeile, woertlich aus der Suite-Konvention
 * @param {object} [eingabe.optionen] Durchgereicht an zerlegeMarkdown (z. B. textZaeuneTransparent)
 * @returns {object[]} Zeilen im Format, das corpus.js#baueKorpusRecord erwartet
 */
export function zeilenAusDokument({ pfad, inhalt, systemText, optionen }) {
  const zeilen = [];
  for (const abschnitt of zerlegeMarkdown(inhalt, optionen || {})) {
    const ueberschrift = abschnitt.ueberschrift.replace(/[#*`]/g, "").trim();
    if (ueberschrift.length < MIN_UEBERSCHRIFT_ZEICHEN) continue;

    const koerper = kuerze(zuFliesstext(abschnitt.zeilen), MAX_ANTWORT_ZEICHEN);
    if (koerper.length < MIN_ANTWORT_ZEICHEN) continue;

    for (const [index, schablone] of FRAGE_SCHABLONEN.entries()) {
      zeilen.push({
        id: `${pfad}#${abschnitt.ebene}-${slug(ueberschrift)}-${index}`,
        // Familie ist die DATEI, nicht der Abschnitt: alle Varianten desselben
        // Dokuments muessen im selben Split landen, sonst prueft der Testteil
        // Wissen, das der Trainingsteil woertlich enthielt.
        gruppe: pfad,
        // Erstpartei-Dokumentation ist per Definition nicht maschinell erzeugt.
        // Das Feld ist trotzdem gesetzt, weil das Tor in licenses.js ein
        // ausdrueckliches false verlangt und ein fehlendes Feld sperrt.
        synthetic: false,
        messages: [
          { role: "system", content: systemText },
          { role: "user", content: schablone(ueberschrift) },
          { role: "assistant", content: koerper }
        ]
      });
    }
  }
  return zeilen;
}

function slug(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)
    || crypto.createHash("sha256").update(text).digest("hex").slice(0, 8);
}
