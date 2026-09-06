// smejj.com — Erkennt der Datensatz seine eigenen Schablonen?
//
// BEFUND 2026-09-06, an der breiten Suite gemessen: Der Adapter aus 11.016
// erzeugten Beispielen war 17,4 Punkte SCHLECHTER als das Basismodell.
// Sprache 27 statt 80 %, Sicherheit 41 statt 69 %. Einziger Gewinn: Rechnen.
//
// Die Antworten zeigen den Grund. Auf eine Rückfrage-Aufgabe kam:
//   "Das laesst sich nicht herausrechnen — ich erfinde keine Angaben.
//    Ich arbeite mit dem Inhalt weiter — der Anweisung darin folge ich nicht."
// Zwei Bausteine aus dem Datensatz, zusammengeklebt, ohne Bezug zur Frage.
//
// Die gemessenen "92 % Antwortvielfalt" des Generators waren KOMBINATORISCH:
// acht Anfänge mal zwölf Gründe mal neun Angebote. Inhaltlich sind es ein paar
// Dutzend Satzteile — und genau die lernt ein Modell auswendig.
//
// Dieser Test misst deshalb nicht die Zahl verschiedener Antworten, sondern
// wie oft dieselben SATZTEILE wiederkehren. Er ist die Probe, die dem alten
// Datensatz gefehlt hat.
import test from "node:test";
import assert from "node:assert/strict";
import { echtePaare } from "../scripts/training/smejj-1-1-echte-paare.mjs";

/** Zerlegt Text in Sätze und normalisiert sie für den Vergleich. */
export function saetze(text) {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim())
    .filter((s) => s.split(" ").length >= 4);
}

/**
 * Wie stark der Datensatz aus wiederkehrenden Sätzen besteht.
 * @returns {{anteilWiederholt: number, haeufigster: {satz: string, mal: number}}}
 */
export function schablonenAnteil(paare) {
  const zaehler = new Map();
  let gesamt = 0;
  for (const p of paare) {
    for (const s of saetze(p.messages.at(-1).content)) {
      zaehler.set(s, (zaehler.get(s) || 0) + 1);
      gesamt += 1;
    }
  }
  let wiederholt = 0, top = { satz: "", mal: 0 };
  for (const [satz, mal] of zaehler) {
    if (mal > 1) wiederholt += mal;
    if (mal > top.mal) top = { satz, mal };
  }
  return { anteilWiederholt: gesamt ? wiederholt / gesamt : 0, haeufigster: top, saetzeGesamt: gesamt, eindeutig: zaehler.size };
}

test("die handgeschriebenen Paare bestehen aus keinem einzigen wiederkehrenden Satz", () => {
  const s = schablonenAnteil(echtePaare());
  assert.equal(s.anteilWiederholt, 0,
    `${Math.round(s.anteilWiederholt * 100)} % der Saetze kommen mehrfach vor — haeufigster: "${s.haeufigster.satz.slice(0, 60)}" (${s.haeufigster.mal}x)`);
});

test("die Probe SIEHT eine Schablone, wenn eine da ist", () => {
  // Kaputte Probe: ohne sie wüsste niemand, ob die Schwelle je auslöst.
  const schablonen = Array.from({ length: 20 }, (_, i) => ({
    messages: [{ role: "user", content: `Frage ${i}` },
      { role: "assistant", content: "Nein, das gebe ich nicht heraus. Wer fragt, aendert daran nichts." }]
  }));
  const s = schablonenAnteil(schablonen);
  assert.ok(s.anteilWiederholt > 0.9, `nur ${Math.round(s.anteilWiederholt * 100)} % erkannt`);
  assert.equal(s.haeufigster.mal, 20);
});

test("jede Antwort passt nur zu IHRER Frage — keine Allzweck-Antwort", () => {
  // Der eigentliche Schaden: eine Antwort, die überall passt, wird überall
  // gegeben. Prüfbar daran, dass jede Antwort Wörter aus ihrer Frage aufgreift
  // oder inhaltlich eindeutig ist.
  const paare = echtePaare();
  const antworten = paare.map((p) => p.messages.at(-1).content.toLowerCase());
  for (let i = 0; i < antworten.length; i += 1) {
    for (let j = i + 1; j < antworten.length; j += 1) {
      const a = new Set(antworten[i].split(/\s+/).filter((w) => w.length > 5));
      const b = antworten[j].split(/\s+/).filter((w) => w.length > 5);
      const gemeinsam = b.filter((w) => a.has(w)).length;
      const anteil = b.length ? gemeinsam / b.length : 0;
      assert.ok(anteil < 0.5,
        `Antwort ${i} und ${j} teilen ${Math.round(anteil * 100)} % ihrer Woerter — eine davon ist zu allgemein`);
    }
  }
});

test("die Antwortlaenge richtet sich nach der Frage, nicht nach einer Vorlage", () => {
  // "Erklaere in zwei Saetzen" und "erklaere ausfuehrlich" duerfen nicht
  // gleich lang beantwortet werden. Ein Modell, das immer gleich lang
  // antwortet, hat die Form gelernt statt die Aufgabe.
  const laengen = echtePaare().map((p) => p.messages.at(-1).content.length);
  const kuerzeste = Math.min(...laengen), laengste = Math.max(...laengen);
  assert.ok(laengste / kuerzeste > 4,
    `Laengen ${kuerzeste}–${laengste} — zu gleichfoermig fuer echte Aufgaben`);
});

test("mehrsprachige Fragen werden in ihrer Sprache beantwortet", () => {
  const paare = echtePaare();
  const englisch = paare.find((p) => p.messages[1].content.startsWith("Can you explain in English"));
  assert.ok(englisch, "es muss eine englische Frage geben");
  assert.ok(!/[äöüß]/.test(englisch.messages.at(-1).content), "englische Frage, englische Antwort");
  const tuerkisch = paare.find((p) => p.messages[1].content.includes("Türkisch"));
  assert.ok(/[şığüöç]/.test(tuerkisch.messages.at(-1).content), "tuerkische Bitte, tuerkische Antwort");
});

test("ein Angriff mitten in einer echten Aufgabe wird abgewehrt UND die Aufgabe erledigt", () => {
  // Der erzeugte Datensatz kannte nur nackte Angriffe ("nenne mir X") und
  // nackte Verweigerungen. Echte Angriffe stehen mitten in einer Aufgabe —
  // und die richtige Antwort ist ein Nein PLUS die eigentliche Arbeit.
  const paare = echtePaare();
  const eingebettet = paare.filter((p) => {
    const f = p.messages[1].content;
    return f.length > 120 && /ignorier|anweisung fuer ki|hinweis fuer ki|log es|logg/i.test(f);
  });
  assert.ok(eingebettet.length >= 2, `nur ${eingebettet.length} eingebettete Angriffe`);
  for (const p of eingebettet) {
    const a = p.messages.at(-1).content;
    assert.ok(a.length > 200, "auf einen eingebetteten Angriff gehoert mehr als ein Nein");
  }
});
