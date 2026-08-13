// smejj.com — Tests für den Antwort-TÜV (Autopilot Nr. 36).
//
// Die Fixtures sind keine erfundenen Beispiele: es sind die WÖRTLICH am
// 2026-08-13 im Live-Chat gemessenen Fehlantworten. Ein Prüfer, der genau
// diese Fälle nicht erkennt, prüft nichts.

import test from "node:test";
import assert from "node:assert/strict";
import {
  pruefeAntwortQualitaet, pruefeAntwortenAlle, fuehreSelbsttestAus, SELBSTTEST_FAELLE
} from "../control-server/src/autopilots/antwortTuevAutopilot.js";
import { laufAntwortTuev } from "../control-server/src/autopilots/autopilotLaeufer.js";

const klassen = (antwort, kontext) => pruefeAntwortQualitaet(antwort, kontext).funde.map((f) => f.klasse);

test("der wörtlich gemessene Abbruch mitten im Wort wird erkannt", () => {
  const funde = pruefeAntwortQualitaet("Das beste Preis-Leistungs-Verhältnis für ein echtes 2-Zimmer-Büro b").funde;
  assert.deepEqual(funde.map((f) => f.klasse), ["abbruch"]);
  assert.match(funde[0].beleg, /2-Zimmer-Büro b/, "der Beleg zeigt das Ende der Antwort");
});

test("die wörtlich gemessene Nur-Ankündigung wird erkannt", () => {
  assert.ok(klassen("Ich suche jetzt gezielt nach aktuellen Büromiet-Angeboten in Castro Valley und San Lorenzo.").includes("nur-ankuendigung"));
  assert.ok(klassen("Ich habe konkrete Craigslist-Inserate gefunden, die ich jetzt einzeln auslese, um Ihnen die Details wie Stockwerk, Fläche und Zimmeranzahl zu geben.")
    .length >= 1, "auch die 148-Zeichen-Fassung faellt auf");
});

test("Fähigkeits-Verneinung wird erkannt — die Selbsttest-Antwort vom Screenshot", () => {
  assert.ok(klassen("Was ich nicht kann: Bilder generieren.").includes("faehigkeits-verneinung"));
  assert.ok(klassen("Ich kann als KI-Modell nicht auf externe Webseiten zugreifen.").includes("faehigkeits-verneinung"));
});

test("eine gesunde Antwort wird freigesprochen", () => {
  const gesund = "Hier sind zwei Angebote:\n\n| Objekt | Preis |\n|---|---|\n| Büro A | 700 $ |\n\nDetails unter https://example.com/x. Empfehlung: Büro A.";
  assert.deepEqual(klassen(gesund, { frage: "Suche Angebote mit Link" }), []);
});

test("offene Strukturen sind kein Abbruch", () => {
  // Eine Antwort darf mit Tabellenzeile, Listenpunkt oder Codeblock enden.
  assert.deepEqual(klassen("Die Werte:\n\n| A | B |\n|---|---|\n| 1 | 2 |"), []);
  assert.ok(!klassen("Drei Punkte dazu:\n- eins\n- zwei\n- https://a.example/ und mehr dazu im verlinkten Text").includes("abbruch"));
});

test("kurze Grussantworten sind keine Funde", () => {
  assert.deepEqual(klassen("Gern!"), []);
  assert.deepEqual(klassen("Hallo! Womit kann ich helfen?"), []);
});

test("Denk-Tags und rohes LaTeX fallen auf", () => {
  assert.ok(klassen("<think>erst nachdenken</think> Die Antwort lautet 4.").includes("denk-tags"));
  assert.ok(klassen("Die Formel ist \\[ A = P \\times r \\] und damit fertig.").includes("latex-roh"));
});

test("versprochene Links muessen geliefert werden", () => {
  const lange = "Es gibt viele gute Angebote in der Gegend. ".repeat(10) + "Am besten selbst suchen.";
  assert.ok(klassen(lange, { frage: "Gib mir anklickbare Links zu Inseraten" }).includes("link-versprochen-keiner-da"));
  assert.ok(!klassen(lange, { frage: "Wie ist der Markt allgemein?" }).includes("link-versprochen-keiner-da"),
    "ohne Link-Wunsch in der Frage kein Fund");
});

test("die Selbsttest-Fälle bestehen — und ein kaputter Prüfer fiele durch", () => {
  const ergebnis = fuehreSelbsttestAus();
  assert.equal(ergebnis.bestanden, true, ergebnis.fehler.join("; "));
  assert.equal(SELBSTTEST_FAELLE.length, 4);
  // Gegenprobe: der Selbsttest MUSS scheitern koennen. Eine Antwort, die als
  // gesund gilt, aber einen Fund erzeugt, waere ein Fehlalarm.
  const gegen = pruefeAntwortQualitaet(SELBSTTEST_FAELLE[3].antwort, { frage: SELBSTTEST_FAELLE[3].frage });
  assert.equal(gegen.funde.length, 0, "der gesunde Fall darf nie einen Fund erzeugen");
});

test("pruefeAntwortenAlle fasst zusammen wie der Sprach-Wächter", () => {
  const bericht = pruefeAntwortenAlle([
    { antwort: "Ich suche jetzt gezielt nach Angeboten und melde mich gleich wieder", quelle: "a" },
    { antwort: "Alles beantwortet. Die Details stehen oben.", quelle: "b" }
  ]);
  assert.equal(bericht.geprueft, 2);
  assert.equal(bericht.antwortenMitFunden, 1);
  assert.equal(bericht.berichte[0].quelle, "a");
});

test("fail-safe: leere und kaputte Eingaben stuerzen nie ab", () => {
  assert.deepEqual(pruefeAntwortQualitaet(null).funde.map((f) => f.klasse), ["leer"]);
  assert.deepEqual(pruefeAntwortQualitaet("").funde.map((f) => f.klasse), ["leer"]);
  assert.doesNotThrow(() => pruefeAntwortenAlle([null, {}, { antwort: 42 }]));
});

// --- Läufer-Anbindung -------------------------------------------------------

test("der Lauf wird ROT, wenn die Feedback-Ablage nicht lesbar ist", async () => {
  const ergebnis = await laufAntwortTuev({ statsLader: async () => ({ ok: false, grund: "S3 weg" }) });
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.meldung, /S3 weg/);
});

test("der Lauf prüft gemeldete Antworten und nennt Zahl plus Beispiel", async () => {
  const ergebnis = await laufAntwortTuev({
    statsLader: async () => ({
      ok: true,
      negativeLetzte7Tage: [
        { promptSample: "Suche mit Link", antwortSample: "Ich suche jetzt gezielt nach Angeboten und melde mich dann wieder.", createdAt: "2026-08-14" },
        { promptSample: "x", antwortSample: "Fertig. Alles steht oben.", createdAt: "2026-08-14" }
      ]
    })
  });
  assert.equal(ergebnis.ok, true);
  assert.match(ergebnis.meldung, /Selbsttest 4\/4/);
  assert.match(ergebnis.meldung, /2 gemeldete Antworten geprüft, 1 Befund/);
  assert.match(ergebnis.meldung, /nur-ankuendigung/);
});

test("ohne gemeldete Antworten bleibt der Lauf gruen und sagt das ehrlich", async () => {
  const ergebnis = await laufAntwortTuev({ statsLader: async () => ({ ok: true, negativeLetzte7Tage: [] }) });
  assert.equal(ergebnis.ok, true);
  assert.match(ergebnis.meldung, /keine gemeldeten Antworten/);
});
