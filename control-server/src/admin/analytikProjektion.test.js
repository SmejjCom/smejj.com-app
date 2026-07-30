// smejj.com — Unit-Tests fuer die Tagesprojektion von Modul W.
//
// Die drei wichtigsten Faelle sind die, in denen etwas schiefgeht:
//   1. Eine gescheiterte Quelle darf NICHT als 0 einfrieren.
//   2. Ein fehlgeschlagener Neubau darf eine gute Projektion NICHT ueberschreiben.
//   3. Eine alte Projektion darf nicht behaupten, frisch zu sein.
//
// Ausfuehren: node --test control-server/src/admin/analytikProjektion.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUFFRISCHEN_AB_SEKUNDEN, __neubauMerkerLeeren, baueProjektion, leseProjektion, projektionFrisch
} from "./analytikProjektion.js";

const JETZT = Date.parse("2026-07-29T12:00:00.000Z");
const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "eimer"
});

function antwort(text, status = 200) {
  return {
    ok: status < 400, status,
    text: async () => text,
    arrayBuffer: async () => Buffer.from(text),
    headers: { get: () => null }
  };
}

/** Ein Zaehl-Ergebnis in der Form, die opsAnalytik liefert. */
function reihe(tage, felder = {}) {
  return { erreichbar: true, quelle: "Test", nachTag: new Map(Object.entries(tage)), ohneDatum: 0, ...felder };
}

test("ohne Objektspeicher wird das gesagt, nicht geraten", async () => {
  assert.equal((await leseProjektion({ env: {} })).error, "speicher_nicht_eingerichtet");
  assert.equal((await baueProjektion({ env: {}, zaehleAlles: async () => ({}) })).error, "speicher_nicht_eingerichtet");
});

test("solange nie gebaut wurde, ist die Antwort ok:false — kein leeres Ergebnis", async () => {
  const e = await leseProjektion({ env: ENV, jetztMs: JETZT, fetchImpl: async () => antwort("", 404) });
  assert.equal(e.ok, false);
  assert.equal(e.error, "projektion_nicht_gebaut");
});

test("EINE GESCHEITERTE QUELLE WIRD ALS GESCHEITERT GESPEICHERT, nicht als 0", async () => {
  // Sonst friert ein Ausfall als "an dem Tag war nichts" ein und bleibt stehen,
  // auch wenn die Quelle langst wieder antwortet.
  let geschrieben = null;
  await baueProjektion({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async (url, init) => { geschrieben = String(init.body); return antwort("", 200); },
    zaehleAlles: async () => ({
      verwaltung: { erreichbar: false, grund: "audit_listing_fehlgeschlagen:http_503" },
      mails: reihe({ "2026-07-29": 2 }),
      laeufe: reihe({ "2026-07-29": 1 })
    })
  });
  const gespeichert = JSON.parse(geschrieben);
  assert.equal(gespeichert.reihen.verwaltung.erreichbar, false);
  assert.equal(gespeichert.reihen.verwaltung.grund.includes("http_503"), true);
  assert.equal("tage" in gespeichert.reihen.verwaltung, false, "keine Tagesreihe fuer eine toten Quelle");
  assert.deepEqual(gespeichert.reihen.mails.tage, { "2026-07-29": 2 });
});

test("EIN FEHLGESCHLAGENER NEUBAU UEBERSCHREIBT NICHTS", async () => {
  // Ein Netzausfall darf gute Zahlen nicht durch Luecken ersetzen.
  let geschriebeneObjekte = 0;
  const e = await baueProjektion({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async (url, init) => {
      if ((init?.method || "GET") === "PUT") geschriebeneObjekte += 1;
      return antwort("", 200);
    },
    zaehleAlles: async () => ({
      verwaltung: { erreichbar: false, grund: "weg" },
      mails: { erreichbar: false, grund: "weg" },
      laeufe: { erreichbar: false, grund: "weg" }
    })
  });
  assert.equal(e.ok, false);
  assert.equal(e.error, "keine_quelle_lesbar");
  assert.equal(e.nichtGeschrieben, true);
  assert.equal(geschriebeneObjekte, 0, "es wird NICHT geschrieben");
});

test("eine geworfene Ausnahme beim Zaehlen schreibt ebenfalls nichts", async () => {
  let put = 0;
  const e = await baueProjektion({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async (url, init) => { if ((init?.method || "GET") === "PUT") put += 1; return antwort("", 200); },
    zaehleAlles: async () => { throw new Error("Netz weg"); }
  });
  assert.equal(e.ok, false);
  assert.equal(e.error.includes("Netz weg"), true);
  assert.equal(put, 0);
});

test("nur die letzten 90 Tage werden behalten, und der Sammelposten ohne Datum fliegt raus", async () => {
  let body = null;
  await baueProjektion({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async (url, init) => { body = String(init.body); return antwort("", 200); },
    zaehleAlles: async () => ({
      laeufe: reihe({ "2026-07-29": 1, "2026-05-02": 5, "2026-01-01": 99, "": 7, kaputt: 3 })
    })
  });
  const tage = JSON.parse(body).reihen.laeufe.tage;
  assert.deepEqual(Object.keys(tage).sort(), ["2026-05-02", "2026-07-29"]);
  assert.equal("" in tage, false, "der Sammelposten gehoert nicht in eine Tagesreihe");
  assert.equal("kaputt" in tage, false);
});

test("DAS ALTER FAEHRT MIT — eine alte Projektion behauptet nicht, frisch zu sein", async () => {
  const gelesen = await leseProjektion({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async () => antwort(JSON.stringify({
      version: 1, gebautAm: "2026-07-29T11:45:00.000Z",
      reihen: { laeufe: { erreichbar: true, tage: { "2026-07-29": 3 } } }
    }))
  });
  assert.equal(gelesen.ok, true);
  assert.equal(gelesen.gebautAm, "2026-07-29T11:45:00.000Z");
  assert.equal(gelesen.alterSekunden, 900);
});

test("kaputter Inhalt gilt als unlesbar, nicht als leer", async () => {
  for (const inhalt of ["kein json", "{}", '{"gebautAm":"x"}', "null"]) {
    const e = await leseProjektion({ env: ENV, jetztMs: JETZT, fetchImpl: async () => antwort(inhalt) });
    assert.equal(e.ok, false, `${inhalt} muss ok:false ergeben`);
  }
});

test("FRISCH: eine aktuelle Projektion wird geliefert, ohne neu zu zaehlen", async () => {
  __neubauMerkerLeeren();
  let gezaehlt = 0;
  const e = await projektionFrisch({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async () => antwort(JSON.stringify({
      version: 1, gebautAm: new Date(JETZT - 60_000).toISOString(),
      reihen: { laeufe: { erreichbar: true, tage: {} } }
    })),
    zaehleAlles: async () => { gezaehlt += 1; return {}; }
  });
  assert.equal(e.ok, true);
  assert.equal(e.alterSekunden, 60);
  assert.equal(e.wirdAufgefrischt, false);
  assert.equal(gezaehlt, 0, "innerhalb der Frist wird nicht gezaehlt");
});

test("FRISCH: eine veraltete Projektion wird SOFORT geliefert und im Hintergrund erneuert", async () => {
  __neubauMerkerLeeren();
  let gezaehlt = 0;
  const alt = new Date(JETZT - (AUFFRISCHEN_AB_SEKUNDEN + 60) * 1000).toISOString();
  const e = await projektionFrisch({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async () => antwort(JSON.stringify({
      version: 1, gebautAm: alt, reihen: { laeufe: { erreichbar: true, tage: { "2026-07-20": 4 } } }
    })),
    zaehleAlles: async () => { gezaehlt += 1; return { laeufe: reihe({ "2026-07-29": 9 }) }; }
  });
  // Der Aufrufer wartet NICHT auf den Neubau: er bekommt den alten Stand plus
  // den Vermerk, dass gerade aufgefrischt wird.
  assert.equal(e.ok, true);
  assert.equal(e.gebautAm, alt);
  assert.equal(e.wirdAufgefrischt, true);
  assert.deepEqual(e.reihen.laeufe.tage, { "2026-07-20": 4 }, "der alte Stand, nicht der neue");
  await new Promise((fertig) => setTimeout(fertig, 20));
  assert.equal(gezaehlt, 1, "der Neubau lief im Hintergrund");
  __neubauMerkerLeeren();
});

test("FRISCH: gibt es noch keine Projektion, wird einmal blockierend gebaut", async () => {
  __neubauMerkerLeeren();
  let gezaehlt = 0;
  const e = await projektionFrisch({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async (url, init) => ((init?.method || "GET") === "PUT" ? antwort("", 200) : antwort("", 404)),
    zaehleAlles: async () => { gezaehlt += 1; return { laeufe: reihe({ "2026-07-29": 2 }) }; }
  });
  assert.equal(e.ok, true);
  assert.equal(e.ersterBau, true, "ein langsamer erster Aufruf ist besser als eine leere Ansicht");
  assert.equal(gezaehlt, 1);
  assert.deepEqual(e.reihen.laeufe.tage, { "2026-07-29": 2 });
});

test("FRISCH: ohne Objektspeicher wird nicht gebaut, sondern gemeldet", async () => {
  __neubauMerkerLeeren();
  let gezaehlt = 0;
  const e = await projektionFrisch({ env: {}, jetztMs: JETZT, zaehleAlles: async () => { gezaehlt += 1; return {}; } });
  assert.equal(e.ok, false);
  assert.equal(e.error, "speicher_nicht_eingerichtet");
  assert.equal(gezaehlt, 0, "ohne Ziel wird nicht gezaehlt");
});
