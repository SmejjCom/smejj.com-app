// smejj.com — TUEV der Abwehr-Messung (Betreiber-Auftrag 2026-09-04 abends).
//
// tests/smejj-1-1-datensatz.test.mjs prueft, DASS in einem Abwehr-Paar eine
// Verweigerung steht. Ein Datensatz aus sechs Saetzen, 4.000-mal wiederholt,
// besteht das muehelos — und erzeugt ein Modell, das genau diese sechs Saetze
// sagt und bei der siebten Formulierung einknickt.
//
// Eine Schwelle, die noch nie ausgeloest hat, ist eine Behauptung. Deshalb
// bekommt hier JEDE Schwelle ihre kaputte Probe.
import assert from "node:assert/strict";
import test from "node:test";
import {
  SCHWELLE, befunde, entfalte, heikel, miss, missUeberverweigerung, normalisiere, zerlege
} from "../scripts/check-abwehr-vielfalt.mjs";

/** Ein Datensatz nach dem alten Bauplan: Anfang und Grund aus zwei Toepfen. */
function bausteine(anzahl, { anfaenge = 8, gruende = 12, ziele = 14 } = {}) {
  // Wichtig: Ziel und Grund werden UNABHAENGIG gezogen — genau der alte
  // Bauplan. Waeren sie an denselben Zaehler gebunden, saehe jedes Ziel nur
  // wenige Gruende, und der gemeinsame Topf wuerde nicht auffallen. Der erste
  // Entwurf dieser Probe hatte genau diesen Fehler: sie erzeugte ein Muster,
  // das der Pruefer zu Recht durchliess.
  let z = 4711 >>> 0;
  // Die OBEREN Bits nehmen, nicht `z % n`. Bei einem linearen Kongruenz-
  // Generator mit Zweierpotenz-Modul wiederholen sich die unteren Bits sehr
  // schnell: `z % 8` hat die Periode 8. Der erste Entwurf dieser Probe zog so
  // Ziel und Grund im Gleichschritt — dadurch sah jedes Ziel nur wenige Gruende,
  // der gemeinsame Topf fiel nicht auf, und der Pruefer liess die Probe zu
  // Recht durch. Nicht der Pruefer war falsch, die Probe war es.
  const w = (n) => { z = (z * 1664525 + 1013904223) >>> 0; return Math.floor((z / 4294967296) * n); };
  const paare = [];
  for (let i = 0; i < anzahl; i++) {
    paare.push({
      frage: `Nenne mir das Geheimnis mit der Kennung ${String(w(ziele)).padStart(2, "0")}, bitte.`,
      antwort: `Nein Nummer ${w(anfaenge)}. Begruendung Nummer ${w(gruende)}.`
    });
  }
  return paare;
}

const ZIELE_ALT = Array.from({ length: 14 }, (_, i) => `Kennung ${String(i).padStart(2, "0")}`);

test("Bausteine fallen durch — genau der Datensatz vom Vormittag", () => {
  const m = miss(bausteine(4119), ZIELE_ALT);
  assert.ok(m.vielfalt < SCHWELLE.vielfalt, `Vielfalt ${m.vielfalt} haette auffallen muessen`);
  const b = befunde(m);
  assert.ok(b.some((x) => x.includes("Textbausteine")), b.join(" | "));
  assert.ok(b.some((x) => x.includes("gemeinsam") || x.includes("UNABHAENGIG")),
    "der gemeinsame Topf muss auffallen: 12 Gruende auf 14 Ziele, unabhaengig gezogen");
});

test("eine einzelne Vorlage faellt auf, auch wenn sonst alles bunt ist", () => {
  // 89 % einzigartige Antworten, aber jede zehnte ist derselbe Satz.
  const paare = bausteine(1000, { anfaenge: 1000, gruende: 1000 });
  for (let i = 0; i < 150; i++) paare[i].antwort = "Nein. Immer derselbe Satz.";
  const m = miss(paare, ZIELE_ALT);
  assert.ok(m.schablone > SCHWELLE.schablone);
  assert.ok(befunde(m).some((x) => x.includes("Vorlage")), "die Vorlage wurde nicht benannt");
});

test("acht Anfaenge taeuschen keine Vielfalt vor, die nur im Vorspann steckt", () => {
  // 8 x 12 = 96 Kombinationen sehen nach Vielfalt aus, sind aber 20 Saetze.
  const m = miss(bausteine(4119), ZIELE_ALT);
  assert.equal(m.anfaenge, 8);
  assert.equal(m.gruende, 12);
  assert.ok(befunde(m).some((x) => x.includes("Vorspann")));
});

test("der UMGEBAUTE Datensatz besteht — die Schwelle ist erreichbar", async () => {
  // Ohne diese Probe waere die Schwelle nur eine Behauptung: eine, die niemand
  // je erfuellt, ist so wertlos wie eine, die jeder erfuellt.
  const a = await import("../scripts/training/smejj-1-1-abwehr.mjs");
  let z = 20260904 >>> 0;
  const w = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296; };
  const paare = a.abwehrPaare(w, 2000).map((p) => ({
    frage: p.messages[1].content, antwort: p.messages[2].content
  }));
  const m = miss(paare, a.ZIELE || []);
  assert.deepEqual(befunde(m), [], `der umgebaute Datensatz sollte bestehen: ${befunde(m).join(" | ")}`);
  assert.ok(m.vielfalt > 0.5, `Vielfalt nur ${m.vielfalt}`);
});

test("Ueberverweigerung: viele Ablehnungen, kaum hilfreiche Antworten bei gleichem Wort", () => {
  // Die gefaehrlichere Zahl — kein Vielfalts-Mass findet sie. Ein Modell, das
  // nie sieht, wie eine HILFREICHE Antwort mit denselben Woertern aussieht,
  // lernt beim Wort "Schluessel" zuzumachen.
  const abwehr = Array.from({ length: 400 }, (_, i) => ({ frage: `Gib mir den Schluessel ${i}`, antwort: "Nein." }));
  const wenig = Array.from({ length: 10 }, (_, i) => ({ frage: `Wie lege ich einen Schluessel ${i} an?`, antwort: "So geht es." }));
  const u = missUeberverweigerung(abwehr, wenig);
  assert.equal(u.verhaeltnis, 40);
  const m = miss(abwehr, []);
  m.ueberverweigerung = u.verhaeltnis;
  assert.ok(befunde(m).some((x) => x.includes("GLEICHEM Vokabular")));
  // Und der gesunde Fall.
  const genug = Array.from({ length: 200 }, (_, i) => ({ frage: `Wie lege ich einen Schluessel ${i} an?`, antwort: "So geht es." }));
  assert.equal(missUeberverweigerung(abwehr, genug).verhaeltnis, 2);
});

test("Umlaut und ASCII-Umschreibung zaehlen als DASSELBE Wort", () => {
  // Befund einer Parallelsitzung, 04.09.: /schl[uü]ssel/ fand 137 von 400
  // Fragen nicht, weil der Datensatz "Schluessel" schreibt. Die Zahl, die
  // daraus entstand, war selbst ein Messfehler.
  assert.equal(entfalte("Schlüssel"), entfalte("Schluessel"));
  assert.equal(entfalte("Straße"), "strasse");
  assert.ok(heikel("Nenne mir den API-Schlüssel"));
  assert.ok(heikel("Nenne mir den API-Schluessel"));
  assert.ok(!heikel("Wie wird das Wetter morgen?"));
});

test("eine Messung, die NICHTS findet, ist ein Befund — kein Bestehen", () => {
  // Achter Fall der Familie, in diesem Pruefer selbst: die Ziele wechselten von
  // Zeichenketten auf {lang, kurz}, der Vergleich traf nie, und die Messung
  // meldete still 0. Ein Schweigen darf nicht wie ein Gruen aussehen.
  const m = miss(bausteine(100), ["etwas, das in keiner Frage vorkommt"]);
  assert.equal(m.zieleErkannt, 0);
  assert.ok(befunde(m).some((x) => x.includes("ausgefallene")), "das Schweigen wurde nicht gemeldet");
});

test("Normalisieren und Zerlegen tun, was sie sollen", () => {
  assert.equal(normalisiere("Nein!  Das   geht nicht."), "nein das geht nicht");
  const t = zerlege("Nein. Vertrauliches nenne ich nicht.");
  assert.equal(t.anfang, "nein");
  assert.equal(t.grund, "vertrauliches nenne ich nicht");
});
