import test from "node:test";
import assert from "node:assert/strict";
import {
  bindConsentScope,
  consentDecision,
  consentDecisionMatchesReference,
  consentDecisionReference,
  createConsentGrant,
  createConsentRevocation,
  isFreshResolvedConsentDecision,
  isResolvedConsentDecision,
  trainingConsentConfig,
  verifyConsentEntry
} from "../src/training/consent.js";
import { capturePersistenceAllowed, evaluateTrainingEligibility } from "../src/training/policy.js";
import {
  consentLedgerObjectKeys,
  createIdriveConsentLedger,
  createImmutableConsentLedger
} from "../control-server/src/training/consentLedger.js";
import {
  handleDecision,
  handleGrant,
  handleRevoke
} from "../control-server/src/routes/trainingConsentRoutes.js";
import { signedS3Put } from "../control-server/src/storage/s3Signer.js";
import {
  isSafeMutatingControlRequest,
  requiresAuthenticatedControlAccess
} from "../src/shared/controlAccessPolicy.js";
import { readJson, validateSchema } from "../scripts/validation-utils.mjs";

const NOTICE_HASH = "a".repeat(64);
const SIGNING_KEY = Buffer.alloc(32, 17);
const BINDING_KEY = Buffer.alloc(32, 29);
const ENV = {
  SMEJJ_TRAINING_CONSENT_API_ENABLED: "YES",
  SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: NOTICE_HASH,
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: SIGNING_KEY.toString("base64"),
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "consent-binding-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: BINDING_KEY.toString("base64")
};
const CONFIG = trainingConsentConfig(ENV);
const SUBJECT = "user:test-owner";
const REPOSITORY = "smejjcom/smejj-app";
const NOW = "2026-07-10T12:00:00.000Z";

test("consent keys are strict, separate and privacy-notice bound", () => {
  assert.equal(CONFIG.ready, true);
  assert.equal(CONFIG.keySeparationVerified, true);
  assert.equal(trainingConsentConfig({ ...ENV, SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: SIGNING_KEY.toString("base64") }).ready, false);
  assert.equal(trainingConsentConfig({ ...ENV, SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "consent-signing-v1" }).ready, false);
  assert.equal(trainingConsentConfig({ ...ENV, SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: "not-a-hash" }).ready, false);
  assert.equal(trainingConsentConfig({ ...ENV, SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: `${SIGNING_KEY.toString("base64")}!` }).ready, false);
  assert.equal(trainingConsentConfig({
    ...ENV,
    SMEJJ_TRAINING_FINGERPRINT_KEY_ID: "fingerprint-key-v1",
    SMEJJ_TRAINING_FINGERPRINT_KEY_B64: SIGNING_KEY.toString("base64")
  }).ready, false);
  assert.equal(trainingConsentConfig({
    ...ENV,
    SMEJJ_TRAINING_ENCRYPTION_KEY_ID: "consent-binding-v1",
    SMEJJ_TRAINING_ENCRYPTION_KEY_B64: Buffer.alloc(32, 41).toString("base64")
  }).ready, false);
});

test("signed grant contains only opaque subject/repository bindings and matches schema", () => {
  const grant = makeGrant();
  assert.equal(verifyConsentEntry(grant, CONFIG), true);
  assert.match(grant.subjectRef, /^sub_[a-f0-9]{64}$/);
  assert.match(grant.repositoryRef, /^repo_[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(grant), /test-owner|smejjcom|smejj-app/);
  assert.deepEqual(validateSchema(
    grant,
    readJson("schemas/training-consent-ledger-entry.schema.json"),
    "consent entry"
  ), []);

  const scope = bindConsentScope({ subjectId: SUBJECT, repository: REPOSITORY, privacyNoticeSha256: NOTICE_HASH }, CONFIG);
  const decision = consentDecision({ entries: [grant], scope }, { config: CONFIG, now: NOW });
  assert.equal(decision.status, "granted");
  assert.equal(decision.captureAllowed, true);
  assert.equal(decision.trainingAllowed, true);
  assert.equal(decision.rightsConfirmed, true);
  assert.equal(isResolvedConsentDecision(decision), true);
  assert.equal(capturePersistenceAllowed({}, decision, { now: NOW }), true);
});

test("candidate-supplied decision copies never become trusted authority", () => {
  const grant = makeGrant();
  const scope = bindConsentScope({ subjectId: SUBJECT, repository: REPOSITORY, privacyNoticeSha256: NOTICE_HASH }, CONFIG);
  const resolved = consentDecision({ entries: [grant], scope }, { config: CONFIG, now: NOW });
  const copiedClaim = JSON.parse(JSON.stringify(consentDecisionReference(resolved)));
  assert.equal(isResolvedConsentDecision(copiedClaim), false);
  assert.equal(capturePersistenceAllowed({ consent: copiedClaim }, copiedClaim), false);
  assert.equal(capturePersistenceAllowed({ consent: { captureStatus: "granted" } }), false);
  const policyResult = evaluateTrainingEligibility({
    consent: {
      captureStatus: "granted",
      trainingStatus: "granted",
      recordedBy: "human",
      rightsConfirmed: true,
      evidenceId: "claimed:consent",
      withdrawalId: "claimed:withdrawal"
    }
  }, { entries: [] }, { consentDecision: copiedClaim, now: NOW });
  assert.equal(policyResult.eligible, false);
  assert.ok(policyResult.reasons.includes("consent_decision_not_verified"));
  assert.ok(policyResult.reasons.includes("capture_consent_missing"));
});

test("resolved decisions expire within 60 seconds and reject excessive future skew", () => {
  const grant = makeGrant();
  const scope = bindConsentScope({ subjectId: SUBJECT, repository: REPOSITORY, privacyNoticeSha256: NOTICE_HASH }, CONFIG);
  const resolved = consentDecision({ entries: [grant], scope }, { config: CONFIG, now: NOW });
  assert.equal(isFreshResolvedConsentDecision(resolved, { now: "2026-07-10T12:00:59.999Z" }), true);
  assert.equal(isFreshResolvedConsentDecision(resolved, { now: "2026-07-10T12:01:00.001Z" }), false);
  assert.equal(isFreshResolvedConsentDecision(resolved, { now: "2026-07-10T11:59:55.001Z" }), true);
  assert.equal(isFreshResolvedConsentDecision(resolved, { now: "2026-07-10T11:59:54.999Z" }), false);
  assert.equal(isFreshResolvedConsentDecision(resolved, { now: "invalid" }), false);
  assert.equal(isFreshResolvedConsentDecision(resolved, { now: NOW, maxAgeMs: 60_001 }), false);
  assert.equal(isFreshResolvedConsentDecision(consentDecisionReference(resolved), { now: NOW }), false);
});

test("fresh re-resolution matches stable evidence but revocation never matches the grant reference", () => {
  const grant = makeGrant();
  const scope = bindConsentScope({ subjectId: SUBJECT, repository: REPOSITORY, privacyNoticeSha256: NOTICE_HASH }, CONFIG);
  const first = consentDecision({ entries: [grant], scope }, { config: CONFIG, now: NOW });
  const reference = consentDecisionReference(first);
  const refreshed = consentDecision({ entries: [grant], scope }, {
    config: CONFIG,
    now: "2026-07-10T12:00:30.000Z"
  });
  assert.notEqual(refreshed.resolvedAt, reference.resolvedAt);
  assert.equal(consentDecisionMatchesReference(refreshed, reference), true);

  const revocation = createConsentRevocation({ grant, subjectId: SUBJECT, repository: REPOSITORY }, {
    config: CONFIG,
    now: "2026-07-10T12:00:31.000Z",
    randomUUID: uuidSequence(70)
  });
  const revoked = consentDecision({ entries: [grant, revocation.event, revocation.sentinel], scope }, {
    config: CONFIG,
    now: "2026-07-10T12:00:32.000Z"
  });
  assert.equal(consentDecisionMatchesReference(revoked, reference), false);
});

test("tampering or scope substitution denies consent", () => {
  const grant = makeGrant();
  const scope = bindConsentScope({ subjectId: SUBJECT, repository: REPOSITORY, privacyNoticeSha256: NOTICE_HASH }, CONFIG);
  const tampered = { ...grant, scope: { ...grant.scope, modelTraining: false } };
  assert.equal(verifyConsentEntry(tampered, CONFIG), false);
  const denied = consentDecision({ entries: [tampered], scope }, { config: CONFIG, now: NOW });
  assert.equal(denied.status, "denied");
  assert.deepEqual(denied.reasons, ["consent_ledger_entry_invalid"]);

  const otherRepository = bindConsentScope({
    subjectId: SUBJECT,
    repository: "smejjcom/another-repository",
    privacyNoticeSha256: NOTICE_HASH
  }, CONFIG);
  const substituted = consentDecision({ entries: [grant], scope: otherRepository }, { config: CONFIG, now: NOW });
  assert.equal(substituted.status, "denied");
  assert.deepEqual(substituted.reasons, ["consent_ledger_entry_invalid"]);
  assert.throws(() => consentDecision({
    entries: [grant],
    scope: {
      subjectRef: scope.repositoryRef,
      repositoryRef: scope.subjectRef,
      privacyNoticeSha256: NOTICE_HASH
    }
  }, { config: CONFIG, now: NOW }), /consent_scope_invalid/);
});

test("signed revoke and independent sentinel permanently override the grant", () => {
  const grant = makeGrant();
  const revocation = createConsentRevocation({ grant, subjectId: SUBJECT, repository: REPOSITORY }, {
    config: CONFIG,
    now: "2026-07-10T12:05:00.000Z",
    randomUUID: uuidSequence(20)
  });
  assert.equal(verifyConsentEntry(revocation.event, CONFIG), true);
  assert.equal(verifyConsentEntry(revocation.sentinel, CONFIG), true);
  const scope = bindConsentScope({ subjectId: SUBJECT, repository: REPOSITORY, privacyNoticeSha256: NOTICE_HASH }, CONFIG);

  for (const entries of [[grant, revocation.event], [grant, revocation.sentinel], [grant, revocation.event, revocation.sentinel]]) {
    const decision = consentDecision({ entries, scope }, { config: CONFIG, now: "2026-07-10T12:06:00.000Z" });
    assert.equal(decision.status, "revoked");
    assert.equal(decision.captureAllowed, false);
    assert.equal(decision.trainingAllowed, false);
    assert.equal(capturePersistenceAllowed({}, decision), false);
  }
});

test("immutable ledger blocks overwrite and never uses raw identity in object keys", async () => {
  const storage = memoryStorage();
  const ledger = createImmutableConsentLedger({ config: CONFIG, ...storage.adapter });
  const grant = makeGrant();
  const result = await ledger.appendGrant(grant);
  assert.equal(result.immutable, true);
  assert.equal(storage.objects.size, 1);
  const [key] = storage.objects.keys();
  assert.match(key, /^training\/consents\/v1\//);
  assert.doesNotMatch(key, /test-owner|smejjcom|smejj-app/);
  assert.equal(key, consentLedgerObjectKeys(grant).event);
  await assert.rejects(() => ledger.appendGrant(grant), /consent_immutable_object_exists/);
  const decision = await ledger.resolve(grant, { now: NOW });
  assert.equal(decision.status, "granted");
});

test("consent ledger refuses general IDrive credentials and requires a dedicated training principal", () => {
  const generalStorageOnly = {
    IDRIVE_E2_ENDPOINT: "https://s3.example.invalid",
    IDRIVE_E2_REGION: "test-1",
    IDRIVE_E2_ACCESS_KEY: "general-access",
    IDRIVE_E2_SECRET_KEY: "general-secret",
    IDRIVE_E2_BUCKET: "general-bucket"
  };
  assert.throws(() => createIdriveConsentLedger(generalStorageOnly, { config: CONFIG }), /training_idrive_config_missing/);
  const trainingStorage = {
    IDRIVE_E2_TRAINING_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
    IDRIVE_E2_TRAINING_REGION: "test-1",
    IDRIVE_E2_TRAINING_ACCESS_KEY: "training-access",
    IDRIVE_E2_TRAINING_SECRET_KEY: "training-secret",
    IDRIVE_E2_TRAINING_BUCKET: "training-bucket",
    IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/consents/v1/"
  };
  assert.doesNotThrow(() => createIdriveConsentLedger(trainingStorage, { config: CONFIG }));
});

test("IDrive consent adapter requires the shared double-PUT immutable proof", async () => {
  const env = {
    IDRIVE_E2_TRAINING_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
    IDRIVE_E2_TRAINING_REGION: "us-west-2",
    IDRIVE_E2_TRAINING_ACCESS_KEY: "training-access",
    IDRIVE_E2_TRAINING_SECRET_KEY: "training-secret-value",
    IDRIVE_E2_TRAINING_BUCKET: "training-bucket",
    IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/consents/v1/",
    IDRIVE_E2_TRAINING_RETRY_DELAY_MS: "0"
  };
  const stored = new Map();
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    const segments = new URL(url).pathname.split("/").filter(Boolean).map(decodeURIComponent);
    assert.equal(segments.shift(), env.IDRIVE_E2_TRAINING_BUCKET);
    const key = segments.join("/");
    const headers = new Headers(options.headers || {});
    requests.push({ method, key, ifNoneMatch: headers.get("if-none-match") || "" });
    if (method === "PUT" && stored.has(key)) return new Response(null, { status: 412 });
    if (method === "PUT") {
      stored.set(key, Buffer.from(options.body));
      return new Response(null, { status: 201 });
    }
    if (!stored.has(key)) return new Response(null, { status: 404 });
    return new Response(stored.get(key), { status: 200 });
  };
  const ledger = createIdriveConsentLedger(env, { config: CONFIG, fetchImpl });
  await ledger.appendGrant(makeGrant());
  assert.deepEqual(requests.map(({ method }) => method), ["PUT", "PUT", "GET"]);
  assert.ok(requests.filter((request) => request.method === "PUT").every((request) => request.ifNoneMatch === "*"));
  assert.equal(stored.size, 1);
});

test("partial revocation write still resolves revoked and cannot fail open", async () => {
  const storage = memoryStorage();
  const ledger = createImmutableConsentLedger({ config: CONFIG, ...storage.adapter });
  const grant = makeGrant();
  await ledger.appendGrant(grant);
  const revocation = createConsentRevocation({ grant, subjectId: SUBJECT, repository: REPOSITORY }, {
    config: CONFIG,
    now: "2026-07-10T12:05:00.000Z",
    randomUUID: uuidSequence(30)
  });
  const failingLedger = createImmutableConsentLedger({
    config: CONFIG,
    listObjects: storage.adapter.listObjects,
    getObject: storage.adapter.getObject,
    putImmutable: async (object) => {
      if (object.key.includes("/revocations/")) return { created: false, conditionEnforced: true, contentVerified: true };
      return storage.adapter.putImmutable(object);
    }
  });
  await assert.rejects(() => failingLedger.appendRevocation(revocation), /consent_immutable_object_exists/);
  const decision = await ledger.resolve(grant, { now: "2026-07-10T12:06:00.000Z" });
  assert.equal(decision.status, "revoked");
});

test("control consent routes are authentication-protected and complete grant/revoke flow", async () => {
  for (const [path, method] of [
    ["/api/training/consent", "POST"],
    ["/api/training/consent/revoke", "POST"],
    ["/api/training/consent/decision", "GET"]
  ]) {
    assert.equal(requiresAuthenticatedControlAccess({ method }, new URL(path, "https://smejj.com")), true);
  }
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "smejj.com", origin: "https://foreign.example", "x-forwarded-proto": "https" }
  }, new URL("https://smejj.com/api/training/consent")), false);

  const storage = memoryStorage();
  const ledger = createImmutableConsentLedger({ config: CONFIG, ...storage.adapter });
  const ledgerFactory = () => ledger;
  const reqUser = { authUser: { userId: SUBJECT } };
  const grantRes = fakeRes();
  await handleGrant(jsonReq({
    repository: REPOSITORY,
    privacyNoticeSha256: NOTICE_HASH,
    captureReviewConsent: true,
    modelTrainingConsent: true,
    sourceRightsConfirmed: true
  }, reqUser), grantRes, { env: ENV, ledgerFactory, now: NOW, randomUUID: uuidSequence(40) });
  assert.equal(grantRes.statusCode, 201);
  const granted = grantRes.json();
  assert.equal(granted.consent.status, "granted");

  const readRes = fakeRes();
  await handleDecision(reqUser, new URL(
    `https://smejj.com/api/training/consent/decision?repository=${encodeURIComponent(REPOSITORY)}&privacyNoticeSha256=${NOTICE_HASH}`
  ), readRes, { env: ENV, ledgerFactory, now: NOW });
  assert.equal(readRes.statusCode, 200);
  assert.equal(readRes.json().consent.status, "granted");

  const revokeRes = fakeRes();
  await handleRevoke(jsonReq({
    repository: REPOSITORY,
    privacyNoticeSha256: NOTICE_HASH,
    withdrawalId: granted.consent.withdrawalId
  }, reqUser), revokeRes, {
    env: ENV,
    ledgerFactory,
    now: "2026-07-10T12:05:00.000Z",
    randomUUID: uuidSequence(50)
  });
  assert.equal(revokeRes.statusCode, 200);
  assert.equal(revokeRes.json().consent.status, "revoked");
});

test("control route fails closed when disabled, unauthenticated or missing explicit scope", async () => {
  const disabled = fakeRes();
  await handleGrant(jsonReq({}), disabled, { env: {} });
  assert.equal(disabled.statusCode, 503);
  assert.equal(disabled.json().error, "consent_api_disabled");

  const unauthenticated = fakeRes();
  await handleGrant(jsonReq({}), unauthenticated, { env: ENV });
  assert.equal(unauthenticated.statusCode, 401);

  const storage = memoryStorage();
  const ledger = createImmutableConsentLedger({ config: CONFIG, ...storage.adapter });
  const incomplete = fakeRes();
  await handleGrant(jsonReq({
    repository: REPOSITORY,
    privacyNoticeSha256: NOTICE_HASH,
    captureReviewConsent: true,
    modelTrainingConsent: false,
    sourceRightsConfirmed: true
  }, { authUser: { userId: SUBJECT } }), incomplete, {
    env: ENV,
    ledgerFactory: () => ledger,
    now: NOW,
    randomUUID: uuidSequence(60)
  });
  assert.equal(incomplete.statusCode, 400);
  assert.equal(storage.objects.size, 0);
});

test("IDrive conditional signer signs If-None-Match and proves creation or conflict", async () => {
  let sentHeaders;
  const base = {
    endpoint: "https://s3.example.invalid",
    region: "test-1",
    accessKey: "access",
    secretKey: "secret",
    bucket: "bucket",
    key: "training-consent/v1/test.json",
    body: "{}\n",
    contentType: "application/json",
    ifNoneMatch: "*"
  };
  const created = await signedS3Put({
    ...base,
    fetchImpl: async (_url, options) => {
      sentHeaders = options.headers;
      return { ok: true, status: 200, text: async () => "" };
    }
  });
  assert.equal(sentHeaders["If-None-Match"], "*");
  assert.match(sentHeaders.Authorization, /SignedHeaders=content-type;host;if-none-match;x-amz-content-sha256;x-amz-date/);
  assert.deepEqual({ created: created.created, conditionEnforced: created.conditionEnforced }, {
    created: true,
    conditionEnforced: true
  });
  const conflict = await signedS3Put({
    ...base,
    fetchImpl: async () => ({ ok: false, status: 412, text: async () => "Precondition failed" })
  });
  assert.equal(conflict.created, false);
  assert.equal(conflict.conditionEnforced, true);
});

function makeGrant() {
  return createConsentGrant({
    subjectId: SUBJECT,
    repository: REPOSITORY,
    privacyNoticeSha256: NOTICE_HASH,
    captureReviewConsent: true,
    modelTrainingConsent: true,
    sourceRightsConfirmed: true
  }, { config: CONFIG, now: NOW, randomUUID: uuidSequence(1) });
}

function uuidSequence(start) {
  let value = start;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function memoryStorage() {
  const objects = new Map();
  return {
    objects,
    adapter: {
      async putImmutable(object) {
        if (objects.has(object.key)) return { created: false, conditionEnforced: true, contentVerified: true };
        objects.set(object.key, object.body);
        return { created: true, conditionEnforced: object.ifNoneMatch === "*", contentVerified: true };
      },
      async listObjects(prefix) {
        return [...objects.keys()].filter((key) => key.startsWith(prefix));
      },
      async getObject(key) {
        if (!objects.has(key)) throw new Error("object_not_found");
        return objects.get(key);
      }
    }
  };
}

function jsonReq(body, extra = {}) {
  const text = JSON.stringify(body);
  return {
    ...extra,
    method: "POST",
    on(event, handler) {
      if (event === "data") queueMicrotask(() => handler(text));
      if (event === "end") queueMicrotask(handler);
    }
  };
}

function fakeRes() {
  return {
    statusCode: 0,
    chunks: [],
    writeHead(status) { this.statusCode = status; },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); },
    json() { return JSON.parse(this.chunks.join("")); }
  };
}

test("der Hinweis-Endpunkt veroeffentlicht den geltenden Hash — und schweigt ohne Konfiguration", async () => {
  // Ohne diesen Endpunkt kann die Oberflaeche gar keine Einwilligung absenden:
  // handleGrant vergleicht den Hash und antwortet sonst 409. Der Hash eines
  // oeffentlich abrufbaren Dokuments ist selbst nicht schutzwuerdig.
  const { handleNotice } = await import("../control-server/src/routes/trainingConsentRoutes.js");

  const ok = fakeResponse();
  handleNotice({}, ok, { env: ENV });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.privacyNoticeSha256, NOTICE_HASH);
  assert.equal(ok.body.privacyNoticeUrl, "/datenschutz.html");
  assert.deepEqual(ok.body.umfang, ["captureReviewConsent", "modelTrainingConsent", "sourceRightsConfirmed"]);

  // Fail-closed: ein Hash ohne funktionierende Schluessel wuerde behaupten,
  // Einwilligungen seien moeglich, waehrend jeder Grant scheitert.
  const kaputt = fakeResponse();
  handleNotice({}, kaputt, { env: { ...ENV, SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: "keine-gueltige-basis" } });
  assert.equal(kaputt.statusCode, 503);
  assert.equal(kaputt.body.privacyNoticeSha256, undefined, "ohne Konfiguration darf kein Hash genannt werden");
});

test("was der Hinweis-Endpunkt nennt, ergibt auch WIRKLICH einen gueltigen Grant", async () => {
  // Der Wachhund fuer einen echten Fehler (2026-08-05): der Endpunkt meldete
  // 200 und nannte Hash und Umfang — aber KEIN repository. createConsentGrant
  // verlangt eines und wirft sonst consent_repository_invalid, die Route
  // antwortet 400. Die Einwilligung war damit live technisch unmoeglich, und
  // kein Test hat es bemerkt: alle prueften Felder, keiner den Durchstich.
  //
  // Dieser Test nimmt AUSSCHLIESSLICH, was der Endpunkt herausgibt, und baut
  // daraus eine Einwilligung. Faellt kuenftig ein Pflichtfeld aus der Antwort,
  // faellt hier der Grant.
  const { handleNotice } = await import("../control-server/src/routes/trainingConsentRoutes.js");
  const antwort = fakeResponse();
  handleNotice({}, antwort, { env: ENV });
  assert.equal(antwort.statusCode, 200);

  const felder = Object.fromEntries(antwort.body.umfang.map((name) => [name, true]));
  const grant = createConsentGrant({
    subjectId: SUBJECT,
    repository: antwort.body.repository,
    privacyNoticeSha256: antwort.body.privacyNoticeSha256,
    ...felder
  }, { config: CONFIG, now: NOW, randomUUID: () => "00000000-0000-4000-8000-00000000beef" });

  const scope = bindConsentScope({
    subjectId: SUBJECT,
    repository: antwort.body.repository,
    privacyNoticeSha256: antwort.body.privacyNoticeSha256
  }, CONFIG);
  const entscheidung = consentDecision({ entries: [grant], scope }, { config: CONFIG, now: NOW });
  assert.equal(entscheidung.status, "granted");
  assert.equal(entscheidung.captureAllowed, true);
});

function fakeResponse() {
  return {
    statusCode: 0,
    body: null,
    writeHead(status) { this.statusCode = status; },
    end(payload) { this.body = JSON.parse(payload); }
  };
}
