// smejj.com — Unit-Tests fuer die Speicher-Sicht.
//
// Kern: eine abgeschnittene Zaehlung muss sich als abgeschnitten zu erkennen
// geben. Eine Zahl, der man nicht ansieht, dass sie unvollstaendig ist, ist
// schlimmer als gar keine — man trifft Entscheidungen auf ihrer Grundlage.
//
// Ausfuehren: node --test control-server/src/admin/opsSpeicher.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { leseSeite, speicherUebersicht } from "./opsSpeicher.js";

const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "eimer"
});

function seiteXml(eintraege, { abgeschnitten = false, token = "" } = {}) {
  const inhalt = eintraege
    .map((e) => `<Contents><Key>${e.key}</Key><Size>${e.size}</Size><LastModified>${e.at}</LastModified></Contents>`)
    .join("");
  return `<?xml version="1.0"?><ListBucketResult>${inhalt}`
    + `<IsTruncated>${abgeschnitten}</IsTruncated>`
    + (token ? `<NextContinuationToken>${token}</NextContinuationToken>` : "")
    + "</ListBucketResult>";
}

test("die Seite wird richtig gelesen: Anzahl, Bytes, juengste Aenderung", () => {
  const seite = leseSeite(seiteXml([
    { key: "a.json", size: 100, at: "2026-07-01T00:00:00.000Z" },
    { key: "b.json", size: 250, at: "2026-07-28T09:00:00.000Z" }
  ]));
  assert.equal(seite.objekte, 2);
  assert.equal(seite.bytes, 350);
  assert.equal(seite.neuestes, "2026-07-28T09:00:00.000Z");
  assert.equal(seite.abgeschnitten, false);
});

test("eine leere Antwort ergibt Nullen, keinen Absturz", () => {
  const seite = leseSeite("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>");
  assert.equal(seite.objekte, 0);
  assert.equal(seite.bytes, 0);
  assert.equal(seite.neuestes, "");
});

test("ohne IDrive-Zugang wird das gesagt, nicht geraten", async () => {
  const e = await speicherUebersicht({ env: {}, fetchImpl: async () => { throw new Error("nie erreicht"); } });
  assert.equal(e.ok, false);
  assert.equal(e.error, "speicher_nicht_eingerichtet");
});

test("zwei Bereiche werden getrennt gezaehlt und aufsummiert", async () => {
  const fetchImpl = async (url) => {
    const prefix = new URL(String(url)).searchParams.get("prefix");
    if (prefix === "a/") return antwort(seiteXml([{ key: "a/1", size: 10, at: "2026-07-01T00:00:00.000Z" }]));
    return antwort(seiteXml([
      { key: "b/1", size: 20, at: "2026-07-02T00:00:00.000Z" },
      { key: "b/2", size: 30, at: "2026-07-03T00:00:00.000Z" }
    ]));
  };
  const e = await speicherUebersicht({
    env: ENV, fetchImpl,
    bereiche: [{ schluessel: "a/", name: "A" }, { schluessel: "b/", name: "B" }]
  });
  assert.equal(e.ok, true);
  assert.equal(e.objekteGesamt, 3);
  assert.equal(e.bytesGesamt, 60);
  assert.equal(e.unvollstaendig, false);
  assert.equal(e.bereiche.find((b) => b.name === "B").objekte, 2);
});

test("wird abgeschnitten, sagt die Antwort das ausdruecklich", async () => {
  // Immer "es geht weiter": nach vier Seiten muss Schluss sein.
  let seiten = 0;
  const fetchImpl = async () => {
    seiten += 1;
    return antwort(seiteXml([{ key: `k${seiten}`, size: 5, at: "2026-07-01T00:00:00.000Z" }],
      { abgeschnitten: true, token: `weiter-${seiten}` }));
  };
  const e = await speicherUebersicht({ env: ENV, fetchImpl, bereiche: [{ schluessel: "viel/", name: "Viel" }] });
  assert.equal(seiten, 4, "hoechstens vier Seiten je Bereich");
  assert.equal(e.bereiche[0].abgeschnitten, true);
  assert.equal(e.unvollstaendig, true);
  assert.equal(e.hinweis.includes("4 Seiten"), true);
});

test("Release-Artefakte werden im Deploy-Eimer gesucht, nicht im Haupteimer", async () => {
  // Live gemessen (28.07.2026): der Betrieb nutzt zwei Eimer. Wer alles im
  // Haupteimer sucht, bekommt fuer die Artefakte eine Null — und eine Null
  // sieht aus wie "nichts da", nicht wie "am falschen Ort gesucht".
  const gefragt = [];
  const fetchImpl = async (url) => {
    const adresse = new URL(String(url));
    gefragt.push({ eimer: adresse.pathname.replace(/^\//, ""), prefix: adresse.searchParams.get("prefix") });
    return antwort(seiteXml([{ key: "x", size: 1, at: "2026-07-01T00:00:00.000Z" }]));
  };
  const e = await speicherUebersicht({
    env: { ...ENV, IDRIVE_E2_DEPLOY_BUCKET: "eimer-deploy" },
    fetchImpl,
    bereiche: [
      { schluessel: "auth/email-users/", name: "Konten", eimer: "haupt" },
      { schluessel: "deployments/control/", name: "Artefakte", eimer: "deploy" }
    ]
  });
  const konten = gefragt.find((g) => g.prefix === "auth/email-users/");
  const artefakte = gefragt.find((g) => g.prefix === "deployments/control/");
  assert.equal(konten.eimer, "eimer", "Daten im Haupteimer");
  assert.equal(artefakte.eimer, "eimer-deploy", "Artefakte im Deploy-Eimer");
  assert.equal(e.deployEimer, "eimer-deploy");
  assert.equal(e.bereiche.find((b) => b.name === "Artefakte").eimer, "eimer-deploy",
    "der Eimer steht in der Antwort — sonst ist eine Null nicht deutbar");
});

test("ohne eigenen Deploy-Eimer bleibt alles im Haupteimer", async () => {
  const gefragt = [];
  const fetchImpl = async (url) => {
    gefragt.push(new URL(String(url)).pathname.replace(/^\//, ""));
    return antwort(seiteXml([]));
  };
  await speicherUebersicht({
    env: ENV, fetchImpl,
    bereiche: [{ schluessel: "deployments/control/", name: "Artefakte", eimer: "deploy" }]
  });
  assert.deepEqual(gefragt, ["eimer"], "kein zweiter Eimer konfiguriert, also der eine");
});

test("ein ausgefallener Bereich kippt die uebrigen nicht", async () => {
  const fetchImpl = async (url) => {
    const prefix = new URL(String(url)).searchParams.get("prefix");
    if (prefix === "kaputt/") return { ok: false, status: 503, text: async () => "" };
    return antwort(seiteXml([{ key: "gut/1", size: 42, at: "2026-07-01T00:00:00.000Z" }]));
  };
  const e = await speicherUebersicht({
    env: ENV, fetchImpl,
    bereiche: [{ schluessel: "kaputt/", name: "Kaputt" }, { schluessel: "gut/", name: "Gut" }]
  });
  assert.equal(e.ok, true);
  assert.equal(e.bereiche.find((b) => b.name === "Kaputt").erreichbar, false);
  assert.equal(e.bereiche.find((b) => b.name === "Gut").bytes, 42);
});

function antwort(text) {
  return { ok: true, status: 200, text: async () => text };
}
