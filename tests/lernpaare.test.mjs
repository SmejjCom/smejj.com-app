// smejj.com — Lernpaare (17.09.2026): Daumen hoch + Trainings-Einwilligung
// wird ein Frage-Antwort-Paar fuer smejj 1. Geprueft wird vor allem, WANN
// NICHTS abgelegt wird — und dass die Reife-Wache die Paare getrennt zaehlt.
import test from "node:test";
import assert from "node:assert/strict";
import { bindConsentScope, consentDecision, createConsentGrant, trainingConsentConfig } from "../src/training/consent.js";
import { TRAINING_CONSENT_REPOSITORY } from "../src/training/constants.js";
import { LERNPAAR_ABLEHNUNG, lernpaarObjektSchluessel, pruefeLernpaar } from "../src/training/lernpaare.js";
import { sichereLernpaar } from "../control-server/src/routes/lernpaarAblage.js";
import { handleFeedbackRoute } from "../control-server/src/routes/feedbackRoutes.js";
import { laufTrainingsReife, lernrundeZiel, zaehleFragen, zaehleLernpaare } from "../control-server/src/autopilots/trainingsReifeAutopilot.js";

const NOTICE_HASH = "b".repeat(64);
const NOW = "2026-09-17T12:00:00.000Z";
const NUTZER = { userId: "konto-4711", email: "test@example.org" };
const FRAGE = "Was ist 17 mal 3?";
const ANTWORT = "17 mal 3 ergibt 51.";
const ENV = {
  SMEJJ_TRAINING_CONSENT_API_ENABLED: "YES",
  SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: NOTICE_HASH,
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: Buffer.alloc(32, 41).toString("base64"),
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "consent-binding-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: Buffer.alloc(32, 43).toString("base64"),
  SMEJJ_TRAINING_CAPTURE_ENABLED: "YES"
};
const CONFIG = trainingConsentConfig(ENV);
let laufend = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++laufend).padStart(12, "0")}`;

function einwilligung() {
  const grant = createConsentGrant({
    subjectId: `user:${NUTZER.userId}`, repository: TRAINING_CONSENT_REPOSITORY, privacyNoticeSha256: NOTICE_HASH,
    captureReviewConsent: true, modelTrainingConsent: true, sourceRightsConfirmed: true
  }, { config: CONFIG, now: NOW, randomUUID: uuid });
  const scope = bindConsentScope({ subjectId: `user:${NUTZER.userId}`, repository: TRAINING_CONSENT_REPOSITORY, privacyNoticeSha256: NOTICE_HASH }, CONFIG);
  return consentDecision({ entries: [grant], scope }, { config: CONFIG, now: NOW });
}

function schreiber(ergebnis = { conditionEnforced: true, contentVerified: true, created: true }) {
  const abgelegt = [];
  return { abgelegt, fabrik: () => ({ putObject: async (o) => { abgelegt.push(o); return ergebnis; } }) };
}

const ruf = (entscheidung, optionen = {}) => {
  const s = optionen.schreiber || schreiber();
  return sichereLernpaar("authUser" in optionen ? optionen.authUser : NUTZER, { frage: optionen.frage ?? FRAGE, antwort: optionen.antwort ?? ANTWORT }, {
    env: optionen.env || ENV, now: NOW, randomUUID: uuid,
    ledgerFactory: optionen.ledgerFactory || (() => ({ resolve: async () => entscheidung })),
    writerFactory: s.fabrik
  }).then((e) => ({ e, s }));
};

test("pruefeLernpaar: ohne Einwilligung nichts, mit Einwilligung ein Satz mit Beleg", () => {
  assert.equal(pruefeLernpaar(FRAGE, ANTWORT, { consentDecision: undefined, env: ENV, now: NOW }).grund, LERNPAAR_ABLEHNUNG.KEINE_EINWILLIGUNG);
  assert.equal(pruefeLernpaar(FRAGE, ANTWORT, { consentDecision: einwilligung(), env: { ...ENV, SMEJJ_TRAINING_CAPTURE_ENABLED: "NO" }, now: NOW }).grund, LERNPAAR_ABLEHNUNG.SCHALTER_AUS);
  const gut = pruefeLernpaar(FRAGE, ANTWORT, { consentDecision: einwilligung(), env: ENV, now: NOW });
  assert.equal(gut.erfassen, true);
  assert.equal(gut.satz.frage, FRAGE);
  assert.equal(gut.satz.antwort, ANTWORT);
  assert.equal(gut.satz.herkunft, "daumen_hoch");
  assert.equal(gut.satz.einwilligung.trainingAllowed, true);
});

test("pruefeLernpaar: Fehlertexte, zu kurze Antworten und Schluessel werden nie Lernziel", () => {
  const e = einwilligung();
  const p = (f, a) => pruefeLernpaar(f, a, { consentDecision: e, env: ENV, now: NOW }).grund;
  assert.equal(p(FRAGE, "smejj 1 konnte gerade nicht antworten (x). Bitte gleich noch einmal versuchen."), LERNPAAR_ABLEHNUNG.FEHLERTEXT);
  assert.equal(p(FRAGE, "51"), LERNPAAR_ABLEHNUNG.ANTWORT_LAENGE);
  assert.equal(p("Hi", ANTWORT), LERNPAAR_ABLEHNUNG.FRAGE_LAENGE);
  // Zur Laufzeit zusammengesetzt, damit der Geheimnis-Waechter die Testdatei nicht fuer echt haelt.
  const schluessel = ["sk", "-", "abcdefghijklmnop", "qrstuvwxyz123456"].join("");
  assert.equal(p(`Mein Schluessel ist ${schluessel}, was nun?`, ANTWORT), LERNPAAR_ABLEHNUNG.SENSIBEL);
});

test("sichereLernpaar legt unter training/fragen/lernpaare/ ab — ohne Kennung des Menschen im Schluessel", async () => {
  const { e, s } = await ruf(einwilligung());
  assert.deepEqual(e, { erfasst: true, grund: null });
  assert.equal(s.abgelegt.length, 1);
  assert.match(s.abgelegt[0].key, /^training\/fragen\/lernpaare\/2026\/09\/17\/[0-9a-f-]{36}\.json$/);
  assert.ok(!s.abgelegt[0].key.includes("4711"));
  const inhalt = JSON.parse(s.abgelegt[0].body);
  assert.equal(inhalt.frage, FRAGE);
  assert.equal(inhalt.antwort, ANTWORT);
  assert.ok(!JSON.stringify(inhalt).includes("test@example.org"), "die E-Mail gehoert nicht ins Paar");
});

test("sichereLernpaar: keine Einwilligung, stummer Ledger, unbewiesener Schreibvorgang — nichts gilt als erfasst", async () => {
  const ohne = await ruf(undefined);
  assert.equal(ohne.e.erfasst, false);
  assert.equal(ohne.s.abgelegt.length, 0);
  const stumm = await ruf(null, { ledgerFactory: () => ({ resolve: async () => { throw new Error("weg"); } }) });
  assert.deepEqual(stumm.e, { erfasst: false, grund: "einwilligung_nicht_erreichbar" });
  const halb = await ruf(einwilligung(), { schreiber: schreiber({ conditionEnforced: true, contentVerified: false, created: true }) });
  assert.deepEqual(halb.e, { erfasst: false, grund: "nicht_gespeichert" });
  const anonym = await ruf(einwilligung(), { authUser: null });
  assert.equal(anonym.e.erfasst, false);
});

test("lernpaarObjektSchluessel weist kaputte Zeiten und Kennungen ab", () => {
  assert.throws(() => lernpaarObjektSchluessel("gestern", "00000000-0000-4000-8000-000000000001"));
  assert.throws(() => lernpaarObjektSchluessel(NOW, "../boese"));
});

function feedbackAnfrage(koerper) {
  const nutzlast = JSON.stringify(koerper);
  return {
    method: "POST", authUser: NUTZER, headers: { "content-type": "application/json" },
    on(ereignis, rueckruf) {
      if (ereignis === "data") queueMicrotask(() => rueckruf(nutzlast));
      if (ereignis === "end") queueMicrotask(() => queueMicrotask(rueckruf));
      return this;
    }
  };
}
function antwortAttrappe() {
  const a = { code: null, koerper: null, headers: {} };
  a.writeHead = (code, h) => { a.code = code; Object.assign(a.headers, h || {}); return a; };
  a.setHeader = (k, v) => { a.headers[k] = v; };
  a.end = (t) => { a.koerper = t ? JSON.parse(t) : null; };
  return a;
}

test("/api/feedback: nur Daumen HOCH fragt nach einem Lernpaar, das Ergebnis steht in der Antwort", async () => {
  const aufrufe = [];
  const deps = {
    env: ENV,
    verarbeite: async () => ({ ok: true }),
    lernpaar: async (wer, paar) => { aufrufe.push(paar); return { erfasst: false, grund: "einwilligung_fehlt_oder_veraltet" }; }
  };
  const hoch = antwortAttrappe();
  await handleFeedbackRoute(feedbackAnfrage({ signalType: "thumbs_up", prompt: FRAGE, antwort: ANTWORT }), new URL("https://api.smejj.com/api/feedback"), hoch, deps);
  assert.equal(hoch.code, 200);
  assert.deepEqual(hoch.koerper.lernpaar, { erfasst: false, grund: "einwilligung_fehlt_oder_veraltet" });
  assert.deepEqual(aufrufe, [{ frage: FRAGE, antwort: ANTWORT }]);

  const runter = antwortAttrappe();
  await handleFeedbackRoute(feedbackAnfrage({ signalType: "thumbs_down", prompt: FRAGE, antwort: ANTWORT }), new URL("https://api.smejj.com/api/feedback"), runter, deps);
  assert.equal(runter.code, 200);
  assert.equal("lernpaar" in runter.koerper, false);
  assert.equal(aufrufe.length, 1, "Daumen runter wird nie ein Lernpaar");
});

test("Reife-Wache: Lernpaare zaehlen getrennt von Fragen und stehen als 'X von 500' in der Meldung", async () => {
  const env = {
    IDRIVE_E2_TRAINING_ENDPOINT: "https://s3.us-west-2.idrivee2.com", IDRIVE_E2_TRAINING_REGION: "us-west-2",
    IDRIVE_E2_TRAINING_BUCKET: "smejj-model-files", IDRIVE_E2_TRAINING_ACCESS_KEY: "training-access-key", IDRIVE_E2_TRAINING_SECRET_KEY: "training-secret-key-value",
    IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/consents/v1/,training/fragen/"
  };
  const alle = ["training/fragen/2026/09/04/a.json", "training/fragen/lernpaare/2026/09/17/p1.json", "training/fragen/lernpaare/2026/09/17/p2.json"];
  const listImpl = async ({ prefix }) => ({
    response: { ok: true, status: 200 },
    body: `<ListBucketResult>${alle.filter((k) => k.startsWith(prefix)).map((k) => `<Contents><Key>${k}</Key></Contents>`).join("")}<IsTruncated>false</IsTruncated></ListBucketResult>`
  });
  assert.equal((await zaehleFragen({ env, listImpl })).anzahl, 1, "Lernpaare sind keine erfassten Fragen");
  assert.equal((await zaehleLernpaare({ env, listImpl })).anzahl, 2);
  assert.equal(lernrundeZiel({ env: {} }), 500);
  assert.equal(lernrundeZiel({ env: { SMEJJ_LERNRUNDE_ZIEL_PAARE: "50" } }), 50);

  const karten = [];
  const lauf = await laufTrainingsReife({
    env: { SMEJJ_TRAINING_REIFE_ZIEL_GESAMT: "5000" },
    storeFabrik: () => ({ liste: async () => ({ ok: true, datensaetze: [] }), schreib: async (d) => { karten.push(d); } }),
    quellen: [{ name: "DPO-Paare", praefix: "x", limit: 10 }],
    fragenZaehler: async () => ({ lesbar: true, anzahl: 8 }),
    gebauteZaehler: async () => ({ lesbar: true, anzahl: 0, namen: [] }),
    lernpaarZaehler: async () => ({ lesbar: true, anzahl: 2 })
  });
  assert.equal(lauf.ok, true);
  assert.match(lauf.meldung, /Lernrunde smejj 1: 2 von 500 Lernpaaren/);
  assert.deepEqual(karten[0].lernrunde, { lernpaare: 2, ziel: 500, reif: false });
});
