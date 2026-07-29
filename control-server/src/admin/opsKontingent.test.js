// smejj.com — Unit-Tests fuer das Speicher-Kontingent.
//
// Kern: IDrive e2 blockiert nicht, es rechnet ab. Diese Bewertung ist die
// einzige Stelle, an der entschieden wird, ob ein Upload noch hineinpasst —
// Anzeige und Sperre nutzen sie gemeinsam. Zwei Rechenwege waeren zwei
// Wahrheiten.
//
// Ausfuehren: node --test control-server/src/admin/opsKontingent.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  MEHRKOSTEN_USD_PRO_GB_MONAT, __leereKontingentCache, bewerte, grenzeProzent,
  kontingentUebersicht, planBytes
} from "./opsKontingent.js";

const GIB = 1024 ** 3;
const TIB = 1024 ** 4;
const JETZT = Date.parse("2026-07-28T12:00:00.000Z");
const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim"
});

/** Antwortet auf GET / mit der Eimerliste und je Eimer mit den Objekten. */
function netz(eimer) {
  return async (url) => {
    const adresse = new URL(String(url));
    const pfad = adresse.pathname.replace(/^\//, "");
    if (!pfad) {
      const namen = Object.keys(eimer).map((n) => `<Bucket><Name>${n}</Name></Bucket>`).join("");
      return antwort(`<?xml version="1.0"?><ListAllMyBucketsResult><Buckets>${namen}</Buckets></ListAllMyBucketsResult>`);
    }
    const inhalt = eimer[pfad];
    if (inhalt === "verboten") return { ok: false, status: 403, text: async () => "", headers: { get: () => null } };
    const bloecke = (inhalt || []).map((groesse, i) =>
      `<Contents><Key>o${i}</Key><Size>${groesse}</Size><LastModified>2026-07-01T00:00:00.000Z</LastModified></Contents>`).join("");
    return antwort(`<?xml version="1.0"?><ListBucketResult>${bloecke}<IsTruncated>false</IsTruncated></ListBucketResult>`);
  };
}

function antwort(text) {
  return { ok: true, status: 200, text: async () => text, arrayBuffer: async () => Buffer.from(text), headers: { get: () => null } };
}

test("das Paket wird binaer gerechnet — 1258 GiB sind 61 % von 2 TiB", () => {
  const e = bewerte({ bytesGesamt: 1258.2 * GIB, paketBytes: 2 * TIB });
  assert.equal(e.auslastungProzent, 61.4, "so steht es auch im Portal als 1,23 von 2 TB");
  assert.equal(e.ampel, "ok");
  assert.equal(e.mehrkostenUsdProMonat, null, "solange nichts ueberschritten ist, gibt es keine Zahl");
});

test("KEINE 0,00 USD, WENN NICHTS UEBERSCHRITTEN IST", () => {
  const e = bewerte({ bytesGesamt: 100 * GIB, paketBytes: 2 * TIB });
  assert.equal(e.mehrkostenUsdProMonat, null,
    "eine 0,00 USD saehe aus wie eine Zusage — es gibt schlicht nichts zu zahlen");
});

test("ueber dem Paket werden die Mehrkosten beziffert", () => {
  const e = bewerte({ bytesGesamt: 2 * TIB + 500 * GIB, paketBytes: 2 * TIB });
  assert.equal(e.ampel, "ueberschritten");
  assert.equal(e.ueberschreitungBytes, 500 * GIB);
  assert.equal(e.mehrkostenUsdProMonat, Math.round(500 * MEHRKOSTEN_USD_PRO_GB_MONAT * 100) / 100);
  assert.equal(e.mehrkostenUsdProMonat, 3, "500 GiB * 0,006 USD = 3,00 USD je Monat");
});

test("die Ampel schaltet bei 80 und 95 Prozent", () => {
  const stufe = (anteil) => bewerte({ bytesGesamt: 2 * TIB * anteil, paketBytes: 2 * TIB }).ampel;
  assert.equal(stufe(0.79), "ok");
  assert.equal(stufe(0.81), "warnung");
  assert.equal(stufe(0.96), "kritisch");
  assert.equal(stufe(1.01), "ueberschritten");
});

test("ein Vorhaben wird eingerechnet, bevor es hochgeladen wird", () => {
  const jetzt = bewerte({ bytesGesamt: 1258 * GIB, paketBytes: 2 * TIB });
  assert.equal(jetzt.ampel, "ok");
  const mitModell = bewerte({ bytesGesamt: 1258 * GIB, paketBytes: 2 * TIB, geplantBytes: 800 * GIB });
  assert.equal(mitModell.ampel, "ueberschritten", "ein weiteres grosses Modell sprengt das Paket");
  assert.equal(mitModell.mehrkostenUsdProMonat > 0, true);
});

test("mehrere Eimer werden zusammengezaehlt", async () => {
  __leereKontingentCache();
  const e = await kontingentUebersicht({
    env: ENV, jetztMs: JETZT, frisch: true,
    fetchImpl: netz({ "smejj-app": [100, 200], "smejj-model-files": [1000] })
  });
  assert.equal(e.ok, true);
  assert.equal(e.objekteGesamt, 3);
  assert.equal(e.bytesGesamt, 1300);
  assert.equal(e.vollstaendig, true);
  assert.equal(e.eimer.length, 2);
});

test("EIN UNLESBARER EIMER MACHT DIE SUMME ZUM MINDESTWERT", async () => {
  __leereKontingentCache();
  const e = await kontingentUebersicht({
    env: ENV, jetztMs: JETZT, frisch: true,
    fetchImpl: netz({ "smejj-app": "verboten", "smejj-model-files": [1000] })
  });
  assert.equal(e.ok, true);
  assert.equal(e.vollstaendig, false, "die Summe ist unvollstaendig");
  assert.equal(e.hinweis.includes("Mindestwert"), true);
  assert.equal(e.bytesGesamt, 1000, "gezaehlt wird nur, was lesbar war");
  const gesperrt = e.eimer.find((x) => x.name === "smejj-app");
  assert.equal(gesperrt.erreichbar, false);
  assert.equal(gesperrt.grund, "HTTP 403");
});

test("ohne Zugang wird das gesagt, nicht geraten", async () => {
  __leereKontingentCache();
  const e = await kontingentUebersicht({ env: {}, jetztMs: JETZT, frisch: true, fetchImpl: async () => { throw new Error("nie"); } });
  assert.equal(e.ok, false);
  assert.equal(e.error, "speicher_nicht_eingerichtet");
});

test("die Messung wird zwischengespeichert — sie kostet Anfragen", async () => {
  __leereKontingentCache();
  let aufrufe = 0;
  const zaehlend = (impl) => async (...args) => { aufrufe += 1; return impl(...args); };
  const impl = zaehlend(netz({ "a": [10] }));
  await kontingentUebersicht({ env: ENV, jetztMs: JETZT, fetchImpl: impl });
  const ersteZahl = aufrufe;
  const zweite = await kontingentUebersicht({ env: ENV, jetztMs: JETZT + 60_000, fetchImpl: impl });
  assert.equal(aufrufe, ersteZahl, "innerhalb von zehn Minuten keine neue Messung");
  assert.equal(zweite.ausCache, true);
  assert.equal(typeof zweite.alterSekunden, "number");
});

test("Paketgroesse und Grenze sind einstellbar, mit sicheren Vorgaben", () => {
  assert.equal(planBytes({}), 2 * TIB);
  assert.equal(planBytes({ SMEJJ_IDRIVE_PLAN_TIB: "5" }), 5 * TIB);
  assert.equal(planBytes({ SMEJJ_IDRIVE_PLAN_TIB: "quatsch" }), 2 * TIB, "Unsinn faellt auf die Vorgabe zurueck");
  assert.equal(grenzeProzent({}), 95);
  assert.equal(grenzeProzent({ SMEJJ_IDRIVE_GRENZE_PROZENT: "80" }), 80);
  assert.equal(grenzeProzent({ SMEJJ_IDRIVE_GRENZE_PROZENT: "0" }), 95, "0 waere eine Dauersperre — nicht gewollt");
  assert.equal(grenzeProzent({ SMEJJ_IDRIVE_GRENZE_PROZENT: "150" }), 95, "ueber 100 waere keine Grenze");
});
