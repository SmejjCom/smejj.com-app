import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { zeilenAusDokument, zerlegeMarkdown, zuFliesstext } from "../src/training/projectcorpus/extract.js";
import { pruefeDatensatzQuelle } from "../src/training/opencorpus/licenses.js";
import { baueSuiteFingerabdruck } from "../src/training/opencorpus/contamination.js";
import { baueKorpus } from "../src/training/opencorpus/corpus.js";

const KEY = Buffer.alloc(32, 11);
const SUITE = JSON.parse(readFileSync(new URL("../evals/suites/smejj-chat-core-v1.json", import.meta.url), "utf8"));
const FINGERABDRUCK = baueSuiteFingerabdruck(SUITE);
const SYSTEM = "Du bist der Assistent von smejj.com.";

const DOKUMENT = `# Speicher

## Zentraler Objektspeicher
smejj.com speichert grosse Dateien, Modelle und Artefakte ausschliesslich auf
IDrive e2. Der Control Server haelt keine grossen Dateien vor.

## Zu kurz
Nein.

## Tabelle wird verworfen
| Dienst | Zweck |
|---|---|
| IDrive e2 | Speicher |
`;

test("Ueberschriften werden zu Abschnitten, Codebloecke stoeren nicht", () => {
  const abschnitte = zerlegeMarkdown("# A\ntext\n\n```\n# kein Titel\n```\n\n## B\nmehr");
  assert.deepEqual(abschnitte.map((a) => a.ueberschrift), ["A", "B"]);
});

// Gliederungsformen von MASTER_PROMPT.md (Vermessung 2026-08-05: ohne diese
// Erkennung liefert das Dokument genau 1 Fakt, mit ihr 13).
const GERAHMT = [
  "# Kopf",
  "Einleitung vor dem Zaun.",
  "```text",
  "======================================================================",
  "AUTONOMIE-REGELN (verbindlich)",
  "======================================================================",
  "Grundtext der Regeln, lang genug fuer einen Abschnitt und noch ein paar",
  "Worte mehr, damit die Mindestlaenge sicher erreicht ist.",
  "GRUENE LISTE — dauerhaft freigegeben, nie nachfragen:",
  "- Code schreiben und aendern, Builds und Tests ausfuehren, deploys",
  "- Livetests durchfuehren und Ergebnisse dokumentieren, ohne Ausnahme",
  "1) beispiel.com — nur kostenlos",
  "   Ausschliesslich dauerhaft kostenlose Dienste dieses Anbieters nutzen,",
  "   keine Trials, keine Upgrades, keine automatischen Verlaengerungen.",
  "```",
  "Nachtext ausserhalb des Zauns."
].join("\n");

test("====-gerahmte Titel werden Abschnitte — auch ausserhalb von Zaeunen", () => {
  const abschnitte = zerlegeMarkdown("====\nGERAHMTER TITEL\n====\nInhalt darunter");
  assert.deepEqual(abschnitte.map((a) => a.ueberschrift), ["GERAHMTER TITEL"]);
  assert.equal(abschnitte[0].ebene, 2);
});

test("ohne Option bleibt ein text-Zaun Code — exakt das alte Verhalten", () => {
  const abschnitte = zerlegeMarkdown(GERAHMT);
  assert.deepEqual(abschnitte.map((a) => a.ueberschrift), ["Kopf"]);
});

test("mit textZaeuneTransparent liefert der Zaun Rahmen-, Listen- und Nummern-Abschnitte", () => {
  const abschnitte = zerlegeMarkdown(GERAHMT, { textZaeuneTransparent: true });
  assert.deepEqual(abschnitte.map((a) => a.ueberschrift), [
    "Kopf",
    "AUTONOMIE-REGELN (verbindlich)",
    "GRUENE LISTE — dauerhaft freigegeben, nie nachfragen",
    "beispiel.com — nur kostenlos"
  ]);
  // Der Inhalt des Zauns ist Prosa geworden: kein Zaunzeichen in den Zeilen.
  assert.ok(abschnitte.every((a) => a.zeilen.every((z) => !z.startsWith("```"))));
});

test("gewoehnliche Codebloecke bleiben auch mit der Option Code", () => {
  const doc = "# Kopf\n```js\nGROSSE ZEILE MIT DOPPELPUNKT:\n```\ndanach";
  const abschnitte = zerlegeMarkdown(doc, { textZaeuneTransparent: true });
  assert.deepEqual(abschnitte.map((a) => a.ueberschrift), ["Kopf"]);
  assert.ok(abschnitte[0].zeilen.includes("```js"), "Zaunzeichen bleibt fuer zuFliesstext erhalten");
});

test("Kleingeschriebenes mit Doppelpunkt wird NICHT zur Ueberschrift", () => {
  const doc = "```text\nNutzung: nur intern\nLast-Ziele:\nmehr text\n```";
  const abschnitte = zerlegeMarkdown(doc, { textZaeuneTransparent: true });
  assert.equal(abschnitte.length, 0);
});

test("Fliesstext entfernt Auszeichnung, aber kein Wort", () => {
  const text = zuFliesstext(["Die **Regel** gilt fuer `alle` [Dateien](x.md)."]);
  assert.equal(text, "Die Regel gilt fuer alle Dateien.");
});

test("Antworten sind woertliche Abschnitte aus der Dokumentation", () => {
  // Der Kern der Policy-Entscheidung: kein Satz darf umformuliert sein, sonst
  // waere es Modellausgabe statt Erstpartei-Inhalt.
  const zeilen = zeilenAusDokument({ pfad: "docs/test.md", inhalt: DOKUMENT, systemText: SYSTEM });
  const antwort = zeilen[0].messages[2].content;
  assert.ok(antwort.includes("IDrive e2"));
  assert.ok(DOKUMENT.includes("ausschliesslich auf"), "Vorbedingung");
  // Jedes Wort der Antwort muss im Quelldokument vorkommen.
  for (const wort of antwort.split(/\s+/).filter((w) => w.length > 4)) {
    assert.ok(DOKUMENT.includes(wort), `Wort nicht im Quelldokument: ${wort}`);
  }
});

test("zu kurze Abschnitte und Tabellen liefern keine Zeilen", () => {
  const zeilen = zeilenAusDokument({ pfad: "docs/test.md", inhalt: DOKUMENT, systemText: SYSTEM });
  const ueberschriften = new Set(zeilen.map((z) => z.messages[1].content));
  assert.ok(![...ueberschriften].some((f) => f.includes("Zu kurz")));
  assert.ok(![...ueberschriften].some((f) => f.includes("Tabelle wird verworfen")));
});

test("jeder Abschnitt bekommt mehrere Frageformen, alle in derselben Familie", () => {
  const zeilen = zeilenAusDokument({ pfad: "docs/test.md", inhalt: DOKUMENT, systemText: SYSTEM });
  assert.equal(zeilen.length, 15, "ein tauglicher Abschnitt x fuenfzehn Schablonen");
  assert.equal(new Set(zeilen.map((z) => z.gruppe)).size, 1);
  assert.equal(new Set(zeilen.map((z) => z.messages[1].content)).size, 15);
  // Alle Antworten identisch: die Formenvielfalt liegt in der FRAGE, die
  // Antwort bleibt der eine woertliche Abschnitt.
  assert.equal(new Set(zeilen.map((z) => z.messages[2].content)).size, 1);
});

test("Erstpartei-Zeilen tragen synthetic=false und laufen durch den Korpus", () => {
  const zeilen = zeilenAusDokument({ pfad: "docs/test.md", inhalt: DOKUMENT, systemText: SYSTEM });
  assert.ok(zeilen.every((z) => z.synthetic === false));
  const ergebnis = baueKorpus({
    zeilen,
    quelle: {
      datasetId: "smejj.com/projektwissen",
      revision: "a".repeat(40),
      license: "first-party-owned",
      authorship: "human-first-party"
    },
    fingerabdruck: FINGERABDRUCK,
    fingerprintKey: KEY
  });
  assert.equal(ergebnis.manifest.anzahl, 15);
  assert.deepEqual(ergebnis.manifest.abgelehnt, {});
});

test("die Systemzeile allein loest das Verunreinigungs-Tor NICHT aus", () => {
  // Gemessener Konstruktionsfehler vom 2026-08-01: mit der Systemzeile im
  // Fingerabdruck wurden 1971 von 1971 Projektzeilen abgewiesen. Die
  // Systemzeile ist geteilter Betriebskontext, keine Testfrage.
  const suiteSystem = SUITE.cases[0].system;
  const zeilen = zeilenAusDokument({ pfad: "docs/test.md", inhalt: DOKUMENT, systemText: suiteSystem });
  const ergebnis = baueKorpus({
    zeilen,
    quelle: {
      datasetId: "smejj.com/projektwissen",
      revision: "b".repeat(40),
      license: "first-party-owned",
      authorship: "human-first-party"
    },
    fingerabdruck: FINGERABDRUCK,
    fingerprintKey: KEY
  });
  assert.equal(ergebnis.manifest.anzahl, 15, JSON.stringify(ergebnis.manifest.abgelehnt));
});

test("Erstpartei-Kennzeichnung muss vollstaendig sein — kein Schlupfloch", () => {
  // Ein Fremddatensatz mit dem Aufkleber 'first-party-owned' kaeme sonst am
  // Lizenz-Tor vorbei.
  const nurLizenz = pruefeDatensatzQuelle({
    datasetId: "fremd/datensatz", revision: "c".repeat(40),
    license: "first-party-owned", authorship: "human"
  });
  assert.equal(nurLizenz.erlaubt, false);
  assert.ok(nurLizenz.gruende.includes("erstpartei_kennzeichnung_unvollstaendig"));

  const nurUrheber = pruefeDatensatzQuelle({
    datasetId: "smejj.com/projektwissen", revision: "c".repeat(40),
    license: "mit", authorship: "human-first-party"
  });
  assert.equal(nurUrheber.erlaubt, false);
  assert.ok(nurUrheber.gruende.includes("erstpartei_kennzeichnung_unvollstaendig"));
});
