// smejj.com — Tests fuer das automatische Setzen von Zeabur-Umgebungswerten.
//
// Das Modul erkundet Zeaburs Schema zur Laufzeit; genau deshalb muss es gegen
// MEHRERE plausible Schema-Formen geprueft werden. Alles ohne Netz und ohne
// Schluessel: die Abfrage wird injiziert.
import test from "node:test";
import assert from "node:assert/strict";
import { argTyp, findeDienst, findeSetzMutation, setzeUmgebungswerte } from "../scripts/deploy/zeabur-umgebung-setzen.mjs";

const PROJEKTE = {
  projects: {
    edges: [{
      node: {
        _id: "proj1",
        name: "smejj",
        environments: [{ _id: "env1", name: "production" }],
        services: { edges: [{ node: { _id: "svc-control", name: "smejj-control" } }, { node: { _id: "svc-bridge", name: "smejj-chat-bridge" } }] }
      }
    }]
  }
};

const NONNULL = (name) => ({ kind: "NON_NULL", ofType: { kind: "SCALAR", name } });

// Form A: eine Mutation nimmt alle Werte als Map.
const SCHEMA_SAMMEL = {
  __schema: { mutationType: { fields: [
    { name: "deleteEnvironmentVariable", args: [{ name: "serviceID", type: NONNULL("ObjectID") }] },
    { name: "updateEnvironmentVariable", args: [
      { name: "serviceID", type: NONNULL("ObjectID") },
      { name: "environmentID", type: NONNULL("ObjectID") },
      { name: "data", type: NONNULL("Map") }
    ] },
    { name: "restartService", args: [
      { name: "serviceID", type: NONNULL("ObjectID") },
      { name: "environmentID", type: NONNULL("ObjectID") }
    ] }
  ] } }
};

// Form B: nur key/value, ein Aufruf je Wert.
const SCHEMA_EINZELN = {
  __schema: { mutationType: { fields: [
    { name: "setEnvironmentVariable", args: [
      { name: "serviceID", type: NONNULL("ObjectID") },
      { name: "environmentID", type: NONNULL("ObjectID") },
      { name: "key", type: NONNULL("String") },
      { name: "value", type: NONNULL("String") }
    ] }
  ] } }
};

// Form C: gar keine passende Mutation (Zeabur hat umgebaut).
const SCHEMA_LEER = { __schema: { mutationType: { fields: [{ name: "createProject", args: [] }] } } };

function abfrageMit(schema) {
  const aufrufe = [];
  const abfrage = async (query, variablen) => {
    aufrufe.push({ query, variablen });
    if (query.includes("projects")) return PROJEKTE;
    if (query.includes("__schema")) return schema;
    return { ok: true };
  };
  return { abfrage, aufrufe };
}

test("argTyp bildet NonNull und Listen korrekt ab", () => {
  assert.equal(argTyp({ type: { kind: "SCALAR", name: "String" } }), "String");
  assert.equal(argTyp({ type: NONNULL("ObjectID") }), "ObjectID!");
  assert.equal(argTyp({ type: { kind: "LIST", ofType: NONNULL("String") } }), "[String!]");
  assert.equal(argTyp({ type: null }), "String");
});

test("findeDienst liefert Dienst- und Umgebungs-ID, nicht den falschen Dienst", async () => {
  const { abfrage } = abfrageMit(SCHEMA_SAMMEL);
  const dienst = await findeDienst("smejj-control", abfrage);
  assert.equal(dienst.serviceId, "svc-control");
  assert.equal(dienst.environmentId, "env1");
  await assert.rejects(() => findeDienst("gibt-es-nicht", abfrage), /zeabur_dienst_nicht_gefunden/);
});

test("findeSetzMutation bevorzugt die Sammel-Mutation und meidet Loeschen", async () => {
  const { abfrage } = abfrageMit(SCHEMA_SAMMEL);
  const mutation = await findeSetzMutation(abfrage);
  assert.equal(mutation.name, "updateEnvironmentVariable");
});

test("Sammel-Form: EIN Aufruf mit allen Werten und den richtigen IDs", async () => {
  const { abfrage, aufrufe } = abfrageMit(SCHEMA_SAMMEL);
  const ergebnis = await setzeUmgebungswerte("smejj-control", { A: "1", B: "2" }, abfrage);
  assert.deepEqual(ergebnis, { ok: true, mutation: "updateEnvironmentVariable", anzahl: 2 });
  const setzAufrufe = aufrufe.filter((a) => a.query.startsWith("mutation Setze"));
  assert.equal(setzAufrufe.length, 1);
  assert.match(setzAufrufe[0].query, /\$serviceID: ObjectID!/);
  assert.deepEqual(setzAufrufe[0].variablen, {
    serviceID: "svc-control", environmentID: "env1", data: { A: "1", B: "2" }
  });
});

test("key/value-Form: ein Aufruf je Wert, Werte korrekt verteilt", async () => {
  const { abfrage, aufrufe } = abfrageMit(SCHEMA_EINZELN);
  const ergebnis = await setzeUmgebungswerte("smejj-control", { A: "1", B: "2" }, abfrage);
  assert.equal(ergebnis.anzahl, 2);
  const setzAufrufe = aufrufe.filter((a) => a.query.startsWith("mutation Setze"));
  assert.equal(setzAufrufe.length, 2);
  assert.deepEqual(setzAufrufe.map((a) => [a.variablen.key, a.variablen.value]), [["A", "1"], ["B", "2"]]);
  assert.equal(setzAufrufe[0].variablen.serviceID, "svc-control");
});

test("Umbau bei Zeabur: lieber ehrlich scheitern als still nichts tun", async () => {
  const { abfrage } = abfrageMit(SCHEMA_LEER);
  assert.equal(await findeSetzMutation(abfrage), null);
  await assert.rejects(
    () => setzeUmgebungswerte("smejj-control", { A: "1" }, abfrage),
    /zeabur_setz_mutation_nicht_gefunden/
  );
});
