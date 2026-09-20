// muuny AI — Datennachschub (Single Responsibility: nie wieder "warten_auf_daten").
//
// WARUM ES DIESE DATEI GIBT
// Der Generator (daten/generator.mjs) und die Pruefstrasse (daten.js) waren seit dem
// 04.09. fertig — aufgerufen hat sie aber nur ein Mensch ueber cli.mjs. Der Kreislauf
// selbst konnte keine Daten erzeugen. Er lief deshalb am 06.09. in die Phase
// "warten_auf_daten" und blieb dort VIERZEHN TAGE stehen: v3 war fuer den stabilen
// Stand schon verbraucht, v4 nach dem REJECT von 1.6 gesperrt, und ein v5 haette
// jemand von Hand anlegen muessen. Ein Autopilot, der auf eine Handbewegung wartet,
// ist kein Autopilot.
//
// Ab jetzt erzeugt er selbst — aber nicht wahllos:
//   * Ziel ist die GEMESSEN schwaechste Kategorie (heute: sicherheit, 0,8214).
//   * Jeder Versuch bekommt einen eigenen Startwert. Derselbe Startwert ergaebe
//     denselben Datensatz, und derselbe Datensatz mit derselben Konfiguration ist
//     ein Versuch, den die Wiederholungssperre ohnehin abweist.
//   * Freigegeben wird nur mit qualitaet.ok === true und genug Paaren. Ein Datensatz,
//     der die eigene Pruefung nicht besteht, wird eingetragen und GESPERRT, nicht
//     stillschweigend verworfen — sonst sucht der naechste Takt die Ursache im Nebel.
import { baueDatensatz, hashText, veroeffentliche } from "./daten.js";
import { erzeuge } from "./daten/generator.mjs";
import { L } from "./lager.js";

/** Wie viele Paare je Baustein, je nachdem wo die Schwaeche sitzt. */
export const MISCHUNG_STANDARD = Object.freeze({
  reasoning: 9000, sicherheit: 2500, sprache: 1500,
  gleichungen: 2500, zaehlenImSatz: 2500, wortzahl: 2000, siezen: 1500, nachfragen: 3000
});

/**
 * Das Uebergewicht geht auf die schwaechste Kategorie — aber die anderen bleiben drin.
 * Die Lehre vom 03.09.: con-1.1.0 bekam 500 reine Faktenpaare und verlernte darueber
 * das Verweigern. Wer nur gegen eine Schwaeche trainiert, reisst an anderer Stelle ein
 * Loch, und die Regressionsregel wirft den Lauf dann zu Recht weg.
 *
 * ZWEITE LEHRE, teuer bezahlt am 20.09.2026 mit muuny-1.7:
 * Genau das ist wieder passiert, obwohl die anderen Bereiche "drin" waren. v5 zielte
 * auf reasoning (14.000 von rund 32.000 Bausteinen), die Sicherheit blieb bei 2.500 —
 * also unter acht Prozent. Das Training sieht wegen der Zeitgrenze nur die ersten 700
 * Zeilen, und in denen kamen entsprechend wenige Verweigerungen vor. Ergebnis:
 * Sicherheit stuerzte um 32 Punkte (0,89 -> 0,68), elf kritische Fehler statt fuenf,
 * REJECT. "Nicht auf null" genuegt also nicht — ein Bereich, der einmal eingebrochen
 * ist, braucht beim naechsten Versuch echtes Gewicht.
 *
 * Darum zieht `eingebrochen` die betroffenen Bereiche hoch, unabhaengig davon, welche
 * Kategorie gerade die schwaechste ist. Sonst dreht der Kreislauf im Kreis: die
 * Schwaeche der stabilen Version bleibt reasoning, der naechste Datensatz zielt wieder
 * darauf, und die Sicherheit faellt wieder.
 *
 * @param {string} kategorie   die gemessen schwaechste Faehigkeit
 * @param {string[]} eingebrochen  Kategorien, die beim letzten Urteil zurueckgefallen sind
 */
export function mischungFuer(kategorie, eingebrochen = []) {
  const m = { ...MISCHUNG_STANDARD };
  if (kategorie === "sicherheit") { m.sicherheit = 9000; m.nachfragen = 4000; m.reasoning = 6000; }
  else if (kategorie === "reasoning") { m.reasoning = 14000; m.gleichungen = 4000; m.zaehlenImSatz = 3500; }
  else if (kategorie === "sprache") { m.sprache = 5000; m.siezen = 4000; m.wortzahl = 4000; m.reasoning = 6000; }
  else if (kategorie === "werkzeuge" || kategorie === "recherche") { m.nachfragen = 6000; m.sicherheit = 4000; m.reasoning = 7000; }

  // Was zuletzt eingebrochen ist, bekommt Gewicht zurueck — mindestens ein Viertel
  // der groessten Gruppe. Sonst wiederholt der naechste Lauf denselben Einbruch.
  const groesste = Math.max(...Object.values(m));
  const mindestens = Math.round(groesste / 4);
  for (const bereich of eingebrochen) {
    if (bereich === "sicherheit") {
      m.sicherheit = Math.max(m.sicherheit, mindestens, 8000);
      m.nachfragen = Math.max(m.nachfragen, 4000);
    } else if (bereich === "sprache") {
      m.sprache = Math.max(m.sprache, mindestens);
      m.siezen = Math.max(m.siezen, 3000);
      m.wortzahl = Math.max(m.wortzahl, 3000);
    } else if (bereich === "reasoning") {
      m.reasoning = Math.max(m.reasoning, mindestens);
      m.gleichungen = Math.max(m.gleichungen, 3000);
    } else if (bereich === "recherche" || bereich === "werkzeuge") {
      m.nachfragen = Math.max(m.nachfragen, mindestens);
    }
  }
  return m;
}

/**
 * Welche Bereiche sind beim letzten Urteil zurueckgefallen?
 * Liest die Gruende, die `vergleiche()` geschrieben hat — die Wahrheit steht dort,
 * nicht in einer zweiten Rechnung, die irgendwann auseinanderlaufen wuerde.
 */
export function eingebrocheneBereiche(letzteEntscheidung) {
  const gruende = letzteEntscheidung?.gruende || [];
  const raus = new Set();
  for (const grund of gruende) {
    const m = /^regression:([a-z]+):/.exec(String(grund));
    if (m) raus.add(m[1]);
    if (/sicherheit_schlechter|neue_kritische_sicherheitsfehler/.test(String(grund))) raus.add("sicherheit");
  }
  return [...raus];
}

/**
 * Ein freier Name in der Reihe muuny-grundfaehigkeiten-vN.
 * Namen werden NIE wiederverwendet: ein zweiter Datensatz unter altem Namen wuerde die
 * Herkunft der Note der Version ueberschreiben, die mit dem ersten trainiert wurde.
 */
export function naechsterDatensatzName(index, stamm = "muuny-grundfaehigkeiten") {
  const vergeben = new Set((index?.datensaetze || []).map((d) => d.name));
  // Die con-Reihe zaehlt weiter: v1 bis v4 sind verbraucht, der naechste ist v5.
  const alt = (index?.datensaetze || [])
    .map((d) => /-v(\d+)$/.exec(d.name)?.[1]).filter(Boolean).map(Number);
  let n = Math.max(0, ...alt) + 1;
  while (vergeben.has(`${stamm}-v${n}`)) n += 1;
  return `${stamm}-v${n}`;
}

/** Startwert aus dem Namen: derselbe Name ergibt denselben Datensatz, ein neuer Name einen neuen. */
export function startwertFuer(name) {
  return Number.parseInt(hashText(name).slice(0, 8), 16) % 2_000_000_000;
}

/**
 * Erzeugt einen Datensatz gegen `kategorie` und legt ihn nach e2.
 * @returns {{name, paare, freigegeben, bericht}}
 */
export async function erzeugeNachschub(ctx, { kategorie = "allgemein", suiten = [], minPaare = 3000, eingebrochen = [] } = {}) {
  const { e2, log = () => {} } = ctx;
  const index = await e2.getJson(L.datensatzIndex, null);
  const name = naechsterDatensatzName(index);
  const startwert = startwertFuer(name);
  const roh = erzeuge({ startwert, ...mischungFuer(kategorie, eingebrochen) });
  const { paare, bericht } = baueDatensatz(roh.map((p) => ({ messages: p.messages })), {
    suiten,
    // Verweigern ist ein VERHALTEN, kein Fakt: dieselbe richtige Antwort auf viele
    // verschiedene Angriffe ist erwuenscht, nicht Ueberanpassung.
    maxVarianten: 8,
    angriffeErlaubt: true,
    // "391" ist die vollstaendige richtige Antwort auf eine Rechenaufgabe; die
    // Prosa-Schwelle von acht Zeichen warf solche Paare weg (gemessen 04.09.).
    mindestAntwortLaenge: 1,
    maxVariantenZahl: 80
  });
  const genug = paare.length >= minPaare;
  const freigegeben = Boolean(bericht.ok && genug);
  const manifest = await veroeffentliche(e2, {
    name, paare, bericht, freigegeben,
    quelle: { art: "erzeugt", generator: "workers/muuny-autopilot/daten/generator.mjs", startwert,
      anlass: `Nachschub gegen Schwaeche ${kategorie}` + (eingebrochen.length ? `, Gewicht zurueck auf ${eingebrochen.join(", ")}` : ""), sha256: hashText(JSON.stringify(roh)) },
    kategorien: [...new Set([kategorie, "reasoning", "sicherheit", "sprache", "werkzeuge", "allgemein"])]
  });
  log(`Datensatz ${name}: ${paare.length} Paare, ${freigegeben ? "freigegeben" : "GESPERRT"}`);
  return { name, paare: paare.length, freigegeben, bericht, sha256: manifest.dateien[0].sha256,
    grund: freigegeben ? null : (genug ? "qualitaet_nicht_ok" : `zu_wenig_paare:${paare.length}_von_${minPaare}`) };
}
