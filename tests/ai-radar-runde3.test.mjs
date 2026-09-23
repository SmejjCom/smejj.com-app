// smejj ai radar — Runde 3 (Betreiber-Auftrag 23.09.2026, Punkte 4 und 5):
// Wissensluecken ehrlich zaehlen, verschobene Laeufe ablegen, Einzelquellen
// gegenpruefen, Radar-Wissen fuer die Chat-Bruecke.
import test from "node:test";
import assert from "node:assert/strict";
import { lueckenAnalyse, themenAusLuecken, zaehleBegriffe } from "../src/radar/wissensluecken.js";
import { fuehreRadarLaufAus, suchworteAus } from "../control-server/src/autopilots/aiRadarAutopilot.js";
import { nutzeranfrageBeginnt, nutzeranfrageEndet, vorrangStand, vorrangZuruecksetzen, darfHintergrundLaufen } from "../control-server/src/autopilots/radarVorrang.js";
import { baueTagesbericht } from "../src/radar/tagesbericht.js";
import { baueEintrag } from "../src/radar/wissensbasis.js";
import { handleRadarKontextRoute } from "../control-server/src/routes/radarKontextRoutes.js";
import { radarIndex, radarIndexVerwerfen } from "../control-server/src/rag/radarKontext.js";

const JETZT = "2026-09-23T09:00:00.000Z";
function ablage(anfang = []) {
  const daten = [...anfang];
  return { daten, liste: async () => ({ ok: true, datensaetze: [...daten] }), schreib: async (s) => { const i = daten.findIndex((d) => d.id === s.id); if (i >= 0) daten[i] = s; else daten.push(s); return s; } };
}
const stumm = { liste: async () => ({ ok: false }) };

test("Luecken: ganze Woerter statt Teilwoerter — 'Frage' ist kein RAG, 'Kapitel' keine API", () => {
  const b = zaehleBegriffe(["Was ist die Frage zu Kapitel drei?", "Ein Studio in Laboe"]);
  assert.deepEqual(b, []);
  assert.deepEqual(zaehleBegriffe(["Wie funktioniert RAG genau?"]).map((x) => x.begriff), ["rag"]);
});

test("Luecken: dieselbe Frage 13-mal ist EIN Signal (gemessen 19.09.2026)", () => {
  const dreizehn = Array.from({ length: 13 }, () => "Generate an image of: giraffe standing in front of the eiffel tower");
  const a = lueckenAnalyse(dreizehn);
  assert.equal(a.signale, 13);
  assert.equal(a.verschieden, 1);
  assert.deepEqual(a.begriffe, [{ begriff: "bildgenerierung", treffer: 1 }], "Umschreibung 'image' zaehlt fuer den Listenbegriff");
  assert.deepEqual(a.vorschlaege, [], "unter der Schwelle 3");
});

test("Luecken: drei VERSCHIEDENE Signale loesen aus — nach draussen geht nur der Listenbegriff", () => {
  const t = themenAusLuecken(["Generate an image of a cat", "mach ein Bild vom Hund in Berlin, Hauptstr. 5", "Zeichne mir ein Haus"]);
  assert.equal(t.length, 1);
  assert.equal(t[0].id, "luecke-bildgenerierung");
  assert.deepEqual(t[0].anfragen, ["bildgenerierung news update documentation"]);
  assert.doesNotMatch(JSON.stringify(t), /Hund|Hauptstr|Haus/);
});

test("Vorrang: ein verschobener Takt-Lauf wird ABGELEGT und im Tagesbericht gezaehlt", async () => {
  vorrangZuruecksetzen();
  const stores = { wissen: ablage(), laeufe: ablage(), konfig: ablage() };
  nutzeranfrageBeginnt();
  const lauf = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, grund: "takt", signale: stumm, suche: async () => { throw new Error("darf nicht suchen"); } });
  nutzeranfrageEndet();
  assert.equal(lauf.grund, "nutzer_hat_vorrang");
  assert.equal(stores.laeufe.daten.length, 1, "vorher: gar nicht abgelegt");
  assert.equal(stores.laeufe.daten[0].anfragen, 0, "kostet kein Budget");
  assert.equal(baueTagesbericht({ laeufe: stores.laeufe.daten, eintraege: [], tag: JETZT.slice(0, 10) }).verschoben, 1);
});

test("Gegenpruefung: Einzelquelle + unabhaengige zweite Quelle = geprueft; sonst vermerkt", async () => {
  vorrangZuruecksetzen();
  const aussage = "OpenAI released GPT-5.5 with a larger context window and lower prices for developers on 2026-09-20.";
  const alt = baueEintrag({ themaId: "x", bereich: "modelle", aussage, jetzt: "2026-09-21T08:00:00.000Z",
    belege: [{ url: "https://blog.example.org/gpt", host: "blog.example.org", titel: "t", guete: "presse", abgerufenAm: "2026-09-21T08:00:00.000Z", markierungen: [] }] });
  assert.equal(alt.pruefstatus, "einzelquelle");
  const stores = { wissen: ablage([alt]), laeufe: ablage(), konfig: ablage([{ id: "radar-konfig", themenAus: ["*"], themen: [] }]) };
  const gesucht = [];
  const suche = async (q) => {
    gesucht.push(q);
    return { results: [{ url: "https://news.example.com/gpt-55", title: "GPT-5.5 released",
      snippet: "According to the company, developers get lower prices and a larger context window: OpenAI released GPT-5.5 on Sunday." }] };
  };
  const lauf = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, grund: "admin:test", maxThemen: 0, signale: stumm, suche });
  assert.equal(lauf.gegenpruefung.length, 1);
  assert.equal(lauf.gegenpruefung[0].ergebnis, "bestaetigt");
  assert.equal(stores.wissen.daten[0].pruefstatus, "geprueft");
  assert.equal(stores.wissen.daten[0].belege.length, 2);
  assert.ok(!/blog\.example\.org/.test(gesucht[0]), "gesucht wird mit Worten der Aussage, nicht mit der alten Quelle");

  const zweiter = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, grund: "admin:test", maxThemen: 0, signale: stumm, suche });
  assert.equal(zweiter.gegenpruefung.length, 0, "Geprueftes wird nicht erneut gesucht");
});

test("Gegenpruefung ohne Bestaetigung: vermerkt, bleibt Einzelquelle, 7 Tage Ruhe", async () => {
  const e = baueEintrag({ themaId: "x", bereich: "modelle", aussage: "Mistral announced a new small model called Ministral Nano for phones this week.", jetzt: JETZT,
    belege: [{ url: "https://a.example.org/m", host: "a.example.org", guete: "presse", markierungen: [] }] });
  const stores = { wissen: ablage([e]), laeufe: ablage(), konfig: ablage([{ id: "radar-konfig", themenAus: ["*"], themen: [] }]) };
  const suche = async () => ({ results: [{ url: "https://a.example.org/m2", title: "gleiche Seite", snippet: "Mistral announced a new small model called Ministral Nano for phones this week and more." }] });
  const lauf = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, grund: "admin:test", maxThemen: 0, signale: stumm, suche });
  assert.equal(lauf.gegenpruefung[0].ergebnis, "keine_zweite_quelle", "dieselbe Seite ist keine Bestaetigung");
  assert.equal(stores.wissen.daten[0].pruefstatus, "einzelquelle");
  const bald = await fuehreRadarLaufAus({ env: {}, jetzt: "2026-09-25T09:00:00.000Z", stores, grund: "admin:test", maxThemen: 0, signale: stumm, suche });
  assert.equal(bald.gegenpruefung.length, 0);
});

test("Gegenpruefung: eine zweite Seite ohne 'laut ...' im Auszug bestaetigt trotzdem (live 23.09.2026)", async () => {
  const e = baueEintrag({ themaId: "x", bereich: "sicherheit", aussage: "ChatGPT now offers an optional Lockdown Mode security setting that cuts off browsing and external services.", jetzt: "2026-09-21T08:00:00.000Z",
    belege: [{ url: "https://reconn-ai.com/a", host: "reconn-ai.com", guete: "presse", markierungen: [] }] });
  const stores = { wissen: ablage([e]), laeufe: ablage(), konfig: ablage([{ id: "radar-konfig", themenAus: ["*"], themen: [] }]) };
  const suche = async () => ({ results: [{ url: "https://www.zdnet.com/article/lockdown", title: "ChatGPT Lockdown Mode",
    snippet: "An optional security setting, ChatGPT Lockdown Mode cuts off browsing and external services for higher-risk users." }] });
  const lauf = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, grund: "admin:test", maxThemen: 0, signale: stumm, suche });
  assert.equal(lauf.gegenpruefung[0].ergebnis, "bestaetigt");
  assert.equal(stores.wissen.daten[0].pruefstatus, "geprueft");
  assert.ok(stores.wissen.daten[0].belege[1].markierungen.includes("bestaetigung"));
});

test("Luecken im Lauf: dieselbe Frage mit wechselnden Antworten ist EIN Signal", async () => {
  const sig = ablage(Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, signalType: "thumbs_down", promptVoll: "Generate an image of: giraffe", antwortSample: `Bild ${i}` })));
  const stores = { wissen: ablage(), laeufe: ablage(), konfig: ablage([{ id: "radar-konfig", themenAus: ["*"], themen: [] }]) };
  const lauf = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, grund: "admin:test", maxThemen: 0, signale: sig, suche: async () => ({ results: [] }) });
  assert.equal(lauf.luecken.signale, 1);
  assert.equal(lauf.luecken.verschieden, 1);
});

test("suchworteAus nimmt tragende Woerter und Zahlen, keine Fuellwoerter", () => {
  assert.equal(suchworteAus("Die EU hat am 2026-08-02 den AI Act verschaerft und Strafen erhoeht."), "2026-08-02 verschaerft Strafen erhoeht");
});

function anfrage(koerper, authUser = { email: "a@b.de" }) {
  const roh = JSON.stringify(koerper);
  return { method: "POST", authUser, headers: {}, on(e, f) { if (e === "data") queueMicrotask(() => f(roh)); if (e === "end") queueMicrotask(() => queueMicrotask(f)); return this; } };
}
function antwort() {
  const a = { code: null, koerper: null, headers: {} };
  a.writeHead = (c, h) => { a.code = c; Object.assign(a.headers, h || {}); return a; };
  a.setHeader = (k, v) => { a.headers[k] = v; };
  a.end = (t) => { a.koerper = t ? JSON.parse(t) : null; };
  return a;
}

test("/api/radar/kontext: nur angemeldet, liefert den Block und zaehlt als Nutzeranfrage", async () => {
  vorrangZuruecksetzen();
  const url = new URL("https://api.smejj.com/api/radar/kontext");
  const ohne = antwort();
  await handleRadarKontextRoute(anfrage({ frage: "x" }, null), url, ohne, { kontext: async () => "X" });
  assert.equal(ohne.code, 401);
  let waehrend = null;
  const mit = antwort();
  await handleRadarKontextRoute(anfrage({ frage: "Was gibt es Neues bei GPT?" }), url, mit, {
    kontext: async () => { waehrend = vorrangStand().laufendeNutzeranfragen; return "Aktuelles aus der eigenen Recherche (smejj ai radar)\n- a\n- b"; }
  });
  assert.equal(mit.code, 200);
  assert.equal(mit.koerper.zeilen, 2);
  assert.equal(waehrend, 1);
  assert.equal(darfHintergrundLaufen().grund, "schonfrist_nach_nutzeranfrage", "Bruecken-Chats sieht der Vorrang jetzt auch");
  assert.equal(await handleRadarKontextRoute(anfrage({}), new URL("https://api.smejj.com/api/feedback"), antwort()), false);
});

test("Radar-Index: veraltet antwortet sofort mit dem alten Stand und erneuert im Hintergrund", async () => {
  radarIndexVerwerfen();
  let ladungen = 0;
  const lader = async () => { ladungen += 1; return [{ id: "a", source: "s", heading: "h", text: `Eintrag ${ladungen}` }]; };
  await radarIndex({ jetztMs: 0, lader });
  let freigabe;
  const langsam = () => new Promise((r) => { freigabe = () => r([{ id: "b", source: "s", heading: "h", text: "neu" }]); });
  const alt = await radarIndex({ jetztMs: 200_000, lader: langsam });
  assert.equal(alt.chunks[0].id, "a", "kein Warten auf e2");
  freigabe();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await radarIndex({ jetztMs: 200_001, lader })).chunks[0].id, "b");
  radarIndexVerwerfen();
});

test("Gegenpruefung: eine Kopie desselben Textes ist KEINE unabhaengige Bestaetigung", async () => {
  const { istKopie } = await import("../control-server/src/autopilots/aiRadarAutopilot.js");
  const text = "Ask Claude Opus, ChatGPT, and Gemini Pro whether we should launch this feature in Q4 and compare the answers side by side.";
  assert.equal(istKopie(`Tip: ${text}`, text), true);
  assert.equal(istKopie("An optional security setting, ChatGPT Lockdown Mode cuts off browsing and external services for higher-risk users.",
    "ChatGPT now offers an optional Lockdown Mode security setting that cuts off browsing and external services."), false);
  const e = baueEintrag({ themaId: "x", bereich: "modelle", aussage: text, jetzt: "2026-09-21T08:00:00.000Z",
    belege: [{ url: "https://a.example.org/x", host: "a.example.org", guete: "presse", markierungen: [] }] });
  const stores = { wissen: ablage([e]), laeufe: ablage(), konfig: ablage([{ id: "radar-konfig", themenAus: ["*"], themen: [] }]) };
  const suche = async () => ({ results: [{ url: "https://b.example.com/copy", title: "Tipps", snippet: `Tip 3: ${text}` }] });
  const lauf = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, grund: "admin:test", maxThemen: 0, signale: stumm, suche });
  assert.equal(lauf.gegenpruefung[0].ergebnis, "keine_zweite_quelle");
  assert.equal(stores.wissen.daten[0].pruefstatus, "einzelquelle");
});
