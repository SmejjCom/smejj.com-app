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

test("Eine Pause klingt nicht nach Training", () => {
  const pausiert = { phase: "ueberwachen", grenzen: { freigabe: false, notaus: false },
    plan: { job: { ziel: "Training muuny-1.12 gegen Schwaeche reasoning" } } };
  assert.match(pulsText(pausiert), /pausiert/);
  assert.doesNotMatch(pulsText(pausiert), /Training muuny/,
    "das Ziel eines Plans, der nie startet, ist keine Beschreibung dessen, was passiert");
  assert.equal(pulsOk(pausiert), true, "gewollt pausiert ist kein Fehler");
  // Laeuft trotz fehlender Freigabe noch ein Job zu Ende, wird DER gemeldet.
  const auslaufend = { ...pausiert, laufenderJob: { modus: "training+messung", kandidat: "muuny-1.12" } };
  assert.match(pulsText(auslaufend), /muuny-1\.12/);
});

test("Die Startsperre einer gewollten Pause ist gruen, jede andere bleibt rot", () => {
  // Genau so sah der echte Zustand am 21.09. aus — der erste Test hatte ihn nicht.
  const pause = { phase: "ueberwachen", grenzen: { freigabe: false, notaus: false },
    startBlockiert: { gruende: ["keine_salad_freigabe (MUUNY_SALAD_FREIGABE=YES fehlt)"] } };
  assert.equal(pulsOk(pause), true, "gewollt pausiert darf nicht als Stoerung erscheinen");

  const budget = { ...pause, grenzen: { freigabe: true, notaus: false },
    startBlockiert: { gruende: ["tagesbudget: 5.2 + 0.69 > 5.5 USD"] } };
  assert.equal(pulsOk(budget), false, "ein Budgetstopp ist eine Meldung wert");

  const beides = { ...pause, startBlockiert: { gruende: ["keine_salad_freigabe", "salad_start_500"] } };
  assert.equal(pulsOk(beides), false, "steckt hinter der Pause noch ein zweiter Grund, bleibt es rot");
});
