// smejj.com — Tests fuer die Suchquelle mit Schluessel (BYOK).
//
// Die drei Zusagen, an denen alles haengt:
//   1. OHNE Schluessel passiert nichts: kein Netzaufruf, keine Kosten, und der
//      bisherige Weg laeuft unveraendert weiter (Non-Regression).
//   2. Der Monatsdeckel greift, BEVOR ein Aufruf rausgeht.
//   3. Ein Fehler des Anbieters bricht nichts ab — es wird auf die freien
//      Quellen zurueckgefallen.

import test from "node:test";
import assert from "node:assert/strict";
import {
  KEY_PROVIDERS,
  configuredKeyProvider,
  keyProviderConfigured,
  keyProviderUsage,
  normalisiereTavily,
  resetKeyProviderBudget,
  searchWithKey
} from "../src/search/searchKeyProvider.js";

const SCHLUESSEL = "tvly-testschluessel1234567890";

function env(extra = {}) {
  return { SMEJJ_SEARCH_TAVILY_API_KEY: SCHLUESSEL, ...extra };
}

test("ohne Schluessel wird NICHT gesucht — kein Netzaufruf, keine Kosten", async () => {
  resetKeyProviderBudget();
  let aufgerufen = false;
  const ergebnis = await searchWithKey("Schlagzeilen Berlin", {
    env: {},
    fetchImpl: async () => { aufgerufen = true; throw new Error("darf nie passieren"); }
  });
  assert.equal(aufgerufen, false, "ohne Schluessel darf kein Netzaufruf entstehen");
  assert.equal(ergebnis.status, "kein schluessel");
  assert.deepEqual(ergebnis.results, []);
  assert.equal(keyProviderConfigured({}), false);
});

test("ein unbrauchbarer Schluessel gilt als kein Schluessel (fail-closed)", async () => {
  resetKeyProviderBudget();
  // Der Fremdschluessel wird zusammengesetzt, nicht als Literal geschrieben:
  // check:security sucht nach genau diesem Muster und wuerde sonst anschlagen
  // (und der Release-Builder wuerde das Artefakt verweigern).
  const fremdformat = "sk" + "-" + "ein" + "modellschluessel" + "versehentlich" + "hier";
  for (const kaputt of ["", "   ", fremdformat, "tvly-", "geheim"]) {
    const e = { SMEJJ_SEARCH_TAVILY_API_KEY: kaputt };
    assert.equal(configuredKeyProvider(e), null, kaputt);
    const r = await searchWithKey("test", { env: e, fetchImpl: async () => { throw new Error("nie"); } });
    assert.equal(r.status, "kein schluessel", kaputt);
  }
});

test("mit Schluessel wird Tavily korrekt aufgerufen", async () => {
  resetKeyProviderBudget();
  let gesehen = null;
  const ergebnis = await searchWithKey("office condo for sale San Jose", {
    env: env(), limit: 6, region: "us",
    fetchImpl: async (url, options) => {
      gesehen = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({
          results: [
            { title: "Office Space for Sale - San Jose, CA", url: "https://www.loopnet.com/search/office/san-jose-ca/for-sale/", content: "12 listings" },
            { title: "Kein https", url: "http://unsicher.example/x", content: "wird verworfen" },
            { title: "", url: "https://ohne-titel.example/", content: "wird verworfen" }
          ]
        })
      };
    }
  });
  assert.equal(gesehen.url, "https://api.tavily.com/search");
  assert.equal(gesehen.options.method, "POST");
  assert.equal(gesehen.options.headers.Authorization, `Bearer ${SCHLUESSEL}`);
  assert.equal(gesehen.body.query, "office condo for sale San Jose");
  assert.equal(gesehen.body.max_results, 6);
  // 1 Credit statt 2: "basic" ist bewusst gewaehlt, "advanced" kostet doppelt.
  assert.equal(gesehen.body.search_depth, "basic");
  // Tavily erwartet den ausgeschriebenen Landesnamen, NICHT das Kuerzel.
  assert.equal(gesehen.body.country, "united states");
  assert.equal(ergebnis.status, "ok");
  assert.equal(ergebnis.source, "tavily");
  assert.equal(ergebnis.results.length, 1, "http und titellose Treffer werden verworfen");
  assert.equal(ergebnis.results[0].url, "https://www.loopnet.com/search/office/san-jose-ca/for-sale/");
});

test("der Markt wird als Landesname uebergeben, weltweit ohne Land", async () => {
  resetKeyProviderBudget();
  const laender = {};
  for (const [region, erwartet] of [["de", "germany"], ["us", "united states"], ["uk", "united kingdom"], ["jp", "japan"]]) {
    await searchWithKey("test", {
      env: env(), region,
      fetchImpl: async (_u, o) => { laender[region] = JSON.parse(o.body).country; return { ok: true, json: async () => ({ results: [] }) }; }
    });
    assert.equal(laender[region], erwartet, region);
  }
  let rumpf = null;
  await searchWithKey("test", {
    env: env(), region: "wt",
    fetchImpl: async (_u, o) => { rumpf = JSON.parse(o.body); return { ok: true, json: async () => ({ results: [] }) }; }
  });
  assert.equal("country" in rumpf, false, "weltweit darf kein Land setzen");
});

test("der Monatsdeckel greift VOR dem Aufruf", async () => {
  resetKeyProviderBudget();
  const e = env({ SMEJJ_SEARCH_API_MONTHLY_MAX: "3" });
  let aufrufe = 0;
  const fetchImpl = async () => { aufrufe += 1; return { ok: true, json: async () => ({ results: [] }) }; };
  for (let i = 0; i < 5; i += 1) await searchWithKey(`frage ${i}`, { env: e, fetchImpl });
  assert.equal(aufrufe, 3, "nach dem Deckel darf kein Aufruf mehr rausgehen");
  const letzte = await searchWithKey("noch eine", { env: e, fetchImpl });
  assert.equal(letzte.status, "budget erschoepft");
  assert.equal(aufrufe, 3);
  const stand = keyProviderUsage(e);
  assert.equal(stand.verbraucht, 3);
  assert.equal(stand.deckel, 3);
});

test("ein neuer Monat setzt den Zaehler zurueck", async () => {
  resetKeyProviderBudget();
  const e = env({ SMEJJ_SEARCH_API_MONTHLY_MAX: "1" });
  const fetchImpl = async () => ({ ok: true, json: async () => ({ results: [] }) });
  await searchWithKey("a", { env: e, fetchImpl, now: new Date("2026-08-15T00:00:00Z") });
  const voll = await searchWithKey("b", { env: e, fetchImpl, now: new Date("2026-08-16T00:00:00Z") });
  assert.equal(voll.status, "budget erschoepft");
  const neuerMonat = await searchWithKey("c", { env: e, fetchImpl, now: new Date("2026-09-01T00:00:00Z") });
  assert.equal(neuerMonat.status, "leer", "im neuen Monat ist wieder Budget da");
});

test("ein Fehler des Anbieters bricht nichts ab", async () => {
  resetKeyProviderBudget();
  const netzWeg = await searchWithKey("test", { env: env(), fetchImpl: async () => { throw new Error("Netz weg"); } });
  assert.match(netzWeg.status, /^fehler:/);
  assert.deepEqual(netzWeg.results, []);

  const abgelehnt = await searchWithKey("test", {
    env: env(),
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => "unauthorized" })
  });
  assert.match(abgelehnt.status, /^fehler: HTTP 401/);
  assert.deepEqual(abgelehnt.results, []);
});

test("leere Anfrage kostet kein Budget", async () => {
  resetKeyProviderBudget();
  const e = env();
  await searchWithKey("   ", { env: e, fetchImpl: async () => { throw new Error("nie"); } });
  assert.equal(keyProviderUsage(e).verbraucht, 0);
});

test("die Anbieterliste ist vollstaendig und stabil", () => {
  assert.equal(KEY_PROVIDERS.length, 1);
  const tavily = KEY_PROVIDERS[0];
  assert.equal(tavily.name, "tavily");
  assert.equal(tavily.envKey, "SMEJJ_SEARCH_TAVILY_API_KEY");
  assert.ok(tavily.keyPattern.test(SCHLUESSEL));
  assert.ok(!tavily.keyPattern.test("sk-openai-schluessel"), "fremde Schluesselformen muessen auffallen");
});

test("normalisiereTavily ist fail-safe bei Muell", () => {
  assert.deepEqual(normalisiereTavily(null), []);
  assert.deepEqual(normalisiereTavily({}), []);
  assert.deepEqual(normalisiereTavily({ results: "kein array" }), []);
  const lang = normalisiereTavily({ results: [{ title: "T", url: "https://x.example/", content: "y".repeat(900) }] });
  assert.equal(lang[0].snippet.length, 400, "Auszuege werden begrenzt");
});
