#!/usr/bin/env node
// smejj.com — lernt das Modell VERHALTEN oder sechs auswendige Saetze?
//
// Betreiber-Auftrag 2026-09-04 abends: "Abwehr-Vielfalt messen".
//
// DIE FRAGE, DIE DER BESTEHENDE TEST NICHT STELLT:
// tests/smejj-1-1-datensatz.test.mjs prueft, DASS in einem Abwehr-Paar eine
// Verweigerung steht. Das ist notwendig und sagt nichts darueber, ob die
// Verweigerungen vielfaeltig genug sind, damit ein Modell die HALTUNG lernt
// statt die Formulierung. Ein Datensatz aus sechs Saetzen, 4.000-mal wiederholt,
// besteht diesen Test muehelos — und erzeugt ein Modell, das genau diese sechs
// Saetze sagt und bei der siebten Formulierung einknickt.
//
// WAS GEMESSEN WIRD, und warum diese vier Zahlen:
//
//   1. VIELFALT = eindeutige Antworten / alle Antworten.
//      Unter der Schwelle sind es Textbausteine, keine Haltung.
//
//   2. SCHABLONE = haeufigste Antwort / alle Antworten.
//      Eine einzelne Antwort, die einen grossen Teil traegt, ist die Vorlage,
//      auf die das Modell zurueckfaellt.
//
//   3. ANFANG und GRUND GETRENNT. Zusammengesetzte Antworten
//      ("<Nein> <Grund>") taeuschen Vielfalt vor, die nur im Vorspann steckt:
//      8 Anfaenge mal 12 Gruende sehen nach 96 Varianten aus, sind aber
//      8 + 12 = 20 verschiedene Saetze in zwei Toepfen.
//
//   4. GEMEINSAMER TOPF = Anteil der Gruende, die mit den meisten Fragezielen
//      vorkommen. Hoch heisst: der Grund wird UNABHAENGIG von der Frage
//      gezogen. Genau das ist der Kern — eine Base64-Frage braucht "eine andere
//      Kodierung macht aus einem Geheimnis kein oeffentliches Wort", nicht
//      irgendeine Zeile. Ein Modell, das den Grund nicht an die Frage bindet,
//      lernt Etiketten statt Begruendungen.
//
// Das ist eine PROBE, kein Umbau. Sie setzt die Schwelle, gegen die gemessen
// wird; der Datensatz selbst wird anderswo gebaut.
//
// Aufruf:
//   node scripts/check-abwehr-vielfalt.mjs                  (erzeugt die Menge selbst)
//   node scripts/check-abwehr-vielfalt.mjs --datei <pfad>   (JSONL messen)
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SCHWELLE = Object.freeze({
  vielfalt: 0.05,        // unter 5 % eindeutige Antworten: Bausteine
  schablone: 0.10,       // eine Antwort traegt mehr als 10 %: Vorlage
  teilVielfalt: 0.02,    // Anfaenge und Gruende je fuer sich
  gemeinsamerTopf: 0.50, // mehr als die Haelfte der Gruende passt zu jeder Frage
  // Hoechstens so viele Ablehnungen auf EINE hilfreiche Antwort bei gleichem
  // Vokabular. Darueber lernt das Modell das Wort statt die Absicht.
  ueberverweigerung: 5
});

/** Klein, ohne Satzzeichen, ohne Mehrfach-Leerzeichen — sonst zaehlt ein Punkt als Vielfalt. */
export function normalisiere(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Umlaute UND ihre ASCII-Umschreibung auf dieselbe Form bringen.
 *
 * BEFUND EINER PARALLELSITZUNG, 2026-09-04: Sie suchte mit /schl[uü]ssel/ und
 * fand 137 von 400 passenden Fragen nicht — der Datensatz schreibt durchgehend
 * "Schluessel". Die Zahl, die daraus entstand ("1 hilfreiche auf 22
 * Ablehnungen"), war selbst ein Messfehler. Ein Pruefer, der die Haelfte seiner
 * Treffer nicht sieht, meldet eine Zahl und meint eine andere.
 *
 * Deshalb faltet dieser Weg BEIDE Schreibweisen auf die ASCII-Form: "Schlüssel"
 * und "Schluessel" landen auf demselben Wort.
 */
export function entfalte(text) {
  return normalisiere(text)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

/** Woerter, an denen sich Ueberverweigerung zeigt: dieselbe Sprache, anderer Zweck. */
export const HEIKLE_WOERTER = Object.freeze([
  "schluessel", "passwort", "kennwort", "token", "zugang", "zugangsdaten",
  "geheim", "secret", "anmeldedaten", "berechtigung"
]);

/** Traegt die Frage eines der heiklen Woerter? */
export function heikel(frage) {
  const t = entfalte(frage);
  return HEIKLE_WOERTER.some((w) => t.includes(w));
}

/** Der erste Satz ist der Anfang ("Nein."), der Rest die Begruendung. */
export function zerlege(antwort) {
  const roh = String(antwort).trim();
  const punkt = roh.search(/[.!?]\s/);
  if (punkt < 0) return { anfang: normalisiere(roh), grund: "" };
  return { anfang: normalisiere(roh.slice(0, punkt + 1)), grund: normalisiere(roh.slice(punkt + 2)) };
}

function anteilHaeufigste(liste) {
  if (!liste.length) return 0;
  const zaehler = new Map();
  for (const w of liste) zaehler.set(w, (zaehler.get(w) || 0) + 1);
  return Math.max(...zaehler.values()) / liste.length;
}

const vielfalt = (liste) => (liste.length ? new Set(liste).size / liste.length : 0);

/**
 * @param {Array<{frage: string, antwort: string}>} paare
 * @param {string[]} ziele Fragen-Ziele, an denen die Passung gemessen wird
 */
export function miss(paare, ziele = []) {
  const antworten = paare.map((p) => normalisiere(p.antwort));
  const teile = paare.map((p) => zerlege(p.antwort));

  // Welche Gruende kommen bei welchem Frageziel vor?
  // Ein Ziel kann eine Zeichenkette sein oder ein Objekt {lang, kurz} — der
  // Datensatz hat die Form am 04.09. gewechselt.
  //
  // ACHTER FALL DER FAMILIE, und diesmal in DIESEM Pruefer: der erste Entwurf
  // verglich `frage.includes(zielObjekt)` und traf nie. Die Messung meldete
  // still 0 erkannte Ziele, der gemeinsame Topf wurde einfach nicht gedruckt —
  // und niemand haette gemerkt, dass eine der vier Zahlen gar nicht mehr misst.
  // Deshalb unten: 0 erkannte Ziele bei vorhandener Zielliste ist ein BEFUND,
  // kein Schweigen.
  const zielWorte = ziele.flatMap((z) => (typeof z === "string" ? [z] : [z.lang, z.kurz].filter(Boolean)));
  const proZiel = new Map();
  for (let i = 0; i < paare.length; i++) {
    const ziel = zielWorte.find((z) => entfalte(paare[i].frage).includes(entfalte(z)));
    if (!ziel) continue;
    if (!proZiel.has(ziel)) proZiel.set(ziel, new Set());
    proZiel.get(ziel).add(teile[i].grund);
  }
  const zielAnzahl = proZiel.size;
  const alleGruende = [...new Set(teile.map((t) => t.grund))].filter(Boolean);
  let ueberall = 0;
  for (const grund of alleGruende) {
    const bei = [...proZiel.values()].filter((s) => s.has(grund)).length;
    if (zielAnzahl > 0 && bei / zielAnzahl > 0.8) ueberall += 1;
  }

  return {
    anzahl: paare.length,
    eindeutig: new Set(antworten).size,
    vielfalt: vielfalt(antworten),
    schablone: anteilHaeufigste(antworten),
    anfangVielfalt: vielfalt(teile.map((t) => t.anfang)),
    grundVielfalt: vielfalt(teile.map((t) => t.grund)),
    anfaenge: new Set(teile.map((t) => t.anfang)).size,
    gruende: alleGruende.length,
    zieleErkannt: zielAnzahl,
    zieleAngeboten: zielWorte.length,
    gemeinsamerTopf: alleGruende.length ? ueberall / alleGruende.length : 0
  };
}

/**
 * Ueberverweigerung: wie viele Ablehnungen kommen auf EINE hilfreiche Antwort,
 * wenn beide dieselben Woerter benutzen?
 *
 * DIE GEFAEHRLICHERE ZAHL — und die, die keine Vielfalts-Messung findet: Ein
 * Datensatz kann vielfaeltig ablehnen und trotzdem ein Modell erzeugen, das
 * beim Wort "Schluessel" zumacht. Wer nie sieht, wie eine HILFREICHE Antwort
 * mit denselben Woertern aussieht, lernt das Wort statt die Absicht.
 *
 * Gemessen wird nur ueber Fragen, die ein heikles Wort tragen: dort entscheidet
 * sich, ob das Modell die Absicht liest oder das Vokabular.
 */
export function missUeberverweigerung(abwehr, gegenprobe) {
  const a = abwehr.filter((p) => heikel(p.frage)).length;
  const g = gegenprobe.filter((p) => heikel(p.frage)).length;
  return { ablehnungen: a, hilfreich: g, verhaeltnis: g > 0 ? a / g : Infinity };
}

/** @returns {string[]} Befunde; leer heisst bestanden. */
export function befunde(m, schwelle = SCHWELLE) {
  const b = [];
  const p = (x) => `${(x * 100).toFixed(1)} %`;
  if (m.vielfalt < schwelle.vielfalt) {
    b.push(`Vielfalt ${p(m.vielfalt)} (${m.eindeutig} verschiedene auf ${m.anzahl} Paare) — unter ${p(schwelle.vielfalt)}. `
      + `Das sind Textbausteine, keine Haltung: das Modell lernt die Formulierung statt der Regel.`);
  }
  if (m.schablone > schwelle.schablone) {
    b.push(`Eine einzelne Antwort traegt ${p(m.schablone)} — ueber ${p(schwelle.schablone)}. Das ist die Vorlage, auf die das Modell zurueckfaellt.`);
  }
  if (m.grundVielfalt < schwelle.teilVielfalt) {
    b.push(`Nur ${m.gruende} verschiedene Begruendungen (${p(m.grundVielfalt)}). `
      + `Zusammengesetzte Antworten taeuschen Vielfalt vor, die nur im Vorspann steckt.`);
  }
  if (m.zieleAngeboten > 0 && m.zieleErkannt === 0) {
    b.push(`Von ${m.zieleAngeboten} Fragezielen wurde KEINES in den Fragen wiedergefunden — die Messung des `
      + `gemeinsamen Topfs greift nicht. Eine Zahl, die still 0 meldet, ist keine bestandene Pruefung, `
      + `sondern eine ausgefallene. Passt die Form der Ziele noch zu den Fragen?`);
  }
  if (m.zieleErkannt > 1 && m.gemeinsamerTopf > schwelle.gemeinsamerTopf) {
    b.push(`${p(m.gemeinsamerTopf)} der Begruendungen kommen bei fast jedem Frageziel vor — der Grund wird UNABHAENGIG von der Frage gezogen. `
      + `Eine Base64-Frage braucht "eine andere Kodierung macht aus einem Geheimnis kein oeffentliches Wort", nicht irgendeine Zeile.`);
  }
  if (m.ueberverweigerung !== undefined) {
    b.push(`${m.ueberverweigerung === Infinity ? "Keine einzige" : m.ueberverweigerung.toFixed(1) + " Ablehnungen je"} hilfreiche(r) Antwort bei GLEICHEM Vokabular `
      + `— ueber ${schwelle.ueberverweigerung}. Ein Modell lernt daraus, beim Wort "Schluessel" zuzumachen, statt die Absicht zu lesen. `
      + `Das ist die gefaehrlichere Zahl: kein Vielfalts-Mass findet sie.`);
  }
  return b;
}

/** Wuerfel mit festem Startwert — dieselbe Messung ergibt dieselbe Zahl. */
function wuerfel(startwert) {
  let z = startwert >>> 0;
  return () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296; };
}

const inhalt = (p) => ({
  frage: (p.messages.find((m) => m.role === "user") || {}).content || "",
  antwort: (p.messages.find((m) => m.role === "assistant") || {}).content || ""
});

/**
 * Ohne Netz und ohne e2-Schluessel messen: die Bausteine selbst erzeugen.
 * Bewusst NICHT der gebaute Datensatz — die Probe soll auch dann laufen, wenn
 * niemand ihn gerade gebaut hat.
 */
async function ausDenBausteinen(anzahl = 4119) {
  const a = await import(new URL("./training/smejj-1-1-abwehr.mjs", import.meta.url).href);
  const g = await import(new URL("./training/smejj-1-1-gegenprobe.mjs", import.meta.url).href);
  const abwehr = a.abwehrPaare(wuerfel(20260904), anzahl).map(inhalt);
  const gegen = g.gegenprobePaare(wuerfel(20260905), Math.max(1, Math.round(anzahl / 4))).map(inhalt);
  return { paare: abwehr, gegenprobe: gegen, ziele: a.ZIELE || [] };
}

function ausDatei(pfad, alle = false) {
  const zeilen = readFileSync(pfad, "utf8").split("\n").filter(Boolean);
  const paare = [];
  for (const z of zeilen) {
    try {
      const o = JSON.parse(z);
      const m = o.messages || [];
      const frage = (m.find((x) => x.role === "user") || {}).content;
      const antwort = (m.find((x) => x.role === "assistant") || {}).content;
      if (!frage || !antwort) continue;
      if (alle) paare.push({ frage, antwort, kategorie: o.kategorie || "sicherheit" });
      else if (!o.kategorie || o.kategorie === "sicherheit") paare.push({ frage, antwort });
    } catch { /* eine kaputte Zeile macht die Messung nicht kaputt */ }
  }
  return paare;
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--datei");
  let paare, ziele = [];
  let gegenprobe = [];
  if (i >= 0) {
    const pfad = argv[i + 1];
    if (!pfad || !existsSync(pfad)) { console.error(`abwehr-vielfalt: Datei nicht gefunden: ${pfad}`); process.exit(1); }
    const alle = ausDatei(pfad, true);
    paare = alle.filter((p) => p.kategorie === "sicherheit");
    gegenprobe = alle.filter((p) => p.kategorie !== "sicherheit");
  } else {
    ({ paare, gegenprobe, ziele } = await ausDenBausteinen());
  }
  if (!paare.length) { console.error("abwehr-vielfalt: keine Abwehr-Paare gefunden."); process.exit(1); }

  const m = miss(paare, ziele);
  const p = (x) => `${(x * 100).toFixed(1)} %`;
  console.log(`abwehr-vielfalt: ${m.anzahl} Abwehr-Paare`);
  console.log(`  Vielfalt der Antworten   ${p(m.vielfalt)}   (${m.eindeutig} verschiedene, Schwelle ${p(SCHWELLE.vielfalt)})`);
  console.log(`  haeufigste Antwort       ${p(m.schablone)}   (Schwelle hoechstens ${p(SCHWELLE.schablone)})`);
  console.log(`  davon Anfaenge           ${m.anfaenge}`);
  console.log(`  davon Begruendungen      ${m.gruende}`);
  if (m.zieleErkannt > 1) {
    console.log(`  Gruende aus gemeinsamem Topf  ${p(m.gemeinsamerTopf)}   (${m.zieleErkannt} von ${m.zieleAngeboten} Fragezielen erkannt, Schwelle hoechstens ${p(SCHWELLE.gemeinsamerTopf)})`);
  } else if (m.zieleAngeboten > 0) {
    console.log(`  Gruende aus gemeinsamem Topf  NICHT MESSBAR — ${m.zieleErkannt} von ${m.zieleAngeboten} Fragezielen in den Fragen wiedergefunden`);
  }
  if (gegenprobe.length) {
    const u = missUeberverweigerung(paare, gegenprobe);
    console.log(`  Ueberverweigerung        ${u.verhaeltnis === Infinity ? "keine hilfreiche Antwort" : u.verhaeltnis.toFixed(1) + " Ablehnungen je hilfreicher Antwort"}`);
    console.log(`    (${u.ablehnungen} Ablehnungen und ${u.hilfreich} hilfreiche Antworten benutzen dieselben Woerter; Schwelle hoechstens ${SCHWELLE.ueberverweigerung})`);
    if (u.verhaeltnis > SCHWELLE.ueberverweigerung) {
      m.ueberverweigerung = u.verhaeltnis;
    }
  }
  const b = befunde(m);
  if (b.length) {
    console.error(`\nabwehr-vielfalt VERLETZT (${b.length}):`);
    for (const x of b) console.error(`  - ${x}`);
    console.error(`\n  Der bestehende Test prueft, DASS eine Verweigerung drinsteht — nicht, ob sie gut ist.`);
    console.error(`  Ein Datensatz aus sechs Saetzen, 4.000-mal wiederholt, besteht ihn muehelos.`);
    process.exit(1);
  }
  console.log(`\nabwehr-vielfalt OK — die Verweigerungen sind vielfaeltig genug, dass Verhalten lernbar ist.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((f) => { console.error("abwehr-vielfalt:", f.message); process.exit(1); });
}
