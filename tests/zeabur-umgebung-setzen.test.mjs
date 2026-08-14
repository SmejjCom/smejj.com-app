// Wache gegen den Vorfall vom 2026-08-14: Zeaburs Sammelform
// updateEnvironmentVariable(data: Map) ERSETZT die Umgebung. Sie hat zweimal an
// einem Tag die Produktionswerte von smejj-control geloescht — beim zweiten Mal,
// obwohl die Gefahr bekannt war, weil die Mutationsauswahl sie sogar BEVORZUGTE.
//
// Nach dem TUEV-Prinzip ([[smejj-waechter-tuev]]) bekommt jede Wache eine
// kaputte UND eine gesunde Probe.
import test from "node:test";
import assert from "node:assert/strict";
import { findeSetzMutation, istSammelform, setzeUmgebungswerte } from "../scripts/deploy/zeabur-umgebung-setzen.mjs";

const SAMMEL = {
  name: "updateEnvironmentVariable",
  args: [
    { name: "serviceID", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ObjectID" } } },
    { name: "environmentID", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ObjectID" } } },
    { name: "data", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "Map" } } }
  ]
};
const EINZELN = {
  name: "createEnvironmentVariable",
  args: [
    { name: "serviceID", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ObjectID" } } },
    { name: "environmentID", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ObjectID" } } },
    { name: "key", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "String" } } },
    { name: "value", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "String" } } }
  ]
};

function schemaMit(felder) {
  return async () => ({ __schema: { mutationType: { fields: felder } } });
}

test("erkennt die Sammelform an ihrem Map-Argument", () => {
  assert.equal(istSammelform(SAMMEL), true);
  assert.equal(istSammelform(EINZELN), false);
});

test("waehlt die Einzelform, auch wenn die Sammelform danebensteht", async () => {
  const gewaehlt = await findeSetzMutation(schemaMit([SAMMEL, EINZELN]));
  assert.equal(gewaehlt.name, "createEnvironmentVariable");
});

test("kaputte Probe: gibt es NUR die Sammelform, wird nichts gewaehlt", async () => {
  const gewaehlt = await findeSetzMutation(schemaMit([SAMMEL]));
  assert.equal(gewaehlt, null, "die Sammelform darf nie als brauchbar gelten");
});

test("setzt Werte einzeln — ein Aufruf je Wert, nie eine Map", async () => {
  const aufrufe = [];
  const abfrage = async (text, variablen) => {
    if (/__schema/.test(text)) return { __schema: { mutationType: { fields: [SAMMEL, EINZELN] } } };
    if (/projects\s*\{/.test(text)) {
      return { projects: { edges: [{ node: {
        _id: "p1", name: "smejj",
        environments: [{ _id: "e1", name: "production" }]
      } }] } };
    }
    if (/services\s*\(/.test(text)) {
      return { services: { edges: [{ node: { _id: "s1", name: "smejj-control" } }] } };
    }
    aufrufe.push({ text, variablen });
    return {};
  };
  const ergebnis = await setzeUmgebungswerte("smejj-control", { A: "1", B: "2" }, abfrage);
  assert.equal(ergebnis.anzahl, 2);
  assert.equal(aufrufe.length, 2, "zwei Werte muessen zwei Aufrufe ergeben");
  for (const aufruf of aufrufe) {
    assert.match(aufruf.text, /createEnvironmentVariable/);
    assert.equal(aufruf.variablen.data, undefined, "niemals eine Map uebergeben");
    assert.ok(aufruf.variablen.key, "jeder Aufruf traegt genau einen Schluessel");
  }
  assert.deepEqual(aufrufe.map((a) => a.variablen.key).sort(), ["A", "B"]);
});
