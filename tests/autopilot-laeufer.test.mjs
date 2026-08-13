// smejj.com — Autopilot-Laeufer: arbeiten die Module wirklich?
//
// Der Laeufer ist der Grund, warum 21 Autopiloten ueberhaupt eine Ampel
// verdienen. Also muss genau eines geprueft sein: Ein Autopilot, der seine
// Aufgabe NICHT loest, wird ROT — sonst waere der Laeufer nur ein neuer,
// besser versteckter Blind-Stempler.
import test from "node:test";
import assert from "node:assert/strict";

import {
  laufeAlle,
  sammleQuelldateien,
  laufBugPredictor,
  laufKnowledgeGraph,
  laufCodeInterpreter,
  laufSmartRouter,
  laufSelfHealing
} from "../control-server/src/autopilots/autopilotLaeufer.js";

// mitNetz:false ueberall in den Tests — der E2E-Waechter ist der einzige Lauf,
// der die Aussenwelt anfasst. Eine Testsuite, die echte Chat-Aufrufe macht,
// misst das Netz statt den Code (und kostet Tokens).
test("Der Laeufer betreibt alle 23 Selbsttest-Autopiloten und meldet jeden einzeln", async () => {
  const gemeldet = [];
  const ergebnisse = await laufeAlle({ melde: (id, e) => { gemeldet.push({ id, ...e }); return true; }, mitNetz: false });

  assert.equal(ergebnisse.length, 23, "23 Autopiloten laufen ohne Netz im Control-Server");
  assert.equal(gemeldet.length, 24, "23 Laeufe + der Taktgeber, der sich selbst bezeugt");
  assert.equal(new Set(gemeldet.map((g) => g.id)).size, 24, "keine Kennung doppelt");
  assert.ok(gemeldet.some((g) => g.id === "autopilot-laeufer"), "der Taktgeber bezeugt sich selbst");

  // Jede Meldung muss ein Ergebnis tragen, keinen Pauschaltext.
  for (const g of gemeldet) {
    assert.ok(g.meldung && g.meldung.length > 15, `${g.id}: Meldung zu duenn — "${g.meldung}"`);
    assert.equal(/betriebsbereit & aktiv/i.test(g.meldung), false,
      `${g.id}: Pauschaltext statt Ergebnis — genau das war der alte Blind-Stempel`);
  }
});

test("ENTSCHEIDEND: ein durchgefallener Autopilot wird ROT gemeldet", async () => {
  // Der Bug-Predictor bekommt keinen Quelltext. Damit kann er nichts finden —
  // und muss das sagen, statt "0 Befunde, alles sauber" zu melden.
  const gemeldet = new Map();
  await laufeAlle({
    melde: (id, e) => { gemeldet.set(id, e); return true; },
    dateienLader: () => [],
    mitNetz: false
  });

  assert.equal(gemeldet.get("bug-predictor").status, "fehler",
    "ohne Quelltext ist der Scan wertlos und muss rot sein");
  assert.match(gemeldet.get("bug-predictor").meldung, /kein Quelltext/i);
  assert.equal(gemeldet.get("knowledge-graph").status, "fehler");
  // Die Selbsttests haengen nicht am Quelltext und bleiben gruen.
  assert.equal(gemeldet.get("code-interpreter").status, "ok");
});

test("Ein abstuerzendes Modul reisst den Lauf nicht mit", async () => {
  const gemeldet = new Map();
  const ergebnisse = await laufeAlle({
    melde: (id, e) => { gemeldet.set(id, e); return true; },
    dateienLader: () => { throw new Error("Dateisystem weg"); },
    mitNetz: false
  });
  assert.equal(ergebnisse.length, 23, "alle anderen laufen trotzdem");
  assert.equal(gemeldet.get("smart-router").status, "ok");
});

test("Mit Netz kommt der E2E-Waechter dazu — und meldet ehrlich, wenn er nicht pruefen kann", async () => {
  // Ohne SMEJJ_SESSION_SECRET kann der Waechter die Kette nicht pruefen. Er
  // faehrt dann KEINEN Netzaufruf und meldet "fehler" mit Grund — nicht "ok".
  const gemeldet = new Map();
  const ergebnisse = await laufeAlle({
    melde: (id, e) => { gemeldet.set(id, e); return true; },
    mitNetz: true
  });
  assert.equal(ergebnisse.length, 25, "E2E-Waechter und Voice-Region sind die beiden Netz-Laeufe");
  const w = gemeldet.get("synthetic-user-watchdog");
  assert.ok(w, "der Waechter muss melden");
  assert.equal(w.status, "fehler", "ohne pruefbare Kette ist er rot, nie gruen");
  assert.match(w.meldung, /gescheitert/i);
  assert.ok(gemeldet.get("voice-region-check"), "Voice-Region laeuft im Control-Server, nicht mehr im Jobs-Dienst");
});

test("Voice-Region: ein toter Endpunkt wird ROT, kein 'Stand unveraendert'", async () => {
  const { laufVoiceRegion } = await import("../control-server/src/autopilots/autopilotLaeufer.js");
  const tot = await laufVoiceRegion({ fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(tot.ok, false);
  assert.match(tot.meldung, /404/);

  const aus = await laufVoiceRegion({ fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, premiumVoice: false }) }) });
  assert.equal(aus.ok, true, "nicht freigeschaltet ist kein Ausfall — der Autopilot hat sauber gemessen");
  assert.match(aus.meldung, /noch nicht freigeschaltet/);

  const an = await laufVoiceRegion({ fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, premiumVoice: true }) }) });
  assert.equal(an.ok, true);
  assert.match(an.meldung, /verfügbar/);
});

test("Quelltext-Sammler findet den echten Code dieses Projekts", () => {
  const dateien = sammleQuelldateien();
  assert.ok(dateien.length > 50, `nur ${dateien.length} Dateien gefunden — Pfad falsch?`);
  assert.ok(dateien.every((d) => d.path.endsWith(".js")), "nur .js-Dateien");
  assert.ok(dateien.every((d) => typeof d.content === "string" && d.content.length > 0), "Inhalt gelesen");
  // Die Falle vom 2026-08-12: .pathname liefert Leerzeichen als %20, der
  // Scanner fand dann null Dateien mitten im vollen Repository.
  assert.equal(dateien.some((d) => d.path.includes("%20")), false, "Pfade duerfen nicht URL-kodiert sein");
});

test("Die Aufgaben haben feststehende Antworten — keine Zufallswerte", () => {
  // Zweimal dieselbe Aufgabe muss dasselbe ergeben. Ein Autopilot, dessen
  // Ergebnis wuerfelt (wie der alte synthetic-user-watchdog mit Math.random),
  // beweist nichts.
  assert.deepEqual(laufCodeInterpreter().ok, laufCodeInterpreter().ok);
  assert.deepEqual(laufSmartRouter().meldung, laufSmartRouter().meldung);
  assert.deepEqual(laufSelfHealing().meldung, laufSelfHealing().meldung);
});

test("Die Repo-Autopiloten melden echte Zahlen aus ihrer Arbeit", () => {
  const dateien = sammleQuelldateien();
  const bug = laufBugPredictor(dateien);
  const graph = laufKnowledgeGraph(dateien);
  assert.equal(bug.ok, true);
  assert.match(bug.meldung, /\d+ Dateien gescannt/, "die Zahl der Dateien gehoert in die Meldung");
  assert.equal(graph.ok, true);
  assert.match(graph.meldung, /\d+ Symbole/, "die Zahl der Symbole gehoert in die Meldung");
});
