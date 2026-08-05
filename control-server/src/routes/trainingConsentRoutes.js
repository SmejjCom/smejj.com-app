// smejj.com control-server — authenticated training consent and revocation API.
import { ROUTES } from "../../../src/shared/platform.js";
import {
  authenticatedConsentSubject,
  bindConsentScope,
  consentDecisionReference,
  createConsentGrant,
  createConsentRevocation,
  trainingConsentConfig
} from "../../../src/training/consent.js";
import { json, readJson } from "../http/respond.js";
import { createIdriveConsentLedger } from "../training/consentLedger.js";

export async function handleTrainingConsentRoute(req, url, res, dependencies = {}) {
  if (url.pathname === ROUTES.api.trainingConsent && req.method === "POST") {
    return handleGrant(req, res, dependencies);
  }
  if (url.pathname === ROUTES.api.trainingConsentRevoke && req.method === "POST") {
    return handleRevoke(req, res, dependencies);
  }
  if (url.pathname === ROUTES.api.trainingConsentDecision && (req.method === "GET" || req.method === "HEAD")) {
    return handleDecision(req, url, res, dependencies);
  }
  if (url.pathname === ROUTES.api.trainingConsentNotice && (req.method === "GET" || req.method === "HEAD")) {
    return handleNotice(req, res, dependencies);
  }
  return json(res, 404, { ok: false, error: "training_consent_route_not_found" });
}

export async function handleGrant(req, res, {
  env = process.env,
  now,
  randomUUID,
  ledgerFactory = defaultLedgerFactory
} = {}) {
  try {
    const context = consentContext(req, env, ledgerFactory);
    const body = await readJson(req);
    if (String(body.privacyNoticeSha256 || "").toLowerCase() !== context.config.privacyNoticeSha256) {
      return json(res, 409, { ok: false, error: "consent_privacy_notice_not_current" });
    }
    const grant = createConsentGrant({
      subjectId: context.subjectId,
      repository: body.repository,
      privacyNoticeSha256: body.privacyNoticeSha256,
      captureReviewConsent: body.captureReviewConsent,
      modelTrainingConsent: body.modelTrainingConsent,
      sourceRightsConfirmed: body.sourceRightsConfirmed
    }, { config: context.config, now, randomUUID });
    await context.ledger.appendGrant(grant);
    const decision = await context.ledger.resolve(grant, { now });
    if (decision.status !== "granted" || decision.verified !== true) throw new Error("consent_grant_resolution_failed");
    return json(res, 201, {
      ok: true,
      immutable: true,
      consent: consentDecisionReference(decision)
    });
  } catch (error) {
    return consentError(res, error);
  }
}

export async function handleRevoke(req, res, {
  env = process.env,
  now,
  randomUUID,
  ledgerFactory = defaultLedgerFactory
} = {}) {
  try {
    const context = consentContext(req, env, ledgerFactory);
    const body = await readJson(req);
    const withdrawalId = String(body.withdrawalId || "").trim();
    if (!/^withdrawal:[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(withdrawalId)) {
      return json(res, 400, { ok: false, error: "consent_withdrawal_id_invalid" });
    }
    const scope = bindConsentScope({
      subjectId: context.subjectId,
      repository: body.repository,
      privacyNoticeSha256: body.privacyNoticeSha256
    }, context.config);
    const current = await context.ledger.resolve(scope, { now });
    if (current.status === "revoked" && current.withdrawalId === withdrawalId) {
      return json(res, 200, { ok: true, immutable: true, consent: consentDecisionReference(current) });
    }
    const grant = await context.ledger.findGrant(scope, withdrawalId);
    if (!grant) return json(res, 404, { ok: false, error: "consent_grant_not_found" });
    const revocation = createConsentRevocation({
      grant,
      subjectId: context.subjectId,
      repository: body.repository
    }, { config: context.config, now, randomUUID });
    try {
      await context.ledger.appendRevocation(revocation);
    } catch (error) {
      const resolved = await context.ledger.resolve(scope, { now });
      if (resolved.status !== "revoked") throw error;
    }
    const decision = await context.ledger.resolve(scope, { now });
    if (decision.status !== "revoked" || decision.verified !== true) throw new Error("consent_revocation_resolution_failed");
    return json(res, 200, {
      ok: true,
      immutable: true,
      consent: consentDecisionReference(decision)
    });
  } catch (error) {
    return consentError(res, error);
  }
}

export async function handleDecision(req, url, res, {
  env = process.env,
  now,
  ledgerFactory = defaultLedgerFactory
} = {}) {
  try {
    const context = consentContext(req, env, ledgerFactory);
    const scope = bindConsentScope({
      subjectId: context.subjectId,
      repository: url.searchParams.get("repository"),
      privacyNoticeSha256: url.searchParams.get("privacyNoticeSha256")
    }, context.config);
    const decision = await context.ledger.resolve(scope, { now });
    return json(res, 200, { ok: true, consent: consentDecisionReference(decision) });
  } catch (error) {
    return consentError(res, error);
  }
}

function consentContext(req, env, ledgerFactory) {
  if (String(env.SMEJJ_TRAINING_CONSENT_API_ENABLED || "NO").trim().toUpperCase() !== "YES") {
    throw new Error("consent_api_disabled");
  }
  if (!req?.authUser) throw new Error("consent_authentication_required");
  const config = trainingConsentConfig(env);
  if (!config.ready) throw new Error("consent_key_configuration_invalid");
  const subjectId = authenticatedConsentSubject(req.authUser);
  const ledger = ledgerFactory(env, config);
  return { config, subjectId, ledger };
}

function defaultLedgerFactory(env, config) {
  return createIdriveConsentLedger(env, { config });
}

function consentError(res, error) {
  const code = String(error?.message || "consent_request_failed").split(":")[0];
  if (code === "consent_api_disabled") return json(res, 503, { ok: false, error: code });
  if (code === "consent_authentication_required") return json(res, 401, { ok: false, error: code });
  if (code === "consent_key_configuration_invalid" || code === "consent_idrive_configuration_invalid" ||
      code.startsWith("consent_idrive_") || code.startsWith("consent_ledger_")) {
    return json(res, 503, { ok: false, error: "consent_service_unavailable" });
  }
  if (code.includes("immutable_object_exists")) return json(res, 409, { ok: false, error: "consent_event_already_exists" });
  const clientErrors = new Set([
    "consent_authenticated_subject_invalid",
    "consent_explicit_scope_required",
    "consent_privacy_notice_hash_invalid",
    "consent_privacy_notice_not_current",
    "consent_repository_invalid",
    "consent_scope_mismatch",
    "consent_verified_grant_required"
  ]);
  if (clientErrors.has(code)) return json(res, 400, { ok: false, error: code });
  return json(res, 503, { ok: false, error: "consent_request_failed" });
}

/**
 * Veroeffentlicht den geltenden Datenschutzhinweis: seinen Hash und wo er steht.
 *
 * WARUM OHNE ANMELDUNG: Ein Klient MUSS den geltenden Hash kennen, um ueberhaupt
 * eine Einwilligung absenden zu koennen — handleGrant vergleicht ihn und
 * antwortet sonst 409 consent_privacy_notice_not_current. Ohne diesen Endpunkt
 * ist die Einwilligung technisch unerreichbar. Der Hash eines oeffentlich
 * abrufbaren Dokuments ist selbst keine schutzwuerdige Angabe; er verraet
 * nichts ueber Nutzer.
 *
 * FAIL-CLOSED: Ist die Einwilligungs-Konfiguration nicht vollstaendig (fehlende
 * oder fehlerhafte Schluessel, kein gueltiger Hash), wird KEIN Hash genannt.
 * Ein ausgelieferter Hash wuerde sonst behaupten, Einwilligungen seien moeglich,
 * waehrend jeder Grant scheitert.
 */
export function handleNotice(req, res, { env = process.env } = {}) {
  const config = trainingConsentConfig(env);
  if (!config?.ready) {
    return json(res, 503, { ok: false, error: "consent_configuration_incomplete" });
  }
  return json(res, 200, {
    ok: true,
    privacyNoticeSha256: config.privacyNoticeSha256,
    // Der Ort des Dokuments, damit die Oberflaeche darauf verweisen kann, statt
    // den Pfad ein zweites Mal zu kennen.
    privacyNoticeUrl: String(env.SMEJJ_TRAINING_PRIVACY_NOTICE_URL || "/datenschutz.html"),
    // Die drei Teil-Einwilligungen, wortgleich zur Datenschutzerklaerung
    // ("dreifach getrennt"). createConsentGrant verlangt sie ALLE — eine
    // Teil-Einwilligung laesst sich nicht ausstellen.
    umfang: ["captureReviewConsent", "modelTrainingConsent", "sourceRightsConfirmed"]
  });
}
