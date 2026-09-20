// muuny AI — der Puls darf nie schoener sein als die Wirklichkeit.
//
// Der Autopiloten-Bildschirm in con.ax hat einen Grundsatz: kein Zustand wird
// behauptet. Ein gruener Punkt, hinter dem nichts arbeitet, ist schlimmer als
// gar kein Punkt — genau daran ist der alte Reiter gescheitert (neun gruene
// Punkte aus einem Backend, das nicht mehr lief).
import assert from "node:assert/strict";
import test from "node:test";
import { meldePuls, pulsOk, pulsText } from "../workers/muuny-autopilot/puls.js";

test("NOTAUS und Halt melden NICHT gruen", () => {
  assert.equal(pulsOk({ phase: "ueberwachen", grenzen: { notaus: true } }), false);
  assert.match(pulsText({ grenzen: { notaus: true } }), /NOTAUS/);
  assert.equal(pulsOk({ phase: "gestoppt" }), false);
  assert.match(pulsText({ phase: "gestoppt", plan: { grund: "3-mal derselbe Fehler" } }), /3-mal/);
});

test("Ein blockierter Start ist kein gruener Takt", () => {
  assert.equal(pulsOk({ phase: "ueberwachen", startBlockiert: { gruende: ["tagesbudget"] } }), false);
});

test("Ein Fehler AUS DIESEM Takt macht rot, ein alter nicht", () => {
  const jetzt = "2026-09-20T18:00:00Z";
  assert.equal(pulsOk({ phase: "ueberwachen", aktualisiert: jetzt, letzterFehler: { zeit: jetzt, text: "e2 weg" } }), false,
    "der Fehler ist von JETZT — das ist rot");
  assert.equal(pulsOk({ phase: "ueberwachen", aktualisiert: jetzt, letzterFehler: { zeit: "2026-09-19T10:00:00Z", text: "alt" } }), true,
    "ein Fehler von gestern darf den heutigen Takt nicht rot faerben");
});

test("Warten auf Daten ist gruen — er erzeugt sie ja selbst", () => {
  const z = { phase: "warten_auf_daten", aktualisiert: "2026-09-20T18:00:00Z",
    letzterNachschub: { name: "muuny-grundfaehigkeiten-v5", paare: 14881 } };
  assert.equal(pulsOk(z), true);
  assert.match(pulsText(z), /muuny-grundfaehigkeiten-v5.*14881/);
});

test("Der Text sagt ohne Vorwissen, was gerade passiert", () => {
  const laufend = { phase: "job_laeuft", laufenderJob: { modus: "training+messung", kandidat: "muuny-1.7",
    letzterStatus: { schritt: "training", fortschritt: "42/88" } } };
  const t = pulsText(laufend);
  assert.match(t, /training\+messung/);
  assert.match(t, /muuny-1\.7/);
  assert.match(t, /42\/88/);
  // Kein Job, kein Nachschub: dann wenigstens das Ziel des naechsten Schritts.
  assert.match(pulsText({ phase: "ueberwachen", plan: { job: { ziel: "Training muuny-1.8" } } }), /muuny-1\.8/);
});

test("Ohne Konfiguration wird still nichts gemeldet — kein Absturz", async () => {
  const r = await meldePuls({ phase: "ueberwachen" }, { env: {} });
  assert.equal(r.gemeldet, false);
  assert.equal(r.grund, "puls_nicht_konfiguriert");
});

test("Der Puls traegt Schluessel, Token und den ehrlichen Zustand", async () => {
  let gesehen = null;
  const fetchImpl = async (url, opt) => { gesehen = { url, opt }; return { ok: true, status: 200 }; };
  const r = await meldePuls({ phase: "gestoppt", plan: { grund: "angehalten" } }, {
    env: { MUUNY_PULS_URL: "http://api/v1/internal/autopilot-run", MUUNY_PULS_TOKEN: "geheim" }, fetchImpl });
  assert.equal(r.gemeldet, true);
  assert.equal(gesehen.opt.headers["x-conax-internal"], "geheim");
  const koerper = JSON.parse(gesehen.opt.body);
  assert.equal(koerper.key, "muuny-ai");
  assert.equal(koerper.ok, false, "angehalten darf NIE als ok gemeldet werden");
  assert.match(koerper.detail, /angehalten/);
});

test("Ein unerreichbares con.ax stoppt muuny nicht", async () => {
  const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
  const r = await meldePuls({ phase: "ueberwachen" }, {
    env: { MUUNY_PULS_URL: "http://api/x", MUUNY_PULS_TOKEN: "t" }, fetchImpl });
  assert.equal(r.gemeldet, false);
  assert.equal(r.grund, "puls_unerreichbar");
});
