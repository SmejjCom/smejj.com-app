// smejj.com — Der Zweitweg für Webhooks (Smee) und sein Eingang.
//
// Betreiber-Auftrag 2026-09-05: "Smee / Webhook-Proxy muss in unserem System
// sein." Die Lage dabei: api.smejj.com ist öffentlich erreichbar (gemessen:
// HTTP 200), Stripe stellt direkt zu. Der Smee-Kanal ist deshalb der ZWEITE
// Weg, nicht der Hauptweg — und er ist ein Eingang, den ein Fremder erreichen
// kann, weil jeder mit der Kanal-Adresse dort etwas hineinlegen darf.
//
// Geprüft wird genau das: dass der Eingang zu ist, solange er nicht
// eingerichtet ist, dass ein falscher Beweis nichts durchlässt, dass ein
// Ereignis nur EINMAL wirkt, und dass die Signaturprüfung des Anbieters nicht
// umgangen wird.
import test from "node:test";
import assert from "node:assert/strict";
import {
  baueGedaechtnis, baueWeitergabe, beweisStimmt, erstelleWebhookRelayRoute,
  kennungFuer, zielFuer, GEDAECHTNIS_MAX
} from "../control-server/src/routes/webhookRelayRoutes.js";
import { baueWeiterleitung, leseKonfig, leseSseBlock, stelleZu, DURCHREICHEN } from "../workers/smejj-smee/relay.mjs";

function antwortDoppel() {
  const daten = { status: 0, koerper: null };
  const res = { writeHead(s) { daten.status = s; }, end(k) { daten.koerper = k; } };
  const json = (r, status, koerper) => { daten.status = status; daten.koerper = koerper; };
  return { res, json, daten };
}
function anfrage(kopf, koerper = "{}") {
  return { method: "POST", headers: kopf, async *[Symbol.asyncIterator]() { yield koerper; } };
}
const URL_RELAY = { pathname: "/api/webhooks/relay" };

test("ohne eingerichtetes Geheimnis ist der Eingang ZU (503), nicht offen", async () => {
  const route = erstelleWebhookRelayRoute({ env: {}, weitergeben: async () => { throw new Error("darf nicht gerufen werden"); } });
  const { res, json, daten } = antwortDoppel();
  assert.equal(await route(anfrage({}), res, URL_RELAY, json), true);
  assert.equal(daten.status, 503);
  assert.equal(daten.koerper.error, "relay_not_configured");
});

test("ein falscher Beweis kommt nicht durch — und ein fehlender auch nicht", async () => {
  let gerufen = 0;
  const route = erstelleWebhookRelayRoute({ env: { SMEJJ_SMEE_RELAY_SECRET: "richtig" }, weitergeben: async () => { gerufen += 1; return { ok: true }; } });
  for (const kopf of [{}, { "x-smejj-relay": "falsch" }, { "x-smejj-relay": "" }, { "x-smejj-relay": "richtigX" }]) {
    const { res, json, daten } = antwortDoppel();
    await route(anfrage(kopf), res, URL_RELAY, json);
    assert.equal(daten.status, 401, `${JSON.stringify(kopf)} haette abgelehnt werden muessen`);
  }
  assert.equal(gerufen, 0, "kein einziger Durchgriff bei falschem Beweis");
});

test("mit richtigem Beweis wird weitergereicht", async () => {
  const gesehen = [];
  const route = erstelleWebhookRelayRoute({
    env: { SMEJJ_SMEE_RELAY_SECRET: "s3hr-geheim" },
    weitergeben: async (kopf, koerper) => { gesehen.push({ kopf, koerper }); return { ok: true, status: 200 }; },
    speicher: baueGedaechtnis()
  });
  const { res, json, daten } = antwortDoppel();
  await route(anfrage({ "x-smejj-relay": "s3hr-geheim", "stripe-signature": "t=1,v1=abc", "x-smejj-ereignis": "evt_1" }, '{"id":"evt_1"}'), res, URL_RELAY, json);
  assert.equal(daten.status, 200);
  assert.equal(gesehen.length, 1);
  assert.equal(gesehen[0].koerper, '{"id":"evt_1"}');
  assert.equal(gesehen[0].kopf["stripe-signature"], "t=1,v1=abc", "die Signatur des Anbieters muss unveraendert ankommen");
});

test("dasselbe Ereignis wirkt nur EINMAL — die Wiederholung bekommt 200, nicht 409", async () => {
  // 200, weil es fuer den Absender erledigt IST. Ein Fehler wuerde ihn zu
  // weiteren Versuchen veranlassen.
  let gerufen = 0;
  const route = erstelleWebhookRelayRoute({
    env: { SMEJJ_SMEE_RELAY_SECRET: "s" },
    weitergeben: async () => { gerufen += 1; return { ok: true, status: 200 }; },
    speicher: baueGedaechtnis()
  });
  const kopf = { "x-smejj-relay": "s", "stripe-signature": "t=1", "x-smejj-ereignis": "evt_gleich" };
  for (let i = 0; i < 3; i += 1) {
    const { res, json, daten } = antwortDoppel();
    await route(anfrage(kopf, '{"a":1}'), res, URL_RELAY, json);
    assert.equal(daten.status, 200);
    if (i > 0) assert.equal(daten.koerper.doppelt, true);
  }
  assert.equal(gerufen, 1, "der Handler darf genau einmal laufen");
});

test("ohne mitgelieferte Kennung entscheidet der Rumpf — gleicher Rumpf ist dasselbe Ereignis", () => {
  assert.equal(kennungFuer("", '{"a":1}'), kennungFuer(null, '{"a":1}'));
  assert.notEqual(kennungFuer("", '{"a":1}'), kennungFuer("", '{"a":2}'));
  assert.equal(kennungFuer("evt_9", '{"a":1}'), "evt_9", "eine mitgelieferte Kennung gewinnt");
});

test("das Gedaechtnis waechst nicht mit der Ereigniszahl", () => {
  const g = baueGedaechtnis({ deckel: 10 });
  for (let i = 0; i < 100; i += 1) g.merke(`e${i}`);
  assert.ok(g.groesse() <= 10, `Gedaechtnis ${g.groesse()} — der Speicher darf nicht mitwachsen`);
  assert.ok(GEDAECHTNIS_MAX > 0);
});

test("alte Kennungen laufen ab, damit ein spaeteres Ereignis nicht faelschlich als doppelt gilt", () => {
  let jetzt = 1000;
  const g = baueGedaechtnis({ jetzt: () => jetzt, maxAlterMs: 100 });
  assert.equal(g.merke("e1"), true);
  assert.equal(g.merke("e1"), false, "sofort danach: doppelt");
  jetzt += 500;
  assert.equal(g.merke("e1"), true, "nach Ablauf wieder neu");
});

test("ein Ereignis OHNE bekannte Signaturkopfzeile wird nicht weitergereicht", async () => {
  // Wer die Kanal-Adresse kennt, kann dort etwas hineinlegen. Ohne
  // Anbieter-Signatur weiss niemand, woher es kommt.
  assert.equal(zielFuer({}), null);
  assert.equal(zielFuer({ "x-beliebig": "1" }), null);
  assert.equal(zielFuer({ "stripe-signature": "t=1" }).pfad, "/api/billing/stripe/webhook");
  let gerufen = 0;
  const weiter = baueWeitergabe({ env: { PORT: "8080" }, fetchImpl: async () => { gerufen += 1; return { ok: true, status: 200 }; } });
  assert.deepEqual(await weiter({}, "{}"), { ok: false, status: 422 });
  assert.equal(gerufen, 0, "ohne Zuordnung darf kein Aufruf hinausgehen");
});

test("die Weitergabe laeuft ueber den EIGENEN Endpunkt, nicht an einem Handler vorbei", async () => {
  // Ein direkter Handler-Aufruf waere schneller und wuerde alles umgehen, was
  // vor dem Handler steht — vor allem die Signaturpruefung.
  let ziel = null, kopfGesehen = null;
  const weiter = baueWeitergabe({
    env: { PORT: "9999" },
    fetchImpl: async (u, o) => { ziel = u; kopfGesehen = o.headers; return { ok: true, status: 200 }; }
  });
  await weiter({ "stripe-signature": "t=1,v1=abc", "content-type": "application/json" }, '{"id":"x"}');
  assert.equal(ziel, "http://127.0.0.1:9999/api/billing/stripe/webhook");
  assert.equal(kopfGesehen["stripe-signature"], "t=1,v1=abc");
});

test("der Beweis wird zeitkonstant verglichen, auch bei ungleicher Laenge", () => {
  assert.equal(beweisStimmt("abc", "abc"), true);
  assert.equal(beweisStimmt("abc", "abd"), false);
  assert.equal(beweisStimmt("ab", "abc"), false, "kuerzer");
  assert.equal(beweisStimmt("abcd", "abc"), false, "laenger");
  assert.equal(beweisStimmt("", ""), false, "ein leeres Geheimnis darf nie passen");
  assert.equal(beweisStimmt(undefined, "abc"), false);
});

// --------------------------------------------------------------- der Client

test("der Client ist AUS, solange er nicht eingeschaltet und eingerichtet ist", () => {
  assert.equal(leseKonfig({}).ok, false);
  assert.equal(leseKonfig({}).an, false);
  assert.deepEqual(leseKonfig({}).fehlend, ["SMEJJ_SMEE_KANAL", "SMEJJ_SMEE_RELAY_SECRET"]);
  const k = leseKonfig({ SMEJJ_SMEE_KANAL: "https://smee.io/x/", SMEJJ_SMEE_RELAY_SECRET: "s", SMEJJ_SMEE_ENABLED: "YES" });
  assert.equal(k.ok, true);
  assert.equal(k.kanal, "https://smee.io/x", "der Schraegstrich am Ende faellt weg");
});

test("der Client reicht die Signaturkopfzeilen durch und faelscht keine", () => {
  const gebaut = baueWeiterleitung({
    "stripe-signature": "t=1,v1=abc", "x-github-event": "push", "content-type": "application/json",
    body: { id: "evt_1" }, id: "e1"
  }, "geheim");
  assert.equal(gebaut.ok, true);
  assert.equal(gebaut.kopf["stripe-signature"], "t=1,v1=abc");
  assert.equal(gebaut.kopf["x-github-event"], "push");
  assert.equal(gebaut.kopf["x-smejj-relay"], "geheim");
  assert.equal(gebaut.koerper, '{"id":"evt_1"}');
  assert.ok(DURCHREICHEN.includes("stripe-signature"));
});

test("der Client verwirft, was kein Ereignis ist", () => {
  assert.equal(baueWeiterleitung(null, "s").ok, false);
  assert.equal(baueWeiterleitung({}, "s").grund, "kein_koerper");
  assert.equal(baueWeiterleitung({ body: "x".repeat(600 * 1024) }, "s").grund, "koerper_zu_gross");
});

test("SSE-Bloecke werden gelesen, Ping und Muell stoeren nicht", () => {
  assert.deepEqual(leseSseBlock('event: message\ndata: {"a":1}'), { art: "message", daten: { a: 1 } });
  assert.equal(leseSseBlock("event: ping"), null, "ein Block ohne data-Feld ist kein Ereignis");
  assert.deepEqual(leseSseBlock("data: kein json"), { art: "message", daten: null });
  assert.equal(leseSseBlock(""), null);
});

test("ein Fehler beim Zustellen wirft nicht — sonst risse der Strom ab", async () => {
  const konfig = { ziel: "https://ziel.example", geheimnis: "s" };
  const kaputt = await stelleZu({ "stripe-signature": "t=1", body: { a: 1 } }, konfig, async () => { throw new Error("Netz weg"); });
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.grund, /Netz weg/);
  const gut = await stelleZu({ "stripe-signature": "t=1", body: { a: 1 } }, konfig, async () => ({ ok: true, status: 200 }));
  assert.equal(gut.ok, true);
});

test("Verbindungs- und Halte-Ereignisse zaehlen NICHT als verworfen", async () => {
  // LIVETEST 2026-09-05 am echten Kanal: beim Verbinden schickt Smee ein
  // "ready" ohne body. Der Client meldete "NICHT zugestellt: kein_koerper" —
  // und haette damit die Ampel des Autopiloten belastet, obwohl nichts
  // fehlgeschlagen war. Ein Nichts darf nicht wie ein Fehler aussehen.
  const { laufe } = await import("../workers/smejj-smee/relay.mjs");
  const bloecke = [
    'event: ready\ndata: {"say":"hi"}\n\n',
    "event: ping\ndata: {}\n\n",
    'data: {"stripe-signature":"t=1","body":{"id":"evt_1"}}\n\n'
  ];
  let zugestellt = 0;
  const meldungen = [];
  const fetchImpl = async (adresse) => {
    if (String(adresse).startsWith("http://ziel")) { zugestellt += 1; return { ok: true, status: 200 }; }
    return {
      ok: true,
      body: { getReader() {
        let i = 0;
        return { read: async () => (i < bloecke.length
          ? { value: new TextEncoder().encode(bloecke[i++]), done: false }
          : { value: undefined, done: true }) };
      } }
    };
  };
  const abbruch = new AbortController();
  const lauf = laufe({ kanal: "https://smee.example/k", ziel: "http://ziel/relay", geheimnis: "s" },
    { fetchImpl, melde: (t) => { meldungen.push(t); if (t.includes("Strom beendet")) abbruch.abort(); }, abbruch: abbruch.signal });
  const ergebnis = await lauf;
  assert.equal(zugestellt, 1, "nur das echte Ereignis geht hinaus");
  assert.equal(ergebnis.verworfen, 0, "ready und ping sind keine Fehlschlaege");
  assert.ok(!meldungen.some((m) => m.includes("NICHT zugestellt")), meldungen.join(" | "));
});

// ---------------------------------------------------------------------------
// Zwei Stripe-Empfänger, zwei Signatur-Geheimnisse
//
// Stripe vergibt je Empfänger ein eigenes Geheimnis. Seit dem Zweitweg über
// die eigene Domain trifft dasselbe Ereignis auf denselben Endpunkt mit zwei
// verschiedenen Signaturen. Beide müssen gelten — und sonst nichts.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import { createBillingHandlers } from "../control-server/src/routes/billingRoutes.js";

function signiere(koerper, geheimnis, zeit = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac("sha256", geheimnis).update(`${zeit}.${koerper}`).digest("hex");
  return `t=${zeit},v1=${sig}`;
}
// readRawBody liest über req.on("data"/"end") — hier ein Doppel, das genau
// das anbietet, statt eines async-Iterators.
function stripeAnfrage(koerper, signatur) {
  const horcher = {};
  const req = {
    method: "POST",
    headers: { "stripe-signature": signatur },
    on(ereignis, rueckruf) {
      horcher[ereignis] = rueckruf;
      if (ereignis === "end") {
        setImmediate(() => { horcher.data?.(Buffer.from(koerper)); horcher.end?.(); });
      }
      return req;
    }
  };
  return req;
}

test("beide Empfänger-Geheimnisse werden akzeptiert, ein drittes nicht", async () => {
  const koerper = JSON.stringify({ id: "evt_1", type: "unbekannt.fuer.den.test" });
  const env = { STRIPE_WEBHOOK_SECRET: "whsec_haupt", STRIPE_WEBHOOK_SECRET_ZWEITWEG: "whsec_zweit" };
  const ergebnisse = [];
  const json = (res, status, body) => ergebnisse.push({ status, body });
  const handlers = createBillingHandlers({ env, readSession: () => null, json });
  const url = { pathname: "/api/billing/stripe/webhook" };

  for (const geheim of ["whsec_haupt", "whsec_zweit"]) {
    ergebnisse.length = 0;
    await handlers(stripeAnfrage(koerper, signiere(koerper, geheim)), {}, url);
    assert.equal(ergebnisse[0].status, 200, `${geheim} muss gelten`);
  }
  ergebnisse.length = 0;
  await handlers(stripeAnfrage(koerper, signiere(koerper, "whsec_fremd")), {}, url);
  assert.equal(ergebnisse[0].status, 400, "ein fremdes Geheimnis darf NICHT gelten");
});

test("ohne jedes Geheimnis bleibt der Endpunkt geschlossen", async () => {
  const ergebnisse = [];
  const json = (res, status, body) => ergebnisse.push({ status, body });
  const handlers = createBillingHandlers({ env: {}, readSession: () => null, json });
  await handlers(stripeAnfrage("{}", "t=1,v1=x"), {}, { pathname: "/api/billing/stripe/webhook" });
  assert.equal(ergebnisse[0].status, 503);
  assert.equal(ergebnisse[0].body.error, "billing_webhook_not_configured");
});

test("nur der Hauptweg eingerichtet: er gilt, der Zweitweg wird abgelehnt", async () => {
  const koerper = JSON.stringify({ id: "evt_2", type: "test" });
  const ergebnisse = [];
  const json = (res, status, body) => ergebnisse.push({ status, body });
  const handlers = createBillingHandlers({ env: { STRIPE_WEBHOOK_SECRET: "whsec_haupt" }, readSession: () => null, json });
  const url = { pathname: "/api/billing/stripe/webhook" };
  await handlers(stripeAnfrage(koerper, signiere(koerper, "whsec_haupt")), {}, url);
  assert.equal(ergebnisse[0].status, 200, "der Hauptweg laeuft unveraendert weiter");
  ergebnisse.length = 0;
  await handlers(stripeAnfrage(koerper, signiere(koerper, "whsec_zweit")), {}, url);
  assert.equal(ergebnisse[0].status, 400, "ohne eingetragenes Zweitweg-Geheimnis wird abgelehnt, nicht durchgewunken");
});
