// smejj.com — Lernrunde der Trainingsschleife (Betreiber 17.09.2026):
// erst ab 500 neuen Lernpaaren trainieren, nur besser als der Stand davor live.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AKTIVER_ADAPTER_KEY, LERNRUNDE_STAND_KEY, baueLernrundenDatensatz, baueLernrundenTor,
  befoerdereZumHausmodell, lernrundeFaellig
} from "../workers/smejj-lora-loop/lernrunde.js";
import { baueJobWeg } from "../workers/smejj-lora-loop/saladWeg.js";
import { ladeLoopKonfiguration } from "../workers/smejj-lora-loop/config.js";

function e2Attrappe(objekte = {}) {
  const ablage = new Map(Object.entries(objekte));
  return {
    ablage,
    async liste(prefix) { return [...ablage.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: 1 })); },
    async getJson(key, standard = null) { return ablage.has(key) ? JSON.parse(ablage.get(key)) : standard; },
    async getText(key) { return ablage.has(key) ? ablage.get(key) : null; },
    async putJson(key, wert) { ablage.set(key, JSON.stringify(wert)); },
    async putText(key, text) { ablage.set(key, text); }
  };
}
const lernpaar = (i) => JSON.stringify({ frage: `Frage Nummer ${i}?`, antwort: `Antwort Nummer ${i}.` });
const basisZeile = JSON.stringify({ messages: [{ role: "user", content: "Was ist smejj?" }, { role: "assistant", content: "Ein KI-Assistent." }] });
const JETZT = () => new Date("2026-09-17T08:00:00Z");

test("lernrundeFaellig zaehlt nur NEUE Paare seit der letzten Runde", () => {
  assert.deepEqual(lernrundeFaellig({ anzahlJetzt: 499, ziel: 500 }), { faellig: false, neu: 499, ziel: 500 });
  assert.equal(lernrundeFaellig({ anzahlJetzt: 500, ziel: 500 }).faellig, true);
  assert.equal(lernrundeFaellig({ anzahlJetzt: 900, anzahlBeiLetzterRunde: 500, ziel: 500 }).faellig, false);
  assert.equal(lernrundeFaellig({ anzahlJetzt: 1000, anzahlBeiLetzterRunde: 500, ziel: 500 }).faellig, true);
});

test("Tor zu: unter dem Ziel wird nichts gebaut und nichts trainiert", async () => {
  const e2 = e2Attrappe({ "training/fragen/lernpaare/2026/09/17/a.json": lernpaar(1), "datasets/smejj-1-10/train.jsonl": basisZeile });
  const tor = baueLernrundenTor({ e2, ziel: 3, basisName: "smejj-1-10", datensatzName: "lernrunde-smejj-1-5", jetzt: JETZT });
  const r = await tor();
  assert.equal(r.vorhanden, false);
  assert.deepEqual(r.gruende, ["lernrunde_wartet:1_von_3_neuen_lernpaaren"]);
  assert.equal(e2.ablage.has("datasets/lernrunde-smejj-1-5/train.jsonl"), false);
  assert.equal(e2.ablage.has(LERNRUNDE_STAND_KEY), false);
});

test("Tor offen: Datensatz = Basis + Lernpaare, Stand fortgeschrieben, naechste Runde braucht wieder neue Paare", async () => {
  const objekte = { "datasets/smejj-1-10/train.jsonl": `${basisZeile}\n` };
  for (let i = 0; i < 3; i += 1) objekte[`training/fragen/lernpaare/2026/09/17/p${i}.json`] = lernpaar(i);
  const e2 = e2Attrappe(objekte);
  const tor = baueLernrundenTor({ e2, ziel: 3, basisName: "smejj-1-10", datensatzName: "lernrunde-smejj-1-5", jetzt: JETZT });
  const r = await tor();
  assert.deepEqual(r, { vorhanden: true, zeilen: 4, name: "lernrunde-smejj-1-5" });
  const manifest = JSON.parse(e2.ablage.get("datasets/lernrunde-smejj-1-5/manifest.json"));
  assert.equal(manifest.paare, 4);
  assert.equal(manifest.lernpaare, 3);
  const zeilen = e2.ablage.get("datasets/lernrunde-smejj-1-5/train.jsonl").trim().split("\n").map((z) => JSON.parse(z));
  assert.equal(zeilen[1].messages[0].role, "user");
  assert.equal(zeilen[1].messages[1].role, "assistant");
  assert.deepEqual(JSON.parse(e2.ablage.get(LERNRUNDE_STAND_KEY)).lernpaare, 3);
  const zweite = await baueLernrundenTor({ e2, ziel: 3, basisName: "smejj-1-10", datensatzName: "lernrunde-smejj-1-6", jetzt: JETZT })();
  assert.equal(zweite.vorhanden, false, "dieselben Paare loesen keine zweite Runde aus");
});

test("Datensatz: doppelte und leere Lernpaare fallen heraus", () => {
  const { manifest } = baueLernrundenDatensatz({
    basisText: basisZeile,
    lernpaare: [{ frage: "Was ist smejj?", antwort: "Ein KI-Assistent." }, { frage: "Hallo?", antwort: "" }, JSON.parse(lernpaar(7))],
    name: "x", basisName: "b", jetzt: JETZT
  });
  assert.equal(manifest.paare, 2);
  assert.equal(manifest.lernpaare, 1);
  assert.equal(manifest.lernpaareVerworfen, 2);
});

test("Befoerderung: nur mit vollstaendigem Adapter, dann Freigabe fuer das Hausmodell", async () => {
  const prefix = "con/versions/smejj-1-5/adapter-gguf";
  const halb = e2Attrappe({ [`${prefix}/adapter.json`]: JSON.stringify({ datei: "a.gguf" }) });
  assert.equal(await befoerdereZumHausmodell({ e2: halb, stand: { adapterSchluessel: prefix, version: "smejj-1-5" } }), false);
  assert.equal(halb.ablage.has(AKTIVER_ADAPTER_KEY), false);

  const ganz = e2Attrappe({ [`${prefix}/adapter.json`]: JSON.stringify({ datei: "a.gguf", sha256: "c".repeat(64), sizeBytes: 123, prefix }) });
  assert.equal(await befoerdereZumHausmodell({ e2: ganz, stand: { adapterSchluessel: prefix, version: "smejj-1-5", kennzahlen: { punktzahl: 0.71 } }, jetzt: JETZT }), true);
  const frei = JSON.parse(ganz.ablage.get(AKTIVER_ADAPTER_KEY));
  assert.equal(frei.modell, "smejj-1-basis");
  assert.equal(frei.version, "smejj-1-5");
  assert.deepEqual(frei.adapter, { datei: "a.gguf", sha256: "c".repeat(64), sizeBytes: 123, prefix });
});

test("Job-Weg: mit Lernrunde eigener Datensatz je Version und eine Befoerderung, ohne Lernrunde alles wie bisher", () => {
  const client = { async lese() { return { ok: true, status: 200, daten: {} }; } };
  const suite = { cases: [{ id: "a" }] };
  const mit = baueJobWeg({ konfig: { salad: {}, versionPraefix: "smejj-1-", versionStart: 11, datensatzName: "smejj-1-10", lernrunde: true, lernrundeZiel: 500 }, zyklusIndex: 0, e2: e2Attrappe(), suite, client });
  assert.equal(mit.version, "smejj-1-11");
  assert.equal(mit.datensatzName, "lernrunde-smejj-1-11");
  assert.equal(typeof mit.befoerdere, "function");
  const ohne = baueJobWeg({ konfig: { salad: {}, versionPraefix: "smejj-1-", versionStart: 11, datensatzName: "smejj-1-10" }, zyklusIndex: 0, e2: e2Attrappe(), suite, client });
  assert.equal(ohne.datensatzName, "smejj-1-10");
  assert.equal(ohne.befoerdere, null);
});

test("Konfiguration: Lernrunde an, Ziel 500, Basiswert nur wenn gesetzt", () => {
  const k = ladeLoopKonfiguration({});
  assert.equal(k.lernrunde, true);
  assert.equal(k.lernrundeZiel, 500);
  assert.equal(k.basisPunktzahl, null);
  assert.equal(ladeLoopKonfiguration({ SMEJJ_LORA_BASIS_PUNKTZAHL: "0.684" }).basisPunktzahl, 0.684);
  assert.equal(ladeLoopKonfiguration({ SMEJJ_LERNRUNDE: "NO" }).lernrunde, false);
});
