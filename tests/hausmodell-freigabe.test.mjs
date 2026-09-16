// Schritt 3 des Lernwegs (17.09.2026): das Hausmodell laedt eine von der
// Trainingsschleife freigegebene Version — und nur eine vollstaendig beschriebene.
import test from "node:test";
import assert from "node:assert/strict";
import { FREIGABE_KEY, freigabeGeaendert, leseFreigabe, mitFreigabe } from "../workers/smejj-hausmodell/freigabe.js";

const e2Mit = (wert) => ({ liesJson: async (key) => (key === FREIGABE_KEY ? wert : null) });
const ADAPTER = { datei: "smejj-1-11.gguf", sha256: "a".repeat(64), sizeBytes: 4096, prefix: "con/versions/smejj-1-11/adapter-gguf" };
const BASIS = { id: "smejj-1-basis", datei: "q.gguf" };

test("keine Datei = Basis, halbe Beschreibung = Basis", async () => {
  assert.equal(await leseFreigabe(e2Mit(null)), null);
  assert.equal(await leseFreigabe(e2Mit({ modell: "smejj-1-basis", adapter: { datei: "x.gguf" } })), null);
});

test("vollstaendige Freigabe haengt den Adapter nur an das genannte Modell", async () => {
  const f = await leseFreigabe(e2Mit({ modell: "smejj-1-basis", version: "smejj-1-11", adapter: ADAPTER }));
  assert.equal(f.version, "smejj-1-11");
  const mit = mitFreigabe(BASIS, f);
  assert.equal(mit.adapter.sha256, ADAPTER.sha256);
  assert.equal(mit.adapter.prefix, ADAPTER.prefix);
  assert.equal(BASIS.adapter, undefined, "der Katalogeintrag selbst bleibt unveraendert");
  assert.equal(mitFreigabe({ id: "bitnet-b1.58-2b-4t" }, f).adapter, undefined);
  assert.equal(mitFreigabe(BASIS, null), BASIS);
});

test("Aenderung erkennt neue Version und Rueckkehr zur Basis", () => {
  const a = { modell: "smejj-1-basis", adapter: ADAPTER };
  assert.equal(freigabeGeaendert(null, null), false);
  assert.equal(freigabeGeaendert(null, a), true);
  assert.equal(freigabeGeaendert(a, { ...a }), false);
  assert.equal(freigabeGeaendert(a, { modell: "smejj-1-basis", adapter: { ...ADAPTER, sha256: "b".repeat(64) } }), true);
  assert.equal(freigabeGeaendert(a, null), true);
});
