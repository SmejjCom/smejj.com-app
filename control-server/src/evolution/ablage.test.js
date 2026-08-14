// smejj.com — Tests der Aufgaben- und Kennzahlen-Ablage.
//
// Die Ablage schliesst den Kreislauf: ohne sie erkannte die Engine Aufgaben und
// vergass sie beim naechsten Deploy. Geprueft wird deshalb genau das, was den
// Unterschied macht — dass NICHTS doppelt entsteht, dass ein Zustand nicht
// zurueckfaellt, und dass eine stumme Ablage NICHT wie "nichts zu tun" aussieht.
//
// Ohne IDrive-Zugang arbeitet createRecordStore im Speicher (idriveConfig gibt
// null) — genau richtig fuer Tests: dieselbe Logik, keine Aussenwelt.
import test from "node:test";
import assert from "node:assert/strict";

import {
  merkeAufgaben, setzeZustand, listeAufgaben, zaehleAufgaben,
  schliesseErloschene, ZUSTAENDE, _leereAblageFuerTest
} from "./aufgabenAblage.js";
import { merkeKennzahlen, holeKennzahlen, tagesId, _leereKennzahlenFuerTest } from "./kennzahlenAblage.js";
import { erfasseAktion, entnimmZuwachs, _leereFuerTest } from "./aiEvolutionEngine.js";
import { schreibeEvolutionAblage, laufSupervisor, laufKonkurrenzRadar } from "./evolutionLaeufe.js";
import { fuehreRadarAus, fuehreRadarSelbsttestAus, BEOBACHTET } from "./konkurrenzRadar.js";

const OHNE_IDRIVE = {};

function probe(id, mehr = {}) {
  return {
    id, titel: `Probe ${id}`, art: "bild", klasse: "fehlbild", quelle: "Quality-Engine",
    betrifft: "maler", score: 60, prioritaet: "high", zustaendig: "multimodal-engine",
    testanforderung: "reproduzieren", risiko: "niedrig", freigabe: "automatisch", ...mehr
  };
}

test("Ablage: derselbe Befund erzeugt NIE eine zweite Aufgabe", async () => {
  _leereAblageFuerTest();
  const erste = await merkeAufgaben([probe("ev-a1")], { env: OHNE_IDRIVE });
  const zweite = await merkeAufgaben([probe("ev-a1")], { env: OHNE_IDRIVE });
  assert.equal(erste.neu, 1);
  assert.equal(zweite.neu, 0);
  assert.equal(zweite.wiedergesehen, 1);
  const { aufgaben } = await listeAufgaben({ env: OHNE_IDRIVE });
  assert.equal(aufgaben.length, 1);
  assert.equal(aufgaben[0].gesehen, 2, "der Zähler misst, wie hartnäckig ein Problem ist");
});

test("Ablage: ein laufender Zustand faellt nicht auf 'neu' zurueck", async () => {
  _leereAblageFuerTest();
  await merkeAufgaben([probe("ev-a2")], { env: OHNE_IDRIVE });
  await setzeZustand("ev-a2", ZUSTAENDE.LAUFEND, { grund: "angenommen", env: OHNE_IDRIVE });
  await merkeAufgaben([probe("ev-a2")], { env: OHNE_IDRIVE });
  const { aufgaben } = await listeAufgaben({ env: OHNE_IDRIVE });
  assert.equal(aufgaben[0].status, ZUSTAENDE.LAUFEND, "sonst verliert jede Arbeit beim nächsten Takt ihren Zustand");
});

test("Ablage: jeder Zustandswechsel steht mit Grund im Verlauf", async () => {
  _leereAblageFuerTest();
  await merkeAufgaben([probe("ev-a3")], { env: OHNE_IDRIVE });
  await setzeZustand("ev-a3", ZUSTAENDE.ERLEDIGT, { grund: "vom Supervisor abgenommen", env: OHNE_IDRIVE });
  const { aufgaben } = await listeAufgaben({ env: OHNE_IDRIVE });
  const verlauf = aufgaben[0].verlauf;
  assert.equal(verlauf.length, 2);
  assert.match(verlauf[1].grund, /Supervisor/);
});

test("Ablage: ein unbekannter Zustand wird abgewiesen", async () => {
  _leereAblageFuerTest();
  await merkeAufgaben([probe("ev-a4")], { env: OHNE_IDRIVE });
  const r = await setzeZustand("ev-a4", "irgendwas", { env: OHNE_IDRIVE });
  assert.equal(r.ok, false);
});

test("Ablage: Zaehlung liefert den Lebenslauf und den haertnaeckigsten Befund", async () => {
  _leereAblageFuerTest();
  await merkeAufgaben([probe("ev-b1"), probe("ev-b2"), probe("ev-b3")], { env: OHNE_IDRIVE });
  await merkeAufgaben([probe("ev-b2")], { env: OHNE_IDRIVE });
  await merkeAufgaben([probe("ev-b2")], { env: OHNE_IDRIVE });
  await setzeZustand("ev-b3", ZUSTAENDE.ERLEDIGT, { grund: "fertig", env: OHNE_IDRIVE });
  const z = await zaehleAufgaben({ env: OHNE_IDRIVE });
  assert.equal(z.ok, true);
  assert.equal(z.gesamt, 3);
  assert.equal(z.jeZustand.neu, 2);
  assert.equal(z.jeZustand.erledigt, 1);
  assert.equal(z.offen, 2);
  assert.equal(z.hartnaeckigste.id, "ev-b2");
  assert.equal(z.hartnaeckigste.gesehen, 3);
});

test("Ablage: erloschene Befunde werden geschlossen — als Beobachtung, nicht als Reparatur", async () => {
  _leereAblageFuerTest();
  await merkeAufgaben([probe("ev-c1"), probe("ev-c2", { art: "video", klasse: "kein-ton" })], { env: OHNE_IDRIVE });
  // "bild|fehlbild" tritt weiter auf, "video|kein-ton" nicht mehr.
  const r = await schliesseErloschene({
    klassenSeither: new Set(["bild|fehlbild"]), messungenSeither: 50, env: OHNE_IDRIVE
  });
  assert.equal(r.geschlossen, 1);
  const { aufgaben } = await listeAufgaben({ env: OHNE_IDRIVE });
  const geschlossen = aufgaben.find((a) => a.id === "ev-c2");
  assert.equal(geschlossen.status, ZUSTAENDE.ERLEDIGT);
  assert.match(geschlossen.verlauf.at(-1).grund, /nicht repariert/, "es muss dranstehen, dass niemand etwas behoben hat");
  assert.equal(aufgaben.find((a) => a.id === "ev-c1").status, ZUSTAENDE.NEU);
});

test("Ablage: zu wenige Messungen schliessen GAR NICHTS", async () => {
  _leereAblageFuerTest();
  await merkeAufgaben([probe("ev-d1")], { env: OHNE_IDRIVE });
  const r = await schliesseErloschene({ klassenSeither: new Set(), messungenSeither: 3, env: OHNE_IDRIVE });
  assert.equal(r.geschlossen, 0, "'nicht wieder aufgetreten' ist bei 3 Messungen nur 'kaum gemessen'");
  assert.match(r.grund, /3 von 20/);
});

test("Ablage: eine fehlende Funktion erlischt NICHT von selbst", async () => {
  _leereAblageFuerTest();
  await merkeAufgaben([probe("ev-e1", { quelle: "Missing-Function-Detector", klasse: "fehlende-funktion" })], { env: OHNE_IDRIVE });
  const r = await schliesseErloschene({ klassenSeither: new Set(), messungenSeither: 99, env: OHNE_IDRIVE });
  assert.equal(r.geschlossen, 0, "eine Funktion fehlt weiter, auch wenn niemand danach fragt");
});

// ── Kennzahlen ──────────────────────────────────────────────────────────────

test("Kennzahlen: Zuwaechse summieren sich auf den Tag", async () => {
  _leereKennzahlenFuerTest();
  const jetztMs = Date.parse("2026-08-14T10:00:00Z");
  await merkeKennzahlen({ jeArt: { text: { aktionen: 2, gemessen: 2, punkteSumme: 180, funde: 1 } } }, { env: OHNE_IDRIVE, jetztMs });
  await merkeKennzahlen({ jeArt: { text: { aktionen: 1, gemessen: 1, punkteSumme: 100, funde: 0 } } }, { env: OHNE_IDRIVE, jetztMs });
  const k = await holeKennzahlen({ tage: 30, env: OHNE_IDRIVE, jetztMs });
  assert.equal(k.ok, true);
  assert.equal(k.aktionen, 3);
  assert.equal(k.gemessen, 3);
  assert.equal(k.abdeckung, 100);
  // (180 + 100) / 3 = 93,3 -> 93
  assert.equal(k.qualitaetsNote, 93);
  assert.equal(tagesId(jetztMs), "tag-2026-08-14");
});

test("Kennzahlen: ungemessene Aktionen druecken die Abdeckung", async () => {
  _leereKennzahlenFuerTest();
  const jetztMs = Date.parse("2026-08-14T10:00:00Z");
  await merkeKennzahlen({ jeArt: {
    text: { aktionen: 1, gemessen: 1, punkteSumme: 100, funde: 0 },
    holodeck: { aktionen: 3, gemessen: 0, punkteSumme: 0, funde: 0 }
  } }, { env: OHNE_IDRIVE, jetztMs });
  const k = await holeKennzahlen({ tage: 30, env: OHNE_IDRIVE, jetztMs });
  assert.equal(k.abdeckung, 25);
  assert.equal(k.qualitaetsNote, 100, "die Note gilt nur für das Gemessene");
});

// ── Zusammenspiel ───────────────────────────────────────────────────────────

test("Kreislauf: eine gemessene Aktion landet ueber den Zuwachs in der Ablage", async () => {
  _leereFuerTest();
  _leereAblageFuerTest();
  _leereKennzahlenFuerTest();
  const jetztMs = Date.parse("2026-08-14T12:00:00Z");
  erfasseAktion({ art: "bild", ergebnis: { url: "blob:x", bytes: 100, format: "png" }, betrifft: "maler", jetztMs });

  const bericht = await schreibeEvolutionAblage({ env: OHNE_IDRIVE, jetztMs });
  assert.equal(bericht.ok, true);
  assert.match(bericht.meldung, /gebucht/);

  const k = await holeKennzahlen({ tage: 30, env: OHNE_IDRIVE, jetztMs });
  assert.equal(k.aktionen, 1);
  const z = await zaehleAufgaben({ env: OHNE_IDRIVE });
  assert.ok(z.gesamt >= 1, "aus dem Befund muss eine Aufgabe geworden sein");

  // Und der Zuwachs ist danach LEER — sonst würde alles doppelt gebucht.
  const rest = entnimmZuwachs();
  assert.equal(rest.messungen, 0);
  assert.equal(rest.aufgaben.length, 0);
});

test("Supervisor: eine stumme Warteschlange ist NICHT dasselbe wie eine leere", async () => {
  const stumm = await laufSupervisor({
    warteschlange: async () => ({ ok: false, aufgaben: [], grund: "Ablage nicht erreichbar" }),
    env: OHNE_IDRIVE
  });
  assert.equal(stumm.ok, false, "fail-closed: ungeprüft ist nicht erledigt");
  assert.match(stumm.meldung, /nicht lesbar/);

  const leer = await laufSupervisor({ warteschlange: async () => ({ ok: true, aufgaben: [] }), env: OHNE_IDRIVE });
  assert.equal(leer.ok, true);
  assert.match(leer.meldung, /keine Abgabe/);
});

test("Supervisor: eine abgegebene Aufgabe wird geprueft UND ihr Urteil festgehalten", async () => {
  _leereAblageFuerTest();
  await merkeAufgaben([probe("ev-f1")], { env: OHNE_IDRIVE });
  await setzeZustand("ev-f1", ZUSTAENDE.ABGEGEBEN, { grund: "fertig gemeldet", env: OHNE_IDRIVE });
  // Ohne Belege muss die Abgabe durchfallen — und die Aufgabe zurück in Arbeit.
  const r = await laufSupervisor({ env: OHNE_IDRIVE });
  assert.equal(r.ok, true, "eine abgelehnte Abgabe ist kein Ausfall des Supervisors");
  assert.match(r.meldung, /0\/1 Abgaben abgenommen/);
  const { aufgaben } = await listeAufgaben({ env: OHNE_IDRIVE });
  assert.equal(aufgaben[0].status, ZUSTAENDE.LAUFEND, "das Urteil muss festgehalten werden");
});

// ── Konkurrenz-Radar (Nr. 04) ───────────────────────────────────────────────
//
// Er war zwei Wochen gruen, ohne je gesucht zu haben. Geprueft wird deshalb
// vor allem eines: dass er die Grenze zwischen MESSUNG und DEUTUNG haelt.

test("Radar: der Selbsttest trennt Funktions-Ankuendigung von Laerm", () => {
  const r = fuehreRadarSelbsttestAus({ jetztMs: 1 });
  assert.equal(r.bestanden, true, r.fehler.join("; "));
});

test("Radar: Treffer werden zu Kandidaten — ausdruecklich UNBESTAETIGT", async () => {
  const suche = async () => ({ results: [
    { title: "OpenAI launches new Canvas feature", url: "https://example.com/canvas", snippet: "rolling out today" },
    { title: "OpenAI hires a new CFO", url: "https://example.com/cfo", snippet: "personnel" }
  ] });
  const r = await fuehreRadarAus({ suche, env: OHNE_IDRIVE, jetztMs: Date.parse("2026-08-14T09:00:00Z"), beobachtet: [{ anbieter: "ChatGPT", anfrage: "x" }] });
  assert.equal(r.ok, true);
  assert.equal(r.kandidaten.length, 1, "die Personalie ist keine Funktion");
  assert.equal(r.kandidaten[0].bestaetigt, false, "ein Suchtreffer ist nie eine bestätigte Funktion");
  assert.match(r.kandidaten[0].url, /^https:/);
});

test("Radar: eine stumme Quelle ist KEINE Nachricht 'nichts Neues'", async () => {
  const suche = async () => { throw new Error("Suchdienst weg"); };
  const r = await fuehreRadarAus({ suche, env: OHNE_IDRIVE, jetztMs: 1, beobachtet: [{ anbieter: "ChatGPT", anfrage: "x" }] });
  assert.equal(r.ok, false, "alle Quellen stumm heisst rot, nicht 'keine Funde'");
  assert.equal(r.stummeQuellen.length, 1);
  assert.match(r.stummeQuellen[0].grund, /Suchdienst weg/);
});

test("Radar: ohne Netz wird nicht gesucht, aber ehrlich berichtet", async () => {
  const r = await laufKonkurrenzRadar({
    mitNetz: false,
    bestand: async () => ({ ok: true, laeufe: 0, letzterLauf: null, kandidaten: [], stummeQuellen: [] }),
    env: OHNE_IDRIVE
  });
  assert.equal(r.ok, true);
  assert.match(r.meldung, /Scan fällig/);
});

test("Radar: ein frischer Scan wird nicht wiederholt", async () => {
  const jetztMs = Date.parse("2026-08-14T09:00:00Z");
  let gesucht = false;
  const r = await laufKonkurrenzRadar({
    mitNetz: true,
    suche: async () => { gesucht = true; return { results: [] }; },
    bestand: async () => ({ ok: true, laeufe: 1, letzterLauf: new Date(jetztMs - 86_400_000).toISOString(), kandidaten: [{}], stummeQuellen: [] }),
    env: OHNE_IDRIVE, jetztMs
  });
  assert.equal(gesucht, false, "wöchentlich heisst wöchentlich — sonst verbrennt er Suchkontingent");
  assert.match(r.meldung, /letzter Scan vor 1 Tag/);
});

// ── Radar: gezielte Bereiche + Selbstmessung (Betreiber-Auftrag 2026-08-14) ──

test("Radar: beobachtet Recherche und Audio als eigene Bereiche", () => {
  const bereiche = new Set(BEOBACHTET.map((b) => b.bereich));
  assert.ok(bereiche.has("recherche"), "die allgemeine Suche findet nur, was gross angekuendigt wird");
  assert.ok(bereiche.has("audio"));
  assert.ok(bereiche.has("allgemein"));
});

test("Radar: der Bereich wandert bis in den Kandidaten", async () => {
  const suche = async () => ({ results: [{ title: "Introducing a new voice mode", url: "https://example.com/v" }] });
  const r = await fuehreRadarAus({
    suche, env: OHNE_IDRIVE, jetztMs: 1,
    beobachtet: [{ anbieter: "mehrere", bereich: "audio", anfrage: "x" }]
  });
  assert.equal(r.kandidaten[0].bereich, "audio", "sonst weiss niemand, wonach gesucht wurde");
});

test("Radar: seine EIGENEN Suchen zaehlen als Recherche", async () => {
  _leereFuerTest();
  const suche = async () => ({ results: [{ title: "Introducing a new research feature", url: "https://example.com/r" }] });
  await fuehreRadarAus({
    suche, env: OHNE_IDRIVE, jetztMs: 1,
    beobachtet: [{ anbieter: "mehrere", bereich: "recherche", anfrage: "x" }]
  });
  const zuwachs = entnimmZuwachs();
  assert.equal(zuwachs.jeArt.recherche?.aktionen, 1, "ein Rechercheur, der sich selbst nicht misst, ist ein blinder Fleck");
  assert.equal(zuwachs.jeArt.recherche.gemessen, 1);
});

test("Radar: eine Suche OHNE Treffer faellt als quellenlose Recherche auf", async () => {
  _leereFuerTest();
  await fuehreRadarAus({
    suche: async () => ({ results: [] }), env: OHNE_IDRIVE, jetztMs: 1,
    beobachtet: [{ anbieter: "mehrere", bereich: "recherche", anfrage: "x" }]
  });
  const zuwachs = entnimmZuwachs();
  assert.ok(zuwachs.klassen.has("recherche|leer") || zuwachs.klassen.has("recherche|quellen-fehlen"),
    "eine Recherche ohne Quelle ist eine Behauptung — das muss als Fund erscheinen");
});
