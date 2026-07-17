// smejj.com — Tests der Agent-API-Route (Phase 1).
// Kernnachweis: fail-closed hinter Feature-Flag und keine Kollision mit dem
// bestehenden Modell-Router-Endpoint /api/agent.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { agentApiEnabled, handleAgentRoute } from "../control-server/src/routes/agentRoutes.js";

const SERVER = fileURLToPath(new URL("../src/server.js", import.meta.url));

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    ended: false,
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); },
    write(chunk) { this.body += chunk; },
    end(chunk) { if (chunk) this.body += chunk; this.ended = true; }
  };
}

test("Feature-Flag ist standardmaessig aus (fail-closed)", () => {
  assert.equal(agentApiEnabled({}), false);
  assert.equal(agentApiEnabled({ SMEJJ_AGENT_API_ENABLED: "" }), false);
  assert.equal(agentApiEnabled({ SMEJJ_AGENT_API_ENABLED: "true" }), false, "nur YES aktiviert");
  assert.equal(agentApiEnabled({ SMEJJ_AGENT_API_ENABLED: "YES" }), true);
  assert.equal(agentApiEnabled({ SMEJJ_AGENT_API_ENABLED: "yes" }), true);
});

test("Deaktivierte Agent API uebernimmt keine Anfrage (Alt-Pfad bleibt zustaendig)", async () => {
  const res = fakeRes();
  const handled = await handleAgentRoute(
    { method: "POST", authUser: { id: "u1" } },
    new URL("https://smejj.com/api/agent/tasks"),
    res,
    { env: {} }
  );
  assert.equal(handled, false);
  assert.equal(res.statusCode, 0, "Es darf nichts geschrieben werden");
});

test("Bestehender Endpoint /api/agent wird nicht uebernommen (Non-Regression)", async () => {
  const res = fakeRes();
  const handled = await handleAgentRoute(
    { method: "POST", authUser: { id: "u1" } },
    new URL("https://smejj.com/api/agent"),
    res,
    { env: { SMEJJ_AGENT_API_ENABLED: "YES" } }
  );
  assert.equal(handled, false, "/api/agent gehoert dem Modell-Router");
  assert.equal(res.statusCode, 0);
});

test("Fremde Pfade werden ignoriert", async () => {
  const res = fakeRes();
  const handled = await handleAgentRoute(
    { method: "GET", authUser: { id: "u1" } },
    new URL("https://smejj.com/api/providers/cline/status"),
    res,
    { env: { SMEJJ_AGENT_API_ENABLED: "YES" } }
  );
  assert.equal(handled, false);
});

test("Aktive Agent API verlangt Authentifizierung", async () => {
  const res = fakeRes();
  const handled = await handleAgentRoute(
    { method: "POST", authUser: null },
    new URL("https://smejj.com/api/agent/tasks"),
    res,
    { env: { SMEJJ_AGENT_API_ENABLED: "YES" } }
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 401);
  assert.match(res.body, /AUTHENTICATION_ERROR/);
});

test("Regression: server.js mountet die Agent API nur fuer Unterpfade", async () => {
  const source = await readFile(SERVER, "utf8");
  assert.ok(source.includes('handleAgentRoute'), "Agent API muss gemountet sein");
  assert.ok(source.includes('url.pathname.startsWith("/api/agent/")'), "nur Unterpfade mounten");
  assert.ok(source.includes("ROUTES.api.agent"), "bestehender Modell-Router-Endpoint bleibt erhalten");
  assert.ok(source.includes('url.pathname.startsWith("/api/providers/")'), "bestehender Cline-Pfad bleibt erhalten");
});
