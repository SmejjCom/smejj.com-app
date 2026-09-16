// Ausfuehren: node --test control-server/src/admin/entscheidungen.test.js
//
// Was diese Tests schuetzen (in dieser Reihenfolge wichtig):
//   1. Ein "Ja" MUSS eine Aufgabe erzeugen. Eine Freigabe ohne Aufgabe waere
//      genau der Zustand, den der Betreiber am 16.09. beklagt hat.
//   2. Ein "Nein" ohne Grund wird abgewiesen — sonst ist es spaeter nicht von
//      "vergessen" zu unterscheiden.
//   3. Ein Vorschlag, den die Messung nicht mehr kennt, ist nicht entscheidbar.
//   4. Eine stumme Radar-Ablage darf die Seite nicht kippen; sie muss den Grund
//      nennen (kein stilles "keine Neuigkeiten").
import test from "node:test";
import assert from "node:assert/strict";

import {
  baueVorschlaege, entscheidungsUebersicht, entscheide, planText, __clearEntscheidungenForTests
} from "./entscheidungen.js";
import { __clearAufgabenForTests } from "./aufgaben.js";
import { KONKURRENZ_STAND } from "../evolution/missingFunctionDetector.js";

const ENV = {}; // ohne IDrive-Zugang: recordStore laeuft im Speicher
const ACTOR = { email: "pruefer@example.de", role: "owner" };

const RADAR_OK = async () => ({
  ok: true,
  letzterLauf: "2026-09-09T19:24:06.944Z",
  kandidaten: [
    { anbieter: "ChatGPT", titel: "Neue Aufgabenplanung in ChatGPT", url: "https://example.org/a", gesehenAm: "2026-09-09", bereich: "produkt" },
    { anbieter: "Gemini", titel: "Gemini kann jetzt X", url: "https://example.org/b", gesehenAm: "2026-09-09", bereich: "produkt" }
  ]
});
const RADAR_STUMM = async () => ({ ok: false, grund: "Ablage antwortet nicht" });

function zuruecksetzen() {
  __clearEntscheidungenForTests();
  __clearAufgabenForTests();
}

test("Vorschlaege entstehen aus Luecken, Bausteinen und Radar-Treffern", async () => {
  zuruecksetzen();
  const { vorschlaege } = await baueVorschlaege({ env: ENV, radarBestand: RADAR_OK });

  assert.ok(vorschlaege.length >= 3, "es muss mehr als einen Vorschlag geben");
  const arten = new Set(vorschlaege.map((v) => v.quelle));
  assert.ok(arten.has("Konkurrenzlücke"), "Konkurrenzluecken fehlen");
  assert.ok(arten.has("Radar-Treffer"), "Radar-Treffer fehlen");

  for (const v of vorschlaege) {
    for (const feld of ["id", "titel", "konkurrent", "wirHeute", "aenderung", "aufwand"]) {
      assert.ok(String(v[feld] || "").length > 0, `${v.id}: Feld ${feld} ist leer — die vier Felder sind Pflicht`);
    }
  }
});

test("Recherche-Funde kommen mit Quelle und doppeln den bestaetigten Stand nicht", async () => {
  zuruecksetzen();
  const { vorschlaege } = await baueVorschlaege({ env: ENV, radarBestand: RADAR_OK });
  const recherche = vorschlaege.filter((v) => v.quelle === "Radar-Recherche");

  assert.ok(recherche.length > 0, "die Recherche vom 16.09. muss ankommen");
  for (const v of recherche) {
    assert.match(v.url, /^https:\/\//, `${v.id}: ohne Quelle ist ein Fund eine Behauptung`);
  }

  // Was der bestaetigte Stand schon kennt, darf nicht zusaetzlich als Fund
  // erscheinen — sonst stuende dieselbe Funktion zweimal zur Entscheidung.
  const bekannt = new Set((KONKURRENZ_STAND.funktionen || []).map((f) => f.id));
  for (const v of recherche) {
    assert.ok(!bekannt.has(v.id.replace(/^recherche-/, "")), `${v.id} steht schon im Konkurrenz-Stand`);
  }

  // Und die Kennungen muessen ueber alle Quellen hinweg eindeutig sein, sonst
  // entscheidet ein Klick ueber zwei Vorschlaege.
  const ids = vorschlaege.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, "doppelte Vorschlags-Kennung");
});

test("Radar stumm: Grund steht da, die Seite bleibt bedienbar", async () => {
  zuruecksetzen();
  const uebersicht = await entscheidungsUebersicht({ env: ENV, radarBestand: RADAR_STUMM });
  assert.equal(uebersicht.ok, true);
  assert.match(uebersicht.radarStumm, /antwortet nicht/);
  assert.ok(uebersicht.offen.length > 0, "die Funktionsluecken kommen auch ohne Radar");
});

test("Ja legt eine Aufgabe mit Plan an und zaehlt danach als entschieden", async () => {
  zuruecksetzen();
  const { vorschlaege } = await baueVorschlaege({ env: ENV, radarBestand: RADAR_OK });
  const ziel = vorschlaege.find((v) => v.quelle === "Konkurrenzlücke");

  const ergebnis = await entscheide({ vorschlagId: ziel.id, wahl: "ja" },
    { actor: ACTOR, env: ENV, radarBestand: RADAR_OK });

  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.aufgabe, "ohne Aufgabe ist ein Ja wertlos");
  assert.match(ergebnis.aufgabe.titel, /Vorschlag: /);
  assert.equal(ergebnis.aufgabe.bereich, "produkt");
  assert.match(ergebnis.aufgabe.notiz, /1\. Prüfen/);
  assert.match(ergebnis.aufgabe.notiz, /3\. Test/);

  const uebersicht = await entscheidungsUebersicht({ env: ENV, radarBestand: RADAR_OK });
  assert.equal(uebersicht.zaehler.ja, 1);
  const wieder = uebersicht.entschieden.find((v) => v.id === ziel.id);
  assert.equal(wieder.entscheidung, "ja");
  assert.equal(wieder.aufgabeId, ergebnis.aufgabe.id);
  assert.ok(!uebersicht.offen.some((v) => v.id === ziel.id), "ein Ja verschwindet aus der offenen Liste");
});

test("Nein braucht einen Grund, mit Grund bleibt es stehen", async () => {
  zuruecksetzen();
  const { vorschlaege } = await baueVorschlaege({ env: ENV, radarBestand: RADAR_OK });
  const ziel = vorschlaege.find((v) => v.quelle === "Radar-Treffer");

  const ohne = await entscheide({ vorschlagId: ziel.id, wahl: "nein" },
    { actor: ACTOR, env: ENV, radarBestand: RADAR_OK });
  assert.equal(ohne.ok, false);
  assert.equal(ohne.error, "entscheidung_grund_noetig");

  const mit = await entscheide({ vorschlagId: ziel.id, wahl: "nein", notiz: "Passt nicht zu unserem Weg." },
    { actor: ACTOR, env: ENV, radarBestand: RADAR_OK });
  assert.equal(mit.ok, true);
  assert.equal(mit.aufgabe, null);

  const uebersicht = await entscheidungsUebersicht({ env: ENV, radarBestand: RADAR_OK });
  const eintrag = uebersicht.entschieden.find((v) => v.id === ziel.id);
  assert.equal(eintrag.entscheidung, "nein");
  assert.match(eintrag.notiz, /Passt nicht/);
});

test("Spaeter bleibt oben in der offenen Liste", async () => {
  zuruecksetzen();
  const { vorschlaege } = await baueVorschlaege({ env: ENV, radarBestand: RADAR_OK });
  const ziel = vorschlaege[0];

  await entscheide({ vorschlagId: ziel.id, wahl: "spaeter" }, { actor: ACTOR, env: ENV, radarBestand: RADAR_OK });
  const uebersicht = await entscheidungsUebersicht({ env: ENV, radarBestand: RADAR_OK });

  const eintrag = uebersicht.offen.find((v) => v.id === ziel.id);
  assert.ok(eintrag, "Später darf nicht aus der Liste fallen — sonst heißt es nie");
  assert.equal(eintrag.entscheidung, "spaeter");
  assert.equal(uebersicht.zaehler.spaeter, 1);
});

test("unbekannte Wahl und unbekannter Vorschlag werden abgewiesen", async () => {
  zuruecksetzen();
  const falscheWahl = await entscheide({ vorschlagId: "luecke-projekt-ordner", wahl: "vielleicht" },
    { actor: ACTOR, env: ENV, radarBestand: RADAR_OK });
  assert.equal(falscheWahl.error, "entscheidung_wahl_unbekannt");

  const unbekannt = await entscheide({ vorschlagId: "radar-gibtsnicht", wahl: "ja" },
    { actor: ACTOR, env: ENV, radarBestand: RADAR_OK });
  assert.equal(unbekannt.error, "entscheidung_vorschlag_unbekannt");
});

test("der Plan hat vier Schritte und bleibt in der Notizlaenge", () => {
  const text = planText({
    titel: "Test", konkurrent: "A kann X", aenderung: "X bauen", aufwand: "klein", plan: "E2E-Weg messen"
  });
  assert.equal(text.split("\n").length, 4);
  assert.ok(text.length <= 400, "die Notiz von Modul Y ist auf 400 Zeichen begrenzt");
});
