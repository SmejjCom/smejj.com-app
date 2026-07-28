// smejj.com — Unit-Tests fuer den Datensatz-Speicher.
//
// Der wichtigste Test hier bildet einen LIVE GEMESSENEN Fall nach (28.07.2026):
// Ein Feature-Flag wurde erfolgreich geschrieben (HTTP 201, Audit-Eintrag da),
// erschien aber rund eine Minute lang nicht in der Uebersicht. Ursache war nicht
// der Schreibvorgang, sondern der LIST-Index von IDrive e2, der nachhinkt.
// Fuer die Bedienerin sieht so etwas aus wie "mein Klick hat nichts getan" —
// und der zweite Klick legt dann den zweiten Datensatz an.
//
// Ausfuehren: node --test control-server/src/admin/recordStore.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createRecordStore, neueKennung } from "./recordStore.js";

const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "eimer"
});

/**
 * Erfindet einen IDrive e2, dessen LIST-Antwort erst dann von einem Objekt
 * weiss, wenn es ausdruecklich freigeschaltet wurde.
 */
function nachhinkenderSpeicher() {
  const objekte = new Map();
  const imIndex = new Set();
  let abrufe = 0;
  const fetchImpl = async (url, optionen = {}) => {
    if ((optionen.method || "GET") === "GET") abrufe += 1;
    const adresse = new URL(String(url));
    if ((optionen.method || "GET") === "PUT") {
      objekte.set(adresse.pathname, String(optionen.body || ""));
      return new Response("", { status: 200 });
    }
    if (adresse.searchParams.get("list-type") === "2") {
      const sichtbar = [...imIndex].map((k) => `<Contents><Key>${k}</Key></Contents>`).join("");
      return new Response(
        `<?xml version="1.0"?><ListBucketResult>${sichtbar}<IsTruncated>false</IsTruncated></ListBucketResult>`,
        { status: 200 }
      );
    }
    const inhalt = objekte.get(adresse.pathname);
    return inhalt === undefined
      ? new Response("", { status: 404 })
      : new Response(inhalt, { status: 200 });
  };
  return {
    fetchImpl,
    abrufe: () => abrufe,
    // Was IDrive e2 nach einer Weile von selbst tut.
    indexHoltAuf() {
      for (const pfad of objekte.keys()) imIndex.add(pfad.replace(/^\/[^/]+\//, ""));
    },
    // Aenderung an IDrive e2 vorbei — steht fuer eine zweite Bedienerin auf
    // einem anderen Prozess.
    fremdeAenderung(id, datensatz, praefix) {
      objekte.set(`/eimer/${praefix}/${id}.json`, JSON.stringify(datensatz));
      imIndex.add(`${praefix}/${id}.json`);
    }
  };
}

test("ein frisch geschriebener Datensatz ist sofort sichtbar, auch wenn der Index noch nichts weiss", async () => {
  const { fetchImpl, indexHoltAuf } = nachhinkenderSpeicher();
  const store = createRecordStore("admin/test-flags");
  const datensatz = { id: neueKennung("flag"), name: "abnahme", createdAt: "2026-07-28T12:30:00.000Z" };

  await store.schreib(datensatz, { env: ENV, fetchImpl });

  const sofort = await store.liste({ env: ENV, fetchImpl });
  assert.equal(sofort.ok, true);
  assert.equal(sofort.total, 1, "der eigene Schreibvorgang darf nicht unsichtbar sein");
  assert.equal(sofort.datensaetze[0].name, "abnahme");

  // Sobald der Index aufholt, kommt derselbe Datensatz aus der echten Quelle —
  // und zwar genau einmal, nicht doppelt.
  indexHoltAuf();
  const spaeter = await store.liste({ env: ENV, fetchImpl });
  assert.equal(spaeter.total, 1, "kein Doppeleintrag, wenn beide Quellen ihn kennen");
});

test("die Ergaenzung laeuft nach zehn Minuten aus — sie ist kein zweiter Speicher", async () => {
  const { fetchImpl } = nachhinkenderSpeicher();
  const store = createRecordStore("admin/test-ablauf");
  const start = 1_785_000_000_000;
  await store.schreib({ id: "flag_alt", createdAt: "2026-07-28T12:00:00.000Z" }, { env: ENV, fetchImpl, nowMs: start });

  const kurzDanach = await store.liste({ env: ENV, fetchImpl, nowMs: start + 60_000 });
  assert.equal(kurzDanach.total, 1);

  const vielSpaeter = await store.liste({ env: ENV, fetchImpl, nowMs: start + 11 * 60_000 });
  assert.equal(vielSpaeter.total, 0,
    "haelt der Index nach elf Minuten immer noch nichts bereit, ist das ein echter Fehler und darf nicht verdeckt werden");
});

test("der gelesene Datensatz gewinnt: die Ergaenzung ueberschreibt nie eine echte Antwort", async () => {
  const { fetchImpl, indexHoltAuf } = nachhinkenderSpeicher();
  const store = createRecordStore("admin/test-vorrang");
  const id = "flag_vorrang";
  await store.schreib({ id, status: "off", createdAt: "2026-07-28T12:00:00.000Z" }, { env: ENV, fetchImpl });
  await store.schreib({ id, status: "on", createdAt: "2026-07-28T12:00:00.000Z" }, { env: ENV, fetchImpl });
  indexHoltAuf();

  const liste = await store.liste({ env: ENV, fetchImpl });
  assert.equal(liste.total, 1);
  assert.equal(liste.datensaetze[0].status, "on", "der zuletzt geschriebene Stand ist der gueltige");
});

test("der Zwischenspeicher spart Abrufe, aber nie auf Kosten des eigenen Schreibvorgangs", async () => {
  const { fetchImpl, abrufe, indexHoltAuf } = nachhinkenderSpeicher();
  const store = createRecordStore("admin/test-cache");
  const start = 1_785_000_000_000;
  await store.schreib({ id: "a", createdAt: "2026-07-28T10:00:00.000Z" }, { env: ENV, fetchImpl, nowMs: start });
  indexHoltAuf();

  await store.liste({ env: ENV, fetchImpl, nowMs: start });
  const nachErstem = abrufe();
  await store.liste({ env: ENV, fetchImpl, nowMs: start + 5_000 });
  assert.equal(abrufe(), nachErstem, "innerhalb der Frist wird nichts erneut geholt");

  // Schreiben muss den Zwischenspeicher verwerfen — sonst sieht die Bedienerin
  // ihre eigene Aenderung bis zu zwanzig Sekunden lang nicht.
  await store.schreib({ id: "b", createdAt: "2026-07-28T11:00:00.000Z" }, { env: ENV, fetchImpl, nowMs: start + 6_000 });
  const liste = await store.liste({ env: ENV, fetchImpl, nowMs: start + 6_100 });
  assert.equal(abrufe() > nachErstem, true, "nach dem Schreiben wird frisch gelesen");
  assert.equal(liste.total, 2);
  assert.equal(liste.datensaetze[0].id, "b");
});

test("nach zwanzig Sekunden wird wieder wirklich gelesen — fremde Aenderungen kommen an", async () => {
  const { fetchImpl, abrufe, fremdeAenderung } = nachhinkenderSpeicher();
  const store = createRecordStore("admin/test-fremd");
  const start = 1_785_000_000_000;
  await store.liste({ env: ENV, fetchImpl, nowMs: start });
  const nachErstem = abrufe();

  fremdeAenderung("x", { id: "x", createdAt: "2026-07-28T12:00:00.000Z" }, "admin/test-fremd");

  const zuFrueh = await store.liste({ env: ENV, fetchImpl, nowMs: start + 10_000 });
  assert.equal(zuFrueh.total, 0, "innerhalb der Frist noch der alte Stand");
  assert.equal(abrufe(), nachErstem);

  const spaeter = await store.liste({ env: ENV, fetchImpl, nowMs: start + 21_000 });
  assert.equal(spaeter.total, 1, "nach Ablauf der Frist ist die fremde Aenderung da");
});

test("die Aufbereitung laeuft bei jedem Aufruf neu — eine Frist altert nicht mit dem Zwischenspeicher", async () => {
  const { fetchImpl, indexHoltAuf } = nachhinkenderSpeicher();
  const store = createRecordStore("admin/test-frist");
  const start = 1_785_000_000_000;
  await store.schreib({ id: "v", createdAt: "2026-07-28T10:00:00.000Z" }, { env: ENV, fetchImpl, nowMs: start });
  indexHoltAuf();

  const restfrist = (nowMs) => (datensatz) => ({ ...datensatz, restSekunden: Math.round((start + 60_000 - nowMs) / 1000) });
  const erste = await store.liste({ env: ENV, fetchImpl, nowMs: start, aufbereiten: restfrist(start) });
  const zweite = await store.liste({ env: ENV, fetchImpl, nowMs: start + 10_000, aufbereiten: restfrist(start + 10_000) });
  assert.equal(erste.datensaetze[0].restSekunden, 60);
  assert.equal(zweite.datensaetze[0].restSekunden, 50, "die Restzeit wird gerechnet, nicht konserviert");
});

test("ohne IDrive-Zugang bleibt der Memory-Rueckfall unveraendert", async () => {
  const store = createRecordStore("admin/test-memory");
  await store.schreib({ id: "a", createdAt: "2026-07-28T10:00:00.000Z" }, { env: {} });
  await store.schreib({ id: "b", createdAt: "2026-07-28T11:00:00.000Z" }, { env: {} });
  const liste = await store.liste({ env: {} });
  assert.equal(liste.total, 2);
  assert.equal(liste.datensaetze[0].id, "b", "neueste zuerst");
  store.__leeren();
  assert.equal((await store.liste({ env: {} })).total, 0);
});
