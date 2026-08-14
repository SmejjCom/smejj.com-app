// Wache gegen den Vorfall vom 2026-08-14: Zeaburs Sammelform
// updateEnvironmentVariable(data: Map) ERSETZT die Umgebung, statt Werte
// hinzuzufuegen. Sie hat an einem einzigen Tag ZWEIMAL die Produktionswerte von
// smejj-control geloescht — Sitzungsgeheimnis, Modellschluessel, Speicher- und
// Mailzugang — waehrend das Skript brav "2 Werte gesetzt" meldete.
//
// In dieser Fassung des Skripts liegt der Schutz NICHT in der Auswahl (die
// Punkteformel bevorzugt die Einzelform nur, sie schliesst die Sammelform nicht
// aus), sondern als harte Sperre in setzeUmgebungswerte: findet sie unter den
// Argumenten ein data/variables/envs, bricht sie ab, bevor irgendetwas
// geschrieben wird. Genau diese Sperre haelt hier niemand fest — darum diese
// Wache: sie darf beim naechsten Umbau nicht still verschwinden.
//
// Nach dem TUEV-Prinzip ([[smejj-waechter-tuev]]) bekommt jede Wache eine
// kaputte UND eine gesunde Probe.
import test from "node:test";
import assert from "node:assert/strict";
import {
  findeSetzMutation,
  sammelArgumente,
  setzeUmgebungswerte
} from "../scripts/deploy/zeabur-umgebung-setzen.mjs";

const objektId = (name) => ({
  name,
  type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ObjectID" } }
});
const text = (name) => ({
  name,
  type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "String" } }
});

// Die ersetzende Form: ein einziges Map-Argument traegt ALLE Werte.
const sammelform = (sammelArg = "data", typ = "Map") => ({
  name: "updateEnvironmentVariable",
  args: [
    objektId("serviceID"),
    objektId("environmentID"),
    { name: sammelArg, type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: typ } } }
  ]
});
const SAMMEL = sammelform();

// Die harmlose Form: ein Aufruf setzt genau einen Schluessel.
const EINZELN = {
  name: "createEnvironmentVariable",
  args: [objektId("serviceID"), objektId("environmentID"), text("key"), text("value")]
};

// Antwortet auf die drei Abfragen, die setzeUmgebungswerte stellt (Schema,
// Projekte, Dienste) und legt jede Mutation im Protokoll ab.
function fakeApi(felder) {
  const aufrufe = [];
  const alle = [];
  const abfrage = async (anfrage, variablen) => {
    alle.push(anfrage);
    if (/__schema/.test(anfrage)) return { __schema: { mutationType: { fields: felder } } };
    if (/projects\s*\{/.test(anfrage)) {
      return { projects: { edges: [{ node: {
        _id: "p1",
        name: "smejj",
        environments: [{ _id: "e1", name: "production" }]
      } }] } };
    }
    if (/services\s*\(/.test(anfrage)) {
      return { services: { edges: [{ node: { _id: "s1", name: "smejj-control" } }] } };
    }
    aufrufe.push({ anfrage, variablen });
    return {};
  };
  return { abfrage, aufrufe, alle };
}

const schemaMit = (felder) => fakeApi(felder).abfrage;

test("waehlt die Einzelform, auch wenn die Sammelform danebensteht", async () => {
  const gewaehlt = await findeSetzMutation(schemaMit([SAMMEL, EINZELN]));
  assert.equal(
    gewaehlt.name,
    "createEnvironmentVariable",
    "key/value muss die Sammelform in der Punkteformel schlagen"
  );
});

test("kaputte Probe: gibt es NUR die Sammelform, wird verweigert statt geloescht", async () => {
  const { abfrage } = fakeApi([SAMMEL]);
  await assert.rejects(
    () => setzeUmgebungswerte("smejj-control", { A: "1" }, abfrage),
    /zeabur_ersetzende_mutation_verweigert/,
    "die Sammelform darf nie durchgehen — sie nimmt dem Dienst alle uebrigen Werte"
  );
});

// Das Skript prueft die Mutationsform ABSICHTLICH vor der Dienstsuche: wenn die
// Form ohnehin verweigert wird, soll der Abbruch kommen, bevor irgendetwas
// angefasst wird. Gemessen wird darum die Zahl ALLER Abfragen — genau eine (das
// Schema). Faellt die Sperre weg, laufen zusaetzlich projects und services, und
// dieser Test wird rot; das blosse "es hat geworfen" wuerde es nicht bemerken,
// denn ohne Sperre scheitert der Lauf einen Schritt spaeter aus anderem Grund.
test("kaputte Probe: der Abbruch kommt, BEVOR irgendetwas angefasst wird", async () => {
  const { abfrage, aufrufe, alle } = fakeApi([SAMMEL]);
  await assert.rejects(
    () => setzeUmgebungswerte("smejj-control", { A: "1", B: "2" }, abfrage),
    /zeabur_ersetzende_mutation_verweigert/
  );
  assert.equal(aufrufe.length, 0, "kein einziger Schreibaufruf darf die Sperre passieren");
  assert.equal(alle.length, 1, "nach dem Schema darf nichts mehr abgefragt werden");
  assert.match(alle[0], /__schema/);
});

test("kaputte Probe: auch variables und envs gelten als Sammelform", async () => {
  for (const sammelArg of ["variables", "envs"]) {
    const { abfrage } = fakeApi([sammelform(sammelArg)]);
    await assert.rejects(
      () => setzeUmgebungswerte("smejj-control", { A: "1" }, abfrage),
      /zeabur_ersetzende_mutation_verweigert/,
      `${sammelArg} ist derselbe Loeschweg wie data`
    );
  }
});

// Sperre 1 liest das Schema. Der Name eines Arguments ist dabei das schwaechere
// Merkmal: Zeabur baut sein Schema regelmaessig um, und eine Sammelform, die
// morgen "payload" heisst, waere durch eine reine Namensliste geschluepft. Der
// Map-Typ verraet sie unabhaengig vom Namen.
test("kaputte Probe: eine Sammelform mit fremdem Namen wird am Map-Typ erkannt", async () => {
  const getarnt = sammelform("payload");
  assert.deepEqual(sammelArgumente(getarnt), ["payload"]);
  const { abfrage, aufrufe } = fakeApi([getarnt]);
  await assert.rejects(
    () => setzeUmgebungswerte("smejj-control", { A: "1" }, abfrage),
    /zeabur_ersetzende_mutation_verweigert/,
    "nicht der Name macht sie gefaehrlich, sondern dass sie alle Werte auf einmal traegt"
  );
  assert.equal(aufrufe.length, 0);
});

test("gesunde Probe: die harmlose Einzelform gilt nicht als Sammelform", () => {
  assert.deepEqual(sammelArgumente(EINZELN), [], "key/value darf nie faelschlich blockiert werden");
});

// Umgekehrt bleibt der Name ein Merkmal fuer sich: ein Argument, das "data"
// heisst, gilt auch dann als Sammelform, wenn sein Typ harmlos aussieht. Lieber
// ein Abbruch zu viel als eine geloeschte Umgebung.
test("beide Merkmale zaehlen einzeln — Name auch ohne Map-Typ", () => {
  assert.deepEqual(sammelArgumente(sammelform("data", "String")), ["data"]);
});

// Sperre 2 sitzt eine Ebene tiefer: sie sieht nicht die Form im Schema, sondern
// was tatsaechlich hinausgeht. Eine Mutation kann lauter harmlose
// key/value-Argumente deklarieren und trotzdem ein Sammelgebilde uebertragen,
// weil ein Aufrufer statt eines Wertes ein Objekt uebergibt.
test("kaputte Probe: ein Objekt als Wert wird vor dem Absenden abgefangen", async () => {
  const { abfrage, aufrufe } = fakeApi([EINZELN]);
  await assert.rejects(
    () => setzeUmgebungswerte("smejj-control", { A: { B: "1", C: "2" } }, abfrage),
    /zeabur_sammelwert_verweigert/,
    "eine Map als Wert ist derselbe Loeschweg, nur einen Stock tiefer"
  );
  assert.equal(aufrufe.length, 0, "der Abbruch muss VOR dem Absenden kommen");
});

test("kaputte Probe: Sperre 2 verraet den Wert nicht, nur das Argument", async () => {
  const { abfrage } = fakeApi([EINZELN]);
  const fehler = await setzeUmgebungswerte("smejj-control", { A: { geheim: "s3kr3t" } }, abfrage)
    .then(() => null, (e) => e);
  assert.ok(fehler, "muss werfen");
  assert.match(fehler.message, /\.value\b/, "das betroffene Argument gehoert in die Meldung");
  assert.doesNotMatch(fehler.message, /s3kr3t/, "Werte werden NIEMALS ausgegeben, auch nicht in Fehlertexten");
});

test("gesunde Probe: setzt zwei Werte in zwei Aufrufen — nie eine Map", async () => {
  const { abfrage, aufrufe } = fakeApi([SAMMEL, EINZELN]);
  const ergebnis = await setzeUmgebungswerte("smejj-control", { A: "1", B: "2" }, abfrage);
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.anzahl, 2);
  assert.equal(aufrufe.length, 2, "zwei Werte muessen zwei Aufrufe ergeben");
  for (const aufruf of aufrufe) {
    assert.match(aufruf.anfrage, /createEnvironmentVariable/);
    assert.equal(aufruf.variablen.data, undefined, "niemals eine Map uebergeben");
    assert.ok(aufruf.variablen.key, "jeder Aufruf traegt genau einen Schluessel");
    assert.equal(aufruf.variablen.serviceID, "s1");
    assert.equal(aufruf.variablen.environmentID, "e1");
  }
  assert.deepEqual(aufrufe.map((a) => a.variablen.key).sort(), ["A", "B"]);
  assert.deepEqual(aufrufe.map((a) => a.variablen.value).sort(), ["1", "2"]);
});
