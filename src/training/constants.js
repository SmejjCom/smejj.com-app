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

export function isCaptureEnabled(env = process.env) {
  return String(env.SMEJJ_TRAINING_CAPTURE_ENABLED || "NO").trim().toUpperCase() === "YES";
}
