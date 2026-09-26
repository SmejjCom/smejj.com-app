// smejj.com — Lernpaare aus dem Internet (26.09.2026, Betreiber: "Soll von Internet trainieren").
import test from "node:test";
import assert from "node:assert/strict";
import { INTERNET_PRAEFIX, INTERNET_STAND_KEY, baueLernpaar, holeQuellen, internetTakt } from "../workers/smejj-lora-loop/internetLernpaare.js";
import { lernpaarZulaessig, baueLernrundenTor } from "../workers/smejj-lora-loop/lernrunde.js";
import { kompakteFrage, SCHLANKE_ROLLE } from "../src/training/quellenFormat.js";

const Q = { titel: "UEFA Nations League", text: "Die UEFA Nations League ist ein vom europaeischen Fussballdachverband UEFA organisiertes Fussballturnier fuer Nationalmannschaften. Alle 55 Mitgliedsverbaende der UEFA nehmen am Turnier teil, das seit 2018 ausgetragen wird.", url: "https://de.wikipedia.org/wiki/UEFA_Nations_League", sprache: "de" };
const ROH = { frage: "Wie viele Mitgliedsverbaende der UEFA nehmen an der UEFA Nations League teil?", antwort: "Alle 55 Mitgliedsverbaende der UEFA nehmen am Turnier teil, das seit 2018 ausgetragen wird. (Quelle: Wikipedia – UEFA Nations League)" };

function e2Attrappe(objekte = {}) {
  const ablage = new Map(Object.entries(objekte));
  return { ablage,
    async liste(p) { return [...ablage.keys()].filter((k) => k.startsWith(p)).map((key) => ({ key })); },
    async getJson(k, s = null) { return ablage.has(k) ? JSON.parse(ablage.get(k)) : s; },
    async getText(k) { return ablage.get(k) ?? null; },
    async putJson(k, w) { ablage.set(k, JSON.stringify(w)); },
    async putText(k, t) { ablage.set(k, t); } };
}

test("Lernpaar im Laufzeitformat: System-Rolle, Frage + Quellenblock wie im Betrieb, Antwort mit Quelle", () => {
  const lp = baueLernpaar(Q, ROH, { jetzt: "2026-09-26T10:00:00.000Z", id: "00000000-0000-4000-8000-000000000001" });
  assert.equal(lp.ok, true);
  assert.equal(lp.satz.messages[0].content, SCHLANKE_ROLLE);
  assert.equal(lp.satz.messages[1].content, kompakteFrage(`${ROH.frage}\n\n- ${Q.titel}: ${Q.text.slice(0, 300)} (Quelle: Wikipedia, ${Q.url})`), "gleiches Format wie schlankeAnfrage");
  assert.match(lp.satz.messages[1].content, /Gefundene Quellen/);
  assert.equal(lp.satz.herkunft, "internet-synthese");
  assert.equal(lp.satz.quelle.modell, "openai/gpt-oss-120b");
  assert.equal(lp.satz.kontext.lizenz, "CC BY-SA 4.0");
  assert.equal(lernpaarZulaessig(lp.satz).zulaessig, true, "ohne Einwilligung zulaessig — kein Mensch beteiligt");
});

test("verworfen: erfundene Antwort ohne Quellbezug, Frage ohne Fragezeichen, GLM als Antwortgeber", () => {
  assert.equal(baueLernpaar(Q, { frage: ROH.frage, antwort: "Das weiss doch jeder, es sind sehr viele Laender aus aller Welt dabei, wirklich." }).grund, "antwort_ohne_quellbezug");
  assert.equal(baueLernpaar(Q, { frage: "Erzaehl mir was", antwort: ROH.antwort }).grund, "frage_form");
  const lp = baueLernpaar(Q, ROH);
  assert.equal(lernpaarZulaessig({ ...lp.satz, quelle: { modell: "glm-5-2" } }).zulaessig, false);
  assert.equal(lernpaarZulaessig({ ...lp.satz, kontext: {} }).grund, "internet_ohne_quelle");
});

test("Ehrlichkeits-Beispiel: unpassende Quelle -> 'beantworten das nicht'", () => {
  const fremd = { ...Q, titel: "Kochbuch", text: "Ein Kochbuch ist ein Buch mit Rezepten fuer Speisen, Getraenke und Backwaren aus vielen Laendern und Zeiten.", url: "https://de.wikipedia.org/wiki/Kochbuch" };
  const lp = baueLernpaar(Q, ROH, { fremdeQuelle: fremd });
  assert.equal(lp.ok, true);
  assert.match(lp.satz.antwort, /beantworten diese Frage nicht/);
  assert.match(lp.satz.messages[1].content, /Kochbuch/);
  assert.equal(lp.satz.kontext.ehrlichkeit, true);
});

test("Takt: legt Paare ab, bricht bei 429 ab, merkt sich erledigte Artikel, stoppt am Ziel", async () => {
  const feed = { mostread: { articles: [
    { titles: { normalized: "UEFA Nations League" }, extract: Q.text, content_urls: { desktop: { page: Q.url } } },
    { titles: { normalized: "Liste der groessten Bruecken" }, extract: "x ".repeat(150), content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/L" } } },
    { titles: { normalized: "Zweiter Artikel" }, extract: Q.text.replace("UEFA Nations League", "Zweiter Artikel"), content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Z" } } }
  ] } };
  let groqAufrufe = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("wikimedia")) return { ok: true, json: async () => (String(url).includes("/de/") ? feed : { mostread: { articles: [] } }) };
    groqAufrufe += 1;
    if (groqAufrufe >= 2) return { ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) };
    return { ok: true, status: 200, headers: { get: () => "7000" }, json: async () => ({ choices: [{ message: { content: JSON.stringify(ROH) } }] }) };
  };
  const e2 = e2Attrappe();
  const r = await internetTakt({ e2, groqKey: "k", fetchImpl, warte: async () => {}, zufall: () => 0.9, jetzt: () => new Date("2026-09-26T10:00:00Z") });
  assert.equal(r.erzeugt, 1);
  assert.equal(r.grund, "groq_kontingent_voll");
  assert.equal([...e2.ablage.keys()].filter((k) => k.startsWith(INTERNET_PRAEFIX)).length, 1);
  const stand = JSON.parse(e2.ablage.get(INTERNET_STAND_KEY));
  assert.equal(stand.anzahl, 1);
  assert.ok(stand.erledigt["de:UEFA Nations League"]);
  assert.equal(stand.erledigt["de:Liste der groessten Bruecken"], undefined, "Listen werden gar nicht erst genommen");
  const voll = await internetTakt({ e2: e2Attrappe({ [INTERNET_STAND_KEY]: JSON.stringify({ erledigt: {}, anzahl: 600 }) }), groqKey: "k", fetchImpl, ziel: 600 });
  assert.equal(voll.grund, "ziel_erreicht");
});

test("Lernrunde zaehlt Internet-Paare mit und baut sie im Laufzeitformat ein", async () => {
  const basis = JSON.stringify({ messages: [{ role: "user", content: "Was ist smejj?" }, { role: "assistant", content: "Ein KI-Assistent." }] });
  const objekte = { "datasets/smejj-1-10/train.jsonl": `${basis}\n` };
  for (let i = 0; i < 3; i += 1) {
    const lp = baueLernpaar(Q, { ...ROH, frage: ROH.frage.replace("Wie viele", i ? `Wie viele (${i})` : "Wie viele") }, { id: `00000000-0000-4000-8000-00000000000${i}` });
    objekte[`${INTERNET_PRAEFIX}2026/09/26/${lp.satz.id}.json`] = JSON.stringify(lp.satz);
  }
  const e2 = e2Attrappe(objekte);
  const r = await baueLernrundenTor({ e2, ziel: 3, basisName: "smejj-1-10", datensatzName: "lernrunde-smejj-1-21" })();
  assert.equal(r.vorhanden, true, JSON.stringify(r));
  const zeilen = e2.ablage.get("datasets/lernrunde-smejj-1-21/train.jsonl").trim().split("\n").map((z) => JSON.parse(z));
  assert.equal(zeilen.length, 4);
  assert.equal(zeilen[1].messages[0].role, "system");
  assert.match(zeilen[1].messages[1].content, /Gefundene Quellen/);
});

test("Wikipedia-Feed: nur Artikel mit Auszug, ohne Listen", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ mostread: { articles: [
    { titles: { normalized: "Hauptseite" }, extract: "x".repeat(300) },
    { titles: { normalized: "Deaths in 2026" }, extract: "x".repeat(300) },
    { titles: { normalized: "Kurz" }, extract: "zu kurz" },
    { titles: { normalized: "Gut" }, extract: "y".repeat(300), content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Gut" } } }
  ] } }) });
  const q = await holeQuellen({ datum: new Date("2026-09-25"), fetchImpl });
  assert.deepEqual(q.map((x) => x.titel), ["Gut"]);
});
