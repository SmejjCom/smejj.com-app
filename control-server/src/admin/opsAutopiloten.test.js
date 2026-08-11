// smejj.com — Unit-Tests fuer Modul AP (Autopiloten).
//
// Die wichtigste Pruefung: GRUEN gibt es nur fuer einen gemessenen Herzschlag.
// Eine Registry-Zeile allein darf nie gruen werden — genau diese Luege
// ("eingetragen = laeuft") hat den Codeberg-Spiegel monatelang verdeckt.
//
// Ausfuehren: node --test control-server/src/admin/opsAutopiloten.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTOPILOTEN,
  autopilotUebersicht,
  frageWaechterAb,
  heartbeatAnnehmen,
  ladeHerzschlaege,
  persistiereHerzschlag,
  pruefeAlarm,
  pruefeWochenbericht,
  wochenberichtText,
  starteSelbstmessung,
  _ablageLeeren,
  _herzschlaegeZuruecksetzen
} from "./opsAutopiloten.js";

const JETZT = Date.parse("2026-08-07T12:00:00.000Z");
const ENV = { SMEJJ_AUTOPILOT_KEYS: "qualitaetsmessung:geheim1,codeberg-spiegel:geheim2" };

function frisch() {
  _herzschlaegeZuruecksetzen();
}

test("ohne Herzschlag ist NIEMAND gruen — auch nicht die eingetragenen", () => {
  frisch();
  const u = autopilotUebersicht({ jetztMs: JETZT });
  assert.equal(u.total, AUTOPILOTEN.length);
  assert.equal(u.gruen, 0, "gruen ohne Messung waere genau die Luege, die das Modul verhindern soll");
  assert.equal(u.grau, AUTOPILOTEN.length);
});

test("puenktlicher Erfolgs-Herzschlag macht gruen", () => {
  frisch();
  const antwort = heartbeatAnnehmen({
    id: "qualitaetsmessung", key: "geheim1", status: "ok", dauerMs: 4200,
    env: ENV, jetztMs: JETZT - 60 * 60 * 1000
  });
  assert.equal(antwort.ok, true);
  const u = autopilotUebersicht({ jetztMs: JETZT });
  const a = u.autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.ampel, "gruen");
  assert.equal(u.gruen, 1);
});

test("ueberfaellig in der Schonfrist = gelb, jenseits = rot", () => {
  frisch();
  // Qualitaetsmessung: erwartet alle 12 h, Schonfrist 6 h.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT - 14 * 60 * 60 * 1000 });
  let a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.ampel, "gelb", "14 h alt bei 12+6 h ist verspaetet, nicht ausgefallen");

  frisch();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT - 20 * 60 * 60 * 1000 });
  a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.ampel, "rot", "20 h alt bei 12+6 h ist ein Ausfall");
});

test("ein gemeldeter Fehler ist sofort rot — egal wie frisch", () => {
  frisch();
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", meldung: "push abgewiesen", env: ENV, jetztMs: JETZT - 1000 });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "codeberg-spiegel");
  assert.equal(a.ampel, "rot");
  assert.ok(a.ampelGrund.includes("push abgewiesen"), "die Fehlermeldung gehoert in den Grund");
});

test("fail-closed: ohne Schluessel-Umgebung wird nichts angenommen", () => {
  frisch();
  const antwort = heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: {}, jetztMs: JETZT });
  assert.equal(antwort.ok, false);
  assert.equal(antwort.status, 503);
  assert.equal(antwort.error, "autopilot_keys_missing");
});

test("falscher Schluessel und unbekannte Kennung werden abgewiesen", () => {
  frisch();
  assert.equal(heartbeatAnnehmen({ id: "qualitaetsmessung", key: "falsch", status: "ok", env: ENV, jetztMs: JETZT }).status, 403);
  assert.equal(heartbeatAnnehmen({ id: "gibtsnicht", key: "x", status: "ok", env: ENV, jetztMs: JETZT }).status, 404);
  const u = autopilotUebersicht({ jetztMs: JETZT });
  assert.equal(u.gruen, 0, "abgewiesene Herzschlaege duerfen die Ampel nicht anfassen");
});

test("Verlauf ist gedeckelt und juengster Lauf steht vorn", () => {
  frisch();
  for (let i = 0; i < 25; i += 1) {
    heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "lauf " + i, env: ENV, jetztMs: JETZT - (25 - i) * 1000 });
  }
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.verlauf.length, 20, "der Verlauf darf nicht unbegrenzt wachsen");
  assert.ok(a.verlauf[0].meldung.includes("lauf 24"), "der juengste Lauf steht vorn");
});

test("lange Meldungen werden gekuerzt — der Speicher ist begrenzt", () => {
  frisch();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "x".repeat(5000), env: ENV, jetztMs: JETZT });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.letzterLauf.meldung.length, 200);
});

test("Eigenmeldung: die Salad-Sonden werden gruen, sonst niemand", () => {
  frisch();
  const zeitgeber = starteSelbstmessung({ intervallMs: 60 * 60 * 1000 });
  clearInterval(zeitgeber);
  const u = autopilotUebersicht({ jetztMs: Date.now() });
  const sonden = u.autopiloten.find((x) => x.id === "salad-sonden");
  assert.equal(sonden.ampel, "gruen", "die Eigenmeldung traegt die Sonden-Ampel");
  assert.ok(sonden.letzterLauf.meldung.includes("Eigenmeldung"));
  assert.equal(u.gruen, 1, "kein anderer Autopilot erbt die Eigenmeldung");
});

test("Stufe 3: ein abgelegter Herzschlag uebersteht den Neustart", async () => {
  frisch(); _ablageLeeren();
  // Ohne IDrive-Umgebung faellt die Ablage auf den Memory-Speicher zurueck —
  // genau das simuliert hier den Neustart: Karte leer, Ablage voll.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "Note 96 %", env: ENV, jetztMs: JETZT - 1000 });
  assert.equal(await persistiereHerzschlag("qualitaetsmessung", { env: {} }), true);
  _herzschlaegeZuruecksetzen();
  assert.equal(autopilotUebersicht({ jetztMs: JETZT }).gruen, 0, "Neustart: erst einmal alles grau");
  const geladen = await ladeHerzschlaege({ env: {} });
  assert.equal(geladen, 1);
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.ampel, "gruen", "der geladene Verlauf traegt die Ampel wieder");
  assert.ok(a.letzterLauf.meldung.includes("Note 96"));
});

test("Stufe 3: ein lebender Herzschlag gewinnt gegen die Ablage", async () => {
  frisch(); _ablageLeeren();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "alt", env: ENV, jetztMs: JETZT - 5000 });
  await persistiereHerzschlag("qualitaetsmessung", { env: {} });
  _herzschlaegeZuruecksetzen();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "frisch", env: ENV, jetztMs: JETZT - 1000 });
  await ladeHerzschlaege({ env: {} });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.ok(a.letzterLauf.meldung.includes("frisch"), "die Ablage darf den lebenden Stand nicht ueberschreiben");
});

test("Stufe 3: Rot-Alarm genau einmal je Episode, danach wieder scharf", async () => {
  frisch(); _ablageLeeren();
  const gesendet = [];
  const sende = async (mail) => { gesendet.push(mail); };
  const alarmEnv = { ...ENV, SMEJJ_ADMIN_OWNER_EMAILS: "smejjcom@gmail.com" };

  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", meldung: "push kaputt", env: ENV, jetztMs: JETZT - 1000 });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT, sende });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT, sende });
  assert.equal(gesendet.length, 1, "dieselbe Rot-Phase wird nur einmal gemeldet");
  assert.ok(gesendet[0].subject.includes("Codeberg-Spiegel"));
  assert.ok(gesendet[0].text.includes("push kaputt"));

  // Episode endet (gruen), neues Rot -> neue Mail.
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "ok", env: ENV, jetztMs: JETZT });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT, sende });
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", meldung: "wieder kaputt", env: ENV, jetztMs: JETZT + 1000 });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT + 2000, sende });
  assert.equal(gesendet.length, 2, "eine neue Rot-Phase meldet sich wieder");
});

test("Stufe 3: ohne Empfaenger wird nichts gesendet und nichts geworfen", async () => {
  frisch();
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", env: ENV, jetztMs: JETZT });
  const ergebnis = await pruefeAlarm({ env: ENV, jetztMs: JETZT, sende: async () => { throw new Error("darf nicht"); } });
  assert.equal(ergebnis.gemeldet, 0);
});

test("Waechter-Abfrage: antwortet er, wird er gruen — mit Bruecken-Zustand", async () => {
  frisch();
  const antwortet = async (url) => ({
    ok: true,
    json: async () => (String(url).includes("/bruecke")
      ? { erreichbar: true, letzteVersion: "v124", gesamtPruefungen: 42 }
      : { ok: true, dienst: "smejj-brueckenwaechter" })
  });
  assert.equal(await frageWaechterAb({ jetztMs: JETZT, fetchImpl: antwortet }), true);
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "brueckenwaechter");
  assert.equal(a.ampel, "gruen");
  assert.ok(a.letzterLauf.meldung.includes("v124"), "der Bruecken-Zustand gehoert in die Meldung");
});

test("Waechter-Abfrage: schweigt er, wird NICHTS eingetragen", async () => {
  frisch();
  const schweigt = async () => { throw new Error("nicht erreichbar"); };
  assert.equal(await frageWaechterAb({ jetztMs: JETZT, fetchImpl: schweigt }), false);
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "brueckenwaechter");
  assert.equal(a.ampel, "grau", "eine erfundene Meldung waere das Gegenteil des Zwecks");
  assert.equal(a.letzterLauf, null);
});

test("Waechter-Abfrage: meldet er die Bruecke als tot, bleibt ER trotzdem gruen", async () => {
  frisch();
  const brueckeTot = async (url) => ({
    ok: true,
    json: async () => (String(url).includes("/bruecke")
      ? { erreichbar: false, laufenderAusfall: { seit: "2026-08-08T05:00:00.000Z" } }
      : { ok: true })
  });
  await frageWaechterAb({ jetztMs: JETZT, fetchImpl: brueckeTot });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "brueckenwaechter");
  assert.equal(a.ampel, "gruen", "der Waechter tut seine Arbeit — die Bruecke ist das Problem, nicht er");
  assert.ok(a.letzterLauf.meldung.includes("AUSGEFALLEN"));
});

test("Profi-Ausbau: Herzschlaege verdichten sich zur Tages-Statistik mit Quote", () => {
  frisch();
  // Drei Laeufe an Tag 1 (einer davon Fehler), einer an Tag 2.
  const tag1 = Date.parse("2026-08-01T06:00:00.000Z");
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: tag1 });
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "fehler", env: ENV, jetztMs: tag1 + 1000 });
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: tag1 + 2000 });
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: tag1 + TAG_TEST_MS });
  const a = autopilotUebersicht({ jetztMs: tag1 + TAG_TEST_MS }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.tage.length, 2, "zwei Kalendertage ergeben zwei Eintraege");
  assert.deepEqual(a.tage[0], { tag: "2026-08-01", ok: 2, fehler: 1 });
  assert.deepEqual(a.tage[1], { tag: "2026-08-02", ok: 1, fehler: 0 });
  assert.equal(a.erfolgsquote90.prozent, 75, "3 von 4 Laeufen erfolgreich");
  assert.equal(a.erfolgsquote90.laeufe, 4);
});

test("Profi-Ausbau: die Tages-Statistik uebersteht den Neustart", async () => {
  frisch(); _ablageLeeren();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT - 1000 });
  await persistiereHerzschlag("qualitaetsmessung", { env: {} });
  _herzschlaegeZuruecksetzen();
  await ladeHerzschlaege({ env: {} });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.tage.length, 1, "die Tages-Statistik kommt aus der Ablage zurueck");
  assert.equal(a.erfolgsquote90.prozent, 100);
});

test("Profi-Ausbau: die Waechter-Abfrage misst ihre eigene Dauer", async () => {
  frisch();
  const antwortet = async () => ({ ok: true, json: async () => ({ ok: true, erreichbar: true }) });
  await frageWaechterAb({ jetztMs: JETZT, fetchImpl: antwortet });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "brueckenwaechter");
  assert.ok(Number.isFinite(a.letzterLauf.dauerMs), "die Dauer der Abfrage gehoert in den Lauf");
  assert.ok(a.tage.length === 1 && a.tage[0].ok === 1, "auch die Abfrage zaehlt in die Tages-Statistik");
});

test("Profi-Ausbau: eine Rot-Phase wird als Vorfall protokolliert und geschlossen", async () => {
  frisch(); _ablageLeeren();
  const sende = async () => {};
  const alarmEnv = { ...ENV, SMEJJ_ADMIN_OWNER_EMAILS: "smejjcom@gmail.com" };

  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", meldung: "push kaputt", env: ENV, jetztMs: JETZT - 1000 });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT, sende });
  let u = autopilotUebersicht({ jetztMs: JETZT });
  assert.equal(u.vorfaelle.length, 1, "das Rot eroeffnet einen Vorfall");
  assert.equal(u.vorfaelle[0].bis, null, "der Vorfall ist noch offen");
  assert.ok(u.vorfaelle[0].grund.includes("push kaputt"));

  // Zweiter Pruefdurchlauf im selben Rot: KEIN zweiter Vorfall.
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT + 1000, sende });
  assert.equal(autopilotUebersicht({ jetztMs: JETZT + 1000 }).vorfaelle.length, 1);

  // Wieder gruen: der Vorfall wird geschlossen und bekommt eine Dauer.
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "ok", env: ENV, jetztMs: JETZT + 2000 });
  await pruefeAlarm({ env: alarmEnv, jetztMs: JETZT + 3000, sende });
  u = autopilotUebersicht({ jetztMs: JETZT + 3000 });
  assert.equal(u.vorfaelle.length, 1);
  assert.ok(u.vorfaelle[0].bis, "der Vorfall ist geschlossen");
  // Der Vorfall beginnt, wenn die Wache das Rot SIEHT (10-Minuten-Takt),
  // nicht beim Fehler-Herzschlag selbst — feiner loest auch die Mail nicht auf.
  assert.equal(u.vorfaelle[0].dauerMs, 3000, "vom ersten Sehen bis zum Pruefdurchlauf");
});

test("Profi-Ausbau: Vorfaelle ueberstehen den Neustart, offene bleiben offen", async () => {
  frisch(); _ablageLeeren();
  heartbeatAnnehmen({ id: "codeberg-spiegel", key: "geheim2", status: "fehler", env: ENV, jetztMs: JETZT - 1000 });
  await pruefeAlarm({ env: {}, jetztMs: JETZT, sende: async () => {} });
  _herzschlaegeZuruecksetzen();
  assert.equal(autopilotUebersicht({ jetztMs: JETZT }).vorfaelle.length, 0, "Neustart: Arbeitsspeicher leer");
  await ladeHerzschlaege({ env: {} });
  const u = autopilotUebersicht({ jetztMs: JETZT });
  assert.equal(u.vorfaelle.length, 1, "der Vorfall kommt aus der Ablage zurueck");
  assert.equal(u.vorfaelle[0].bis, null, "ein offener Vorfall bleibt offen");
});

const TAG_TEST_MS = 24 * 60 * 60 * 1000;

test("Nr. 5: eine Gelb-Phase wird Vorfall und eskaliert zu EINEM Rot-Vorfall", async () => {
  frisch(); _ablageLeeren();
  const sende = async () => {};
  // Qualitaetsmessung: 12 h erwartet, 6 h Schonfrist. 14 h alt = gelb.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT - 14 * 60 * 60 * 1000 });
  await pruefeAlarm({ env: ENV, jetztMs: JETZT, sende });
  let u = autopilotUebersicht({ jetztMs: JETZT });
  assert.equal(u.vorfaelle.length, 1, "die Verspaetung eroeffnet einen Vorfall");
  assert.equal(u.vorfaelle[0].art, "gelb");

  // 20 h alt = rot: derselbe Vorfall wird angehoben, kein zweiter.
  const SPAETER = JETZT + 6 * 60 * 60 * 1000;
  await pruefeAlarm({ env: ENV, jetztMs: SPAETER, sende });
  u = autopilotUebersicht({ jetztMs: SPAETER });
  assert.equal(u.vorfaelle.length, 1, "Eskalation ist EIN Vorfall, kein neuer");
  assert.equal(u.vorfaelle[0].art, "rot");
  assert.equal(u.vorfaelle[0].bis, null, "der Beginn bleibt der Gelb-Beginn, der Vorfall laeuft");

  // Frischer Erfolg: der Vorfall schliesst.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: SPAETER });
  await pruefeAlarm({ env: ENV, jetztMs: SPAETER + 1000, sende });
  u = autopilotUebersicht({ jetztMs: SPAETER + 1000 });
  assert.ok(u.vorfaelle[0].bis, "wieder gruen schliesst den Vorfall");
});

test("Nr. 4: der Wochenbericht kommt montags ab 7 Uhr UTC — genau einmal", async () => {
  frisch(); _ablageLeeren();
  const gesendet = [];
  const sende = async (mail) => { gesendet.push(mail); };
  const env = { ...ENV, SMEJJ_ADMIN_OWNER_EMAILS: "smejjcom@gmail.com" };
  const MONTAG_8 = Date.parse("2026-08-10T08:00:00.000Z");

  // Sonntag: nicht faellig. Montag 6 Uhr: noch nicht faellig.
  assert.equal((await pruefeWochenbericht({ env, jetztMs: MONTAG_8 - TAG_TEST_MS, sende })).gesendet, false);
  assert.equal((await pruefeWochenbericht({ env, jetztMs: MONTAG_8 - 2 * 60 * 60 * 1000, sende })).gesendet, false);

  // Montag 8 Uhr: faellig — einmal, nicht zweimal.
  assert.equal((await pruefeWochenbericht({ env, jetztMs: MONTAG_8, sende })).gesendet, true);
  assert.equal((await pruefeWochenbericht({ env, jetztMs: MONTAG_8 + 60 * 60 * 1000, sende })).gesendet, false);
  assert.equal(gesendet.length, 1);
  assert.ok(gesendet[0].subject.includes("Wochenbericht 2026-08-10"));

  // Der Marker uebersteht den Neustart: auch danach keine zweite Mail.
  await new Promise((r) => setTimeout(r, 10));
  _herzschlaegeZuruecksetzen();
  await ladeHerzschlaege({ env: {} });
  assert.equal((await pruefeWochenbericht({ env, jetztMs: MONTAG_8 + 2 * 60 * 60 * 1000, sende })).gesendet, false, "der abgelegte Marker verhindert die Doppel-Mail");
});

test("Nr. 4: der Berichtstext ist ehrlich — Quote aus Laeufen, Stillgelegtes als gewollt", () => {
  frisch();
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT - 1000 });
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "fehler", meldung: "kaputt", env: ENV, jetztMs: JETZT - 500 });
  const text = wochenberichtText({ jetztMs: JETZT });
  assert.ok(text.includes("01. Qualitätsmessung [ROT]: 2 Laeufe, 1 Fehler (50 % erfolgreich)"), "Quote aus gemessenen Laeufen: " + text);
  assert.ok(text.includes("05. Training-Loop [keine Messung]: keine Laeufe gemessen"));
  assert.ok(text.includes("04. Konkurrenz-Radar [keine Messung]: keine Laeufe gemessen"));
  assert.ok(text.includes("smejj.com/admin/autopiloten/"));
});

test("Nachlieferung: ein Herzschlag mit Original-Zeitpunkt landet an seinem Platz", () => {
  frisch();
  // Frischer Lauf zuerst, dann kommt ein aelterer aus der Warteschlange nach.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "frisch", env: ENV, jetztMs: JETZT - 1000 });
  const antwort = heartbeatAnnehmen({
    id: "qualitaetsmessung", key: "geheim1", status: "ok", meldung: "nachgeliefert",
    am: new Date(JETZT - 26 * 60 * 60 * 1000).toISOString(), env: ENV, jetztMs: JETZT
  });
  assert.equal(antwort.ok, true);
  assert.equal(antwort.gespeichert.meldung, "nachgeliefert", "die Quittung gehoert zum nachgelieferten Lauf");
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.ok(a.letzterLauf.meldung.includes("frisch"), "der Nachzuegler darf den juengsten Lauf nicht verdraengen");
  assert.equal(a.ampel, "gruen", "die Ampel liest weiter den juengsten Lauf");
  assert.equal(a.tage.length, 2, "der Nachzuegler zaehlt in SEINEM Kalendertag");
  assert.ok(a.tage[0].tag < a.tage[1].tag, "die Tage bleiben aufsteigend sortiert");
});

test("Nachlieferung: Zukunft und Uralt werden abgewiesen, kaputte Zeit auch", () => {
  frisch();
  const zukunft = heartbeatAnnehmen({
    id: "qualitaetsmessung", key: "geheim1", status: "ok",
    am: new Date(JETZT + 60 * 60 * 1000).toISOString(), env: ENV, jetztMs: JETZT
  });
  assert.equal(zukunft.status, 400, "eine Stunde Zukunft ist keine Uhren-Abweichung mehr");
  const uralt = heartbeatAnnehmen({
    id: "qualitaetsmessung", key: "geheim1", status: "ok",
    am: new Date(JETZT - 15 * TAG_TEST_MS).toISOString(), env: ENV, jetztMs: JETZT
  });
  assert.equal(uralt.status, 400, "aelter als 14 Tage faellt aus dem Fenster");
  const kaputt = heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", am: "gestern", env: ENV, jetztMs: JETZT });
  assert.equal(kaputt.status, 400);
  const u = autopilotUebersicht({ jetztMs: JETZT });
  assert.equal(u.gruen, 0, "abgewiesene Nachlieferungen fassen die Ampel nicht an");
});

test("Neustart-Wettlauf: die geladene Tages-Historie verschmilzt mit frischen Laeufen", async () => {
  frisch(); _ablageLeeren();
  // Gestern und vorgestern liefen Herzschlaege, die Ablage kennt sie.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT - 2 * TAG_TEST_MS });
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "fehler", env: ENV, jetztMs: JETZT - TAG_TEST_MS });
  await persistiereHerzschlag("qualitaetsmessung", { env: {} });
  _herzschlaegeZuruecksetzen();
  // Neustart: ein frischer Herzschlag kommt an, BEVOR die Ablage geladen ist —
  // genau der Wettlauf, der die 90-Tage-Anzeige bisher bei jedem Neustart
  // geloescht hat.
  heartbeatAnnehmen({ id: "qualitaetsmessung", key: "geheim1", status: "ok", env: ENV, jetztMs: JETZT });
  await ladeHerzschlaege({ env: {} });
  const a = autopilotUebersicht({ jetztMs: JETZT }).autopiloten.find((x) => x.id === "qualitaetsmessung");
  assert.equal(a.tage.length, 3, "alte Tage aus der Ablage UND der frische Tag: " + JSON.stringify(a.tage));
  assert.equal(a.tage[1].fehler, 1, "der Fehler von gestern bleibt erhalten");
  assert.ok(a.letzterLauf.meldung !== undefined && a.tage[2].ok >= 1, "der frische Lauf zaehlt in seinem Tag");
});

test("jeder Autopilot hat, was die idiotensichere Ansicht braucht", () => {
  for (const a of AUTOPILOTEN) {
    assert.ok(a.id && a.name && a.kurz, a.id + ": Kennung, Name und Kurzbeschreibung sind Pflicht");
    assert.ok(Array.isArray(a.funktionen) && a.funktionen.length > 0, a.id + ": mindestens eine Funktionszeile");
    assert.ok(a.startAnleitung && a.stopAnleitung, a.id + ": Start- und Stopp-Anleitung sind Pflicht");
    if (a.messung === "heartbeat") {
      assert.ok(a.erwartetAlleMs > 0 && a.schonfristMs > 0, a.id + ": Herzschlag braucht Intervall und Schonfrist");
    } else {
      assert.ok(a.messungHinweis, a.id + ": ohne Herzschlag braucht es die ehrliche Begruendung");
    }
  }
});
