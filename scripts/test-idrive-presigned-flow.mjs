import { runIdriveConnectionTest } from "../src/storage/idriveConnectionTest.js";

const requiredEnv = [
  "IDRIVE_E2_ENDPOINT",
  "IDRIVE_E2_REGION",
  "IDRIVE_E2_ACCESS_KEY",
  "IDRIVE_E2_SECRET_KEY",
  "IDRIVE_E2_BUCKET"
];

const env = Object.fromEntries(requiredEnv.map((name) => [name, process.env[name] || ""]));
env.IDRIVE_E2_COST_MODE = process.env.IDRIVE_E2_COST_MODE || "free-safe-idrive-storage-only";
env.PRESIGN_HARD_LIMIT_ALLOWED = process.env.PRESIGN_HARD_LIMIT_ALLOWED || "";
env.PRESIGN_REMAINING = process.env.PRESIGN_REMAINING || "";

if (requiredEnv.some((name) => !env[name])) {
  console.log(JSON.stringify({
    ok: false,
    mode: "disabled",
    reason: "missing_idrive_e2_env_fail_closed",
    upload: false,
    download: false,
    checksum: false,
    restore: false,
    note: "Set IDrive e2 env vars locally to run the real presigned upload/download test. Never commit them."
  }, null, 2));
  process.exit(0);
}

if (process.env.CONFIRM_IDRIVE_CONNECTION_TEST !== "YES") {
  console.log(JSON.stringify({
    ok: false,
    mode: "disabled",
    reason: "confirmation_required_fail_closed",
    upload: false,
    download: false,
    checksum: false,
    restore: false,
    note: "Set CONFIRM_IDRIVE_CONNECTION_TEST=YES for a small real IDrive e2 test object."
  }, null, 2));
  process.exit(0);
}

const result = await runIdriveConnectionTest({ env });
console.log(JSON.stringify({
  ...result,
  url: undefined,
  secretValuesPrinted: false
}, null, 2));
process.exit(result.ok ? 0 : 1);
