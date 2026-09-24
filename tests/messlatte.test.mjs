// Messlatte (Autopilot Nr. 88, 24.09.2026): Radar-Fragen der Vorwoche + goldene Fragen.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baueAktuellesSuite, wochenStichtag, zerlegeAussage } from "../src/evaluation/aktuellesSuite.js";
import { validateEvalSuite } from "../src/evaluation/evalSuite.js";
import { fuehreSelbsttestAus, fuehreVerlauf, laufMesslatte, wochenId } from "../control-server/src/autopilots/messlatteAutopilot.js";
import { DECKUNG_IDS } from "../control-server/src/autopilots/deckungsLaeufe.js";
import { DECKUNG_AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListeDeckung.js";
import { bereichVon } from "../control-server/src/admin/opsAutopilotenBereiche.js";

const JETZT = Date.parse("2026-09-24T12:00:00Z"); // Donnerstag
const eintrag = (id, aussage, erstelltAm, extra = {}) => ({ id, themaId: "neue-modelle", pruefstatus: "geprueft", aussage, erstelltAm, ...extra });

test("Stichtag ist Montag 00:00 UTC", () => {
  assert.equal(new Date(wochenStichtag(JETZT)).toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(new Date(wochenStichtag(Date.parse("2026-09-21T00:00:00Z"))).toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(wochenId(JETZT), "2026-09-21");
});

test("Deutsche Hauptwoerter sind keine Namen, Produkte schon", () => {
  const t = zerlegeAussage("OpenAI senkt den Preis von GPT-5 mini auf 0,15 USD pro Million Tokens.");
  assert.equal(t.gegenstand, "OpenAI");
  assert.ok(t.details.includes("0,15 USD"));
  assert.ok(!t.details.includes("Preis"));
  assert.equal(zerlegeAussage("Die Preise steigen weiter."), null);
});

test("Suite: nur gepruefte, nicht zurueckgenommene Eintraege der Vorwoche, gueltig mit Hash", () => {
  const stichtag = wochenStichtag(JETZT);
  const suite = baueAktuellesSuite([
    eintrag("a", "Google hat Gemini 3.5 Flash mit 2 Mio. Token Kontext veroeffentlicht.", "2026-09-18T08:00:00Z"),
    eintrag("b", "Anthropic released Claude Opus 5.5 with a 1M token context.", "2026-09-19T08:00:00Z"),
    eintrag("c", "Meta plant Llama 5 mit 2 Billionen Parametern.", "2026-09-19T08:00:00Z", { pruefstatus: "einzelquelle" }),
    eintrag("d", "Mistral Large 3 kostet 2 USD.", "2026-09-19T08:00:00Z", { zurueckgenommen: true }),
    eintrag("e", "DeepSeek V4 kostet 0,27 USD.", "2026-09-22T08:00:00Z"), // nach dem Stichtag: naechste Woche
    eintrag("f", "Qwen 4 hat 235 Mrd. Parameter.", "2026-09-10T08:00:00Z") // aelter als 7 Tage
  ], { jetzt: stichtag });
  assert.deepEqual(suite.cases.map((c) => c.id), ["aktuell-b", "aktuell-a"]);
  assert.equal(validateEvalSuite(suite).ok, true);
  assert.ok(suite.cases.every((c) => !c.prompt.includes("2 Mio.") && !c.prompt.includes("1M")), "die Frage verraet die Antwort nicht");
});

test("gleiche Eingabe in derselben Woche = gleiche Faelle (kein Dauer-Nachmessen)", () => {
  const e = [eintrag("a", "Google hat Gemini 3.5 Flash mit 2 Mio. Token Kontext veroeffentlicht.", "2026-09-18T08:00:00Z")];
  const montag = baueAktuellesSuite(e, { jetzt: wochenStichtag(Date.parse("2026-09-21T09:00:00Z")) });
  const sonntag = baueAktuellesSuite(e, { jetzt: wochenStichtag(Date.parse("2026-09-27T23:00:00Z")) });
  assert.deepEqual(montag.cases, sonntag.cases);
});

test("Selbsttest besteht", () => {
  const probe = fuehreSelbsttestAus();
  assert.equal(probe.bestanden, true, probe.fehler.join("; "));
});

function speicher(start = {}) {
  const daten = new Map(Object.entries(start));
  return { lies: async (id) => daten.get(id) || null, schreib: async (d) => { daten.set(d.id, d); }, daten };
}

test("Verlauf nennt die Vorwoche und die Veraenderung", async () => {
  const verlauf = speicher({ "woche-2026-09-14": { id: "woche-2026-09-14", aktuelles: 40, golden: 90 } });
  const zeile = await fuehreVerlauf({ aktuell: { prozent: 52.5, summary: { cases: 12 } }, golden: { prozent: 87.5 }, verlauf, jetztMs: JETZT });
  assert.match(zeile, /Woche 2026-09-21: Aktuelles 52,5 % bei 12 Radar-Fragen \(Vorwoche 40 %, \+12,5 Punkte\); Goldene Fragen 87,5 %/);
  assert.equal(verlauf.daten.get("woche-2026-09-21").aktuelles, 52.5);
});

test("Lauf: beide Messungen ueber den Nutzerweg, woechentlich, Aktuelles ohne Alarm-Schwelle", async () => {
  const aufrufe = [];
  const messen = async (o) => { aufrufe.push(o); return { ok: true, meldung: "ok" }; };
  const ablagen = { aktuell: speicher(), golden: speicher(), verlauf: speicher() };
  const e = await laufMesslatte({ mitNetz: false, jetztMs: JETZT, messen, ablagen });
  assert.equal(e.ok, true);
  assert.deepEqual(aufrufe.map((a) => [a.kennung, a.weg, a.mindestNote, a.messAbstandMs]), [
    ["messlatte-aktuelles", "agent", 0, 7 * 86400000],
    ["messlatte-golden", "agent", 0.8, 7 * 86400000]
  ]);
});

test("Nr. 88 ist eingehaengt, eingetragen und einem Bereich zugeordnet", () => {
  assert.ok(DECKUNG_IDS.includes("messlatte"));
  const eintragListe = DECKUNG_AUTOPILOTEN.find((a) => a.id === "messlatte");
  assert.equal(eintragListe?.nummer, "88");
  assert.equal(bereichVon("messlatte"), "Antwortqualität & Sprache");
});
