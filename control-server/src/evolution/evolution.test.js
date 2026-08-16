// smejj.com — Tests der AI Evolution Engine.
//
// Der Schwerpunkt liegt bewusst auf den ZUSAGEN, nicht auf den Innereien:
// Erkennt die Engine bekannte Fehler? Spricht sie Gesundes frei? Bremst sie
// sich selbst? Und vor allem: Lehnt der Supervisor eine unbelegte
// Erfolgsmeldung ab? Ein Test, der nur prüft, dass eine Funktion antwortet,
// wäre selbst eine Attrappe.
import test from "node:test";
import assert from "node:assert/strict";

import {
  bewerteErgebnis, registriereMedientyp, medientypen, fuehreQualitaetSelbsttestAus
} from "./qualitaetsEngine.js";
import {
  erfasseAktion, verbesserungenAus, filtereNeue, aufgabenId, bewerteVerbesserung,
  prioritaetAus, evolutionUebersicht, fuehreEngineSelbsttestAus, _leereFuerTest
} from "./aiEvolutionEngine.js";
import {
  erkenneLuecken, baueLueckenAufgaben, pruefeBelege, fuehreDetectorSelbsttestAus, SMEJJ_FAEHIGKEITEN
} from "./missingFunctionDetector.js";
import { pruefeAbnahme, fuehreSupervisorSelbsttestAus } from "./autopilotSupervisor.js";

// ── Quality-Engine ──────────────────────────────────────────────────────────

test("Quality-Engine: jeder Prüfer erkennt Kaputtes und spricht Gesundes frei", () => {
  const ergebnis = fuehreQualitaetSelbsttestAus();
  assert.equal(ergebnis.bestanden, true, ergebnis.fehler.join("; "));
  assert.ok(ergebnis.geprueft >= 9);
});

test("Quality-Engine: ungeprüfte Art bekommt KEINE Note", () => {
  const r = bewerteErgebnis("holodeck", { irgendwas: true });
  assert.equal(r.gemessen, false);
  assert.equal(r.punkte, null, "ungeprüft darf nie wie 'gut' aussehen");
});

test("Quality-Engine: neue Medientypen lassen sich anmelden", () => {
  registriereMedientyp("tabelle", (e) => ({ funde: e?.zeilen ? [] : [{ klasse: "leer", beleg: "keine Zeilen" }] }));
  assert.ok(medientypen().includes("tabelle"));
  assert.equal(bewerteErgebnis("tabelle", { zeilen: 3 }).punkte, 100);
  assert.equal(bewerteErgebnis("tabelle", {}).punkte, 0);
});

test("Quality-Engine: flüchtige Medien-Adresse wird als Fund gemeldet", () => {
  const r = bewerteErgebnis("video", { url: "blob:https://smejj.com/x", dauerSek: 5, hatTon: true, bytes: 900_000 });
  assert.ok(r.funde.some((f) => f.klasse === "fluechtige-url"));
  assert.ok(r.punkte < 100);
});

test("Quality-Engine: Geheimnis im Code wiegt schwer", () => {
  const r = bewerteErgebnis("code", { code: 'const k = "' + ["sk", "abcdefghijklmnopqrstuvwx"].join("-") + '"; export default k;', testsVorhanden: true });
  assert.ok(r.funde.some((f) => f.klasse === "geheimnis-im-code"));
  assert.ok(r.punkte <= 30);
});

// ── Evolution-Layer ─────────────────────────────────────────────────────────

test("Layer: eine schlechte Aktion erzeugt eine vollständige Aufgabe", () => {
  _leereFuerTest();
  const { bewertung, aufgaben } = erfasseAktion({
    art: "bild", prompt: "male einen Leuchtturm",
    ergebnis: { url: "blob:x", bytes: 500, format: "png" },
    quelle: "test", betrifft: "bilder-malen"
  });
  assert.equal(bewertung.gemessen, true);
  assert.ok(aufgaben.length > 0);
  for (const a of aufgaben) {
    assert.ok(a.id.startsWith("ev-"));
    assert.ok(a.zustaendig, "ohne Zuständigen macht die Aufgabe niemand");
    assert.ok(a.testanforderung);
    assert.ok(["critical", "high", "medium", "low"].includes(a.prioritaet));
    assert.equal(a.status, "neu");
  }
});

test("Layer: eine gute Aktion erzeugt keine Aufgabe", () => {
  _leereFuerTest();
  const { aufgaben } = erfasseAktion({
    art: "bild", ergebnis: { url: "https://smejj.com/b.png", bytes: 400_000, format: "png", breite: 1024 }
  });
  assert.equal(aufgaben.length, 0);
});

test("Layer: Aufgaben-IDs sind deterministisch", () => {
  const a = aufgabenId({ art: "bild", klasse: "fehlbild", betrifft: "maler" });
  const b = aufgabenId({ art: "bild", klasse: "fehlbild", betrifft: "maler" });
  assert.equal(a, b);
  assert.notEqual(a, aufgabenId({ art: "video", klasse: "fehlbild", betrifft: "maler" }));
});

test("Layer: die Sperrfrist verhindert dieselbe Aufgabe im nächsten Takt", () => {
  const gemeldet = new Map();
  const aufgaben = verbesserungenAus(bewerteErgebnis("video", { url: "blob:x", dauerSek: 0, bytes: 100 }), { betrifft: "v" });
  const erste = filtereNeue(aufgaben, 1_000, { gemeldet });
  const zweite = filtereNeue(aufgaben, 2_000, { gemeldet });
  assert.ok(erste.aufgaben.length > 0);
  assert.equal(zweite.aufgaben.length, 0);
  assert.equal(zweite.unterdrueckt, erste.aufgaben.length);
});

test("Layer: die Obergrenze kappt NICHT still", () => {
  const viele = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, score: i }));
  const r = filtereNeue(viele, 1_000, { gemeldet: new Map(), grenze: 5 });
  assert.equal(r.aufgaben.length, 5);
  assert.equal(r.gekappt, 25, "was weggelassen wurde, muss im Bericht stehen");
});

test("Layer: Sicherheitsfunde brauchen Betreiber-Freigabe", () => {
  const b = bewerteErgebnis("code", { code: 'const k = "' + ["sk", "abcdefghijklmnopqrstuvwx"].join("-") + '";' });
  const aufgaben = verbesserungenAus(b, { betrifft: "irgendwo" });
  const sicher = aufgaben.find((a) => a.klasse === "geheimnis-im-code");
  assert.equal(sicher.freigabe, "betreiber");
  assert.equal(sicher.prioritaet, "critical");
});

test("Layer: Score und Priorität hängen zusammen", () => {
  assert.ok(bewerteVerbesserung({ nutzen: 1, haeufigkeit: 1, sicherheit: 1 }) > bewerteVerbesserung({ nutzen: 0.1, haeufigkeit: 0.1 }));
  assert.equal(prioritaetAus(90), "critical");
  assert.equal(prioritaetAus(10), "low");
  assert.equal(prioritaetAus(10, { sicherheit: 0.9 }), "critical", "Sicherheit schlägt jeden niedrigen Score");
});

test("Layer: die Übersicht zählt ungemessene Aktionen NICHT als gut", () => {
  _leereFuerTest();
  erfasseAktion({ art: "text", ergebnis: "Ein vollständiger Satz." });
  erfasseAktion({ art: "gibt-es-nicht", ergebnis: {} });
  const u = evolutionUebersicht({});
  assert.equal(u.aktionen, 2);
  assert.equal(u.gemessen, 1);
  assert.equal(u.abdeckung, 50, "die Abdeckung ist die ehrlichste Zahl des Dashboards");
});

test("Layer: Selbsttest der Engine besteht", () => {
  const r = fuehreEngineSelbsttestAus({});
  assert.equal(r.bestanden, true, r.fehler.join("; "));
});

// ── Missing-Function-Detector ───────────────────────────────────────────────

test("Detector: findet Lücken, meldet Vorhandenes nicht", () => {
  const r = fuehreDetectorSelbsttestAus();
  assert.equal(r.bestanden, true, r.fehler.join("; "));
});

test("Detector: aus dem echten Stand entstehen priorisierte Aufgaben", () => {
  const { luecken, vorteile, gleichstand } = erkenneLuecken({});
  assert.ok(luecken.length > 0, "der gepflegte Stand kennt Funktionen, die smejj fehlen");
  assert.ok(gleichstand.length > 0);
  const aufgaben = baueLueckenAufgaben(luecken);
  assert.equal(aufgaben.length, luecken.length);
  // Nach Score sortiert — die wichtigste zuerst.
  for (let i = 1; i < aufgaben.length; i += 1) assert.ok(aufgaben[i - 1].score >= aufgaben[i].score);
  assert.ok(Array.isArray(vorteile));
});

test("Detector: eine Fähigkeit ohne Beleg-Datei gilt als nicht vorhanden", () => {
  const { unbelegt } = pruefeBelege(
    [{ id: "phantom", name: "Phantom", art: "text", beleg: "control-server/src/nicht-da.js" }],
    [{ path: "control-server/src/server.js" }]
  );
  assert.equal(unbelegt.length, 1);
});

test("Detector: ohne Dateiliste wird NICHT geurteilt", () => {
  const r = pruefeBelege(SMEJJ_FAEHIGKEITEN, []);
  assert.equal(r.ungeprueft, true, "eine leere Dateiliste sagt etwas über den Scan, nicht über smejj");
  assert.equal(r.unbelegt.length, 0);
});

// ── Supervisor ──────────────────────────────────────────────────────────────

test("Supervisor: Selbsttest besteht (blind UND blockierend wären beide fatal)", () => {
  const r = fuehreSupervisorSelbsttestAus();
  assert.equal(r.bestanden, true, r.fehler.join("; "));
});

test("Supervisor: 'erledigt' ohne einen einzigen Beleg wird abgelehnt", () => {
  const r = pruefeAbnahme({
    aufgabe: { id: "a1", betrifft: "irgendwas", zustaendig: "bug-predictor" },
    behauptung: { aufgabeId: "a1", autopilot: "bug-predictor" },
    belege: {}
  });
  assert.equal(r.abgenommen, false);
  assert.ok(r.durchgefallen.includes("aenderung-belegt"));
  assert.ok(r.durchgefallen.includes("tests-gruen"));
  assert.equal(r.zurueckAn, "bug-predictor");
});

test("Supervisor: eine Abgabe zur FALSCHEN Aufgabe fällt durch", () => {
  const r = pruefeAbnahme({
    aufgabe: { id: "a1", betrifft: "x" },
    behauptung: { aufgabeId: "a2" },
    belege: {}
  });
  assert.ok(r.durchgefallen.includes("bezug"));
});

test("Supervisor: genannte, aber nicht existierende Datei fällt durch", () => {
  const r = pruefeAbnahme({
    aufgabe: { id: "a1", betrifft: "server" },
    behauptung: { aufgabeId: "a1" },
    belege: { dateien: ["src/erfunden.js"] },
    dateiExistiert: () => false
  });
  assert.ok(r.durchgefallen.includes("aenderung-belegt"));
});

test("Supervisor: bei hohem Risiko ist die Leistungsmessung Pflicht", () => {
  const belege = {
    dateien: ["control-server/src/evolution/qualitaetsEngine.js", "control-server/src/evolution/evolution.test.js"],
    tests: { gelaufen: 3, gescheitert: 0 },
    regression: { geprueft: true, neueFehler: 0 },
    live: { geprueft: true, erreichbar: true }
  };
  const behauptung = { aufgabeId: "a1", autopilot: "bug-predictor" };
  const niedrig = pruefeAbnahme({ aufgabe: { id: "a1", betrifft: "qualitaetsEngine", risiko: "niedrig" }, behauptung, belege, dateiExistiert: () => true });
  const hoch = pruefeAbnahme({ aufgabe: { id: "a1", betrifft: "qualitaetsEngine", risiko: "hoch" }, behauptung, belege, dateiExistiert: () => true });
  assert.equal(niedrig.abgenommen, true);
  assert.equal(hoch.abgenommen, false);
  assert.ok(hoch.durchgefallen.includes("leistung"));
});

test("Supervisor: nach drei erfolglosen Abgaben geht es an den Betreiber", () => {
  const r = pruefeAbnahme({ aufgabe: { id: "a1", betrifft: "x" }, behauptung: { aufgabeId: "a1", autopilot: "bug-predictor" }, belege: {}, abgabeNr: 3 });
  assert.equal(r.eskaliert, true);
  assert.equal(r.zurueckAn, "betreiber");
});
