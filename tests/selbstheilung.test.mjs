// smejj.com — Selbstheilung: die BREMSE ist der Prüfgegenstand.
//
// Ein Heiler ohne Bremse ist gefährlicher als keiner: er hämmert im
// Sekundentakt gegen einen Dienst, der ohnehin am Boden liegt. Diese Tests
// halten fest, dass genau dreimal versucht wird, mit wachsendem Abstand,
// und dass danach ein Mensch gerufen wird statt weiterzuhämmern.
import test from "node:test";
import assert from "node:assert/strict";

import {
  planeHeilung,
  fuehreHeilungAus,
  VERSUCHE_MAX,
  ABSTAENDE_MS,
  befristeterAlarm,
  befristeterAlarmBis,
  BEFRISTUNG_MAX_MS
} from "../control-server/src/autopilots/selbstheilung.js";
import { laufKontoWache } from "../control-server/src/autopilots/kontoWacheAutopilot.js";

const rot = (id, extra = {}) => ({ id, name: id, ampel: "rot", ampelGrund: "Überfällig", ...extra });
const gruen = (id) => ({ id, name: id, ampel: "gruen", ampelGrund: "pünktlich" });

test("Gruene Autopiloten werden nicht angefasst", () => {
  const zustand = new Map();
  const plan = planeHeilung({ autopiloten: [gruen("a"), gruen("b")], zustand, jetztMs: 1000 });
  assert.deepEqual(plan.heilen, []);
  assert.deepEqual(plan.eskalieren, []);
});

test("Erster Versuch passiert SOFORT, der zweite erst nach Abstand", () => {
  const zustand = new Map();
  const t0 = 1_000_000;

  const p1 = planeHeilung({ autopiloten: [rot("x")], zustand, jetztMs: t0 });
  assert.deepEqual(p1.heilen, [{ id: "x", versuch: 1 }], "sofort versuchen");

  // Direkt danach: noch nicht wieder — sonst waere es ein Hammer.
  const p2 = planeHeilung({ autopiloten: [rot("x")], zustand, jetztMs: t0 + 1000 });
  assert.deepEqual(p2.heilen, [], "kein zweiter Versuch im selben Moment");
  assert.equal(p2.warten.length, 1);
  assert.ok(p2.warten[0].nochMs > 0);

  // Nach dem Abstand: zweiter Versuch.
  const p3 = planeHeilung({ autopiloten: [rot("x")], zustand, jetztMs: t0 + ABSTAENDE_MS[1] + 1 });
  assert.deepEqual(p3.heilen, [{ id: "x", versuch: 2 }]);
});

test("ENTSCHEIDEND: nach drei Versuchen wird eskaliert, nicht weitergehaemmert", () => {
  const zustand = new Map();
  let t = 1_000_000;
  const ap = [rot("y")];

  planeHeilung({ autopiloten: ap, zustand, jetztMs: t });                       // 1
  t += ABSTAENDE_MS[1] + 1;
  planeHeilung({ autopiloten: ap, zustand, jetztMs: t });                       // 2
  t += ABSTAENDE_MS[2] + 1;
  const p3 = planeHeilung({ autopiloten: ap, zustand, jetztMs: t });            // 3
  assert.deepEqual(p3.heilen, [{ id: "y", versuch: VERSUCHE_MAX }]);

  t += ABSTAENDE_MS[2] + 1;
  const p4 = planeHeilung({ autopiloten: ap, zustand, jetztMs: t });
  assert.deepEqual(p4.heilen, [], "kein vierter Versuch");
  assert.equal(p4.eskalieren.length, 1, "stattdessen wird ein Mensch gerufen");
  assert.match(p4.eskalieren[0].grund, /3 Wiederbelebungsversuche/);

  // Und danach Ruhe: nicht bei jedem Takt erneut eskalieren (Mail-Sturm).
  t += 10 * ABSTAENDE_MS[2];
  const p5 = planeHeilung({ autopiloten: ap, zustand, jetztMs: t });
  assert.deepEqual(p5.eskalieren, [], "eskaliert wird genau einmal");
  assert.deepEqual(p5.heilen, []);
});

test("Wieder gruen setzt den Zaehler zurueck — erst dann, nicht schon beim Versuch", () => {
  const zustand = new Map();
  const t0 = 5_000_000;
  planeHeilung({ autopiloten: [rot("z")], zustand, jetztMs: t0 });
  assert.equal(zustand.get("z").versuche, 1, "der Versuch zaehlt, auch wenn er lief");

  planeHeilung({ autopiloten: [gruen("z")], zustand, jetztMs: t0 + 1000 });
  assert.equal(zustand.has("z"), false, "geheilt = Zaehler weg");

  // Faellt er spaeter erneut aus, beginnt die Bremse wieder bei eins.
  const p = planeHeilung({ autopiloten: [rot("z")], zustand, jetztMs: t0 + 2000 });
  assert.deepEqual(p.heilen, [{ id: "z", versuch: 1 }]);
});

test("In Wartung wird nichts wiederbelebt", () => {
  const zustand = new Map();
  const plan = planeHeilung({
    autopiloten: [rot("w", { wartung: { seit: "2026-08-13", grund: "Umbau" } })],
    zustand, jetztMs: 1000
  });
  assert.deepEqual(plan.heilen, [], "stillgelegt heisst stillgelegt");
});

test("Audit 03.09.: ohne Start-Weg ist ein Roter ein Betreiber-Punkt — kein Versuch, keine Eskalation, kein Doppel-Rot", async () => {
  const zustand = new Map();
  const erreichbar = new Set(["im-laeufer"]);
  let t = 1_000_000;
  const ap = [rot("web-vitals-wache"), rot("im-laeufer")];
  const p1 = planeHeilung({ autopiloten: ap, zustand, jetztMs: t, erreichbar });
  assert.deepEqual(p1.heilen, [{ id: "im-laeufer", versuch: 1 }], "nur der erreichbare wird versucht");
  assert.deepEqual(p1.betreiber.map((b) => b.id), ["web-vitals-wache"], "der Mac-Job ist ein Betreiber-Punkt");
  // Drei Takte spaeter: kein Versuchszaehler, keine Eskalation, der Punkt wird nicht wiederholt.
  for (let i = 0; i < 4; i += 1) { t += ABSTAENDE_MS[2] + 1; planeHeilung({ autopiloten: ap, zustand, jetztMs: t, erreichbar }); }
  const p5 = planeHeilung({ autopiloten: ap, zustand, jetztMs: t + 1, erreichbar });
  assert.equal(p5.eskalieren.some((e) => e.id === "web-vitals-wache"), false, "ein Mac-Job wird NIE 'nach 3 Versuchen aufgegeben'");
  assert.deepEqual(p5.betreiber, [], "der Betreiber-Punkt kommt genau einmal je Rot-Phase");
  // Wieder gruen setzt auch den Betreiber-Punkt zurueck.
  planeHeilung({ autopiloten: [gruen("web-vitals-wache")], zustand, jetztMs: t + 2, erreichbar });
  assert.equal(zustand.has("web-vitals-wache"), false);
  // Und die Selbstmeldung bleibt gruen, nennt den Punkt aber mit Zahl.
  const gemeldet = new Map();
  await fuehreHeilungAus({
    plan: { heilen: [], eskalieren: [], warten: [], betreiber: [{ id: "web-vitals-wache", name: "Web-Vitals-Wache" }] },
    heiler: {},
    melde: (id, e) => { gemeldet.set(id, e); return true; }
  });
  assert.equal(gemeldet.get("selbstheilung").status, "ok");
  assert.match(gemeldet.get("selbstheilung").meldung, /1 ohne Start-Weg \(Mac\/extern\) = Betreiber-Punkt/);
  // Ohne erreichbar-Menge bleibt das alte Verhalten (Rueckwaertskompatibel).
  const alt = planeHeilung({ autopiloten: [rot("x")], zustand: new Map(), jetztMs: 1 });
  assert.deepEqual(alt.heilen, [{ id: "x", versuch: 1 }]);
});

test("Ohne hinterlegten Weg wird ehrlich eskaliert statt Erfolg vorzutaeuschen", async () => {
  const alarme = [];
  const ergebnisse = await fuehreHeilungAus({
    plan: { heilen: [{ id: "ohne-weg", versuch: 1 }], eskalieren: [], warten: [] },
    heiler: {},
    sendeAlarm: async (e) => { alarme.push(e); }
  });
  assert.equal(ergebnisse[0].ok, false);
  assert.match(ergebnisse[0].grund, /kein Wiederbelebungsweg/);
  assert.equal(alarme.length, 1, "der Betreiber erfaehrt, dass es hier keinen Weg gibt");
});

test("Der Heiler bezeugt sich selbst", async () => {
  const gemeldet = new Map();
  await fuehreHeilungAus({
    plan: { heilen: [{ id: "a", versuch: 1 }], eskalieren: [], warten: [{ id: "b", nochMs: 5000 }] },
    heiler: { a: async () => true },
    melde: (id, e) => { gemeldet.set(id, e); return true; }
  });
  const m = gemeldet.get("selbstheilung");
  assert.ok(m, "ohne Selbstmeldung wuesste niemand, ob der Heiler arbeitet");
  assert.equal(m.status, "ok");
  assert.match(m.meldung, /1\/1 Wiederbelebung/);

  const leer = new Map();
  await fuehreHeilungAus({
    plan: { heilen: [], eskalieren: [], warten: [] },
    melde: (id, e) => { leer.set(id, e); return true; }
  });
  assert.match(leer.get("selbstheilung").meldung, /Nichts zu heilen/);
});

test("Eskalation faerbt die Heiler-Ampel rot", async () => {
  const gemeldet = new Map();
  await fuehreHeilungAus({
    plan: { heilen: [], eskalieren: [{ id: "tot", name: "tot", grund: "3x nichts" }], warten: [] },
    melde: (id, e) => { gemeldet.set(id, e); return true; },
    sendeAlarm: async () => {}
  });
  assert.equal(gemeldet.get("selbstheilung").status, "fehler",
    "wenn der Heiler aufgibt, darf seine eigene Ampel nicht gruen bleiben");
});

test("Der Heiler hat einen Registry-Eintrag — sonst meldet er ins Leere", async () => {
  // Genau das war am 2026-08-13 kurz kaputt: Der Heiler bezeugte sich selbst
  // unter der Kennung "selbstheilung", die es in der Registry nicht gab.
  // interneMeldung() nimmt unbekannte Kennungen nicht an (fail-closed) — die
  // Selbstmeldung verschwand also spurlos. Ein Waechter, dessen eigene
  // Meldung ins Leere geht, ist unsichtbar, wenn er ausfaellt.
  const { AUTOPILOTEN } = await import("../control-server/src/admin/opsAutopilotenListe.js");
  const { interneMeldung, _herzschlaegeZuruecksetzen } = await import("../control-server/src/admin/opsAutopiloten.js");

  for (const id of ["selbstheilung", "autopilot-laeufer"]) {
    assert.ok(AUTOPILOTEN.some((a) => a.id === id), `${id} fehlt in der Registry`);
    _herzschlaegeZuruecksetzen();
    assert.equal(interneMeldung(id, { status: "ok", meldung: "Probe" }), true,
      `${id}: interneMeldung nimmt die Kennung nicht an — die Selbstmeldung ginge verloren`);
  }
  _herzschlaegeZuruecksetzen();
});

test("Live-Test 15.09.: bewusst befristet rote Wache wird NICHT wiederbelebt, zählt nicht und eskaliert nie", async () => {
  const t0 = Date.parse("2026-09-15T10:00:00Z");
  const grund = (bisMs) => `Der letzte Lauf hat einen Fehler gemeldet: ${befristeterAlarm(bisMs)}: Admin-Liste wurde vor Kurzem geändert (NEU x@y) — Alarm noch 8 h, dann gilt der neue Stand.`;
  const bis = t0 + 8 * 3_600_000;
  assert.equal(befristeterAlarmBis(grund(bis)), bis, "die Marke ist lesbar (Minutengenau)");
  const zustand = new Map([["konto-wache", { versuche: 2, letzterMs: t0 - 1, eskaliert: false }]]);
  const erreichbar = new Set(["konto-wache", "echt-kaputt"]);
  const alarme = [];
  const gemeldet = new Map();
  let t = t0;
  // Gesund: über viele Takte hinweg (mehr als VERSUCHE_MAX) kein Versuch, kein Zähler, keine Mail.
  for (let i = 0; i < VERSUCHE_MAX + 3; i += 1, t += ABSTAENDE_MS[2] + 1) {
    const plan = planeHeilung({ autopiloten: [rot("konto-wache", { ampelGrund: grund(bis) })], zustand, jetztMs: t, erreichbar });
    assert.deepEqual(plan.heilen, [], "eine befristete Frist lässt sich nicht wegheilen");
    assert.deepEqual(plan.eskalieren, []);
    assert.deepEqual(plan.befristet.map((b) => b.id), ["konto-wache"]);
    assert.equal(zustand.has("konto-wache"), false, "kein Zähler, auch keine Altlast von vor der Marke");
    await fuehreHeilungAus({ plan, heiler: { "konto-wache": async () => true }, melde: (id, e) => { gemeldet.set(id, e); return true; }, sendeAlarm: async (e) => { alarme.push(e); } });
  }
  assert.equal(alarme.length, 0, "keine 'Autopilot gibt auf'-Mail");
  assert.equal(gemeldet.get("selbstheilung").status, "ok", "die Erste Hilfe wird dadurch nicht selbst rot");
  assert.match(gemeldet.get("selbstheilung").meldung, /1 bewusst befristet rot \(konto-wache\) = kein Ausfall/);

  // Kaputt 1: echter Ausfall daneben wird weiter geheilt — die Marke ist kein Freifahrtschein für alle.
  const daneben = planeHeilung({ autopiloten: [rot("konto-wache", { ampelGrund: grund(bis) }), rot("echt-kaputt")], zustand: new Map(), jetztMs: t0, erreichbar });
  assert.deepEqual(daneben.heilen, [{ id: "echt-kaputt", versuch: 1 }]);
  // Kaputt 2: Frist abgelaufen und immer noch rot -> wieder ein normaler Ausfall.
  const abgelaufen = planeHeilung({ autopiloten: [rot("konto-wache", { ampelGrund: grund(bis) })], zustand: new Map(), jetztMs: bis + 60_000, erreichbar });
  assert.deepEqual(abgelaufen.heilen, [{ id: "konto-wache", versuch: 1 }]);
  // Kaputt 3: eine Frist weit in der Zukunft ist eine Dauer-Ausrede, keine Befristung.
  const ewig = planeHeilung({ autopiloten: [rot("konto-wache", { ampelGrund: grund(t0 + BEFRISTUNG_MAX_MS + 3_600_000) })], zustand: new Map(), jetztMs: t0, erreichbar });
  assert.deepEqual(ewig.heilen, [{ id: "konto-wache", versuch: 1 }]);
  // Kaputt 4: bleibt die Wache aus, trägt der ampelGrund "Überfällig" -> echter Ausfall, auch mit alter Marke im letzten Lauf.
  const stumm = planeHeilung({ autopiloten: [rot("konto-wache", { ampelGrund: "Überfällig: der letzte Lauf ist deutlich länger her als der Zeitplan erlaubt.", letzterLauf: { status: "fehler", meldung: befristeterAlarm(bis) } })], zustand: new Map(), jetztMs: t0, erreichbar });
  assert.deepEqual(stumm.heilen, [{ id: "konto-wache", versuch: 1 }]);
  assert.equal(befristeterAlarmBis("Admin-Liste wurde vor Kurzem geändert — Alarm noch 6 h"), null, "ohne Marke kein Signal");
});

test("Konto-Wache trägt die Marke vorn — auch wenn der Herzschlag nach 200 Zeichen abschneidet", async () => {
  const env = { SMEJJ_SESSION_SECRET: "x".repeat(48), SMEJJ_ADMIN_OWNER_EMAILS: "a@x.de" };
  // Eigene Ablage im Speicher: createRecordStore griffe mit e2-Schlüsseln in der Umgebung auf den echten Speicher.
  const karte = new Map();
  const ablage = { lies: async (id) => karte.get(id) || null, schreib: async (r) => { karte.set(r.id, { ...r }); return r; } };
  const t0 = Date.parse("2026-09-15T10:00:00Z");
  await laufKontoWache({ env, ablage, jetztMs: t0 });
  const viele = Array.from({ length: 12 }, (_, i) => `neuer-admin-${i}@beispiel.example`).join(",");
  const drift = await laufKontoWache({ env: { ...env, SMEJJ_ADMIN_OWNER_EMAILS: `a@x.de,${viele}` }, ablage, jetztMs: t0 });
  assert.equal(drift.ok, false);
  assert.equal(befristeterAlarmBis(drift.meldung.slice(0, 200)), Date.parse("2026-09-16T10:00:00Z"));
  const nachhall = await laufKontoWache({ env: { ...env, SMEJJ_ADMIN_OWNER_EMAILS: `a@x.de,${viele}` }, ablage, jetztMs: t0 + 3_600_000 });
  assert.equal(nachhall.ok, false, "die Wache bleibt bewusst rot");
  assert.equal(befristeterAlarmBis(nachhall.meldung.slice(0, 200)), Date.parse("2026-09-16T10:00:00Z"), "die Frist läuft ab der Änderung, nicht ab jedem Lauf");
  const danach = await laufKontoWache({ env: { ...env, SMEJJ_ADMIN_OWNER_EMAILS: `a@x.de,${viele}` }, ablage, jetztMs: t0 + 25 * 3_600_000 });
  assert.equal(danach.ok, true, danach.meldung);
  assert.equal(befristeterAlarmBis(danach.meldung), null, "grün trägt keine Marke");
});
