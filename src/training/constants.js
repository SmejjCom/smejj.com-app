export const SMEJJ_TARGET_MODEL_ID = "smejj-1-0";
export const TRAINING_SCHEMA_VERSION = 1;
export const DATASET_SPLIT_SEED = "smejj-1.0-dataset-family-v1";

export const DATASET_SPLITS = Object.freeze(["train", "validation", "test"]);
export const DATASET_DOMAINS = Object.freeze([
  "coding",
  "browser",
  "terminal",
  "git",
  "database",
  "web",
  "pwa",
  "ios",
  "android",
  "safety"
]);

export const TRAINING_STATES = Object.freeze({
  DENIED: "denied",
  QUARANTINED: "quarantined",
  CANDIDATE: "candidate",
  PROMOTED: "promoted",
  REVOKED: "revoked"
});

export const EXCLUDED_TRAINING_ARTIFACT_KEYS = Object.freeze(new Set([
  "screenshots",
  "browserscreenshots",
  "browservideo",
  "browserrecording",
  "har",
  "cookies",
  "storagestate",
  "rawrequestheaders",
  "rawresponseheaders"
]));

export const REQUIRED_QUALITY_GATES = Object.freeze([
  "build",
  "typecheck",
  "lint",
  "unitTests",
  "integrationTests",
  "privacyReview",
  "security",
  "nonRegression",
  "rollback",
  "stagingOrLive"
]);

export const MODEL_LABEL_SOURCES = Object.freeze(new Set([
  "model",
  "model-review",
  "llm",
  "zai-api",
  "kimi-api",
  "provider-api"
]));

/**
 * Der Geltungsbereich, an den eine Trainings-Einwilligung gebunden wird.
 *
 * WARUM ES DIESE KONSTANTE GIBT (gemessen am 2026-08-05):
 * Das Einwilligungsmodell stammt aus der Code-Arbeit und bindet jede Zustimmung
 * an ein Repository — `createConsentGrant` wirft ohne eines
 * `consent_repository_invalid`, und die Route antwortet 400. Die erste Fassung
 * der Oberflaeche schickte keines mit: der Schalter war fail-closed, aber die
 * Einwilligung liess sich gar nicht erteilen.
 *
 * Eine Chat-Frage hat kein Repository. Sie hat aber sehr wohl einen
 * Geltungsbereich, und das ist dieses Projekt: "meine Fragen duerfen smejj
 * trainieren". Darum EIN fester Wert, serverseitig — und der Endpunkt
 * `/api/training/consent/notice` nennt ihn, damit die Oberflaeche ihn nicht
 * raten oder doppelt pflegen muss. Ein zweiter Ort waere ein zweiter Ort, der
 * driften kann.
 */
export const TRAINING_CONSENT_REPOSITORY = "smejjcom/smejj-app";

export function isCaptureEnabled(env = process.env) {
  return String(env.SMEJJ_TRAINING_CAPTURE_ENABLED || "NO").trim().toUpperCase() === "YES";
}
