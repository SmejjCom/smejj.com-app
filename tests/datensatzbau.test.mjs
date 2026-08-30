import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  baueDatensatz,
  bereitePaarVor,
  DATENSATZ_FORMAT,
  pruefeVollstaendigkeit,
  STANDARD_SYSTEMPROMPT
} from "../src/training/datensatzbau.js";
import { DATASET_SPLITS } from "../src/training/constants.js";

const SCHLUESSEL = Buffer.alloc(32, 7);
const BASIS = {
  frage: "Wie aendere ich mein Passwort in der smejj-App?",
  antwort: "Oeffne Einstellungen und waehle Passwort aendern. Bestaetige mit deinem aktuellen Passwort.",
  quelle: "batch-01",
  einwilligung: "consent-2026-08-30-001"
};

// --- bereitePaarVor ---

test("ein gueltiges Paar wird zur messages-Zeile im Trainer-Format", () => {
  const ergebnis = bereitePaarVor(BASIS, { fingerprintKey: SCHLUESSEL });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.paar.messages.length, 3);
  assert.equal(ergebnis.paar.messages[0].role, "system");
  assert.equal(ergebnis.paar.messages[0].content, STANDARD_SYSTEMPROMPT);
  assert.equal(ergebnis.paar.messages[1].content, BASIS.frage);
  assert.equal(ergebnis.paar.messages[2].content, BASIS.antwort);
  assert.ok(/^[a-f0-9]{64}$/.test(ergebnis.paar.recordId));
  assert.ok(DATASET_SPLITS.includes(ergebnis.paar.split));
});

test("strukturierte PII wird bereinigt, nicht verworfen", () => {
  const paare = bereitePaarVor({
    ...BASIS,
    frage: "Mein Login mit al@example.com und Telefon +49 170 1234567 klappt nicht.",
    antwort: "Bitte wende dich mit deiner E-Mail an den Support."
  }, { fingerprintKey: SCHLUESSEL });
  assert.equal(paare.ok, true);
  const text = JSON.stringify(paare.paar.messages);
  assert.equal(text.includes("al@example.com"), false);
  assert.equal(text.includes("1234567"), false);
  assert.ok(paare.paar.bereinigungFunde.length > 0);
});

test("ohne Einwilligung KEIN Paar (fail-closed)", () => {
  const ergebnis = bereitePaarVor({ ...BASIS, einwilligung: "" }, { fingerprintKey: SCHLUESSEL });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "einwilligung_fehlt");
});

test("ohne Quelle KEIN Paar", () => {
  const ergebnis = bereitePaarVor({ ...BASIS, quelle: " " }, { fingerprintKey: SCHLUESSEL });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "pflichtfeld_leer");
});

test("ohne Fingerabdruck-Schluessel KEIN Paar", () => {
  const ergebnis = bereitePaarVor(BASIS, { fingerprintKey: null });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "fingerprint_schluessel_fehlt");
});

test("bekannte Namen werden ersetzt", () => {
  const ergebnis = bereitePaarVor({
    ...BASIS,
    frage: "Wie melde ich mich ab, wenn der Nutzer ExamplePerson genannt wird?"
  }, { fingerprintKey: SCHLUESSEL, personen: ["ExamplePerson"] });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.paar.messages[1].content.includes("ExamplePerson"), false);
  assert.ok(ergebnis.paar.messages[1].content.includes("[person]"));
});

test("gleiche Familie ergibt denselben Split — zwei Familien koennen auseinanderfallen", () => {
  const eins = bereitePaarVor(BASIS, { fingerprintKey: SCHLUESSEL }).paar;
  const zwei = bereitePaarVor({ ...BASIS, frage: "Andere Frage ganz anderen Inhalts?" }, { fingerprintKey: SCHLUESSEL }).paar;
  assert.equal(zwei.familyFingerprint, eins.familyFingerprint, "gleiche Quelle = gleiche Familie");
  assert.equal(zwei.split, eins.split);
});

// --- baueDatensatz ---

test("ungueltige Version wird abgelehnt", () => {
  assert.throws(
    () => baueDatensatz([BASIS], { fingerprintKey: SCHLUESSEL, versionId: "1.0" }),
    /datensatz_version_id_ungueltig/
  );
});

test("ohne gueltige Paare gibt es keinen Datensatz", () => {
  assert.throws(
    () => baueDatensatz([{ ...BASIS, einwilligung: "" }], { fingerprintKey: SCHLUESSEL, versionId: "v2026.08.30" }),
    /datensatz_ohne_gueltige_paare/
  );
});

test("Duplikate landen in der Quarantaene, nicht im Datensatz", () => {
  const ergebnis = baueDatensatz([BASIS, { ...BASIS }], {
    fingerprintKey: SCHLUESSEL,
    versionId: "v2026.08.30"
  });
  assert.equal(ergebnis.manifest.gesamt, 1);
  assert.equal(ergebnis.manifest.quarantaeneAnzahl, 1);
  assert.equal(ergebnis.quarantaene[0].grund, "duplikat");
});

test("Manifest fuehrt proSplit fuer die Schleifen-Datenpruefung", () => {
  // Familien suchen, die alle drei Splits treffen — der Split ist deterministisch.
  const paare = [];
  for (const split of DATASET_SPLITS) {
    for (let i = 0; i < 500; i += 1) {
      const familie = `suche-${split}-${i}`;
      const probe = bereitePaarVor({ ...BASIS, familie, quelle: familie }, { fingerprintKey: SCHLUESSEL });
      if (probe.ok && probe.paar.split === split) {
        paare.push({ ...BASIS, familie, quelle: familie });
        break;
      }
    }
  }
  assert.equal(paare.length, 3, "drei Familien fuer drei Splits gefunden");

  const ergebnis = baueDatensatz(paare, { fingerprintKey: SCHLUESSEL, versionId: "v2026.08.30" });
  assert.equal(ergebnis.manifest.proSplit.train, ergebnis.train.length);
  assert.equal(ergebnis.manifest.proSplit.validation, ergebnis.validation.length);
  assert.equal(ergebnis.manifest.proSplit.test, ergebnis.test.length);
  assert.equal(
    ergebnis.manifest.proSplit.train + ergebnis.manifest.proSplit.validation + ergebnis.manifest.proSplit.test,
    ergebnis.manifest.gesamt
  );
  assert.equal(ergebnis.manifest.promotionStatus, "not-approved");
  assert.equal(ergebnis.manifest.format, DATENSATZ_FORMAT);
  assert.equal(ergebnis.manifest.leakageCheck, "passed-family-grouped");
  for (const split of DATASET_SPLITS) {
    for (const paar of ergebnis[split]) {
      assert.ok(paar.messages.length >= 2);
      assert.equal(paar.split, split);
    }
  }
});

test("Vollstaendigkeit: ein fehlender Split sperrt den Weiterweg", () => {
  const ergebnis = baueDatensatz([BASIS], { fingerprintKey: SCHLUESSEL, versionId: "v2026.08.30" });
  const pruefung = pruefeVollstaendigkeit(ergebnis);
  assert.equal(pruefung.vollstaendig, false);
  assert.ok(pruefung.fehlt.includes("validation") || pruefung.fehlt.includes("test"));
});

// --- CLI Ende-zu-Ende ---

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Fuehrt ein Skript aus und LIEFERT den Exit-Code (statt bei != 0 zu werfen). */
function fuehreSkript(skript, args, env) {
  try {
    const ausgabe = execFileSync(process.execPath, [skript, ...args], {
      cwd: REPO_ROOT, env, encoding: "utf8"
    });
    return { status: 0, ausgabe };
  } catch (fehler) {
    return { status: fehler.status, ausgabe: `${fehler.stdout || ""}${fehler.stderr || ""}` };
  }
}

function schreibeQuellenpaket(dir, paare, personen) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "paare.jsonl"), paare.map((p) => JSON.stringify(p)).join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(dir, "personen.txt"), personen.join("\n"), "utf8");
}

function familiesFuerAlleSplits() {
  const familien = [];
  for (const split of DATASET_SPLITS) {
    for (let i = 0; i < 500; i += 1) {
      const probe = bereitePaarVor({ ...BASIS, familie: `familie-${split}-${i}`, quelle: `familie-${split}-${i}` }, { fingerprintKey: SCHLUESSEL });
      if (probe.ok && probe.paar.split === split) {
        familien.push(`familie-${split}-${i}`);
        break;
      }
    }
  }
  return familien;
}

test("CLI: baut drei JSONL-Dateien, Manifest und Bericht in ein Ausgabeverzeichnis", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "smejj-datensatz-"));
  const familien = familiesFuerAlleSplits();
  const paare = familien.map((familie, i) => ({
    ...BASIS,
    frage: `${BASIS.frage} (Variante ${i})`,
    familie,
    quelle: familie
  }));
  schreibeQuellenpaket(path.join(temp, "quellen"), paare, ["ExamplePerson"]);
  const ausgabe = path.join(temp, "ausgabe");

  const ergebnis = fuehreSkript("scripts/training/baue_smejj_datensatz.mjs", [
    "--quellen", path.join(temp, "quellen"),
    "--ausgabe", ausgabe,
    "--version", "v2026.08.30"
  ], {
    ...process.env,
    SMEJJ_TRAINING_FINGERPRINT_KEY_ID: "test-key-v1",
    SMEJJ_TRAINING_FINGERPRINT_KEY_B64: SCHLUESSEL.toString("base64")
  });
  assert.equal(ergebnis.status, 0, ergebnis.ausgabe);
  assert.ok(ergebnis.ausgabe.includes("FERTIG"));

  const manifest = JSON.parse(fs.readFileSync(path.join(ausgabe, "manifest.json"), "utf8"));
  const zeilen = (name) => fs.readFileSync(path.join(ausgabe, name), "utf8").trim().split("\n").filter(Boolean).length;
  assert.equal(zeilen("train.jsonl"), manifest.proSplit.train);
  assert.equal(zeilen("validation.jsonl"), manifest.proSplit.validation);
  assert.equal(zeilen("test.jsonl"), manifest.proSplit.test);
  // Jede Zeile liest der Trainer: messages >= 2, parsebar.
  for (const roh of fs.readFileSync(path.join(ausgabe, "train.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const eintrag = JSON.parse(roh);
    assert.ok(Array.isArray(eintrag.messages) && eintrag.messages.length >= 2);
  }
  assert.ok(fs.existsSync(path.join(ausgabe, "bericht.md")));
  assert.ok(fs.existsSync(path.join(ausgabe, "quarantaene.jsonl")));
});

test("CLI: ohne Fingerabdruck-Schluessel bricht es ab, bevor etwas geschrieben wird", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "smejj-datensatz-"));
  schreibeQuellenpaket(path.join(temp, "quellen"), [BASIS], []);
  const ausgabe = path.join(temp, "ausgabe");
  const ergebnis = fuehreSkript("scripts/training/baue_smejj_datensatz.mjs", [
    "--quellen", path.join(temp, "quellen"),
    "--ausgabe", ausgabe,
    "--version", "v2026.08.30"
  ], { ...process.env, SMEJJ_TRAINING_FINGERPRINT_KEY_ID: "", SMEJJ_TRAINING_FINGERPRINT_KEY_B64: "" });
  assert.equal(ergebnis.status, 1, "Abbruch mit Exit 1");
  assert.ok(ergebnis.ausgabe.includes("ABBRUCH"));
  assert.equal(fs.existsSync(ausgabe), false, "kein Ausgabeverzeichnis ohne Schluessel");
});

test("Upload: ohne CONFIRM_DATENSATZ_UPLOAD passiert NICHTS", () => {
  const ergebnis = fuehreSkript("scripts/training/lade_datensatz_hoch.mjs", [
    "--eingabe", "x",
    "--ziel", "datasets/smejj-1-1/v2026.08.30"
  ], { ...process.env, CONFIRM_DATENSATZ_UPLOAD: "NO" });
  assert.equal(ergebnis.status, 1);
  assert.ok(ergebnis.ausgabe.includes("ABBRUCH"));
});
