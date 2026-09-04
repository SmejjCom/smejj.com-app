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
  fuehreAus,
  fuehreLaeufeAus,
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
test("Der Laeufer betreibt alle Selbsttest-Autopiloten und meldet jeden einzeln", async () => {
  const gemeldet = [];
  const ergebnisse = await laufeAlle({ melde: (id, e) => { gemeldet.push({ id, ...e }); return true; }, mitNetz: false });

  assert.equal(ergebnisse.length, 69, "69 Autopiloten laufen ohne Netz im Control-Server (seit 2026-08-26 Trainings-Reife Nr. 65, seit 2026-08-30 die fünf Deckungs-Wächter Nr. 66-70, seit 2026-09-03 der Modell-Evolutions-Takt Nr. 72, seit 2026-09-04 die Schutz-Echtheit Nr. 82)");
  assert.equal(gemeldet.length, 70, "69 Laeufe + der Taktgeber, der sich selbst bezeugt");
  assert.equal(new Set(gemeldet.map((g) => g.id)).size, 70, "keine Kennung doppelt");
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
  assert.equal(ergebnisse.length, 69, "alle anderen laufen trotzdem");
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
  assert.equal(ergebnisse.length, 72, "E2E-Waechter, Voice-Region und Sync-Waechter sind die drei zusaetzlichen Netz-Laeufe (plus Nr. 65, die fuenf Deckungs-Waechter Nr. 66-70, Nr. 72 und die Schutz-Echtheit Nr. 82 ohne Netz)");
  const sw = gemeldet.get("sync-waechter");
  assert.ok(sw, "der Sync-Waechter muss melden");
  assert.equal(sw.status, "fehler", "ohne Geheimnis ist er rot, nie gruen");
  const w = gemeldet.get("synthetic-user-watchdog");
  assert.ok(w, "der Waechter muss melden");
  assert.equal(w.status, "fehler", "ohne pruefbare Kette ist er rot, nie gruen");
  // Seit 2026-08-30 meldet der 30-Minuten-Eintrag dieselbe SIEBEN-Schritt-
  // Nutzerreise wie der 15-Minuten-Takt — nicht mehr den schmalen Kern.
  assert.match(w.meldung, /Nutzerreise .*kaputt/);
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

test("Ein haengender Lauf blockiert den Durchgang nicht (Befund 2026-08-13)", async () => {
  // Live hielt EIN Lauf ohne Zeitlimit den gesamten Durchgang fest, und weil
  // damals erst nach ALLEN Laeufen gemeldet wurde, blieben saemtliche Ampeln
  // stumm-grau. Zwei Zusicherungen halten das fest:
  // 1. Ein Lauf, der nie fertig wird, endet nach dem Zeitlimit als "fehler"
  //    mit ehrlicher Begruendung — der Durchgang geht weiter.
  const haenger = await fuehreAus("test-haenger", () => new Promise(() => {}), 50);
  assert.equal(haenger.ok, false);
  assert.match(haenger.meldung, /Zeitlimit/, "das Zeitlimit muss als Grund genannt werden");

  // 2. Die Meldung kommt SOFORT nach jedem Modul, nicht gesammelt am Ende:
  //    Wenn der Haenger in der Mitte sitzt, muss der Lauf DAVOR schon
  //    gemeldet sein, bevor der Haenger ueberhaupt fertig ist — und der
  //    Lauf DANACH kommt trotzdem noch dran.
  const protokoll = [];
  const ergebnisse = await fuehreLaeufeAus(
    [
      ["erster", () => ({ ok: true, meldung: "sofort fertig und sofort gemeldet" })],
      ["haenger", () => { protokoll.push(`beim Start des Haengers lagen ${protokoll.length} Meldungen vor`); return new Promise(() => {}); }],
      ["letzter", () => ({ ok: true, meldung: "kommt trotz Haenger noch dran" })]
    ],
    { melde: (id) => protokoll.push(`gemeldet: ${id}`), zeitlimitMs: 50 }
  );
  assert.deepEqual(protokoll, [
    "gemeldet: erster",
    "beim Start des Haengers lagen 1 Meldungen vor",
    "gemeldet: haenger",
    "gemeldet: letzter"
  ], "der erste Lauf muss gemeldet sein, BEVOR der Haenger laeuft — sonst ist es doch eine Sammel-Meldung");
  assert.deepEqual(ergebnisse.map((e) => e.ok), [true, false, true]);
});
