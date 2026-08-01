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
  assert.equal(zeilen.length, 3, "ein tauglicher Abschnitt x drei Schablonen");
  assert.equal(new Set(zeilen.map((z) => z.gruppe)).size, 1);
  assert.equal(new Set(zeilen.map((z) => z.messages[1].content)).size, 3);
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
  assert.equal(ergebnis.manifest.anzahl, 3);
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
  assert.equal(ergebnis.manifest.anzahl, 3, JSON.stringify(ergebnis.manifest.abgelehnt));
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
