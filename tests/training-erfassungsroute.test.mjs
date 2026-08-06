// smejj.com — Tests der Erfassungsroute (Teil 3).
//
// Die Route ist der einzige Ort, an dem eine Nutzerfrage zu Trainingsmaterial
// werden kann. Diese Tests pruefen darum vor allem, WANN NICHTS abgelegt wird —
// und dass ein nicht bewiesener Schreibvorgang NICHT als Erfolg durchgeht.
//
// Die Einwilligung wird echt gebaut (signierter Grant, gebundener Scope). Ein
// handgeschriebener Ersatz wuerde capturePersistenceAllowed umgehen und genau
// das verfehlen, was hier abgesichert gehoert.
import test from "node:test";
import assert from "node:assert/strict";
import {
  bindConsentScope,
  consentDecision,
  createConsentGrant,
  trainingConsentConfig
} from "../src/training/consent.js";
import { TRAINING_CONSENT_REPOSITORY } from "../src/training/constants.js";
import { ABLEHNUNG } from "../src/training/fragenerfassung.js";
import { captureObjectKey, handleCapture } from "../control-server/src/routes/trainingCaptureRoutes.js";

const NOTICE_HASH = "b".repeat(64);
const NOW = "2026-08-05T12:00:00.000Z";
const SUBJEKT = { userId: "konto-4711" };
const FRAGE = "Wo liegen bei smejj.com die Sicherungen?";

const ENV_BASIS = {
  SMEJJ_TRAINING_CONSENT_API_ENABLED: "YES",
  SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: NOTICE_HASH,
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: Buffer.alloc(32, 41).toString("base64"),
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "consent-binding-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: Buffer.alloc(32, 43).toString("base64")
};
const ENV_AN = { ...ENV_BASIS, SMEJJ_TRAINING_CAPTURE_ENABLED: "YES" };
const CONFIG = trainingConsentConfig(ENV_BASIS);

let laufend = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++laufend).padStart(12, "0")}`;

function echteEntscheidung() {
  const grant = createConsentGrant({
    subjectId: `user:${SUBJEKT.userId}`,
    repository: TRAINING_CONSENT_REPOSITORY,
    privacyNoticeSha256: NOTICE_HASH,
    captureReviewConsent: true,
    modelTrainingConsent: true,
    sourceRightsConfirmed: true
  }, { config: CONFIG, now: NOW, randomUUID: uuid });
  const scope = bindConsentScope({
    subjectId: `user:${SUBJEKT.userId}`,
    repository: TRAINING_CONSENT_REPOSITORY,
    privacyNoticeSha256: NOTICE_HASH
  }, CONFIG);
  return consentDecision({ entries: [grant], scope }, { config: CONFIG, now: NOW });
}

/** Antwort-Attrappe, die Status und Rumpf festhaelt. */
function antwort() {
  const a = { code: null, koerper: null, headers: {} };
  a.writeHead = (code, headers) => { a.code = code; Object.assign(a.headers, headers || {}); return a; };
  a.setHeader = (k, v) => { a.headers[k] = v; };
  a.end = (text) => { a.koerper = text ? JSON.parse(text) : null; };
  return a;
}

// readRawBody() haengt sich mit req.on("data"/"end") ein — ein asyncIterator
// reicht NICHT. Mit dem falschen Attrappentyp antwortete jeder Test 400
// capture_body_invalid, und zwar bevor irgendeine echte Regel griff.
const anfrage = (frage = FRAGE, authUser = SUBJEKT) => {
  const nutzlast = JSON.stringify({ frage });
  return {
    method: "POST",
    authUser,
    headers: { "content-type": "application/json" },
    on(ereignis, rueckruf) {
      if (ereignis === "data") queueMicrotask(() => rueckruf(nutzlast));
      if (ereignis === "end") queueMicrotask(() => queueMicrotask(rueckruf));
      return this;
    }
  };
};

const gutenLedger = (entscheidung) => () => ({ resolve: async () => entscheidung });

/** Schreiber-Attrappe: merkt sich, was abgelegt wurde. */
function schreiberAttrappe(ergebnis = { conditionEnforced: true, contentVerified: true, created: true }) {
  const abgelegt = [];
  return {
    abgelegt,
    fabrik: () => ({ putObject: async (objekt) => { abgelegt.push(objekt); return ergebnis; } })
  };
}

async function ruf(optionen = {}) {
  const res = antwort();
  const schreiber = optionen.schreiber || schreiberAttrappe();
  // `?? echteEntscheidung()` waere hier falsch: der Fall "ausdruecklich KEINE
  // Einwilligung" wird als undefined uebergeben und haette sich damit still in
  // eine gueltige zurueckverwandelt — der Test haette dann das Gegenteil
  // dessen geprueft, was er behauptet.
  const entscheidung = "entscheidung" in optionen ? optionen.entscheidung : echteEntscheidung();
  await handleCapture(optionen.req || anfrage(optionen.frage), res, {
    env: optionen.env || ENV_AN,
    now: NOW,
    randomUUID: uuid,
    ledgerFactory: optionen.ledgerFactory || gutenLedger(entscheidung),
    writerFactory: optionen.writerFactory || schreiber.fabrik
  });
  return { res, schreiber };
}

test("die Testeinwilligung ist echt", () => {
  const d = echteEntscheidung();
  assert.equal(d.status, "granted");
  assert.equal(d.captureAllowed, true);
});

test("mit Anmeldung, Schalter und Einwilligung wird abgelegt", async () => {
  const { res, schreiber } = await ruf();
  assert.equal(res.code, 201, JSON.stringify(res.koerper));
  assert.deepEqual(res.koerper, { ok: true, erfasst: true });
  assert.equal(schreiber.abgelegt.length, 1);

  const inhalt = JSON.parse(schreiber.abgelegt[0].body);
  assert.equal(inhalt.text, FRAGE);
  assert.equal(inhalt.herkunft, "nutzerfrage");
  assert.equal(inhalt.einwilligung.privacyNoticeSha256, NOTICE_HASH);
});

test("die Antwort verraet die Frage NICHT zurueck", async () => {
  const { res } = await ruf();
  assert.doesNotMatch(JSON.stringify(res.koerper), /Sicherungen|smejj\.com\/api/);
  assert.equal(res.koerper.schluessel, undefined, "der Objektschluessel gehoert nicht ueber die Leitung");
});

test("der Objektschluessel traegt keine Kennung des Fragenden", async () => {
  const { schreiber } = await ruf();
  const schluessel = schreiber.abgelegt[0].key;
  assert.match(schluessel, /^training\/fragen\/2026\/08\/05\/[a-f0-9-]{36}\.json$/);
  assert.doesNotMatch(schluessel, /konto-4711/);
});

test("ohne Anmeldung: 401, nichts wird abgelegt", async () => {
  const schreiber = schreiberAttrappe();
  const { res } = await ruf({ req: anfrage(FRAGE, null), schreiber });
  assert.equal(res.code, 401);
  assert.equal(schreiber.abgelegt.length, 0);
});

test("Schalter aus: 503, und der Ledger wird gar nicht erst gefragt", async () => {
  const schreiber = schreiberAttrappe();
  let gefragt = false;
  const { res } = await ruf({
    env: ENV_BASIS,
    schreiber,
    ledgerFactory: () => ({ resolve: async () => { gefragt = true; return echteEntscheidung(); } })
  });
  assert.equal(res.code, 503);
  assert.equal(res.koerper.error, "capture_disabled");
  assert.equal(gefragt, false, "ein abgeschalteter Dienst darf nicht nach der Einwilligung fragen");
  assert.equal(schreiber.abgelegt.length, 0);
});

test("ohne Einwilligung: 200 mit Grund, aber NICHTS abgelegt", async () => {
  for (const [name, entscheidung] of [
    ["gar keine", undefined],
    ["leeres Objekt", {}],
    ["handgebaute Attrappe", { status: "granted", captureAllowed: true, trainingAllowed: true, verified: true }]
  ]) {
    const schreiber = schreiberAttrappe();
    const { res } = await ruf({ entscheidung, schreiber });
    assert.equal(res.code, 200, name);
    assert.equal(res.koerper.erfasst, false, name);
    assert.equal(res.koerper.grund, ABLEHNUNG.KEINE_EINWILLIGUNG, name);
    assert.equal(schreiber.abgelegt.length, 0, `abgelegt trotz ${name}`);
  }
});

test("ein stummer Ledger ist ein Nein, kein Vielleicht", async () => {
  const schreiber = schreiberAttrappe();
  const { res } = await ruf({
    schreiber,
    ledgerFactory: () => ({ resolve: async () => { throw new Error("netz"); } })
  });
  assert.equal(res.code, 503);
  assert.equal(res.koerper.error, "consent_service_unavailable");
  assert.equal(schreiber.abgelegt.length, 0);
});

test("kein Speicher: 503 statt stiller Erfolgsmeldung", async () => {
  // Der wichtigste Test der Datei. Ein 200 ohne Ablage saehe in der Oberflaeche
  // gut aus und wuerde monatelang niemandem auffallen.
  const { res } = await ruf({ writerFactory: () => { throw new Error("keine Konfiguration"); } });
  assert.equal(res.code, 503);
  assert.equal(res.koerper.error, "capture_storage_unavailable");
  assert.notEqual(res.koerper.ok, true);
});

test("ein nicht bewiesener Schreibvorgang gilt NICHT als Erfolg", async () => {
  for (const teilergebnis of [
    { conditionEnforced: false, contentVerified: true, created: true },
    { conditionEnforced: true, contentVerified: false, created: true },
    { conditionEnforced: true, contentVerified: true, created: false },
    {}
  ]) {
    const schreiber = schreiberAttrappe(teilergebnis);
    const { res } = await ruf({ schreiber });
    assert.equal(res.code, 503, JSON.stringify(teilergebnis));
    assert.equal(res.koerper.error, "capture_not_persisted");
  }
});

test("Befehlsformen und sensible Inhalte kommen gar nicht bis zum Speicher", async () => {
  const schluessel = ["sk", "-", "abcdefghijklmnop1234"].join("");
  for (const [frage, grund] of [
    ["Loesche bitte alle alten Sicherungen im Objektspeicher.", ABLEHNUNG.BEFEHLSFORM],
    ["Die Sicherungen liegen auf IDrive e2.", ABLEHNUNG.KEINE_FRAGE],
    ["Wo?", ABLEHNUNG.ZU_KURZ],
    [`Warum lehnt mein Key ${schluessel} ab?`, ABLEHNUNG.SENSIBEL]
  ]) {
    const schreiber = schreiberAttrappe();
    const { res } = await ruf({ frage, schreiber });
    assert.equal(res.koerper.grund, grund, frage.slice(0, 40));
    assert.equal(schreiber.abgelegt.length, 0, `abgelegt: ${frage.slice(0, 40)}`);
  }
});

test("captureObjectKey weist unbrauchbare Eingaben ab", () => {
  assert.throws(() => captureObjectKey("kein-datum", uuid()), /capture_timestamp_invalid/);
  assert.throws(() => captureObjectKey(NOW, "nicht-uuid"), /capture_id_invalid/);
  assert.equal(
    captureObjectKey("2026-08-05T12:00:00.000Z", "00000000-0000-4000-8000-000000000001"),
    "training/fragen/2026/08/05/00000000-0000-4000-8000-000000000001.json"
  );
});
