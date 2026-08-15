// smejj.com — Tests fuer das automatische Setzen von Zeabur-Umgebungswerten.
//
// Das Modul erkundet Zeaburs Schema zur Laufzeit; genau deshalb muss es gegen
// MEHRERE plausible Schema-Formen geprueft werden. Alles ohne Netz und ohne
// Schluessel: die Abfrage wird injiziert.
//
// DER WICHTIGSTE TEST HIER ist der letzte: Sammel-Mutationen sind verboten.
// Am 2026-08-14 hat `updateEnvironmentVariable(data: Map)` bei Zeabur die
// Umgebung nicht ergaenzt, sondern ERSETZT — ein Aufruf mit zwei Stripe-Werten
// loeschte an smejj-control alle uebrigen 19 Variablen (Sitzungsgeheimnis,
// Modellschluessel, Speicher- und Mailzugang) und meldete dabei "2 Werte
// gesetzt". Diese Tests halten den Riegel fest, damit niemand die Sammelform
// als "effizienter" wieder einbaut.
import test from "node:test";
import assert from "node:assert/strict";
import {
  argTyp, findeDienst, findeSetzMutation, sammelArgumente, setzeUmgebungswerte
} from "../scripts/deploy/zeabur-umgebung-setzen.mjs";

const PROJEKTE = {
  projects: { edges: [{ node: { _id: "proj1", name: "smejj", environments: [{ _id: "env1", name: "production" }] } }] }
};

const DIENSTE = {
  services: { edges: [
    { node: { _id: "svc-control", name: "smejj-control" } },
    { node: { _id: "svc-bridge", name: "smejj-chat-bridge" } }
  ] }
};

const NONNULL = (name) => ({ kind: "NON_NULL", ofType: { kind: "SCALAR", name } });

// Beide Formen nebeneinander: die gefaehrliche Sammelform MUSS liegen bleiben,
// obwohl sie mit "update" im Namen verlockender aussieht.
const SCHEMA_BEIDE = {
  __schema: { mutationType: { fields: [
    { name: "deleteEnvironmentVariable", args: [{ name: "serviceID", type: NONNULL("ObjectID") }] },
    { name: "updateEnvironmentVariable", args: [
      { name: "serviceID", type: NONNULL("ObjectID") },
      { name: "environmentID", type: NONNULL("ObjectID") },
      { name: "data", type: NONNULL("Map") }
    ] },
    { name: "setEnvironmentVariable", args: [
      { name: "serviceID", type: NONNULL("ObjectID") },
      { name: "environmentID", type: NONNULL("ObjectID") },
      { name: "key", type: NONNULL("String") },
      { name: "value", type: NONNULL("String") }
    ] },
    { name: "restartService", args: [
      { name: "serviceID", type: NONNULL("ObjectID") },
      { name: "environmentID", type: NONNULL("ObjectID") }
    ] }
  ] } }
};

// NUR die Sammelform vorhanden: dann lieber gar nichts tun.
const SCHEMA_NUR_SAMMEL = {
  __schema: { mutationType: { fields: [
    { name: "updateEnvironmentVariable", args: [
      { name: "serviceID", type: NONNULL("ObjectID") },
      { name: "environmentID", type: NONNULL("ObjectID") },
      { name: "data", type: NONNULL("Map") }
    ] }
  ] } }
};

// Zeabur hat umgebaut — keine passende Mutation mehr.
const SCHEMA_LEER = { __schema: { mutationType: { fields: [{ name: "createProject", args: [] }] } } };

function abfrageMit(schema) {
  const aufrufe = [];
  const abfrage = async (query, variablen) => {
    aufrufe.push({ query, variablen });
    if (query.includes("services(")) return DIENSTE;
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
  const { abfrage, aufrufe } = abfrageMit(SCHEMA_BEIDE);
  const dienst = await findeDienst("smejj-control", abfrage);
  assert.equal(dienst.serviceId, "svc-control");
  assert.equal(dienst.environmentId, "env1");
  // Dienste kommen ueber eine EIGENE Abfrage: Project.services ist bei Zeabur
  // eine schlichte Liste, die verschachtelte Fassung endete mit HTTP 422.
  assert.ok(aufrufe.some((a) => a.query.includes("services(")));
  await assert.rejects(() => findeDienst("gibt-es-nicht", abfrage), /zeabur_dienst_nicht_gefunden/);
});

test("sammelArgumente erkennt genau die Formen, die die Umgebung ersetzen", () => {
  assert.deepEqual(sammelArgumente({ args: [{ name: "data", type: NONNULL("Map") }] }), ["data"]);
  assert.deepEqual(sammelArgumente({ args: [{ name: "variables", type: NONNULL("String") }] }), ["variables"]);
  assert.deepEqual(sammelArgumente({ args: [{ name: "envs", type: NONNULL("String") }] }), ["envs"]);
  // Ein harmlos benanntes Argument mit Map-Typ ist ebenfalls eine Sammelform —
  // auf den Namen allein waere kein Verlass.
  assert.deepEqual(sammelArgumente({ args: [{ name: "payload", type: NONNULL("Map") }] }), ["payload"]);
  assert.deepEqual(sammelArgumente({
    args: [{ name: "key", type: NONNULL("String") }, { name: "value", type: NONNULL("String") }]
  }), []);
  assert.deepEqual(sammelArgumente(null), []);
});

test("findeSetzMutation MEIDET die Sammelform und nimmt key/value", async () => {
  const { abfrage } = abfrageMit(SCHEMA_BEIDE);
  const mutation = await findeSetzMutation(abfrage);
  assert.equal(mutation.name, "setEnvironmentVariable");
});

test("key/value-Form: ein Aufruf je Wert, Werte korrekt verteilt", async () => {
  const { abfrage, aufrufe } = abfrageMit(SCHEMA_BEIDE);
  const ergebnis = await setzeUmgebungswerte("smejj-control", { A: "1", B: "2" }, abfrage);
  assert.deepEqual(ergebnis, { ok: true, mutation: "setEnvironmentVariable", anzahl: 2 });
  const setzAufrufe = aufrufe.filter((a) => a.query.startsWith("mutation Setze"));
  assert.equal(setzAufrufe.length, 2);
  assert.deepEqual(setzAufrufe.map((a) => [a.variablen.key, a.variablen.value]), [["A", "1"], ["B", "2"]]);
  assert.equal(setzAufrufe[0].variablen.serviceID, "svc-control");
  assert.equal(setzAufrufe[0].variablen.environmentID, "env1");
  // Kein Geheimwert darf in einer Antwort angefordert werden.
  assert.ok(setzAufrufe.every((a) => !/\{\s*value\s*\}/.test(a.query)));
});

test("NUR Sammelform vorhanden: verweigern, bevor irgendetwas angefasst wird", async () => {
  const { abfrage, aufrufe } = abfrageMit(SCHEMA_NUR_SAMMEL);
  // Zwei Riegel liegen hier hintereinander (Auswahl und Ausfuehrung); welcher
  // zuerst greift, ist Umbau-abhaengig. Wichtig ist NUR: es wird abgebrochen
  // und nichts angefasst.
  await assert.rejects(
    () => setzeUmgebungswerte("smejj-control", { A: "1" }, abfrage),
    /zeabur_(setz_mutation_nicht_gefunden|ersetzende_mutation_verweigert)/
  );
  // Weder gesetzt noch ueberhaupt nach dem Dienst gefragt: der Abbruch kommt
  // vor jedem anderen Schritt, damit nichts halb passiert.
  assert.equal(aufrufe.filter((a) => a.query.startsWith("mutation Setze")).length, 0);
  assert.equal(aufrufe.filter((a) => a.query.includes("services(")).length, 0);
});

test("Umbau bei Zeabur: lieber ehrlich scheitern als still nichts tun", async () => {
  const { abfrage } = abfrageMit(SCHEMA_LEER);
  assert.equal(await findeSetzMutation(abfrage), null);
  await assert.rejects(
    () => setzeUmgebungswerte("smejj-control", { A: "1" }, abfrage),
    /zeabur_setz_mutation_nicht_gefunden/
  );
});
