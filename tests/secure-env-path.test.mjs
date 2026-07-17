import assert from "node:assert/strict";
import test from "node:test";
import { secureLocalEnvPath } from "../src/shared/env.js";

test("local secret files default outside the project and require absolute overrides", () => {
  assert.equal(
    secureLocalEnvPath({}, { homeDirectory: "/safe/home" }),
    "/safe/home/.config/smejj.com/env.local"
  );
  assert.equal(
    secureLocalEnvPath({ SMEJJ_LOCAL_ENV_FILE: "/secure/runtime/smejj.env" }),
    "/secure/runtime/smejj.env"
  );
  assert.throws(
    () => secureLocalEnvPath({ SMEJJ_LOCAL_ENV_FILE: ".env.local" }),
    /secure_local_env_path_must_be_absolute/
  );
});
