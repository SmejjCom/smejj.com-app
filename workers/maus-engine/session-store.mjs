// smejj.com Maus-Engine — Session-Store auf IDrive e2.
// Single Responsibility: Browser-Sessions (storageState: Cookies) pro Task
// Capsule als e2-Objekt speichern und wiederherstellen. Nie persistent auf
// dem Worker; der Worker bleibt vollstaendig stateless.
import { signedS3Request } from "../glm-salad/s3.js";

function sessionKey(capsuleRef, name) {
  const safe = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return `capsules/maus-engine/${safe(capsuleRef)}/sessions/${safe(name)}.json`;
}

// e2-gestuetzter Store. config wie in artifact-uploader.idriveConfigFromEnv.
// getObject/putObject sind injizierbar (Tests ohne Netz).
export function createSessionStore(capsuleRef, { config, getObject, putObject } = {}) {
  const put = putObject || ((key, body) => signedS3Request(config, "PUT", key, body, "application/json"));
  const get = getObject || ((key) => signedS3Request(config, "GET", key));
  return {
    async save(name, state) {
      await put(sessionKey(capsuleRef, name), JSON.stringify(state));
    },
    async load(name) {
      try {
        const text = await get(sessionKey(capsuleRef, name));
        return JSON.parse(text);
      } catch {
        return null; // fehlende Session ist kein Abbruch; restoreSession meldet fail-closed
      }
    }
  };
}
