// Der Adapter-Weg ins Hausmodell.
//
// DER ANLASS ist die peinlichste Luecke des Projekts: Neun Trainingslaeufe
// lagen in der Ablage, waehrend der Hausmodell-Dienst das unveraenderte
// Basismodell auslieferte — er kannte das Wort "Adapter" nicht. Niemand haette
// es gemerkt, denn ein Modell ohne Adapter antwortet ja. Es antwortet nur als
// ein anderes.
//
// Genau dagegen pruefen diese Faelle: dass der Adapter ANKOMMT (im
// Startargument), dass ein falscher AUFFAELLT (Pruefsumme) und dass eine halbe
// Beschreibung VERWORFEN wird statt heimlich zu wirken.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { adapterOderNichts, e2AdapterSchluessel } from "../workers/smejj-hausmodell/katalog.js";
import { Depot } from "../workers/smejj-hausmodell/depot.js";
import { Motor, baueStartArgumente } from "../workers/smejj-hausmodell/motor.js";

const INHALT = Buffer.from("nicht wirklich ein LoRA, aber pruefbar");
const SUMME = createHash("sha256").update(INHALT).digest("hex");

const MODELL_MIT = {
  id: "smejj-1-8", stufe: "staging", datei: "basis.gguf", sizeBytes: 10, sha256: "a".repeat(64), kontext: 4096,
  adapter: { datei: "smejj-1-8-lora.gguf", sizeBytes: INHALT.length, sha256: SUMME, prefix: "con/versions/smejj-1-8/adapter-gguf" }
};
const MODELL_OHNE = { id: "smejj-1-basis", stufe: "staging", datei: "basis.gguf", sizeBytes: 10, sha256: "a".repeat(64), kontext: 4096 };

const stumm = { log() {}, warn() {}, error() {} };

// --- Katalog: was als Adapter durchgeht ---------------------------------------

test("ein vollstaendig beschriebener Adapter wird uebernommen", () => {
  const a = adapterOderNichts(MODELL_MIT);
  assert.equal(a.datei, "smejj-1-8-lora.gguf");
  assert.equal(a.sha256, SUMME);
});

test("eine HALBE Beschreibung wird verworfen, nicht ergaenzt", () => {
  // Ohne Pruefsumme kann das Depot nicht erkennen, ob die Datei die richtige
  // ist — und ein falscher Adapter faellt nirgends auf.
  const stummerFehler = console.error;
  console.error = () => {};
  try {
    assert.equal(adapterOderNichts({ id: "x", adapter: { datei: "a.gguf", sizeBytes: 5 } }), null);
    assert.equal(adapterOderNichts({ id: "x", adapter: { datei: "a.gguf", sha256: "kurz", sizeBytes: 5 } }), null);
    assert.equal(adapterOderNichts({ id: "x", adapter: { sha256: SUMME, sizeBytes: 5 } }), null);
    assert.equal(adapterOderNichts({ id: "x", adapter: { datei: "a.gguf", sha256: SUMME, sizeBytes: 0 } }), null);
  } finally { console.error = stummerFehler; }
});

test("kein Adapter ist ein gueltiger Zustand, kein Fehler", () => {
  assert.equal(adapterOderNichts(MODELL_OHNE), null);
  assert.equal(e2AdapterSchluessel(MODELL_OHNE), null);
});

test("der Adapter darf liegen bleiben, wo das Training ihn ablegt", () => {
  // Ein eigener prefix erspart das Kopieren von Trainings- in Modellablage —
  // und damit eine zweite Wahrheit darueber, welcher Adapter der richtige ist.
  assert.equal(e2AdapterSchluessel(MODELL_MIT), "con/versions/smejj-1-8/adapter-gguf/smejj-1-8-lora.gguf");
  assert.equal(e2AdapterSchluessel({ ...MODELL_MIT, adapter: { ...MODELL_MIT.adapter, prefix: null } }),
    "models/staging/smejj-1-8/smejj-1-8-lora.gguf");
});

// --- Depot: holen und pruefen -------------------------------------------------

function e2Attrappe(daten) {
  return {
    async ladeInDatei(schluessel, ziel) {
      const inhalt = daten[schluessel];
      if (!inhalt) throw new Error(`nicht in e2: ${schluessel}`);
      await writeFile(ziel, inhalt);
      return { bytes: inhalt.length, sha256: createHash("sha256").update(inhalt).digest("hex") };
    }
  };
}

test("der Adapter wird aus e2 geholt und die Pruefsumme stimmt", async () => {
  const cache = await mkdtemp(path.join(tmpdir(), "hausmodell-"));
  const depot = new Depot({
    e2: e2Attrappe({ "con/versions/smejj-1-8/adapter-gguf/smejj-1-8-lora.gguf": INHALT }),
    cacheVerzeichnis: cache, protokoll: stumm
  });
  const r = await depot.adapterBereitstellen(MODELL_MIT);
  assert.equal(r.quelle, "e2");
  assert.deepEqual(await readFile(r.pfad), INHALT);
});

test("ein FALSCHER Adapter wird abgelehnt und nicht abgelegt", async () => {
  // Der wichtigste Fall. Ein Adapter mit falschem Inhalt wuerde sonst
  // klaglos antworten — als ein Modell, das niemand gemessen hat.
  const cache = await mkdtemp(path.join(tmpdir(), "hausmodell-"));
  const depot = new Depot({
    e2: e2Attrappe({ "con/versions/smejj-1-8/adapter-gguf/smejj-1-8-lora.gguf": Buffer.from("etwas ganz anderes") }),
    cacheVerzeichnis: cache, protokoll: stumm
  });
  await assert.rejects(() => depot.adapterBereitstellen(MODELL_MIT), /adapter_pruefsumme_falsch/);
  assert.equal(await stat(depot.adapterPfadVon(MODELL_MIT)).catch(() => null), null,
    "eine abgelehnte Datei darf nicht liegen bleiben");
});

test("ein Modell OHNE Adapter liefert null statt zu scheitern", async () => {
  const cache = await mkdtemp(path.join(tmpdir(), "hausmodell-"));
  const depot = new Depot({ e2: e2Attrappe({}), cacheVerzeichnis: cache, protokoll: stumm });
  assert.equal(await depot.adapterBereitstellen(MODELL_OHNE), null);
});

test("im Cache wird die Pruefsumme JEDES MAL nachgerechnet", async () => {
  // Anders als bei der 2,5-GB-Modelldatei: ein Adapter ist Megabyte gross, das
  // Rechnen kostet Millisekunden — und eine vertauschte Datei mit zufaellig
  // gleicher Groesse waere sonst unsichtbar.
  const cache = await mkdtemp(path.join(tmpdir(), "hausmodell-"));
  const depot = new Depot({
    e2: e2Attrappe({ "con/versions/smejj-1-8/adapter-gguf/smejj-1-8-lora.gguf": INHALT }),
    cacheVerzeichnis: cache, protokoll: stumm
  });
  const erst = await depot.adapterBereitstellen(MODELL_MIT);
  // Datei heimlich austauschen, Groesse gleich lassen.
  await writeFile(erst.pfad, Buffer.alloc(INHALT.length, 0x41));
  const zweit = await depot.adapterBereitstellen(MODELL_MIT);
  assert.equal(zweit.quelle, "e2", "die vertauschte Datei muss neu geholt werden");
  assert.deepEqual(await readFile(zweit.pfad), INHALT);
});

// --- Motor: kommt --lora wirklich an? ----------------------------------------

test("--lora landet in den Startargumenten, wenn ein Adapter da ist", () => {
  const a = baueStartArgumente({ modell: MODELL_MIT, modellPfad: "/c/basis.gguf", adapterPfad: "/c/lora.gguf" });
  const stelle = a.indexOf("--lora");
  assert.ok(stelle > -1, "ohne --lora laeuft die nackte Basis, und niemand sieht es");
  assert.equal(a[stelle + 1], "/c/lora.gguf");
});

test("OHNE Adapter steht kein --lora in den Argumenten", () => {
  // Ein leeres --lora wuerde llama-server sofort beenden.
  const a = baueStartArgumente({ modell: MODELL_OHNE, modellPfad: "/c/basis.gguf" });
  assert.equal(a.includes("--lora"), false);
});

test("der Adapter aendert nichts an den uebrigen Argumenten", () => {
  // Sonst waere der Vergleich zwischen Basis und trainiertem Stand nicht mehr
  // sauber: gleiche Kontextgroesse, gleicher Cache, gleiche Threadzahl.
  const ohne = baueStartArgumente({ modell: MODELL_OHNE, modellPfad: "/c/basis.gguf", kvTyp: "q8_0" });
  const mit = baueStartArgumente({ modell: MODELL_MIT, modellPfad: "/c/basis.gguf", kvTyp: "q8_0", adapterPfad: "/c/lora.gguf" });
  const ohneAlias = (l) => l.filter((x, i) => x !== "--alias" && l[i - 1] !== "--alias");
  assert.deepEqual(ohneAlias(mit).filter((x, i) => x !== "--lora" && ohneAlias(mit)[i - 1] !== "--lora"), ohneAlias(ohne));
});

test("der Bericht sagt, OB ein Adapter aktiv ist", () => {
  const motor = new Motor({ protokoll: stumm });
  assert.equal(motor.bericht().adapter, null, "ohne Adapter muss das Feld leer sein, nicht fehlen");
  motor.adapterPfad = "/var/cache/hausmodell/smejj-1-8/smejj-1-8-lora.gguf";
  assert.equal(motor.bericht().adapter, "smejj-1-8-lora.gguf");
});
